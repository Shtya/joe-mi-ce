import { Entity, Column, OneToMany, Index, Unique, ManyToMany, ManyToOne, JoinTable, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { Category } from './category.entity';
import { Project } from 'entities/project.entity';

@Entity('brands')
@Unique('uq_brand_name_owner', ['name', 'project'])
export class Brand extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  logo_url: string;

  @OneToMany(() => Product, product => product.brand)
  products: Product[];

  // 👇 Make the relation optional
  @ManyToOne(() => Project, project => project.brands, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @ManyToMany(() => Category, category => category.brands)
  @JoinTable({
    name: 'brand_categories',
    joinColumn: { name: 'brand_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' }
  })
  categories: Category[];

  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;
}
