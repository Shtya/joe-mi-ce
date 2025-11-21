// i need here when a pormoter make audit on product on branch
// - cannot make audit in the same daay again
// - if there an promoter will mke audit on the

import { Controller, Post, Get, Patch, Delete, Param, Body, Query, ParseUUIDPipe, Req, UseGuards } from '@nestjs/common';

import { CreateAuditDto, QueryAuditsDto, UpdateAuditDto, UpdateAuditStatusDto } from 'dto/audit.dto';
import { Audit } from 'entities/audit.entity';
import { AuditsService } from './audit.service';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { AuthGuard } from 'src/auth/auth.guard';

@Controller('audits')
@UseGuards(AuthGuard)
export class AuditsController {
  constructor(private readonly service: AuditsService) {}

  @Post()
  @Permissions(EPermission.AUDIT_CREATE)
  create(@Body() dto: CreateAuditDto) {
    return this.service.create(dto);
  }

  @Get('')
  @Permissions(EPermission.AUDIT_READ)
  async getAudit(@Query() query, @Req() req) {
    const {
      search,
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'DESC',
      fromDate,
      toDate,
      filters, // may be object or JSON string
    } = query;

    let parsedFilters: any = {};

    // Support both: filters as object or filters as stringified JSON
    if (filters) {
      if (typeof filters === 'string') {
        try {
          parsedFilters = JSON.parse(filters);
        } catch (e) {
          // optional: throw BadRequestException if you want to be strict
          parsedFilters = {};
        }
      } else {
        parsedFilters = filters;
      }
    }

    const mergedFilters: any = {
      projectId: req.user.project.id,
      ...parsedFilters,
    };

    // 👇 range filters for audit_date (handled in findAllRelation as *_from / *_to)
    if (fromDate) {
      mergedFilters.audit_date_from = fromDate; // will map to audit.audit_date >= fromDate
    }
    if (toDate) {
      mergedFilters.audit_date_to = toDate; // will map to audit.audit_date <= toDate
    }

    return CRUD.findAllRelation(
      this.service.repo,
      'audit',
      search,
      page,
      limit,
      sortBy,
      sortOrder?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
      ['branch', 'promoter', 'branch.city', 'branch.city.region', 'branch.chain'],
      [], // searchFields
      mergedFilters, // filters (includes projectId + date range)
    );
  }

  @Get(':id')
  @Permissions(EPermission.AUDIT_READ)
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return CRUD.findOne(this.service.repo, 'audit', id, ['product']);
  }

  @Patch(':id')
  @Permissions(EPermission.AUDIT_UPDATE)
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateAuditDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @Permissions(EPermission.AUDIT_STATUS_UPDATE)
  updateStatus(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateAuditStatusDto) {
    return this.service.updateStatus(id, dto);
  }

  @Delete(':id')
  @Permissions(EPermission.AUDIT_DELETE)
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return CRUD.softDelete(this.service.repo, 'audit', id);
  }

  // في audits.controller.ts
  @Get('by-product/:productId')
  @Permissions(EPermission.AUDIT_READ)
  byProduct(@Param('productId', new ParseUUIDPipe()) productId: string, @Query() query: any) {
    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [], // relation
      [], // search
      { productId }, // filter
    );
  }

  @Get('by-branch/:branchId')
  @Permissions(EPermission.AUDIT_READ)
  byBranch(@Param('branchId', new ParseUUIDPipe()) branchId: string, @Query() query: any) {
    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [], // relation
      [], // search
      { branchId }, // filter
    );

    // return this.service.findByBranch(branchId, q);
  }

  // GET بحسب المروّج
  @Get('by-promoter/:promoterId')
  @Permissions(EPermission.AUDIT_READ)
  byPromoter(@Param('promoterId', new ParseUUIDPipe()) promoterId: string, @Query() query: any) {
    return CRUD.findAll(
      this.service.repo,
      'audit',
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [], // relation
      [], // search
      { promoterId }, // filter
    );
  }
}
