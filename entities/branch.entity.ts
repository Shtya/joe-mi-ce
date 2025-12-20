// branch.entity.ts
import { Entity, Column, ManyToOne, OneToMany, Index } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Project } from './project.entity';
import { User } from './user.entity';
import { Stock } from './products/stock.entity';
import { Audit } from './audit.entity';
import { Sale } from './products/sale.entity';
import { GeoLocation } from './geo.embeddable';
import { Chain } from './locations/chain.entity';
import { City } from './locations/city.entity';
import { Journey } from './all_plans.entity';
import { SalesTarget, SalesTargetType } from './sales-target.entity';

@Entity('branches')
@Index(['name', 'project'])
export class Branch extends CoreEntity {
  @Column()
  name: string;

   @Column({
    type: 'jsonb',
    nullable: true,
  })
  geo: {
    lat: number;
    lng: number;
  };


  @Column({ default: 500 })
  geofence_radius_meters: number;

  @Column({ nullable: true })
  image_url: string;
  @Column({
    type: 'enum',
    enum: SalesTargetType,
    default: SalesTargetType.MONTHLY
  })
  salesTargetType: SalesTargetType;
  @Column({ type: 'boolean', default: true })
  autoCreateSalesTargets: boolean;

  @Column({ type: 'decimal', precision: 15, scale: 2, nullable: true })
  defaultSalesTargetAmount: number;

  @OneToMany(() => SalesTarget, salesTarget => salesTarget.branch)
  salesTargets: SalesTarget[];
  // Relationships
  @ManyToOne(() => Project, project => project.branches)
  project: Project;

  @ManyToOne(() => User, { nullable: true , eager : true})
  supervisor: User;

  @OneToMany(() => User, user => user.branch)
  team: User[];

  @ManyToOne(() => City, city => city.branches , {eager : true} )
  city: City;

  @ManyToOne(() => Chain, chain => chain.branches, { nullable: true, eager : true })
  chain: Chain;

  @OneToMany(() => Journey, journey => journey.branch)
  journeys: Journey[];

  @OneToMany(() => Stock, stock => stock.branch)
  stock: Stock[];

  @OneToMany(() => Audit, audit => audit.branch)
  audits: Audit[];

  @OneToMany(() => Sale, sale => sale.branch)
  sales: Sale[];
}
