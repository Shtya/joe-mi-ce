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

export interface PromoterCheckinPayload {
  promoterId: string;
  branchId: string;
  branchName: string;
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

  async notifySupervisorOnCheckin(payload: SupervisorCheckinPayload, lang: string = 'en') {
    const type = payload.type === 'checkin' ? NotificationType.JOURNEY_CHECKIN : payload.type === 'checkout' ? NotificationType.JOURNEY_CHECKOUT : NotificationType.JOURNEY_UPDATE;

    const titleEn = payload.type === 'checkin' ? 'New check-in on your branch' : payload.type === 'checkout' ? 'Check-out completed on your branch' : 'Journey status updated on your branch';
    const titleAr = payload.type === 'checkin' ? 'تسجيل دخول جديد في فرعك' : payload.type === 'checkout' ? 'تم تسجيل الخروج في فرعك' : 'تم تحديث حالة الرحلة في فرعك';

    const messageEn = `${payload.promoterName || 'Promoter'} did ${payload.type} at ${payload.branchName}`;
    const messageAr = `${payload.promoterName || 'المروج'} قام بـ ${this.translateType(payload.type)} في ${payload.branchName}`;

    const notification = this.notificationRepo.create({
      user: { id: payload.supervisorId } as User,
      branch: { id: payload.branchId } as Branch,
      journey: { id: payload.journeyId } as Journey,
      sale: null,
      type,
      title: lang === 'ar' ? titleAr : titleEn,
      message: lang === 'ar' ? messageAr : messageEn,
      meta: {
        ...payload,
      },
    });

    await this.notificationRepo.save(notification);
    this.logger.log(`Notification stored for supervisor ${payload.supervisorId} (journey ${payload.journeyId})`);
  }

  async notifyPromoterOnCheckin(payload: PromoterCheckinPayload, lang: string = 'en') {
    const type = payload.type === 'checkin' ? NotificationType.JOURNEY_CHECKIN : payload.type === 'checkout' ? NotificationType.JOURNEY_CHECKOUT : NotificationType.JOURNEY_UPDATE;

    const titleEn = payload.type === 'checkin' ? 'Check-in Successful' : payload.type === 'checkout' ? 'Check-out Successful' : 'Journey Updated';
    const titleAr = payload.type === 'checkin' ? 'تم تسجيل الدخول بنجاح' : payload.type === 'checkout' ? 'تم تسجيل الخروج بنجاح' : 'تم تحديث الرحلة';

    const messageEn = `You have successfully ${payload.type === 'checkin' ? 'checked in' : payload.type === 'checkout' ? 'checked out' : 'updated status'} at ${payload.branchName}`;
    const messageAr = `لقد قمت ${payload.type === 'checkin' ? 'بتسجيل الدخول' : payload.type === 'checkout' ? 'بتسجيل الخروج' : 'بتحديث الحالة'} بنجاح في ${payload.branchName}`;

    const notification = this.notificationRepo.create({
      user: { id: payload.promoterId } as User,
      branch: { id: payload.branchId } as Branch,
      journey: { id: payload.journeyId } as Journey,
      sale: null,
      type,
      title: lang === 'ar' ? titleAr : titleEn,
      message: lang === 'ar' ? messageAr : messageEn,
      meta: {
        ...payload,
      },
    });

    await this.notificationRepo.save(notification);
    this.logger.log(`Notification stored for promoter ${payload.promoterId} (journey ${payload.journeyId})`);
  }

  private translateType(type: string): string {
    switch (type) {
      case 'checkin': return 'تسجيل الدخول';
      case 'checkout': return 'تسجيل الخروج';
      case 'update': return 'تحديث';
      default: return type;
    }
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
