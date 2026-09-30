import { Column, Entity, Index } from "typeorm";
import { CoreEntity } from "./core.entity";

export enum TrackingEventType {
  STARTED = "tracking_started",
  LEFT_GEOFENCE = "left_geofence",
  RETURNED_TO_GEOFENCE = "returned_to_geofence",
  WENT_OFFLINE = "tracking_went_offline",
  RETURNED_ONLINE = "tracking_returned_online",
  CLOSED = "tracking_closed",
}

export type TrackingLocationStatus = "inside" | "outside" | "too_far";

@Entity("tracking_events")
@Index(["userId", "occurredAt"])
@Index(["checkInId", "occurredAt"])
export class TrackingEvent extends CoreEntity {
  @Column({ type: "uuid" })
  userId: string;

  @Column({ type: "uuid", nullable: true })
  projectId: string | null;

  @Column({ type: "uuid", nullable: true })
  journeyId: string | null;

  @Column({ type: "uuid", nullable: true })
  checkInId: string | null;

  @Column({ type: "uuid", nullable: true })
  branchId: string | null;

  @Column({ type: "enum", enum: TrackingEventType })
  type: TrackingEventType;

  @Column({ type: "timestamptz" })
  occurredAt: Date;

  @Column("decimal", { precision: 9, scale: 6, nullable: true })
  lat: number | null;

  @Column("decimal", { precision: 9, scale: 6, nullable: true })
  lng: number | null;

  @Column("integer", { nullable: true })
  distanceMeters: number | null;

  @Column({ type: "varchar", nullable: true })
  previousStatus: TrackingLocationStatus | null;

  @Column({ type: "varchar", nullable: true })
  currentStatus: TrackingLocationStatus | null;

  @Column({ type: "timestamptz", nullable: true })
  offlineSince: Date | null;

  @Column("integer", { nullable: true })
  offlineDurationMinutes: number | null;
}
