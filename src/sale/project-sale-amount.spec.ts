import { projectSaleAmount } from "./project-sale-amount";
import { INATURAL_PROJECT_ID } from "../project/customer-projects";

describe("Inatural promotional pricing", () => {
  it.each([
    [1, 99],
    [2, 198],
    [10, 990],
  ])(
    "rounds the 149-to-99 unit price before multiplying %s units",
    (quantity, total) => {
      expect(
        projectSaleAmount(INATURAL_PROJECT_ID, 149, quantity, 33.56, -1),
      ).toBe(total);
    },
  );
  it("preserves another project's existing total", () => {
    expect(projectSaleAmount("other", 149, 10, 33.56, 989.956)).toBe(989.956);
  });
  it("handles decimal strings from PostgreSQL without concatenating", () => {
    expect(
      projectSaleAmount(INATURAL_PROJECT_ID, "149.00", 2, "33.56", 0),
    ).toBe(198);
  });
});
