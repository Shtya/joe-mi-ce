import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role } from './role.entity';
import { CoreEntity } from './core.entity';

@Entity('permissions')
export class Permission extends CoreEntity {
  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description: string;

  @ManyToMany(() => Role, role => role.permissions, {
    onDelete: 'NO ACTION',
    onUpdate: 'CASCADE',
  })
  roles: Role[];
}
