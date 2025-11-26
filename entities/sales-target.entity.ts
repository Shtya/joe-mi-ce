// sales-target.entity.ts
import { 
    Entity, 
    Column, 
    ManyToOne, 
    CreateDateColumn, 
    UpdateDateColumn,
    Index 
  } from 'typeorm';
  import { CoreEntity } from './core.entity';
  import { Branch } from './branch.entity';
  import { User } from './user.entity';
  
  export enum SalesTargetType {
    MONTHLY = 'monthly',
    QUARTERLY = 'quarterly'
  }
  
  export enum SalesTargetStatus {
    ACTIVE = 'active',
    COMPLETED = 'completed',
    EXPIRED = 'expired'
  }
  
  @Entity('sales_targets')
  @Index(['branch', 'startDate', 'endDate'])
  @Index(['status', 'endDate'])
  export class SalesTarget extends CoreEntity {
    @Column()
    name: string;
  
    @Column({ type: 'text', nullable: true })
    description: string;
  
    @Column({ 
      type: 'enum', 
      enum: SalesTargetType, 
      default: SalesTargetType.MONTHLY 
    })
    type: SalesTargetType;
  
    @Column({ 
      type: 'enum', 
      enum: SalesTargetStatus, 
      default: SalesTargetStatus.ACTIVE 
    })
    status: SalesTargetStatus;
  
    @Column({ type: 'decimal', precision: 15, scale: 2 })
    targetAmount: number;
  
    @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
    currentAmount: number;
  
    @Column({ type: 'date' })
    startDate: Date;
  
    @Column({ type: 'date' })
    endDate: Date;
  
    @Column({ type: 'boolean', default: true })
    autoRenew: boolean;
  
    // Relationships
    @ManyToOne(() => Branch, branch => branch.salesTargets, { onDelete: 'CASCADE' })
    branch: Branch;
  
    @ManyToOne(() => User, { nullable: true })
    createdBy: User;
  
    @CreateDateColumn()
    createdAt: Date;
  
    @UpdateDateColumn()
    updatedAt: Date;
  
    // Calculated properties
    get progressPercentage(): number {
      if (this.targetAmount === 0) return 0;
      return Math.min(100, (this.currentAmount / this.targetAmount) * 100);
    }
  
    get remainingAmount(): number {
      return Math.max(0, this.targetAmount - this.currentAmount);
    }
  
    get isActive(): boolean {
      const now = new Date();
      return now >= new Date(this.startDate) && now <= new Date(this.endDate);
    }
  
    get isExpired(): boolean {
      return new Date() > new Date(this.endDate);
    }
  
    get isCompleted(): boolean {
      return this.currentAmount >= this.targetAmount;
    }
  
    updateStatus(): void {
      if (this.isCompleted) {
        this.status = SalesTargetStatus.COMPLETED;
      } else if (this.isExpired) {
        this.status = SalesTargetStatus.EXPIRED;
      } else if (this.isActive) {
        this.status = SalesTargetStatus.ACTIVE;
      }
    }
  }