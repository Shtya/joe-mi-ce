import { JourneyController } from "./journey.controller";

describe("JourneyController supervisor unplanned visit", () => {
  it("passes an uploaded check-in image to the supervisor unplanned visit service", async () => {
    const journeyService = {
      checkInSupervisorUnplannedVisit: jest.fn().mockResolvedValue({
        journey: { id: "journey-1" },
      }),
    };
    const controller = new JourneyController(journeyService as any, {} as any);
    const dto = {
      lat: 30.0444,
      lng: 31.2357,
      checkInTime: "2026-09-10T09:00:00.000Z",
    };
    const file = { filename: "supervisor-check-in.jpg" } as Express.Multer.File;

    await controller.checkInSupervisorUnplannedVisit(
      dto,
      { user: { id: "supervisor-1" } },
      file,
    );

    expect(journeyService.checkInSupervisorUnplannedVisit).toHaveBeenCalledWith(
      expect.objectContaining({
        image: "/tmp/checkins/supervisor-check-in.jpg",
      }),
      { id: "supervisor-1" },
    );
  });
});
