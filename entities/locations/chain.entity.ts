import { Branch } from 'entities/branch.entity';
import { CoreEntity } from 'entities/core.entity';
import { Entity, Column, OneToMany, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('chains')
export class Chain {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  logoUrl: string;

  @OneToMany(() => Branch, branch => branch.chain)
  branches: Branch[];
  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
