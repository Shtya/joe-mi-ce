// entities/audit-competitor.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Audit, DiscountReason } from './audit.entity';
import { Competitor } from './competitor.entity';

@Entity('audit_competitors')
@Unique(["audit", "competitor"])  // One competitor per audit
@Index(['audit', 'competitor'])
@Index(['competitor', 'audit_date'])
export class AuditCompetitor extends CoreEntity {
  @ManyToOne(() => Audit, audit => audit.auditCompetitors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audit_id' })
  audit: Audit;

  @Column()
  audit_id: string;

  @ManyToOne(() => Competitor, competitor => competitor.auditCompetitors, { eager: true })
  @JoinColumn({ name: 'competitor_id' })
  competitor: Competitor;

  @Column()
  competitor_id: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number | null;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
  discount: number | null;

  @Column({ type: 'boolean', default: false })
  is_available: boolean;


  @Column({ type: 'text', nullable: true })
  origin: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  observed_at: Date;

  @Column({ type: 'date', nullable: true })
  audit_date: string;

  // Use varchar instead of enum to avoid conflicts
  @Column({
    type: 'varchar',
    length: 50,
    nullable: true,
    default: null
  })
  discount_reason: string | null;

  @Column({ type: 'text', nullable: true })
  discount_details: string | null;

  setOrigin(isNational: boolean, origin?: string): void {
    if (isNational) {
      this.origin = 'local';
    } else if (origin) {
      this.origin = origin;
    } else {
      this.origin = null;
    }
  }

  setDiscountReason(reason: DiscountReason, details?: string): void {
    this.discount_reason = reason;

    if (reason === DiscountReason.OTHER && details) {
      this.discount_details = details;
    } else if (reason !== DiscountReason.OTHER) {
      this.discount_details = null;
    }
  }

  // Helper method to get typed discount reason
  getDiscountReason(): DiscountReason | null {
    if (!this.discount_reason) return null;
    return this.discount_reason as DiscountReason;
  }
}