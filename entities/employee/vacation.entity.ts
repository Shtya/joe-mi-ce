// entities/employee/vacation.entity.ts
import { Branch } from 'entities/branch.entity';
import { CoreEntity } from 'entities/core.entity';
import { User } from 'entities/user.entity';
import { VacationDate } from './vacation-date.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';

@Entity('vacations')
export class Vacation extends CoreEntity {
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @OneToMany(() => VacationDate, vacationDate => vacationDate.vacation, { cascade: true })
  vacationDates: VacationDate[];

  @Column()
  reason: string;

  @Column({ nullable: true })
  image_url: string;

  @Column({
    type: 'enum',
    enum: ['pending',  'approved', 'rejected'],
    default: 'pending',
  })
  overall_status: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processed_by' })
  processedBy: User;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string;
}