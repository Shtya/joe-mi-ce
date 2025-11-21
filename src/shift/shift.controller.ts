import { Controller, Get, Post, Body, Param, Patch, Delete, Query, UseGuards } from '@nestjs/common';
import { ShiftService } from './shift.service';
import { CreateShiftDto, UpdateShiftDto } from 'dto/shift.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('shifts')
export class ShiftController {
  constructor(private readonly shiftService: ShiftService) {}

  // 🔹 Create new shift
  @Post()
  @Permissions(EPermission.SHIFT_CREATE)
  create(@Body() dto: CreateShiftDto) {
    return this.shiftService.create(dto);
  }

  // 🔹 Get all shifts
  @Get()
  @Permissions(EPermission.SHIFT_READ)
  findAll(@Query() query) {
    return CRUD.findAll(this.shiftService.shiftRepo, 'shift', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['project'], ['name'], query.filters);
  }

  // 🔹 Update a shift
  @Patch(':id')
  @Permissions(EPermission.SHIFT_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftService.update(id, dto);
  }

  // 🔹 Delete a shift
  @Delete(':id')
  @Permissions(EPermission.SHIFT_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.softDelete(this.shiftService.shiftRepo, 'shift', id);
  }

  // 🔹 Get shifts by project
  @Get('/by-project/:projectId')
  @Permissions(EPermission.SHIFT_READ)
  findByProject(@Param('projectId') projectId: string, @Query() query) {
    return CRUD.findAll(this.shiftService.shiftRepo, 'shift', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['project'], ['name'], { project: { id: projectId } });
  }
}
