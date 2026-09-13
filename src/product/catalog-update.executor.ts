import { BadRequestException } from "@nestjs/common";
import {
  CatalogProductInput,
  CatalogUpdateExecutionResult,
  CatalogUpdatePlan,
} from "./catalog-update.types";

export interface CatalogUpdateTransaction<T extends CatalogProductInput> {
  findProduct(id: string, projectId: string): Promise<T | null>;
  saveProduct(product: T): Promise<T>;
}

export interface CatalogUpdateDataSource<T extends CatalogProductInput> {
  transaction<R>(
    work: (transaction: CatalogUpdateTransaction<T>) => Promise<R>,
  ): Promise<R>;
}

export async function applyCatalogUpdatePlan<T extends CatalogProductInput>(
  plan: CatalogUpdatePlan,
  projectId: string,
  dataSource: CatalogUpdateDataSource<T>,
): Promise<CatalogUpdateExecutionResult> {
  if (!plan.canApply) {
    throw new BadRequestException(
      "Catalog update import contains invalid or conflicting rows",
    );
  }

  let committedProducts = 0;
  let committedFieldChanges = 0;

  await dataSource.transaction(async (transaction) => {
    for (const update of plan.productUpdates) {
      const product = await transaction.findProduct(update.id, projectId);
      if (!product) {
        throw new BadRequestException(
          `Product ${update.id} was not found in the authenticated project`,
        );
      }

      const updatedProduct = {
        ...product,
        ...update.changedValues,
      };
      await transaction.saveProduct(updatedProduct);
      committedProducts++;
      committedFieldChanges += Object.keys(update.changedValues).length;
    }
  });

  return {
    ...plan,
    dryRun: false,
    databaseChanges: committedProducts,
    committedProducts,
    committedFieldChanges,
  };
}
