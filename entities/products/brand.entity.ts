import { Entity, Column, OneToMany, Index, Unique, ManyToMany, JoinTable } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { Category } from './category.entity';

@Entity('brands')
@Unique('uq_brand_name_owner', ['name', 'ownerUserId'])
export class Brand extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @Column({ nullable: true })
  logo_url: string;

  @OneToMany(() => Product, product => product.brand)
  products: Product[];

  @ManyToMany(() => Category, category => category.brands)
  @JoinTable({
    name: 'brand_categories',
    joinColumn: { name: 'brand_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'category_id', referencedColumnName: 'id' }
  })
  categories: Category[];
  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;
}

