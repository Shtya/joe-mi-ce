import { Branch } from 'entities/branch.entity';
import { CoreEntity } from 'entities/core.entity';
import { Entity, Column, OneToMany, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';
import { Region } from './region.entity';

@Entity('countries')
export class Country {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @OneToMany(() => Region, region => region.country, { cascade: true })
  regions: Region[];
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
