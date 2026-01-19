import { Branch } from 'entities/branch.entity';
import { CoreEntity } from 'entities/core.entity';
import { Project } from 'entities/project.entity';
import { Entity, Column, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, Unique } from 'typeorm';

@Entity('chains')
@Unique(['name', 'project'])
export class Chain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  logoUrl: string;

  @OneToMany(() => Branch, branch => branch.chain)
  branches: Branch[];
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @ManyToOne(() => Project, project => project.chains,{ nullable: true, eager : true })
  project: Project;
}
