import { BadRequestException } from "@nestjs/common";
import { UserVacationBalanceUpdate } from "./vacation-balance.service";
import { parseBalanceDate, roundDays } from "./vacation-balance.util";

const balanceHeaders: Record<string, keyof UserVacationBalanceUpdate> = {
  compensatoryremainingdays: "compensatoryRemainingDays",
  "رصيد الإجازة التعويضية": "compensatoryRemainingDays",
  annualremainingdays: "annualRemainingDays",
  "رصيد الإجازة السنوية": "annualRemainingDays",
  joiningdate: "joiningDate",
  "تاريخ الالتحاق": "joiningDate",
};

export function readVacationBalanceImport(
  row: Record<string, unknown>,
): UserVacationBalanceUpdate {
  const result: UserVacationBalanceUpdate = {};
  for (const [header, raw] of Object.entries(row)) {
    const key =
      balanceHeaders[
        header
          .trim()
          .toLowerCase()
          .replace(/[\s_-]+/g, "")
      ] ?? balanceHeaders[header.trim()];
    if (
      !key ||
      raw === undefined ||
      raw === null ||
      (typeof raw === "string" && !raw.trim())
    ) {
      continue;
    }
    if (result[key] !== undefined) {
      throw new BadRequestException(`Duplicate ${key} column`);
    }
    if (key === "joiningDate") {
      const value =
        raw instanceof Date
          ? raw.toISOString().slice(0, 10)
          : String(raw).trim();
      try {
        parseBalanceDate(value);
      } catch {
        throw new BadRequestException("Joining Date must use YYYY-MM-DD");
      }
      result.joiningDate = value;
      continue;
    }
    const maximum = key === "annualRemainingDays" ? 21 : 365;
    if (
      (typeof raw !== "number" && typeof raw !== "string") ||
      (typeof raw === "string" && !/^\d+(?:\.\d+)?$/.test(raw.trim()))
    ) {
      throw new BadRequestException(`${key} must be a number`);
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > maximum) {
      throw new BadRequestException(`${key} must be between 0 and ${maximum}`);
    }
    // Excel formulas can carry extra binary/decimal precision; the ledger is numeric(10,4).
    result[key] = roundDays(value);
  }
  return result;
}
