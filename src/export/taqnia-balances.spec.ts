import { Writable } from "stream";
import { Workbook } from "exceljs";
import { DataSource } from "typeorm";
import { HttpService } from "@nestjs/axios";
import { ExportService } from "./export.service";
import { readVacationBalanceImport } from "src/vacation/vacation-balance-excel";

describe("Taqnia balance workbook", () => {
  it.each(["user", "users", "teams"])(
    "exports editable numeric balances for %s and imports the same columns",
    async (entity) => {
      const chunks: Buffer[] = [];
      const response = Object.assign(
        new Writable({
          write(chunk, _encoding, done) {
            chunks.push(Buffer.from(chunk));
            done();
          },
        }),
        { setHeader: () => undefined },
      );
      const service = new ExportService({} as DataSource, {} as HttpService);
      await service.exportRowsToExcel(
        response,
        [
          {
            username: "AEC-01",
            name: "Employee",
            joiningDate: "2026-07-01",
            canGrantCompensatoryLeave: true,
            vacationBalance: "Annual: 14 | Compensatory: 3",
            vacationBalanceDetails: {
              joiningDate: "2026-07-01",
              annualRemainingDays: 14,
              compensatoryRemainingDays: 3,
            },
          },
          {
            username: "AEC-02",
            canGrantCompensatoryLeave: false,
            vacationBalance: {
              joiningDate: null,
              annualRemainingDays: 0,
              compensatoryRemainingDays: 0,
            },
          },
          { username: "other-project", vacationBalance: null },
        ],
        entity,
      );
      const workbook = new Workbook();
      await workbook.xlsx.load(Buffer.concat(chunks));
      const sheet = workbook.worksheets[0];
      const row: Record<string, unknown> = {};
      sheet.getRow(1).eachCell((cell, column) => {
        row[String(cell.value)] = sheet.getRow(2).getCell(column).value;
      });
      expect(row["Username"]).toBe("AEC-01");
      expect(row["Annual Remaining Days"]).toBe(14);
      expect(row["Compensatory Remaining Days"]).toBe(3);
      expect(row["Joining Date"]).toBe("2026-07-01");
      const balanceHeaders = Object.keys(row).filter((header) =>
        /vacationbalance|annualremainingdays|compensatoryremainingdays|joiningdate|cangrantcompensatoryleave/.test(
          header.toLowerCase().replace(/\s/g, ""),
        ),
      );
      expect(balanceHeaders.sort()).toEqual([
        "Annual Remaining Days",
        "Compensatory Remaining Days",
        "Joining Date",
      ]);
      expect(readVacationBalanceImport(row)).toEqual({
        joiningDate: "2026-07-01",
        annualRemainingDays: 14,
        compensatoryRemainingDays: 3,
      });
      let annualColumn = 0;
      sheet.getRow(1).eachCell((cell, column) => {
        if (cell.value === "Annual Remaining Days") annualColumn = column;
      });
      expect(annualColumn).toBeGreaterThan(0);
      expect(sheet.getRow(3).getCell(annualColumn).value).toBe(0);
      expect(sheet.getRow(4).getCell(annualColumn).value).toBeNull();
      row["Annual Remaining Days"] = 12;
      row["Compensatory Remaining Days"] = 0;
      expect(readVacationBalanceImport(row)).toMatchObject({
        annualRemainingDays: 12,
        compensatoryRemainingDays: 0,
      });
    },
  );
});
