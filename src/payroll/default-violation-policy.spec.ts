import { DEFAULT_VIOLATION_RULES } from "./default-violation-policy";
describe("DEFAULT_VIOLATION_RULES", () => {
  it("contains all ten supplied rules with four escalation actions", () => {
    expect(DEFAULT_VIOLATION_RULES).toHaveLength(10);
    expect(
      DEFAULT_VIOLATION_RULES.every((rule) => rule.actions.length === 4),
    ).toBe(true);
  });
});
