import { Entity, PrimaryGeneratedColumn, Column, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
 import { CoreEntity } from 'entities/core.entity';
import { Project } from 'entities/project.entity';
import { Journey } from 'entities/all_plans.entity';

@Entity('shifts')
export class Shift extends CoreEntity {
  @Column()
  name: string;

  @Column({ type: 'time' })
  startTime: string;

  @Column({ type: 'time' })
  endTime: string;

  @ManyToOne(() => Project )
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @OneToMany(() => Journey, journey => journey.shift)
  journeys: Journey[];
}
