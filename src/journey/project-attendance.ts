import { BadRequestException } from "@nestjs/common";
import { getPreciseDistance } from "geolib";
import { INATURAL_PROJECT_ID } from "../project/customer-projects";

// Kept as an export for existing customer-specific compatibility paths.
export { INATURAL_PROJECT_ID } from "../project/customer-projects";
const ATTENDANCE_RADIUS_METERS = 300;

interface Coordinates {
  lat: number;
  lng: number;
}
interface AttendanceBranch {
  id: string;
  name: string;
  geo: Coordinates | null;
  project?: { id: string; is_active?: boolean };
  deleted_at?: Date | null;
  geofence_radius_meters?: number;
}

function validCoordinates(geo: Coordinates | null): geo is Coordinates {
  return (
    !!geo &&
    typeof geo.lat === "number" &&
    typeof geo.lng === "number" &&
    Number.isFinite(geo.lat) &&
    Math.abs(geo.lat) <= 90 &&
    Number.isFinite(geo.lng) &&
    Math.abs(geo.lng) <= 180
  );
}

export function resolveProjectAttendance<T extends AttendanceBranch>(
  geo: Coordinates,
  branches: T[],
  plannedBranchId: string | undefined,
  lang: string,
  projectId: string = INATURAL_PROJECT_ID,
): { branch: T; distanceMeters: number } {
  if (!validCoordinates(geo))
    throw new BadRequestException("Invalid geo coordinates");

  let nearest: { branch: T; distanceMeters: number } | undefined;
  let nearestAllowed: { branch: T; distanceMeters: number } | undefined;
  for (const branch of branches) {
    if (
      branch.project?.id !== projectId ||
      branch.project.is_active === false ||
      branch.deleted_at ||
      !validCoordinates(branch.geo)
    )
      continue;
    const distanceMeters = getPreciseDistance(
      { latitude: geo.lat, longitude: geo.lng },
      { latitude: branch.geo.lat, longitude: branch.geo.lng },
      0.01,
    );
    const tie = nearest && distanceMeters === nearest.distanceMeters;
    const radius = branch.geofence_radius_meters;
    const allowedRadius =
      typeof radius === "number" && Number.isFinite(radius) && radius > 0
        ? radius
        : ATTENDANCE_RADIUS_METERS;
    if (
      distanceMeters <= allowedRadius &&
      (!nearestAllowed ||
        distanceMeters < nearestAllowed.distanceMeters ||
        (distanceMeters === nearestAllowed.distanceMeters &&
          (branch.id === plannedBranchId ||
            (nearestAllowed.branch.id !== plannedBranchId &&
              branch.id.localeCompare(nearestAllowed.branch.id) < 0))))
    ) {
      nearestAllowed = { branch, distanceMeters };
    }
    if (
      !nearest ||
      distanceMeters < nearest.distanceMeters ||
      (tie &&
        (branch.id === plannedBranchId ||
          (nearest.branch.id !== plannedBranchId &&
            branch.id.localeCompare(nearest.branch.id) < 0)))
    )
      nearest = { branch, distanceMeters };
  }

  if (!nearest)
    throw new BadRequestException(
      lang === "ar"
        ? "لا توجد مواقع حضور صالحة لهذا المشروع"
        : "No valid attendance locations are configured for this project",
    );

  if (nearestAllowed) return nearestAllowed;
  const radius = nearest.branch.geofence_radius_meters;
  const allowedRadiusMeters =
    typeof radius === "number" && Number.isFinite(radius) && radius > 0
      ? radius
      : ATTENDANCE_RADIUS_METERS;
  if (nearest.distanceMeters > allowedRadiusMeters) {
    const distanceMeters = Math.ceil(nearest.distanceMeters);
    throw new BadRequestException({
      code: "OUTSIDE_PROJECT_GEOFENCE",
      message:
        lang === "ar"
          ? `أنت بعيد عن مواقع الحضور. أقرب فرع: ${nearest.branch.name}، وتبعد عنه ${distanceMeters} مترًا. المسافة المسموحة ${allowedRadiusMeters} متر.`
          : `You are too far from the attendance locations. Nearest branch: ${nearest.branch.name}, ${distanceMeters} meters away. Allowed distance: ${allowedRadiusMeters} meters.`,
      nearestBranchId: nearest.branch.id,
      branchName: nearest.branch.name,
      distanceMeters,
      allowedRadiusMeters,
    });
  }
  return nearest;
}
