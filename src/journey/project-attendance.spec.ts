import { BadRequestException } from "@nestjs/common";
import {
  resolveProjectAttendance,
  INATURAL_PROJECT_ID,
} from "./project-attendance";

const location = (
  id: string,
  name: string,
  lat: number,
  projectId = INATURAL_PROJECT_ID,
) => ({
  id,
  name,
  geo: { lat, lng: 50 },
  project: { id: projectId, is_active: true },
  deleted_at: null,
});

describe("Inatural project attendance", () => {
  it("uses the configured radius and project for an enabled shift", () => {
    const branch = {
      ...location("other", "Other project site", 26, "other"),
      geofence_radius_meters: 500,
    };
    expect(
      resolveProjectAttendance(
        { lat: 26.004, lng: 50 },
        [branch],
        branch.id,
        "en",
        "other",
      ).branch.id,
    ).toBe("other");
  });
  it("accepts a site with a larger radius even if a nearer site's radius excludes the user", () => {
    const near = {
      ...location("near", "Near", 26),
      geofence_radius_meters: 10,
    };
    const allowed = {
      ...location("allowed", "Allowed", 26.001),
      geofence_radius_meters: 500,
    };
    expect(
      resolveProjectAttendance(
        { lat: 26.0002, lng: 50 },
        [near, allowed],
        "near",
        "en",
      ).branch.id,
    ).toBe("allowed");
  });
  it("accepts attendance between 100 and 300 meters", () => {
    const result = resolveProjectAttendance(
      { lat: 26.002, lng: 50 },
      [location("one", "One", 26)],
      "one",
      "en",
    );
    expect(result.distanceMeters).toBeGreaterThan(100);
    expect(result.distanceMeters).toBeLessThan(300);
  });
  it("accepts a different project branch and returns its identity for the shift record", () => {
    const actual = location("actual", "الظهران", 26.001);
    const result = resolveProjectAttendance(
      { lat: 26.0011, lng: 50 },
      [location("planned", "النخيل", 26), actual],
      "planned",
      "ar",
    );
    expect(result.branch.id).toBe("actual");
    expect(result.distanceMeters).toBeLessThan(20);
  });

  it.each(["ar", "en"])(
    "reports the nearest project's branch and distance when too far (%s)",
    (lang) => {
      try {
        resolveProjectAttendance(
          { lat: 26.005, lng: 50 },
          [location("far", "النخيل", 26), location("near", "الظهران", 26.001)],
          "far",
          lang,
        );
        throw new Error("Expected location rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        if (!(error instanceof BadRequestException)) throw error;
        expect(error.getResponse()).toMatchObject({
          code: "OUTSIDE_PROJECT_GEOFENCE",
          nearestBranchId: "near",
          branchName: "الظهران",
          allowedRadiusMeters: 300,
          distanceMeters: expect.any(Number),
          message: expect.stringContaining("الظهران"),
        });
        const response = error.getResponse();
        if (typeof response === "string")
          throw new Error("Expected structured rejection");
        expect(JSON.stringify(response)).toContain("444");
      }
    },
  );

  it("does not use a nearby foreign, deleted or inactive location", () => {
    const invalid = [
      location("foreign", "Foreign", 26.003, "other"),
      { ...location("deleted", "Deleted", 26.003), deleted_at: new Date() },
      {
        ...location("inactive", "Inactive", 26.003),
        project: { id: INATURAL_PROJECT_ID, is_active: false },
      },
      { ...location("bad", "Invalid", 26.003), geo: { lat: NaN, lng: 50 } },
    ];
    expect(() =>
      resolveProjectAttendance(
        { lat: 26.003, lng: 50 },
        [...invalid, location("valid", "Only valid", 26)],
        "foreign",
        "en",
      ),
    ).toThrow("Only valid");
  });

  it("does not fall back to unrestricted roaming when no locations are configured", () => {
    expect(() =>
      resolveProjectAttendance({ lat: 26, lng: 50 }, [], "none", "en"),
    ).toThrow(BadRequestException);
  });

  it.each([
    { lat: NaN, lng: 50 },
    { lat: 91, lng: 50 },
    { lat: 26, lng: 181 },
  ])("rejects invalid device coordinates %j", (geo) => {
    expect(() =>
      resolveProjectAttendance(geo, [location("one", "One", 26)], "one", "en"),
    ).toThrow(BadRequestException);
  });

  it("prefers the planned branch for identical coordinates and otherwise breaks ties deterministically", () => {
    const branches = [location("b", "Second", 26), location("a", "First", 26)];
    expect(
      resolveProjectAttendance({ lat: 26, lng: 50 }, branches, "b", "en").branch
        .id,
    ).toBe("b");
    expect(
      resolveProjectAttendance({ lat: 26, lng: 50 }, branches, "none", "en")
        .branch.id,
    ).toBe("a");
  });
});
