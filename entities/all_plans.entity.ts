// ===== الكيانات الأساسية =====
import { Entity, Column, ManyToOne, JoinColumn, OneToOne, Relation } from 'typeorm';
import { CoreEntity } from 'entities/core.entity';
import { User } from './user.entity';
import { Branch } from './branch.entity';
import { Shift } from './employee/shift.entity';
 
export enum JourneyType {
  PLANNED = 'planned',
  UNPLANNED = 'unplanned',
}

export enum JourneyStatus {
  ABSENT = 'absent',
  PRESENT = 'present',
  CLOSED = 'closed',
  UNPLANNED_ABSENT = 'unplanned_absent',
  UNPLANNED_PRESENT = 'unplanned_present',
  UNPLANNED_CLOSED = 'unplanned_closed',
}

@Entity('journey_plans')
export class JourneyPlan extends CoreEntity {
  @ManyToOne(() => User, { eager: true })
  user: Relation<User>;

  @ManyToOne(() => Branch, { eager: true })
  branch: Relation<Branch>;

  @ManyToOne(() => Shift, { eager: true })
  shift: Relation<Shift>;

  @ManyToOne(() => User, { eager: true })
  createdBy: Relation<User>;

  // ✅ Just a scalar, no relation
  @Column({ type: 'uuid', nullable: true })
  projectId: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  fromDate: string;

  @Column({ type: 'date', nullable: true })
  toDate: string;

  @Column({ type: 'text', array: true })
  days: string[];
}

@Entity('journeys')
export class Journey extends CoreEntity {
  @ManyToOne(() => User, { eager: true, nullable: true })
  user: Relation<User>;

  @ManyToOne(() => Branch, { eager: true, nullable: true })
  branch: Relation<Branch>;

  @ManyToOne(() => Shift, { eager: true, nullable: true })
  shift: Relation<Shift>;

  @Column({ type: 'enum', enum: JourneyType, nullable: true })
  type: JourneyType;

  @Column({ type: 'date', nullable: true })
  date: string;

  @Column({ type: 'enum', enum: JourneyStatus, default: JourneyStatus.ABSENT, nullable: true })
  status: JourneyStatus;

  @ManyToOne(() => JourneyPlan, { nullable: true })
  journeyPlan?: Relation<JourneyPlan>;

  @OneToOne(() => CheckIn, checkin => checkin.journey)
  checkin: Relation<CheckIn>;

  @ManyToOne(() => User, { eager: true, nullable: true })
  createdBy: Relation<User>;

  @Column({ type: 'uuid' })
  projectId: string;
}

@Entity('check_ins')
export class CheckIn extends CoreEntity {
  @OneToOne(() => Journey, journey => journey.checkin, { onDelete: 'CASCADE' })
  @JoinColumn()
  journey: Relation<Journey>;

  @ManyToOne(() => User, { eager: true })
  user: Relation<User>;

  @Column({ type: 'timestamp', nullable: true })
  checkInTime: Date;

  @Column({ type: 'timestamp', nullable: true })
  checkOutTime: Date;

  @Column({ nullable: true })
  checkInDocument: string;

  @Column({ nullable: true })
  checkOutDocument: string;

  @Column({nullable : true})
  geo: string;

  @Column({ nullable: true })
  image: string;

  @Column({ type: 'text', nullable: true })
  noteIn: string;

  @Column({ type: 'text', nullable: true })
  noteOut: string;

  @Column({ default: false })
  isWithinRadius: boolean;
}
