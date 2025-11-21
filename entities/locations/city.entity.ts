import { Entity, Column, ManyToOne, OneToMany, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { Region } from './region.entity';
import { CoreEntity } from 'entities/core.entity';
import { Branch } from 'entities/branch.entity';

@Entity('cities')
export class City {
  @PrimaryGeneratedColumn('uuid')
  id: string;
  @Column()
  name: string;

  @ManyToOne(() => Region, region => region.cities , {eager : true})
  region: Region;

  @OneToMany(() => Branch, branch => branch.city)
  branches: Branch[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
