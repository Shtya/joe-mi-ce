import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { I18nService } from 'nestjs-i18n';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'entities/user.entity';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private readonly i18n: I18nService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    const requiredPermissions: any = this.reflector.get<string[]>('permissions', context.getHandler());

    if (!token) {
      throw new UnauthorizedException(this.i18n.t('events.auth.errors.unauthorized'));
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: process.env.JWT_SECRET });
      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ['role', 'role.permissions', 'project'],
      });

      if (!user) {
        throw new UnauthorizedException(this.i18n.t('events.auth.errors.user_not_found'));
      }

      request.user = user;

      if (!user.is_active) {
        throw new ForbiddenException(this.i18n.t('events.auth.errors.account_inactive'));
      }

      if (requiredPermissions?.length) {
        const roleName = String(user?.role?.name ?? '').toLowerCase();

        if (roleName !== 'super_admin') {
          const userPermissions = new Set((user?.role?.permissions ?? []).map((p: any) => String(p?.name ?? '').toLowerCase()));
          // هل عنده كل الـ requiredPermissions ؟
          const hasPermission = requiredPermissions.every(perm => userPermissions.has(String(perm).toLowerCase()));

          if (!hasPermission) {
            throw new ForbiddenException(
              this.i18n.t('events.auth.errors.insufficient_permissions', {
                args: { permissions: requiredPermissions.join(', ') },
              }),
            );
          }
        }
      }

      // if (requiredPermissions?.length) {
      //   const hasPermission = await user.hasPermission(requiredPermissions);
      //   if (!hasPermission) {
      //     throw new ForbiddenException(
      //       this.i18n.t('events.auth.errors.insufficient_permissions', {
      //         args: { permissions: requiredPermissions.join(', ') },
      //       }),
      //     );
      //   }
      // }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new UnauthorizedException(this.i18n.t('events.auth.errors.invalid_token'));
    }

    return true;
  }

  private extractToken(request: Request): string | null {
    return request.headers.authorization?.split(' ')[1] || null;
  }
}
