import { Entity, Column, PrimaryColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('promoter_locations')
@Index(['projectId', 'updatedAt']) // fast live-map query
export class PromoterLocation {
  /** userId is the PK — guarantees exactly one row per promoter */
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @Column('decimal', { precision: 9, scale: 6 })
  lat: number;

  @Column('decimal', { precision: 9, scale: 6 })
  lng: number;

  @Column({ nullable: true })
  projectId: string;

  @Column({ type: 'uuid', nullable: true })
  checkInId: string;

  @Column({ nullable: true })
  name: string;

  @Column({ nullable: true })
  avatar_url: string;

  /** true when the promoter is outside the branch geofence */
  @Column({ default: false })
  isOutside: boolean;

  /** The time the device went offline (null = currently online) */
  @Column({ type: 'timestamptz', nullable: true })
  offlineSince: Date | null;

  /** Auto-updated on every upsert — used for 30-min staleness check */
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
