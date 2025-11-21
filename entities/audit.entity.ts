import { Entity, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { Branch } from './branch.entity';
import { Product } from './products/product.entity';

export enum AuditStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export class CompetitorSnapshot {
  Availability: number; // 0/1 أو نسبة
  competitor_id: string;
  competitor_price: number;
  competitor_discount: number;
  images: string[];
  observed_at: Date;
}

const ColumnNumericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null): number | null => (value === null || value === undefined ? null : parseFloat(value)),
};

@Entity({ name: 'audits' })
@Index(['branchId', 'productId', 'promoterId', 'audit_date'], { unique: true })
export class Audit extends CoreEntity {
  @Column({ default: false })
  is_available: boolean;

  @Column('decimal', {precision: 10,scale: 2,nullable: true,transformer: ColumnNumericTransformer,})
  current_price: number | null;

  @Column('decimal', { precision: 5, scale: 2, nullable: true, transformer: ColumnNumericTransformer, })
  current_discount: number | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column('text', { array: true, nullable: true })
  image_urls: string[] | null;

  @ManyToOne(() => User, user => user.audits, { eager: false })
  promoter: User;

  @ManyToOne(() => Branch, branch => branch.audits, { eager: false })
  branch: Branch;

  @ManyToOne(() => Product, product => product.audits, { eager: false })
  product: Product;

  @Column()
  promoterId: string;
  
  @Column()
  branchId: string;

  @Column()
  productId: string;

  @Column({nullable : true})
  projectId: string;

  @Column()
  product_name: string;

  @Column({ nullable: true })
  product_brand: string;

  @Column({ nullable: true })
  product_category: string;

  @Column('jsonb', { nullable: true })
  competitors: CompetitorSnapshot[] | null;

  @Column({
    type: 'enum',
    enum: AuditStatus,
    default: AuditStatus.PENDING,
  })
  status: AuditStatus;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  reviewed_by: User | null;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  audit_date: string;
}
