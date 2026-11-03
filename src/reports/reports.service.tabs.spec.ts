import * as fs from "fs/promises";
import * as ExcelJS from "exceljs";
import { ObjectLiteral, Repository } from "typeorm";
import { ReportsService } from "./reports.service";

describe("Taqnia monthly report worksheets", () => {
  it("omits MG Attendance and Overtime while retaining the requested useful sheets", async () => {
    const query = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      createQueryBuilder: jest.fn().mockReturnValue(query),
    };
    const repo = <T extends ObjectLiteral>() =>
      repository as unknown as Repository<T>;
    const service = new ReportsService(
      repo(),
      {
        ...repository,
        findOne: jest.fn().mockResolvedValue({ id: "taqnia", branches: [] }),
      } as unknown as Repository<import("entities/project.entity").Project>,
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
    );
    const file = await service.generateMonthlyReport(
      "2026-10-01T10:00:00+03:00",
      { tabs: { mgAttendance: true, overtime: true } },
    );
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file);
      const names = workbook.worksheets.map((sheet) => sheet.name);
      expect(names).not.toContain("MG Attendance");
      expect(names).not.toContain("Overtime");
      expect(names).toContain("Attendance");
      expect(names).toContain("Sales by Model");
    } finally {
      await fs.unlink(file);
    }
  });
});
