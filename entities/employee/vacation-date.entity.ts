// entities/employee/vacation-date.entity.ts
import { CoreEntity } from 'entities/core.entity';
import { Vacation } from 'entities/employee/vacation.entity';
import { User } from 'entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';

@Entity('vacation_dates')
export class VacationDate extends CoreEntity {
  @ManyToOne(() => Vacation, vacation => vacation.vacationDates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'vacation_id' })
  vacation: Vacation;

  @Column('date')
  date: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processed_by' })
  processedBy: User;

  @Column({ type: 'timestamp', nullable: true })
  processed_at: Date;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string;
}