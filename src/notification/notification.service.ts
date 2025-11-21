import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Notification, NotificationType } from 'entities/notification.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Journey } from 'entities/all_plans.entity';
import { Sale } from 'entities/products/sale.entity';

export type SupervisorCheckinType = 'checkin' | 'checkout' | 'update';

export interface SupervisorCheckinPayload {
  supervisorId: string;
  branchId: string;
  branchName: string;
  promoterId: string;
  promoterName?: string;
  journeyId: string;
  type: SupervisorCheckinType;
  time: Date;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    public readonly notificationRepo: Repository<Notification>,
  ) {}

  // ====== PUBLIC API FOR OTHER MODULES ======

  async notifySupervisorOnCheckin(payload: SupervisorCheckinPayload) {
    const type = payload.type === 'checkin' ? NotificationType.JOURNEY_CHECKIN : payload.type === 'checkout' ? NotificationType.JOURNEY_CHECKOUT : NotificationType.JOURNEY_UPDATE;

    const notification = this.notificationRepo.create({
      user: { id: payload.supervisorId } as User,
      branch: { id: payload.branchId } as Branch,
      journey: { id: payload.journeyId } as Journey,
      sale: null,
      type,
      title: type === NotificationType.JOURNEY_CHECKIN ? 'New check-in on your branch' : type === NotificationType.JOURNEY_CHECKOUT ? 'Check-out completed on your branch' : 'Journey status updated on your branch',
      message: `${payload.promoterName || 'Promoter'} did ${payload.type} at ${payload.branchName}`,
      meta: {
        ...payload,
      },
    });

    await this.notificationRepo.save(notification);

    // 🔔 هنا تقدر تضيف WebSocket / FCM / WhatsApp / Email
    this.logger.log(`Notification stored for supervisor ${payload.supervisorId} (journey ${payload.journeyId})`);
  }

  // ====== UI – GET LIST FOR CURRENT USER ======

  async getUserNotifications(userId: string, query: any & { is_read?: string; type?: NotificationType }) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;

    const where: any = {
      user: { id: userId },
    };

    if (query.is_read !== undefined) {
      where.is_read = query.is_read === 'true' || query.is_read === true;
    }

    if (query.type) {
      where.type = query.type;
    }

    const [items, total] = await this.notificationRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async markAsRead(id: string, userId: string) {
    const notif = await this.notificationRepo.findOne({
      where: { id, user: { id: userId } },
    });

    if (!notif) {
      throw new NotFoundException('Notification not found');
    }

    notif.is_read = true;
    await this.notificationRepo.save(notif);

    return { success: true };
  }

  async markAllAsRead(userId: string) {
    await this.notificationRepo.update({ user: { id: userId }, is_read: false }, { is_read: true });

    return { success: true };
  }
}
