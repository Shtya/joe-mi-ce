// entities/audit-competitor.entity.ts
import { Entity, Column, ManyToOne, JoinColumn, Unique, Index } from 'typeorm';
import { CoreEntity } from './core.entity';
import { Audit } from './audit.entity';
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

  @Column({ type: 'boolean', nullable: true })
  is_national: boolean | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  observed_at: Date;

  // You can also store audit_date for easier querying
  @Column({ type: 'date', nullable: true })
  audit_date: string;
  @Column({ type: 'text', nullable: true })
  discount_reason: string | null;

}