
import { Controller, Get, Post, Body, Param, Delete, Put, UseGuards, Request, Query, Req, ForbiddenException, NotFoundException, UseInterceptors, BadRequestException, UploadedFile } from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchDto, UpdateBranchDto, AssignPromoterDto } from 'dto/branch.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { CRUD } from 'common/crud.service';
import { UUID } from 'crypto';
import { ERole } from 'enums/Role.enum';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'papaparse';
import * as fs from 'fs';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

import { multerOptions } from 'common/multer.config';
@Controller('branches')
@UseGuards(AuthGuard)
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @Permissions(EPermission.BRANCH_CREATE)
  create(@Request() req, @Body() dto: CreateBranchDto) {
    return this.branchService.create(dto, req.user);
  }

  @Get(':projectId/project')
  @Permissions(EPermission.BRANCH_READ)
  async getBranchesByProject(@Param('projectId') projectId: string, @Query() query: PaginationQueryDto) {
    return CRUD.findAll(this.branchService.branchRepo, 'branch', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['city', 'chain', 'project', 'supervisor', 'supervisors', 'team'], ['name'], { project: { id: projectId } , ...query.filters });
  }

  @Get('/my')
  @Permissions(EPermission.BRANCH_READ)
  async getBranches(@Query() query: PaginationQueryDto, @Req() req: any) {
    if (req.user.role?.name == ERole.SUPER_ADMIN) {
      throw new ForbiddenException('You cannot access this route');
    }
    const whereCondition = {
      project: { id: req.user?.project?.id || req.user?.project_id }
    };

    // Apply other filters if they exist and are for branch fields
    if (query.filters) {
      Object.assign(whereCondition, query.filters);
    }

    return CRUD.findAll2(
      this.branchService.branchRepo,
      'branch',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ['city', 'chain', 'project', 'supervisor', 'supervisors', 'team'],
      ['name'],
      whereCondition
    );
  }
  @Get('/my/for-mobile')
  @Permissions(EPermission.BRANCH_READ)
  async getBranchesForMobile( @Req() req: any) {
  const user = await this.branchService.usersService.resolveUserWithProject(
    req.user.id,
  );

  // 2️⃣ Resolve projectId
  const projectId =
    user.project?.id ||
    user.branch?.project?.id||
    user.project_id

  if (!projectId) {
    throw new ForbiddenException(
      'User is not assigned to any project',
    );
  }

  // 3️⃣ Get branches by resolved projectId
  return this.branchService.findAllbyProject(projectId);
}

  @Get(':branchId/teams')
  @Permissions(EPermission.BRANCH_READ)
  async getTeamOnBranch(@Param('branchId') branchId: UUID, @Query() query: PaginationQueryDto, @Req() req: any) {
    return CRUD.findAll(this.branchService.branchRepo, 'branch', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['supervisor', 'supervisors', 'team'], ['name'], { id: branchId , ...query.filters });
  }

  @Get(':id')
  @Permissions(EPermission.BRANCH_READ)
  findOne(@Param('id') id: string) {
    return this.branchService.findOne(id);
  }

  @Put(':id')
  @Permissions(EPermission.BRANCH_UPDATE)
  update(@Param('id') id: string, @Request() req, @Body() dto: UpdateBranchDto) {
    return this.branchService.update(id, dto, req.user);
  }

  @Post(':id/supervisor')
  @Permissions(EPermission.BRANCH_ASSIGN_SUPERVISOR)
  assignSupervisor(@Param('id') id: string, @Body() dto, @Request() req) {
    return this.branchService.assignSupervisor(id, dto.userId, req.user);
  }

  @Post(':branchId/promoter')
  @Permissions(EPermission.BRANCH_ASSIGN_PROMOTER)
  async assignPromoter(@Param('projectId') projectId: any, @Param('branchId') branchId: any, @Body() dto: AssignPromoterDto, @Req() req: any) {
    const project = req?.user?.project?.id || req.user.project_id || projectId
    return this.branchService.assignPromoter(project, branchId, dto, req.user);
  }
   @Post('import')
  @Permissions(EPermission.BRANCH_CREATE)
  @UseInterceptors(FileInterceptor('file', multerOptions))
  async importBranches(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const requester = await this.branchService.userRepo.findOne({
      where: { id: req.user.id },
      relations: ['role', 'project'],
    });

    const filePath = file.path;
    let rows: any[] = [];

    try {

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

      // Call service to import branches
      return await this.branchService.importBranches(rows, requester);

    } catch (err) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw err;
    }
  }

  @Post('migrate-supervisors')
  @Permissions(EPermission.BRANCH_UPDATE)
  async migrateSupervisors() {
    return this.branchService.migrateSupervisors();
  }

  @Post('fix-chain-consistency')
  @Permissions(EPermission.BRANCH_UPDATE)
  async fixChainConsistency() {
    return this.branchService.fixChainConsistency();
  }

}
