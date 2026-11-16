import { qualifiesForAnnualAutoApproval } from "./annual-vacation-policy";

describe("annual automatic approval thresholds", () => {
  it.each([
    [1, 0.5, false],
    [1, 0.5001, true],
    [1, 1, true],
    [2, 1.6, false],
    [2, 1.6001, true],
    [2, 2, true],
    [3, 2.9, false],
    [3, 3, false],
    [0, 1, false],
    [1, -1, false],
    [1, NaN, false],
    [1, Infinity, false],
  ])(
    "qualifies %s day(s) with %s annual days: %s",
    (days, available, expected) => {
      expect(
        qualifiesForAnnualAutoApproval(days, available, "annual_leave"),
      ).toBe(expected);
    },
  );
  it.each([
    "compensatory_leave",
    "sick_leave",
    "weekly_leave",
    "legacy reason",
  ])("does not qualify %s", (reason) => {
    expect(qualifiesForAnnualAutoApproval(1, 3, reason)).toBe(false);
  });
});
