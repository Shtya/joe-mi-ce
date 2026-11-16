// Call only after establishing that the employee belongs to Taqnia.
export function qualifiesForAnnualAutoApproval(
  requestedDays: number,
  annualAvailable: number,
  reason: string,
): boolean {
  if (
    reason.trim().toLowerCase() !== "annual_leave" ||
    !Number.isFinite(annualAvailable)
  ) {
    return false;
  }
  if (requestedDays === 1) return annualAvailable > 0.5;
  if (requestedDays === 2) return annualAvailable > 1.6;
  return false;
}
