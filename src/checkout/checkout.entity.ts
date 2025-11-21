import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, BeforeInsert, BeforeUpdate } from 'typeorm';

export enum CheckoutStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity({ name: 'checkouts' })
@Index('idx_checkouts_phone_pair', ['countryCode', 'phone'])
export class Checkout {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 6 })
  countryCode: string;

  @Column({ type: 'varchar', length: 14 })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'text' })
  proofUrl: string;

  @Column({ type: 'boolean', default: false })
  agreed: boolean;

  @Column({
    type: 'enum',
    enum: CheckoutStatus,
    default: CheckoutStatus.PENDING,
  })
  status: CheckoutStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @Column({ type: 'inet', nullable: true })
  ipAddress?: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
