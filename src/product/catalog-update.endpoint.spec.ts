import { isCatalogUpdateDryRun } from "./catalog-update.endpoint";

describe("isCatalogUpdateDryRun", () => {
  it.each([undefined, "", "true", "FALSE", "0"])(
    "keeps dry run enabled for %p",
    (value) => {
      expect(isCatalogUpdateDryRun(value)).toBe(true);
    },
  );

  it("enables writes only for the exact false value", () => {
    expect(isCatalogUpdateDryRun("false")).toBe(false);
  });
});
