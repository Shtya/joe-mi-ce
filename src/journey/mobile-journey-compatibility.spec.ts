import { JourneyService } from "./journey.service";
import { Journey, JourneyStatus } from "entities/all_plans.entity";
import { Branch } from "entities/branch.entity";

describe("Legacy mobile journey compatibility", () => {
  const journeys = { find: jest.fn() };
  let service: JourneyService;

  beforeEach(() => {
    service = new JourneyService(
      {} as never,
      journeys as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it.each([
    ["ar", "أي فرع في المشروع"],
    ["ar-SA", "أي فرع في المشروع"],
    ["en", "Any project branch"],
  ])(
    "makes a branchless journey renderable in %s without assigning a real branch",
    async (lang, label) => {
      const journey = Object.assign(new Journey(), {
        id: "journey",
        branch: null,
        status: JourneyStatus.ABSENT,
        allowAttendanceFromAnyProjectLocation: true,
      });
      journeys.find.mockResolvedValue([journey]);
      const [response] = await service.getTodayJourneysForUserMobile(
        "user",
        lang,
      );
      expect(response.branch).toMatchObject({
        id: "",
        name: label,
        isDisplayOnly: true,
        city: { name: label, region: { name: label } },
      });
      expect(response).toMatchObject({
        assignedBranchId: null,
        allowAttendanceFromAnyProjectLocation: true,
        journeyStatus: lang.startsWith("ar") ? "غائب" : "Absent",
      });
      expect(journey.branch).toBeNull();
    },
  );

  it("preserves the actual branch ID after attendance and fills missing display geography only", async () => {
    const branch = Object.assign(new Branch(), {
      id: "actual-branch",
      name: "Mall",
      city: null,
    });
    const journey = Object.assign(new Journey(), {
      branch,
      status: JourneyStatus.PRESENT,
    });
    journeys.find.mockResolvedValue([journey]);
    const [response] = await service.getTodayJourneysForUserMobile("user");
    expect(response.branch.id).toBe("actual-branch");
    expect(response.branch.city.name).toBeTruthy();
    expect(branch.city).toBeNull();
  });
});
