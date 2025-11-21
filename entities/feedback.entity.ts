// --- File: entities/feedback.entity.ts ---
import { Entity, Column, ManyToOne } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { Project } from './project.entity';

@Entity('feedback')
export class Feedback extends CoreEntity {
  @ManyToOne(() => User, { eager: true, nullable: true })
  user: User | null;

  @ManyToOne(() => Project, { eager: true, nullable: true })
  project: Project | null;

  @Column()
  type: string;

  @Column({ type: 'text' })
  message: string;

  // URLs for uploaded attachments (images/files)
  @Column('text', { array: true, nullable: true })
  attachment_urls: string[] | null;

  @Column({ default: false })
  is_resolved: boolean;

  @ManyToOne(() => User, { eager: true, nullable: true })
  resolvedBy: User | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolved_at: Date | null;
}
