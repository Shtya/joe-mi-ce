const annualDays = 21;
const precision = 10000;

export function roundDays(value: number): number {
  return Math.round(value * precision) / precision;
}

export function parseBalanceDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Invalid date");
  const result = new Date(`${value}T00:00:00Z`);
  if (
    !Number.isFinite(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("Invalid date");
  }
  return result;
}

function anniversary(joining: Date, year: number): string {
  const month = joining.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(year, month, Math.min(joining.getUTCDate(), lastDay)),
  )
    .toISOString()
    .slice(0, 10);
}

export function contractPeriod(
  joiningDate: string,
  asOf: string,
): { start: string; end: string } {
  const joining = parseBalanceDate(joiningDate);
  const date = parseBalanceDate(asOf);
  let year = Math.max(joining.getUTCFullYear(), date.getUTCFullYear());
  if (asOf < anniversary(joining, year) && year > joining.getUTCFullYear())
    year--;
  return {
    start: anniversary(joining, year),
    end: anniversary(joining, year + 1),
  };
}

// HR's 12 x 30-day model. Anniversary dates, rather than January 1,
// delimit the period; the joining day itself has no earned credit yet.
export function earnedAnnualDays(joiningDate: string, asOf: string): number {
  const period = contractPeriod(joiningDate, asOf);
  if (asOf < joiningDate) return 0;
  const index = (value: string) => {
    const date = parseBalanceDate(value);
    return (
      date.getUTCFullYear() * 360 +
      date.getUTCMonth() * 30 +
      Math.min(date.getUTCDate(), 30) -
      1
    );
  };
  return roundDays(
    (annualDays *
      Math.min(360, Math.max(0, index(asOf) - index(period.start)))) /
      360,
  );
}

export function allocateVacationDays(
  count: number,
  annualAvailable: number,
  compensatoryAvailable: number,
) {
  let annual = Math.max(0, Math.round(annualAvailable * precision));
  let compensatory = Math.max(0, Math.round(compensatoryAvailable * precision));
  if (
    !Number.isInteger(count) ||
    count < 0 ||
    count * precision > annual + compensatory
  ) {
    throw new Error("Insufficient vacation balance");
  }
  return Array.from({ length: count }, () => {
    const fromAnnual = Math.min(precision, annual);
    const fromCompensatory = precision - fromAnnual;
    annual -= fromAnnual;
    compensatory -= fromCompensatory;
    return {
      annualDays: fromAnnual / precision,
      compensatoryDays: fromCompensatory / precision,
    };
  });
}

export function balanceToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((value) => value.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
