
import { Controller, Post, Body, UseGuards, Get, Param, Req, ForbiddenException, Put, Delete, Query } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RegisterDto, LoginDto, RefreshTokenDto, ViewUserPasswordDto, UpdateUserDto, UpdateUserRoleDto } from 'dto/user.dto';
import { User } from 'entities/user.entity';
import { ERole } from 'enums/Role.enum';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { CRUD } from 'common/crud.service';

@Controller('')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard)
  @Post('auth/register')
  async register(@Req() req: any, @Body() dto: RegisterDto) {
    if (!req.user && dto.role !== ERole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can be created this way');
    }
    return this.authService.register(req.user, dto);
  }

  @Post('auth/login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AuthGuard)
  @Post('auth/refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refresh_token);
  }

  @UseGuards(AuthGuard)
  @Get('users/me')
  async getCurrentUser(@Req() req: { user: User }) {
    return this.authService.getCurrentUser(req.user);
  }

  @UseGuards(AuthGuard)
  @Get('users/:id')
  @Permissions(EPermission.USER_READ)
  async getUserById(@Param('id') userId: string) {
    return this.authService.getUserById(userId);
  }

  @UseGuards(AuthGuard)
  @Get('users')
  @Permissions(EPermission.USER_READ)
  async getUsers(@Query() query: any, @Req() req: { user: User }) {
    return CRUD.findAll(this.authService.userRepository, 'user', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['role', 'project', 'branch', 'created_by'], ['name', 'mobile', 'username'], {});
  }

  @UseGuards(AuthGuard)
  @Put('users/:id')
  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any) {
    return this.authService.updateUser(id, dto, req.user);
  }

  @UseGuards(AuthGuard)
  @Delete('users/:id')
  async deleteUser(@Param('id') id: string, @Req() req: any) {
    return this.authService.deleteUser(id, req.user);
  }

  @UseGuards(AuthGuard)
  @Put('users/:id/role')
  async updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto, @Req() req: any) {
    return this.authService.updateUserRole(id, dto.role_id, req.user);
  }

	
}
