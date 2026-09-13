import {
  CatalogFieldChange,
  CatalogMatchedProduct,
  CatalogPlannedProductUpdate,
  CatalogProductInput,
  CatalogProductValues,
  CatalogUpdateField,
  CatalogUpdatePlan,
  CatalogUpdatePlanRow,
  CatalogUpdateRow,
  CatalogUpdateStatus,
} from "./catalog-update.types";
import { normalizeCatalogMatchKey } from "./catalog-update.parser";

const CATALOG_UPDATE_FIELDS: CatalogUpdateField[] = [
  "name",
  "model",
  "sku",
  "price",
];

export function buildCatalogUpdatePlan(
  sourceRows: CatalogUpdateRow[],
  products: CatalogProductInput[],
): CatalogUpdatePlan {
  const productsByName = groupProductsByNormalizedName(products);
  const rows = sourceRows.map((sourceRow) =>
    buildPlanRow(
      sourceRow,
      productsByName.get(sourceRow.normalizedMatchName) ?? [],
    ),
  );

  markDuplicateSourceRows(rows);
  markConflictingProductUpdates(rows);
  markProposedNameConflicts(rows, productsByName);

  const canApply = rows.every(
    (row) => row.status !== "invalid" && row.status !== "conflict",
  );
  const productUpdates = canApply ? collectProductUpdates(rows) : [];

  return {
    dryRun: true,
    databaseChanges: 0,
    canApply,
    rows,
    productUpdates,
    summary: buildSummary(rows, productUpdates),
  };
}

function groupProductsByNormalizedName(
  products: CatalogProductInput[],
): Map<string, CatalogProductInput[]> {
  const productsByName = new Map<string, CatalogProductInput[]>();

  for (const product of products) {
    const key = normalizeCatalogMatchKey(product.name);
    const matches = productsByName.get(key) ?? [];
    matches.push(product);
    productsByName.set(key, matches);
  }

  return productsByName;
}

function buildPlanRow(
  sourceRow: CatalogUpdateRow,
  matches: CatalogProductInput[],
): CatalogUpdatePlanRow {
  if (sourceRow.errors.length > 0) {
    return {
      ...sourceRow,
      status: "invalid",
      matchCount: 0,
      products: [],
      warnings: [],
      duplicateExcelRows: [],
    };
  }

  if (matches.length === 0) {
    return {
      ...sourceRow,
      status: "not_found",
      matchCount: 0,
      products: [],
      warnings: [],
      duplicateExcelRows: [],
    };
  }

  const products = matches.map((product) =>
    createMatchedProduct(product, sourceRow),
  );
  const wouldUpdate = products.some((product) => product.wouldUpdate);

  return {
    ...sourceRow,
    status: wouldUpdate
      ? matches.length > 1
        ? "multiple_matches"
        : "matched"
      : "unchanged",
    matchCount: matches.length,
    products,
    warnings: [],
    duplicateExcelRows: [],
  };
}

function createMatchedProduct(
  product: CatalogProductInput,
  sourceRow: CatalogUpdateRow,
): CatalogMatchedProduct {
  const current: CatalogProductValues = {
    name: product.name,
    model: product.model,
    sku: product.sku,
    price: toNullableNumber(product.price),
  };
  const proposed: CatalogProductValues = {
    name: sourceRow.name,
    model: sourceRow.model,
    sku: sourceRow.sku,
    price: sourceRow.price,
  };
  const changes = CATALOG_UPDATE_FIELDS.flatMap((field) =>
    fieldValuesEqual(field, current[field], proposed[field])
      ? []
      : [
          {
            field,
            before: current[field],
            after: proposed[field],
          } as CatalogFieldChange,
        ],
  );

  return {
    id: product.id,
    current,
    proposed,
    changes,
    wouldUpdate: changes.length > 0,
  };
}

function markDuplicateSourceRows(rows: CatalogUpdatePlanRow[]): void {
  const rowsBySignature = new Map<string, CatalogUpdatePlanRow[]>();

  for (const row of rows) {
    const signature = JSON.stringify({
      matchName: row.normalizedMatchName,
      name: row.name,
      model: row.model,
      sku: row.sku,
      price: row.price,
    });
    const duplicates = rowsBySignature.get(signature) ?? [];
    duplicates.push(row);
    rowsBySignature.set(signature, duplicates);
  }

  for (const duplicates of rowsBySignature.values()) {
    if (duplicates.length < 2) continue;

    for (const row of duplicates) {
      row.duplicateExcelRows = duplicates
        .filter((duplicate) => duplicate.excelRowNumber !== row.excelRowNumber)
        .map((duplicate) => duplicate.excelRowNumber);
    }
  }
}

function markConflictingProductUpdates(rows: CatalogUpdatePlanRow[]): void {
  const updatesByProductId = new Map<
    string,
    Array<{ row: CatalogUpdatePlanRow; product: CatalogMatchedProduct }>
  >();

  for (const row of rows) {
    for (const product of row.products) {
      if (!product.wouldUpdate) continue;
      const updates = updatesByProductId.get(product.id) ?? [];
      updates.push({ row, product });
      updatesByProductId.set(product.id, updates);
    }
  }

  for (const updates of updatesByProductId.values()) {
    if (updates.length < 2 || hasSingleProposedValue(updates)) continue;

    for (const { row } of updates) {
      row.status = "conflict";
      row.errors.push(
        "Conflicting workbook rows propose different values for the same product",
      );
    }
  }
}

function markProposedNameConflicts(
  rows: CatalogUpdatePlanRow[],
  productsByName: Map<string, CatalogProductInput[]>,
): void {
  for (const row of rows) {
    if (row.status === "invalid" || row.status === "not_found") continue;

    const proposedNameOwners =
      productsByName.get(normalizeCatalogMatchKey(row.name)) ?? [];

    for (const product of row.products) {
      if (!product.wouldUpdate) continue;

      const belongsToAnotherProduct = proposedNameOwners.some(
        (owner) => owner.id !== product.id,
      );
      if (!belongsToAnotherProduct) continue;

      row.status = "conflict";
      if (
        !row.errors.includes(
          "Proposed product name already belongs to another product in this project",
        )
      ) {
        row.errors.push(
          "Proposed product name already belongs to another product in this project",
        );
      }
      break;
    }
  }
}

function hasSingleProposedValue(
  updates: Array<{ row: CatalogUpdatePlanRow; product: CatalogMatchedProduct }>,
): boolean {
  const [first] = updates;
  if (!first) return true;

  return updates.every(({ product }) =>
    CATALOG_UPDATE_FIELDS.every((field) =>
      fieldValuesEqual(
        field,
        first.product.proposed[field],
        product.proposed[field],
      ),
    ),
  );
}

function collectProductUpdates(
  rows: CatalogUpdatePlanRow[],
): CatalogPlannedProductUpdate[] {
  const updatesByProductId = new Map<string, CatalogPlannedProductUpdate>();

  for (const row of rows) {
    for (const product of row.products) {
      if (!product.wouldUpdate) continue;

      const existing = updatesByProductId.get(product.id);
      if (existing) {
        existing.sourceExcelRows.push(row.excelRowNumber);
        continue;
      }

      const changedValues = product.changes.reduce<
        Partial<CatalogProductValues>
      >((values, change) => ({ ...values, [change.field]: change.after }), {});
      updatesByProductId.set(product.id, {
        id: product.id,
        changedValues,
        sourceExcelRows: [row.excelRowNumber],
      });
    }
  }

  return [...updatesByProductId.values()];
}

function buildSummary(
  rows: CatalogUpdatePlanRow[],
  productUpdates: CatalogPlannedProductUpdate[],
): CatalogUpdatePlan["summary"] {
  const statuses: Record<CatalogUpdateStatus, number> = {
    matched: 0,
    multiple_matches: 0,
    unchanged: 0,
    not_found: 0,
    invalid: 0,
    conflict: 0,
  };
  const fieldChanges: Record<CatalogUpdateField, number> = {
    name: 0,
    model: 0,
    sku: 0,
    price: 0,
  };

  let matchedProducts = 0;
  for (const row of rows) {
    statuses[row.status]++;
    matchedProducts += row.products.length;
    for (const product of row.products) {
      for (const change of product.changes) fieldChanges[change.field]++;
    }
  }

  return {
    inputRows: rows.length,
    matched: statuses.matched,
    multipleMatches: statuses.multiple_matches,
    unchanged: statuses.unchanged,
    notFound: statuses.not_found,
    invalid: statuses.invalid,
    conflict: statuses.conflict,
    duplicateSpreadsheetRows: rows.filter(
      (row) => row.duplicateExcelRows.length > 0,
    ).length,
    matchedProducts,
    productsToUpdate: productUpdates.length,
    fieldChanges,
  };
}

function fieldValuesEqual(
  field: CatalogUpdateField,
  left: string | number | null,
  right: string | number | null,
): boolean {
  if (field === "price") return Number(left) === Number(right);
  return left === right;
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}
