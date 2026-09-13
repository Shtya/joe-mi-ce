import { CatalogUpdateRow } from "./catalog-update.types";
import { buildCatalogUpdatePlan } from "./catalog-update.plan";

const createRow = (
  overrides: Partial<CatalogUpdateRow> = {},
): CatalogUpdateRow => ({
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
  ...overrides,
});

describe("buildCatalogUpdatePlan", () => {
  it("shows every exact matched product with current, proposed, and changed fields", () => {
    const result = buildCatalogUpdatePlan(
      [createRow()],
      [
        {
          id: "product-a",
          project_id: "project-1",
          name: " I5   Stretch ",
          model: "old-model",
          sku: "old-sku",
          price: 100,
        },
        {
          id: "product-b",
          project_id: "project-1",
          name: "i5 stretch",
          model: "old-model",
          sku: "old-sku",
          price: 100,
        },
      ],
    );

    expect(result.rows).toEqual([
      expect.objectContaining({
        status: "multiple_matches",
        matchCount: 2,
        products: [
          expect.objectContaining({
            id: "product-a",
            current: {
              name: " I5   Stretch ",
              model: "old-model",
              sku: "old-sku",
              price: 100,
            },
            proposed: {
              name: "Tineco Floor One i5 strech",
              model: "FW441700AE",
              sku: "111521 - 100487287",
              price: 1799,
            },
            changes: [
              {
                field: "name",
                before: " I5   Stretch ",
                after: "Tineco Floor One i5 strech",
              },
              { field: "model", before: "old-model", after: "FW441700AE" },
              { field: "sku", before: "old-sku", after: "111521 - 100487287" },
              { field: "price", before: 100, after: 1799 },
            ],
            wouldUpdate: true,
          }),
          expect.objectContaining({ id: "product-b", wouldUpdate: true }),
        ],
      }),
    ]);
    expect(result.summary).toEqual(
      expect.objectContaining({
        inputRows: 1,
        multipleMatches: 1,
        matchedProducts: 2,
        productsToUpdate: 2,
        fieldChanges: { name: 2, model: 2, sku: 2, price: 2 },
      }),
    );
  });

  it("does not fuzzy match a different product name", () => {
    const result = buildCatalogUpdatePlan(
      [createRow()],
      [
        {
          id: "partial-name",
          project_id: "project-1",
          name: "I5 Stretch Pro",
          model: "old-model",
          sku: "old-sku",
          price: 100,
        },
      ],
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "not_found",
        matchCount: 0,
        products: [],
      }),
    );
  });

  it("reports unchanged products with their full details", () => {
    const row = createRow({
      matchName: "Tineco Floor One i5 strech",
      normalizedMatchName: "tineco floor one i5 strech",
    });
    const result = buildCatalogUpdatePlan(
      [row],
      [
        {
          id: "unchanged-product",
          project_id: "project-1",
          name: row.name,
          model: row.model,
          sku: row.sku,
          price: row.price,
        },
      ],
    );

    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "unchanged",
        products: [
          expect.objectContaining({
            current: {
              name: row.name,
              model: row.model,
              sku: row.sku,
              price: row.price,
            },
            proposed: {
              name: row.name,
              model: row.model,
              sku: row.sku,
              price: row.price,
            },
            changes: [],
            wouldUpdate: false,
          }),
        ],
      }),
    );
  });

  it("marks conflicting source rows for the same product and blocks applying them", () => {
    const result = buildCatalogUpdatePlan(
      [
        createRow(),
        createRow({ excelRowNumber: 4, name: "Different name", price: 2000 }),
      ],
      [
        {
          id: "product-a",
          project_id: "project-1",
          name: "I5 Stretch",
          model: "old-model",
          sku: "old-sku",
          price: 100,
        },
      ],
    );

    expect(result.canApply).toBe(false);
    expect(result.rows).toEqual([
      expect.objectContaining({ status: "conflict" }),
      expect.objectContaining({ status: "conflict" }),
    ]);
  });

  it("flags a new name that belongs to another product in the project", () => {
    const result = buildCatalogUpdatePlan(
      [createRow({ name: "Existing other product" })],
      [
        {
          id: "product-a",
          project_id: "project-1",
          name: "I5 Stretch",
          model: "old-model",
          sku: "old-sku",
          price: 100,
        },
        {
          id: "product-b",
          project_id: "project-1",
          name: "Existing other product",
          model: "other-model",
          sku: "other-sku",
          price: 200,
        },
      ],
    );

    expect(result.canApply).toBe(false);
    expect(result.rows[0]).toEqual(
      expect.objectContaining({
        status: "conflict",
        errors: [
          "Proposed product name already belongs to another product in this project",
        ],
      }),
    );
  });
});
