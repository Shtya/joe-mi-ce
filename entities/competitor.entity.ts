// entities/competitor.entity.ts
import { Entity, Column, ManyToOne, OneToMany, JoinColumn, Unique, Index } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Project } from './project.entity';
import { AuditCompetitor } from './audit-competitor.entity'; // We'll create this

@Entity('competitor')
@Unique(["name", "project"])  // Ensures that name is unique for each project
@Index(['project', 'name'])   // Add index for better query performance
export class Competitor extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  logo_url: string;

  @Column({ nullable: true })
  description: string;

  @Column({ default: true })
  is_active: boolean;

  @ManyToOne(() => Project, project => project.competitors)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @Column({ nullable: true })
  project_id: string;

  @OneToMany(() => AuditCompetitor, auditCompetitor => auditCompetitor.competitor)
  auditCompetitors: AuditCompetitor[];

}