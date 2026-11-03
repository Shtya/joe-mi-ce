import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { I18nService } from "nestjs-i18n";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "entities/user.entity";
import { requestLanguage } from "common/request-language";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
    private readonly i18n: I18nService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    const requiredPermissions = this.reflector.get<string[]>(
      "permissions",
      context.getHandler(),
    );

    if (!token) {
      throw new UnauthorizedException(
        this.i18n.t("events.auth.errors.unauthorized"),
      );
    }

    let payload: { sub: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: process.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException(
        this.i18n.t("events.auth.errors.invalid_token"),
      );
    }
    if (typeof payload?.sub !== "string" || !payload.sub) {
      throw new UnauthorizedException(
        this.i18n.t("events.auth.errors.invalid_token"),
      );
    }

    let user: User | null;
    try {
      user = await this.userRepository.findOne({
        where: { id: payload.sub },
        relations: ["role", "role.permissions", "project"],
      });
    } catch (error: unknown) {
      // A valid session must survive an infrastructure outage. Returning 401
      // here makes existing mobile clients erase their saved login.
      this.logger.error({
        event: "auth.session.lookup_failed",
        userId: payload.sub,
        errorType: error instanceof Error ? error.name : "UnknownError",
      });
      const ar = requestLanguage(request.headers.lang) === "ar";
      throw new ServiceUnavailableException({
        statusCode: 503,
        code: "AUTH_LOOKUP_UNAVAILABLE",
        message: ar
          ? "خدمة تسجيل الدخول غير متاحة مؤقتًا. يرجى إعادة المحاولة"
          : "Authentication service is temporarily unavailable. Please try again.",
      });
    }

    if (!user) {
      throw new UnauthorizedException(
        this.i18n.t("events.auth.errors.user_not_found"),
      );
    }

    request.user = user;

    if (!user.is_active) {
      throw new ForbiddenException(
        this.i18n.t("events.auth.errors.account_inactive"),
      );
    }

    if (requiredPermissions?.length) {
      const roleName = String(user?.role?.name ?? "").toLowerCase();

      if (roleName !== "super_admin") {
        const userPermissions = new Set(
          (user?.role?.permissions ?? []).map((p) =>
            String(p?.name ?? "").toLowerCase(),
          ),
        );
        const hasPermission = requiredPermissions.every((perm) =>
          userPermissions.has(String(perm).toLowerCase()),
        );

        if (!hasPermission) {
          throw new ForbiddenException(
            this.i18n.t("events.auth.errors.insufficient_permissions", {
              args: { permissions: requiredPermissions.join(", ") },
            }),
          );
        }
      }
    }

    return true;
  }

  private extractToken(request: Request): string | null {
    return request.headers.authorization?.split(" ")[1] || null;
  }
}
