// entities/audit.entity.ts
import { Entity, Column, ManyToOne, OneToMany, Index, JoinColumn } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { Branch } from './branch.entity';
import { Product } from './products/product.entity';
import { AuditCompetitor } from './audit-competitor.entity';


// Enum for discount reasons
export enum DiscountReason {
  NATIONAL_DAY = 'National Day',
  FOUNDING_DAY = 'Founding Day',
  MEGA_SALE = 'Mega Sale',
  BLACK_FRIDAY = 'Black Friday',
  OTHER = 'Other'
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

  @Column({ 
    type: 'enum', 
    enum: DiscountReason, 
    nullable: true 
  })
  discount_reason: DiscountReason | null;

  @Column({ type: 'text', nullable: true })
  discount_details: string | null;



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


  @Column({ type: 'timestamp', nullable: true })
  reviewed_at: Date | null;

  @ManyToOne(() => User, { nullable: true, eager: false })
  reviewed_by: User | null;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  audit_date: string;

  // Method to set origin based on national status and country
 

  // Method to set discount reason with details for "Other"
  setDiscountReason(reason: DiscountReason, details?: string): void {
    this.discount_reason = reason;
    
    if (reason === DiscountReason.OTHER && details) {
      this.discount_details = details;
    } else if (reason !== DiscountReason.OTHER) {
      this.discount_details = null;
    }
  }

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


}

const ColumnNumericTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null): number | null => (value === null || value === undefined ? null : parseFloat(value)),
};