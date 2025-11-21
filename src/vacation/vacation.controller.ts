import { Controller, Post, Body, Param, Put, Get, UseGuards, Query, Delete } from '@nestjs/common';
import { VacationService } from './vacation.service';
import { CreateVacationDto, UpdateVacationDto } from 'dto/vacation.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { UUID } from 'crypto';
import { CRUD } from 'common/crud.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('vacations')
export class VacationController {
  constructor(private readonly vacationService: VacationService) {}

  // 🔹 Create a new vacation request
  @Post()
  @Permissions(EPermission.VACATION_CREATE)
  async createVacation(@Body() dto: CreateVacationDto) {
    return await this.vacationService.createVacation(dto);
  }

  // 🔹 Get all vacations by branch
  @Get('by-branch/:branchId')
  @Permissions(EPermission.VACATION_READ)
  async getVacationsByBranch(@Param('branchId') branchId: UUID, @Query() query) {
    return CRUD.findAll(this.vacationService.vacationRepo, 'vacation', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['branch'], [], { branch: { id: branchId } });
  }

  // 🔹 Get all vacations by user
  @Get('by-user/:userId')
  @Permissions(EPermission.VACATION_READ)
  async getVacationsByUser(@Param('userId') userId: UUID, @Query() query) {
    return CRUD.findAll(this.vacationService.vacationRepo, 'vacation', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['user'], [], { user: { id: userId } });
  }

  // 🔹 Supervisor approves or rejects vacation
  @Put(':id')
  @Permissions(EPermission.VACATION_UPDATE)
  async updateVacationStatus(@Param('id') id: string, @Body() dto: UpdateVacationDto) {
    return await this.vacationService.updateVacationStatus(id, dto);
  }

  // 🔹 Delete a vacation (soft delete)
  @Delete(':id')
  @Permissions(EPermission.VACATION_DELETE)
  async deleteVacation(@Param('id') id: string) {
    return CRUD.softDelete(this.vacationService.vacationRepo, 'vacation', id);
  }
}
