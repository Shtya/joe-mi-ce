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



}