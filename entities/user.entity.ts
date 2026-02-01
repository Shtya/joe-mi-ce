import { Entity, Column, OneToMany, ManyToOne, JoinColumn, Index, OneToOne } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Asset } from './assets.entity';
import { Role } from './role.entity';
import { Project } from './project.entity';
import { Branch } from './branch.entity';
 import { Audit } from './audit.entity';
 import { Vacation } from './employee/vacation.entity';
 import { Sale } from './products/sale.entity';
import { Journey } from './all_plans.entity';
import { DocumentBuilder } from './documentbuilder.entity';


@Entity('users')
@Index(['username'], { unique: true })
@Index(['mobile'], { unique: true })

export class User extends CoreEntity {
  @Column({ length: 50 })
  username: string;

  @Column({ length: 100, select: false }) // Never select password in queries
  password: string;

  @Column({ length: 100 , nullable : true })
  name: string;

  @Column({ length: 20, nullable: true })
  mobile: string;

  @Column({ length: 255, nullable: true })
  avatar_url: string;

  @Column({ length: 255, nullable: true })
  national_id: string;

  @Column({ length: 100, nullable: true })
  device_id: string;

  @Column({nullable: true })
  project_id: string;

  @Column({nullable: true })
  manager_id: string;

  @Column({ default: true })
  is_active: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  created_by: User;

  @ManyToOne(() => Role, role => role.users, { onDelete: 'SET NULL' })
  role: Role;

  @OneToOne(() => Project, project => project.owner)
  project: Project;

  @OneToMany(() => Journey, journey => journey.user)
  journeys: Journey[];

  @ManyToOne(() => Branch, branch => branch.team)
  branch: Branch;

  @OneToMany(() => Vacation, vacation => vacation.user)
  vacations: Vacation[];

  @OneToMany(() => Asset, asset => asset.user)
  assets: Asset[];

  @OneToMany(() => Audit, audit => audit.promoter)
  audits: Audit[];

  @OneToMany(() => Sale, sale => sale.user)
  sales: Sale[];

  @OneToMany(() => Sale, checkin => checkin.user)
  checkins: Sale[];

  @OneToMany(() => DocumentBuilder, doc => doc.user)
  documentBuilders: DocumentBuilder[];

  user: Promise<Role>;


  async hasPermission(permission: string): Promise<boolean> {
    return this.role?.hasPermission(permission) ?? false;
  }
}
