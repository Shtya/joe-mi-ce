// stock.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { Branch } from 'entities/branch.entity';
  
@Entity('stocks')
@Unique(['product', 'branch'])
export class Stock extends CoreEntity {
  @Column('int')
  quantity: number;

  @ManyToOne(() => Branch, branch => branch.stock, { eager: true })
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  @ManyToOne(() => Product, product => product.stock, { eager: true })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ nullable: true })
  branch_id: string;

  @Column({ nullable: true })
  product_id: string;
}