import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { PayrollTimeSheetImportDto } from "dto/payroll.dto";

describe("PayrollTimeSheetImportDto", () => {
  it("treats an empty multipart month as omitted so legacy workbooks derive their period", async () => {
    const dto = plainToInstance(PayrollTimeSheetImportDto, { month: "" });

    expect(await validate(dto)).toEqual([]);
    expect(dto.month).toBeUndefined();
  });
});
