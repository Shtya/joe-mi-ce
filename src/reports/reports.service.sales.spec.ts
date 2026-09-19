import * as fs from "fs/promises";
import * as ExcelJS from "exceljs";
import { ReportsService } from "./reports.service";

describe("ReportsService Gatemea sales period", () => {
  it("uses the Riyadh calendar day and includes every status in the export", async () => {
    const sales = [
      {
        sale_date: new Date("2026-09-16T20:59:59.999Z"),
        quantity: 99,
        status: "completed",
        product: { name: "Previous day sale" },
        branch: { name: "Previous branch", chain: { name: "Extra" } },
      },
      {
        sale_date: new Date("2026-09-16T21:00:00.000Z"),
        quantity: 2,
        status: "completed",
        product: { name: "Extra product" },
        branch: { name: "Extra branch", chain: { name: "Extra" } },
      },
      {
        sale_date: new Date("2026-09-17T20:59:59.999Z"),
        quantity: 3,
        status: "completed",
        product: { name: "Saco product" },
        branch: { name: "Saco branch", chain: { name: "Saco" } },
      },
      {
        sale_date: new Date("2026-09-17T21:00:00.000Z"),
        quantity: 70,
        status: "completed",
        product: { name: "Next day sale" },
        branch: { name: "Next branch", chain: { name: "Extra" } },
      },
      {
        sale_date: new Date("2026-09-17T12:00:00.000Z"),
        quantity: 10,
        status: "cancelled",
        product: { name: "Cancelled sale" },
        branch: { name: "Extra branch", chain: { name: "Extra" } },
      },
      {
        sale_date: new Date("2026-09-17T13:00:00.000Z"),
        quantity: 20,
        status: "returned",
        product: { name: "Returned sale" },
        branch: { name: "Saco branch", chain: { name: "Saco" } },
      },
    ];
    let salesRange: { start: Date; end: Date } | undefined;
    const salesQuery = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn((condition, params) => {
        if (condition === "sale.sale_date BETWEEN :start AND :end") {
          salesRange = params;
        }
        return salesQuery;
      }),
      select: jest.fn().mockReturnThis(),
      getMany: jest
        .fn()
        .mockImplementation(() =>
          sales.filter(
            (sale) =>
              salesRange &&
              sale.sale_date >= salesRange.start &&
              sale.sale_date <= salesRange.end,
          ),
        ),
    };
    const emptyQuery = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const project = {
      id: "gatemea-project",
      chains: [{ name: "Extra" }, { name: "Saco" }],
    };
    const service = new (ReportsService as any)(
      { find: jest.fn().mockResolvedValue([]) },
      { findOne: jest.fn().mockResolvedValue(project) },
      { createQueryBuilder: jest.fn().mockReturnValue(emptyQuery) },
      { createQueryBuilder: jest.fn().mockReturnValue(salesQuery) },
      { find: jest.fn().mockResolvedValue([]) },
      { createQueryBuilder: jest.fn().mockReturnValue(emptyQuery) },
      { find: jest.fn().mockResolvedValue([]) },
      { find: jest.fn().mockResolvedValue([]) },
      { findOne: jest.fn().mockResolvedValue(null) },
    );

    const filePath = await service.generateGatemeaReport(
      "2026-09-18T09:00:00+03:00",
    );
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    expect(salesRange).toEqual({
      start: new Date("2026-09-16T21:00:00.000Z"),
      end: new Date("2026-09-17T20:59:59.999Z"),
    });
    expect(salesQuery.andWhere).toHaveBeenCalledTimes(1);

    const reportSheet = workbook.getWorksheet("SixSeven Report")!;
    let totalRowValues: unknown[] | undefined;
    reportSheet.eachRow((row) => {
      if (row.getCell(1).value === "Grand Total") {
        totalRowValues = row.values as unknown[];
      }
    });
    expect(totalRowValues?.slice(1, 5)).toEqual(["Grand Total", 12, 23, 35]);

    await fs.unlink(filePath);
  });
});
