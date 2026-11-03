import { isRoamingLocation } from "./roaming-location";

describe("Database roaming name variants", () => {
  it.each([
    "ROAMING",
    "Roaming",
    "Roaming Jeddah",
    "Roaming  Al-Hassa",
    "JEDDAH - ROAMING",
    "Dammam Roaming ",
    "Roming Riyadh",
    "Roaming-Eastern",
  ])("recognizes the stored branch variant %s", (name) => {
    expect(isRoamingLocation({ name, chain: { name: "extra" } })).toBe(true);
  });
  it("recognizes a chain-only roaming assignment", () => {
    expect(
      isRoamingLocation({
        name: "Western Region",
        chain: { name: " RoAmInG " },
      }),
    ).toBe(true);
  });
  it.each([
    null,
    undefined,
    { name: "Showroom" },
    { name: "Roamington" },
    { name: "Regular", chain: { name: "Extra" } },
  ])(
    "does not classify ordinary/missing locations as roaming: %j",
    (branch) => {
      expect(isRoamingLocation(branch)).toBe(false);
    },
  );
});
