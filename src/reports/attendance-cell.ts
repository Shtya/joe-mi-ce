type PayrollViolation = {
  eventDate: string;
  deductionAmount: string;
};

type PayrollAttendanceLine = {
  violations?: PayrollViolation[];
};

export function getDailyAttendanceDeductions(
  userId: string,
  payrollLinesByUserId: Map<string, PayrollAttendanceLine>,
): Map<string, number> {
  const deductionsByDate = new Map<string, number>();
  const violations = payrollLinesByUserId.get(userId)?.violations || [];

  violations.forEach((violation) => {
    const deduction = Number(violation.deductionAmount || 0);
    deductionsByDate.set(
      violation.eventDate,
      (deductionsByDate.get(violation.eventDate) || 0) + deduction,
    );
  });

  return deductionsByDate;
}

export function formatAttendanceCell(
  attendanceStatus: number | string,
  deductionAmount: number,
): number | string {
  if (deductionAmount <= 0) return attendanceStatus;

  const status = attendanceStatus === "" ? "Deduction" : attendanceStatus;
  return `${status} (${deductionAmount.toFixed(2)})`;
}

export function formatVacationCell(reason?: string): string {
  const normalizedReason = reason?.trim();
  return normalizedReason ? `Vacation (${normalizedReason})` : "Vacation";
}
