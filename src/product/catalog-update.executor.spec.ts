import { buildCatalogUpdatePlan } from "./catalog-update.plan";
import { CatalogUpdateRow } from "./catalog-update.types";
import { applyCatalogUpdatePlan } from "./catalog-update.executor";

const row: CatalogUpdateRow = {
  excelRowNumber: 3,
  matchName: "I5 Stretch",
  normalizedMatchName: "i5 stretch",
  name: "Tineco Floor One i5 strech",
  model: "FW441700AE",
  sacoSku: "111521",
  extraSku: "100487287",
  sku: "111521 - 100487287",
  ignoredSkuComponents: [],
  price: 1799,
  errors: [],
};

describe("applyCatalogUpdatePlan", () => {
  it("updates only changed catalog fields once per product", async () => {
    const product = {
      id: "product-a",
      project_id: "project-1",
      name: "I5 Stretch",
      model: "old-model",
      sku: "old-sku",
      price: 100,
      description: "do not change this",
    };
    const plan = buildCatalogUpdatePlan(
      [row, { ...row, excelRowNumber: 4 }],
      [product],
    );
    const savedProducts: Array<typeof product> = [];
    let transactions = 0;

    const result = await applyCatalogUpdatePlan<typeof product>(
      plan,
      "project-1",
      {
        transaction: async (work) => {
          transactions++;
          return work({
            findProduct: async (id, projectId) =>
              id === product.id && projectId === product.project_id
                ? product
                : null,
            saveProduct: async (updatedProduct) => {
              savedProducts.push(updatedProduct);
              return updatedProduct;
            },
          });
        },
      },
    );

    expect(transactions).toBe(1);
    expect(savedProducts).toEqual([
      {
        ...product,
        name: "Tineco Floor One i5 strech",
        model: "FW441700AE",
        sku: "111521 - 100487287",
        price: 1799,
      },
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        committedProducts: 1,
        committedFieldChanges: 4,
      }),
    );
  });

  it("refuses an invalid or conflicting plan before starting a transaction", async () => {
    const invalidPlan = buildCatalogUpdatePlan(
      [
        {
          ...row,
          price: null,
          errors: ["RSP must be a finite non-negative number"],
        },
      ],
      [],
    );
    const transaction = jest.fn();

    await expect(
      applyCatalogUpdatePlan(invalidPlan, "project-1", { transaction }),
    ).rejects.toThrow(
      "Catalog update import contains invalid or conflicting rows",
    );
    expect(transaction).not.toHaveBeenCalled();
  });
});
