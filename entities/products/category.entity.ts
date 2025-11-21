import { Entity, Column, OneToMany, Index, Unique } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';

@Entity('categories')
@Unique('uq_category_name_owner', ['name', 'ownerUserId']) // <-- Composite unique
export class Category extends CoreEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  description: string;

  @OneToMany(() => Product, product => product.category)
  products: Product[];

  @Index()
  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;
}
