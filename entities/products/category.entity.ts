import { Entity, Column, OneToMany, Index, Unique, ManyToMany, JoinTable, JoinColumn, ManyToOne } from 'typeorm';
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



    @ManyToOne(() => Project, project => project.categories)
    @JoinColumn({ name: 'project_id' })
    project: Project;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ type: 'uuid' })
project_id: string;

}