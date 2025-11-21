import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors, BadRequestException, Req } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CheckoutsService } from './checkout.service';
import { CreateCheckoutDto, UpdateCheckoutDto } from './checkout.dto';

import { imageUploadOptions } from './upload.config';
import type { Request } from 'express';
import { CRUD } from 'common/crud.service';

@Controller('checkouts')
export class CheckoutsController {
  constructor(private readonly service: CheckoutsService) {}

  /**
   * Create checkout (multipart/form-data)
   * field name: "file"
   * other fields: name, countryCode, phone, email, agreed, notes?
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  async create(@UploadedFile() file: any, @Body() body: any, @Req() req: Request) {
    if (!file) {
      throw new BadRequestException('Proof image (file) is required');
    }

    // Build a stable URL or store relative path
    // If you serve /uploads statically, a relative path is enough
    const relativePath = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
    const proofUrl = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

    // Attach proofUrl & ip
    body.proofUrl = proofUrl;
    const xfwd = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    body.ipAddress = (Array.isArray(xfwd) ? xfwd[0] : xfwd).split(',')[0].trim();

    // agreed comes as "on"/"true"/"false" sometimes
    if (typeof (body as any).agreed === 'string') {
      body.agreed = ['true', '1', 'on', 'yes'].includes((body as any).agreed.toLowerCase());
    }

    return this.service.create(body);
  }

  @Get()
  async findAll(@Query('') query: any) {
    return CRUD.findAll(this.service.repo, 'p', query.search, query.page, query.limit, query.sortBy, query.sortOrder ?? 'DESC', [], ['weekOf'], query.filters);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCheckoutDto) {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  async setStatus(@Param('id') id: string, @Body() body: { status: 'pending' | 'verified' | 'rejected'; notes?: string }) {
    if (!body?.status) throw new BadRequestException('status is required');
    return this.service.setStatus(id, body.status, body.notes);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.service.remove(id);
    return { ok: true };
  }
}
