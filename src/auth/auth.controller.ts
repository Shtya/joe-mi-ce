
import { Controller, Post, Body, UseGuards, Get, Param, Req, ForbiddenException, Put, Delete, Query, BadRequestException, UploadedFile, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { RegisterDto, LoginDto, RefreshTokenDto, ViewUserPasswordDto, UpdateUserDto, UpdateUserRoleDto } from 'dto/user.dto';
import { User } from 'entities/user.entity';
import { ERole } from 'enums/Role.enum';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { CRUD } from 'common/crud.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerOptions } from 'common/multer.config';
import { parse } from 'papaparse';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { UsersService } from 'src/users/users.service';

@Controller('')
export class AuthController {
  constructor(private readonly authService: AuthService,
    private readonly userService: UsersService,
  ) {}

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
  async getUsers(@Query() query: any, @Req() req: any) {
    if(req.user.role.name !== ERole.SUPER_ADMIN){
      const projectId = await this.userService.resolveProjectIdFromUser(req.user.id)
      query.project_id = projectId;
    }
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
  @UseGuards(AuthGuard)

@Post('import/promoters')

@Permissions(EPermission.USER_CREATE)
@UseInterceptors(FileInterceptor('file', multerOptions))
async importPromoters(
  @UploadedFile() file: Express.Multer.File,
  @Req() req: any,
) {
  if (!file) {
    throw new BadRequestException('File is required');
  }

  const requester = await this.authService.userRepository.findOne({
    where: { id: req.user.id },
    relations: ['role', 'project'],
  });

  const filePath = file.path;
  let rows: any[] = [];

  try {
    console.log(file.mimetype)
if (file.mimetype === 'text/csv') {
  // ✅ CSV
  const csvContent = fs.readFileSync(filePath, 'utf8');
  const result = parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  rows = result.data;

} else if (file.mimetype === 'application/vnd.ms-excel') {
  // ✅ REAL .xls
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  rows = XLSX.utils.sheet_to_json(
    workbook.Sheets[sheetName],
    { defval: '' },
  );

} else {
  // ✅ .xlsx
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(1);

  const headers: string[] = [];
  sheet.getRow(1).eachCell((cell, i) => {
    headers[i - 1] = cell.value?.toString() || '';
  });

  for (let i = 2; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    const obj: any = {};
    headers.forEach((h, idx) => {
      const v = row.getCell(idx + 1).value;
      if (v !== null && v !== undefined) {
        obj[h] = v.toString().trim();
      }
    });
    rows.push(obj);
  }
}


    fs.unlinkSync(filePath);

    // 2️⃣ Call service
    return await this.authService.importPromoters(rows, requester);

  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw err;
  }
}

}
