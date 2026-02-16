
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
  @UseInterceptors(FileInterceptor('avatar', multerOptions))
  async register(
    @Req() req: any, 
    @Body() dto: RegisterDto,
    @UploadedFile() file?: Express.Multer.File
  ) {
    if (!req.user && dto.role !== ERole.SUPER_ADMIN) {
      throw new ForbiddenException('Only super admin can be created this way');
    }
    return this.authService.register(req.user, dto, file);
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
  @Get('auth/me')
  async getMe(@Req() req: { user: User }) {
    return this.authService.getCurrentUser(req.user);
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
    @UseInterceptors(FileInterceptor('avatar', multerOptions))

  async updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: any,    @UploadedFile() file?: Express.Multer.File
) {
    return this.authService.updateUser(id, dto, req.user,file);
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
  const BATCH_SIZE = 50;

  try {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as any[],
      processed: 0,
      totalRows: 0
    };

    if (file.mimetype === 'text/csv') {
      await this.processCSVInBatches(filePath, requester, BATCH_SIZE, result);
    } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet') || file.mimetype === 'application/vnd.ms-excel') {
      await this.processExcelInBatches(filePath, requester, BATCH_SIZE, result);
    } else {
      throw new BadRequestException('Unsupported file format. Please use CSV or Excel files.');
    }

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`Promoter import completed: Success: ${result.success}, Failed: ${result.failed}`);
    return result;
  } catch (err) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Promoter import error:', err);
    throw new BadRequestException(`Import failed: ${err.message}`);
  }
}

private async processCSVInBatches(
  filePath: string,
  requester: User,
  batchSize: number,
  result: any
): Promise<void> {
  try {
    const csvContent = fs.readFileSync(filePath, 'utf8');
    const parseResult = parse(csvContent, {
      delimiter: ',',
      skipEmptyLines: true,
      header: true,
    });

    const records = parseResult.data as any[];
    let batch: any[] = [];
    let processedRows = 0;

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const mappedRow = this.authService.mapHeaders(row);
      
      const hasData = Object.values(mappedRow).some(v => v !== null && v !== undefined && v !== '');
      if (!hasData) continue;

      processedRows++;
      batch.push({ data: mappedRow, index: i + 2 });

      if (batch.length >= batchSize) {
        await this.processBatch(batch, requester, result);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await this.processBatch(batch, requester, result);
    }

    result.totalRows = processedRows;
  } catch (error) {
    console.error('CSV processing error:', error);
    throw error;
  }
}

private async processExcelInBatches(
  filePath: string,
  requester: User,
  batchSize: number,
  result: any
): Promise<void> {
  let batch: any[] = [];

  try {
    if (filePath.endsWith('.xls')) {
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      for (let i = 0; i < rows.length; i++) {
        const mappedRow = this.authService.mapHeaders(rows[i]);
        batch.push({ data: mappedRow, index: i + 2 });

        if (batch.length >= batchSize) {
          await this.processBatch(batch, requester, result);
          batch = [];
        }
      }
      result.totalRows = rows.length;
    } else {
      const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
        sharedStrings: 'cache',
        worksheets: 'emit',
      });

      let worksheetProcessed = false;
      let rowIndex = 0;
      let headers: string[] = [];

      for await (const worksheetReader of workbook) {
        if (worksheetProcessed) break;
        worksheetProcessed = true;

        for await (const row of worksheetReader) {
          rowIndex++;
          if (rowIndex === 1) {
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
              headers[colNumber - 1] = cell.value?.toString() || '';
            });
            continue;
          }

          const rowData: any = {};
          let hasData = false;
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              rowData[header] = cell.value?.toString().trim();
              hasData = true;
            }
          });

          if (!hasData) continue;

          const mappedRow = this.authService.mapHeaders(rowData);
          batch.push({ data: mappedRow, index: rowIndex });

          if (batch.length >= batchSize) {
            await this.processBatch(batch, requester, result);
            batch = [];
          }
        }
      }
      result.totalRows = rowIndex - 1;
    }

    if (batch.length > 0) {
      await this.processBatch(batch, requester, result);
    }
  } catch (error) {
    console.error('Excel processing error:', error);
    throw error;
  }
}

private async processBatch(
  batch: Array<{ data: any; index: number }>,
  requester: User,
  result: any
): Promise<void> {
  if (batch.length === 0) return;

  try {
    const batchResult = await this.authService.importPromotersBatch(
      batch.map(b => b.data),
      requester,
      batch.map(b => b.index)
    );

    result.success += batchResult.success;
    result.failed += batchResult.failed;
    result.processed += batchResult.success + batchResult.failed;
    result.errors.push(...batchResult.errors);

    console.log(`Promoter batch processed: ${batch.length} rows. Progress: ${result.processed}/${result.totalRows || '?'}`);

    if (global.gc) {
      try { global.gc(); } catch (e) {}
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error(`Promoter batch processing failed:`, error);
    result.failed += batch.length;
    result.processed += batch.length;
    result.errors.push(`Batch failed at rows ${batch[0]?.index}-${batch[batch.length-1]?.index}: ${error.message}`);
  }
}

}
