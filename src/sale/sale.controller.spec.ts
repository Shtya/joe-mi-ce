import { CRUD } from "common/crud.service";
import { SaleController } from "./sale.controller";

describe("SaleController export date filters", () => {
  afterEach(() => jest.restoreAllMocks());

  it("filters by the sale date column over the full Riyadh calendar day", async () => {
    const exportSpy = jest
      .spyOn(CRUD, "exportEntityToExcel2")
      .mockResolvedValue(undefined as never);
    const controller = new SaleController(
      { saleRepo: {} } as any,
      {
        resolveProjectIdFromUser: jest
          .fn()
          .mockResolvedValue("gatemea-project"),
      } as any,
    );

    await controller.exportData(
      { filters: { fromDate: "2026-09-17", toDate: "2026-09-17" } },
      { user: { id: "user-id" } },
      {},
    );

    expect(exportSpy).toHaveBeenCalledWith(
      {},
      "sale",
      "sales_report",
      {},
      expect.objectContaining({
        filters: {
          projectId: "gatemea-project",
          sale_date: {
            gte: "2026-09-17T00:00:00.000+03:00",
            lte: "2026-09-17T23:59:59.999+03:00",
          },
        },
      }),
    );
  });
});
