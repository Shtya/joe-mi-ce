import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Unique } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Project } from './project.entity';

@Entity()
@Unique(["name", "project"])  // Ensures that name is unique for each project
export class Competitor extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  logo_url: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;
}
