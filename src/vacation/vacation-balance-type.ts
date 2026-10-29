export type VacationBalanceType = "annual" | "compensatory" | "none";

// These are the stable reason/type codes already sent by the clients.
export function vacationBalanceType(reason: string): VacationBalanceType {
  const type = reason.trim().toLowerCase();
  if (type === "compensatory_leave") return "compensatory";
  if (
    [
      "weekend_vacation",
      "weekly_leave",
      "sick_leave",
      "sick leave",
      "permission_or_absence",
    ].includes(type)
  )
    return "none";
  // Preserve the annual default for legacy clients using free-text reasons.
  return "annual";
}
