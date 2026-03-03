import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { Project } from './project.entity';
import { Branch } from './branch.entity';

export enum EEntranceLetterStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('entrance_letters')
export class EntranceLetter extends CoreEntity {
  @ManyToOne(() => User)
  @JoinColumn({ name: 'supervisor_id' })
  supervisor: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'promoter_id' })
  promoter: User;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @Column({
    type: 'enum',
    enum: EEntranceLetterStatus,
    default: EEntranceLetterStatus.PENDING,
  })
  status: EEntranceLetterStatus;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'processed_by' })
  processedBy: User;

  @Column({ type: 'text', nullable: true })
  rejection_reason: string;
}
