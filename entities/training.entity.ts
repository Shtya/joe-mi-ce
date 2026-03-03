import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Project } from './project.entity';

@Entity('trainings')
export class Training extends CoreEntity {
  @Column({ name: 'project_id' })
  projectId: string;

  @ManyToOne(() => Project, (project) => project.trainings)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ nullable: true })
  video_url: string;

  @Column({ nullable: true })
  pdf_url: string;

  @Column()
  title_ar: string;

  @Column()
  title_en: string;

  @Column({ type: 'text', nullable: true })
  description_ar: string;

  @Column({ type: 'text', nullable: true })
  description_en: string;
}
