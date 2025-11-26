import { Entity, Column, OneToMany, Index, Unique, ManyToMany, JoinTable } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { Brand } from './brand.entity';

@Entity('categories')
@Unique('uq_category_name_owner', ['name', 'ownerUserId'])
export class Category extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => Product, product => product.category)
  products: Product[];

  @ManyToMany(() => Brand, brand => brand.categories)
  brands: Brand[];

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;
}