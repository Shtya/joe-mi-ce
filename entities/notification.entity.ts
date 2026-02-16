import { Entity, Column, ManyToOne } from 'typeorm';
import { CoreEntity } from './core.entity';
import { User } from './user.entity';
import { Branch } from './branch.entity';
import { Journey } from './all_plans.entity';
import { Sale } from './products/sale.entity';

export enum NotificationType {
  JOURNEY_CHECKIN = 'journey_checkin',
  JOURNEY_CHECKOUT = 'journey_checkout',
  JOURNEY_UPDATE = 'journey_update',
  SALE_CREATED = 'sale_created',
  SALE_UPDATED = 'sale_updated',
  STOCK_ALERT = 'stock_alert',
}

@Entity('notifications')
export class Notification extends CoreEntity {
  // صاحب النوتيفيكেশন (المستلم) → غالباً الـ supervisor
  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE' })
  user: User;

  @ManyToOne(() => Branch, { eager: true, nullable: true, onDelete: 'CASCADE' })
  branch: Branch | null;

  @ManyToOne(() => Journey, { eager: false, nullable: true, onDelete: 'CASCADE' })
  journey: Journey | null;

  @ManyToOne(() => Sale, { eager: false, nullable: true, onDelete: 'CASCADE' })
  sale: Sale | null;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  message: string | null;

  @Column({ default: false })
  is_read: boolean;

  @Column({ type: 'jsonb', nullable: true })
  meta: any;
}
