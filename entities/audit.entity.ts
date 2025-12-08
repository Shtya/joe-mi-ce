// entities/audit.entity.ts
import { Entity, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { Branch } from './branch.entity';
import { Product } from './products/product.entity';
import { AuditCompetitor } from './audit-competitor.entity';

export enum AuditStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  SUBMITTED = 'submitted',
  REVIEWED = 'reviewed',
}

@Entity({ name: 'audits' })
@Index(['branchId', 'productId', 'promoterId', 'audit_date'], { unique: true })
export class Audit extends CoreEntity {
  @Column({ default: false })
  is_available: boolean;

  @Column('decimal', {
    precision: 10,
    scale: 2,
    nullable: true,
  })
  current_price: number | null;

  @Column('decimal', { 
    precision: 5, 
    scale: 2, 
    nullable: true, 
  })
  current_discount: number | null;

  @Column({ type: 'text', nullable: true })
  discount_reason: string | null;


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

  @Column({ nullable: true })
  projectId: string;

  @Column()
  product_name: string;

  @Column({ nullable: true })
  product_brand: string | null;

  @Column({ nullable: true })
  product_category: string | null;


  @OneToMany(() => AuditCompetitor, auditCompetitor => auditCompetitor.audit, { 
    cascade: true,
    eager: false 
  })
  auditCompetitors: AuditCompetitor[];

  @Column({ default: 0 })
  competitors_count: number;

  @Column({ default: 0 })
  available_competitors_count: number;

  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  reviewed_by: User | null;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  audit_date: string;



  // Helper method to get competitors as array
  getCompetitors(): any[] {
    if (!this.auditCompetitors) return [];
    
    return this.auditCompetitors.map(ac => ({
      competitor_id: ac.competitor_id,
      competitor: ac.competitor,
      price: ac.price,
      discount: ac.discount,
      is_available: ac.is_available,
  
      observed_at: ac.observed_at
    }));
  }

  // Helper method to calculate counts
  calculateCompetitorCounts(): void {
    if (!this.auditCompetitors) {
      this.competitors_count = 0;
      this.available_competitors_count = 0;
      return;
    }

    this.competitors_count = this.auditCompetitors.length;
    this.available_competitors_count = this.auditCompetitors
      .filter(ac => ac.is_available)
      .length;
  }
}

const ColumnNumericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null): number | null => (value === null || value === undefined ? null : parseFloat(value)),
};