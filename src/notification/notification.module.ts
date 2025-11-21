import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Notification } from 'entities/notification.entity';
import { User } from 'entities/user.entity';
import { Branch } from 'entities/branch.entity';
import { Journey } from 'entities/all_plans.entity';
import { Sale } from 'entities/products/sale.entity';

import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, Branch, Journey, Sale]),
  ],
  providers: [NotificationService],
  controllers: [NotificationController],
  exports: [NotificationService],
})
export class NotificationModule {}
