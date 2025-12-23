import { Controller, Get, Patch, Param, Req, Query, UseGuards } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { CRUD } from 'common/crud.service';

@UseGuards(AuthGuard)
@Controller('notification')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // 🔹 List notifications for current user (supervisor, admin, etc.)
  @Get('my')
  @Permissions(EPermission.CHECKIN_READ)
  async getMyNotifications(@Req() req, @Query("userId") userId : string ,  @Query() query:any) {
		return CRUD.findAll(
      this.notificationService.notificationRepo,
      'notification',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [], // relation
      [], // search
      { user: { id: userId || req?.user.id} }, // filter
    );
  }

  // 🔹 Mark single notification as read
  @Patch(':id/read')
  @Permissions(EPermission.CHECKIN_READ)
  async markAsRead(@Param('id') id: string, @Req() req , @Query("userId") userId : string) {
    return this.notificationService.markAsRead(id, userId || req.user.id);
  }

  // 🔹 Mark all my notifications as read
  @Patch('read-all/my')
  @Permissions(EPermission.CHECKIN_READ)
  async markAllAsRead(@Req() req) {
    return this.notificationService.markAllAsRead(req.user.id);
  }

    @Get('user')
  async getUserNotifications(
    @Req() req,
    @Query() query: any,

  ) {
    const lang = req.headers['lang']?.toLowerCase() || 'en';

    const userId = req.user.id;
    const notificationsData = await this.notificationService.getUserNotifications(
      userId,
      query,
    );

    return {
      code: 200,
      message: lang === 'ar' ? 'نجاح' : 'success',
      data: {
        notifications: notificationsData.items.map((n) => ({
          id: n.id,
          unreadCount: n.is_read ? 0 : 1,
          createdAt: n.created_at,
          updatedAt: n.updated_at,
          isRead: n.is_read,
          head: n.title,
          message: n.message,
          userId: n.user.id,
        })),
      },
    };
  }

    @Patch('unread/mobile/:id')
  async markAsReadMobile(
    @Param('id') id: string,
    @Req() req,
  ) {
      const lang = req.headers['lang']?.toLowerCase() || 'en';

    await this.notificationService.markAsRead(id, req.user.id);
    return {
      success: true,
      code: 200,
      message: lang === 'ar' ? 'تم وضع العلامة كمقروءة' : 'Marked as read',
    };
  }
}
