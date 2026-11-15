import { BadRequestException } from "@nestjs/common";
import { readVacationBalanceImport } from "./vacation-balance-excel";

describe("vacation balance Excel input", () => {
  it("parses annual balances and joining dates alongside compensatory days", () => {
    expect(
      readVacationBalanceImport({
        "Annual Remaining Days": "14",
        "Joining Date": "2026-07-01",
        "Compensatory Remaining Days": 3,
      }),
    ).toEqual({
      annualRemainingDays: 14,
      joiningDate: "2026-07-01",
      compensatoryRemainingDays: 3,
    });
    expect(readVacationBalanceImport({ annualRemainingDays: "0" })).toEqual({
      annualRemainingDays: 0,
    });
    expect(() =>
      readVacationBalanceImport({ annualRemainingDays: "22" }),
    ).toThrow();
    expect(() =>
      readVacationBalanceImport({ "Joining Date": "2026-02-30" }),
    ).toThrow();
  });
  it.each([
    "Compensatory Remaining Days",
    "compensatoryRemainingDays",
    "compensatory_remaining_days",
    "رصيد الإجازة التعويضية",
  ])("accepts %s with zero preserved", (header) => {
    expect(readVacationBalanceImport({ [header]: "0" })).toEqual({
      compensatoryRemainingDays: 0,
    });
    expect(readVacationBalanceImport({ [header]: 3 })).toEqual({
      compensatoryRemainingDays: 3,
    });
  });
  it.each([undefined, null, "", "  "])("leaves blank %s unchanged", (value) => {
    expect(
      readVacationBalanceImport({ "Compensatory Remaining Days": value }),
    ).toEqual({});
  });
  it.each([
    -1,
    366,
    true,
    "abc",
    "3 days",
    "0x10",
    "Infinity",
    "1.12345",
    { formula: "1+2" },
  ])("rejects invalid input %s", (value) => {
    expect(() =>
      readVacationBalanceImport({ "Compensatory Remaining Days": value }),
    ).toThrow(BadRequestException);
  });
});
