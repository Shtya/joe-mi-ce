import { Entity, Column, OneToMany, Index, Unique, ManyToMany, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { Brand } from './brand.entity';
import { Project } from 'entities/project.entity';

@Entity('categories')
@Unique('uq_category_name_owner', ['name', 'project'])
export class Category extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => Product, product => product.category)
  products: Product[];

  @ManyToMany(() => Brand, brand => brand.categories)
  brands: Brand[];

  // 👇 Make the relation optional
  @ManyToOne(() => Project, project => project.categories, { nullable: true })
  @JoinColumn({ name: 'project_id' })
  project: Project | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  // Optional project_id column (nullable)
  @Column({ type: 'uuid', nullable: true })
  project_id: string | null;
}
