import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

/**
 * Append-only audit trail for every location event:
 *  - Geofence exits during check-in/check-out
 *  - Offline pings synced later from the mobile app
 *  - Live pings from the WebSocket gateway
 */
@Entity('location_logs')
@Index(['userId', 'recordedAt'])
@Index(['journeyId'])
export class LocationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  /** Optional: links this log entry to a specific journey */
  @Column({ type: 'uuid', nullable: true })
  journeyId: string;

  /** Optional: links this log entry to a specific check-in */
  @Column({ type: 'uuid', nullable: true })
  checkInId: string;

  /** Optional: links this log entry to a specific project */
  @Column({ nullable: true })
  projectId: string;

  @Column('decimal', { precision: 9, scale: 6 })
  lat: number;

  @Column('decimal', { precision: 9, scale: 6 })
  lng: number;

  /** true when the position is outside the branch geofence */
  @Column({ default: false })
  isOutside: boolean;

  /**
   * The time the device went offline (null = live ping).
   * When provided, recordedAt holds the GPS timestamp from that offline session.
   */
  @Column({ type: 'timestamptz', nullable: true })
  offlineSince: Date | null;

  /** Original GPS timestamp (may be in the past for offline pings) */
  @Column({ type: 'timestamptz' })
  recordedAt: Date;

  /** Server receive time */
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
