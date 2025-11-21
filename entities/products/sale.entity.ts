import { Entity, Column, ManyToOne } from 'typeorm';
import { Product } from './product.entity';
import { CoreEntity } from 'entities/core.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';

@Entity()
export class Sale extends CoreEntity {
  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('int')
  quantity: number;

  @Column('decimal', { precision: 10, scale: 2 })
  total_amount: number; // Calculated: price * quantity

  @Column({
    type: 'enum',
    enum: ['completed', 'returned', 'canceled'],
    default: 'completed',
  })
  status: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sale_date: Date;

  // Relationships
  @ManyToOne(() => User, user => user.sales)
  user: User;

  @ManyToOne(() => Product, product => product.sales)
  product: Product;

  @ManyToOne(() => Branch, branch => branch.sales)
  branch: Branch;

  @Column({ nullable: true })
  projectId: string;
}
