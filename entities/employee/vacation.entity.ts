import { Branch } from 'entities/branch.entity';
import { CoreEntity } from 'entities/core.entity';
import { City } from 'entities/locations/city.entity';
import { User } from 'entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';

@Entity('vacations')
export class Vacation extends CoreEntity {
  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;
 
  @Column('date')
  start_date: Date;

  @Column('date')
  end_date: Date;

  @Column()
  reason: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  })
  status: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processed_by' })
  processedBy: User;

}
