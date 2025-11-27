// sale.entity.ts
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';

@Entity('sale')
export class Sale extends CoreEntity {
  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  total_amount: number;

  @Column({
    type: 'enum',
    enum: ['completed', 'returned', 'cancelled'],
    default: 'completed',
  })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sale_date: Date;

  // Relationships
  @ManyToOne(() => User, user => user.sales)
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Product, product => product.sales)
  @JoinColumn({ name: 'productId' })
  product: Product;

  @ManyToOne(() => Branch, branch => branch.sales)
  @JoinColumn({ name: 'branchId' })
  branch: Branch;

  @Column({ nullable: true })
  projectId: string;

  @Column({ nullable: true })
  userId: string;

  @Column({ nullable: true })
  productId: string;

  @Column({ nullable: true })
  branchId: string;
}