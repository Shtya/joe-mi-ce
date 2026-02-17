import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('app_versions')
export class AppVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  latestVersion: string;

  @Column()
  latestBuildNumber: string;

  @Column({ default: false })
  isForcedUpdate: boolean;

  @Column({ type: 'text', nullable: true })
  updateMessage: string;

  @Column('jsonb', { nullable: true })
  downloadUrl: { android: string; ios: string };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
