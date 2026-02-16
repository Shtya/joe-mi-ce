// controllers/vacation.controller.ts
import {
  Controller,
  Post,
  Body,
  Param,
  Put,
  Get,
  UseGuards,
  Query,
  Delete,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UsePipes,
  ValidationPipe,
  Patch,
  Req
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VacationService } from './vacation.service';
import {
  CreateVacationDto,
  UpdateDateStatusDto,
  UpdateMultipleDatesStatusDto,
  VacationQueryDto,
  ApprovedDatesQueryDto
} from 'dto/vacation.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { UUID } from 'crypto';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { multerOptionsVaction } from 'common/multer.config';

@UseGuards(AuthGuard)
@Controller('vacations')
@UsePipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
  transformOptions: {
    enableImplicitConversion: true,
  }
}))
export class VacationController {
  constructor(private readonly vacationService: VacationService) {}

  @Post()
  @Permissions(EPermission.VACATION_CREATE)
  @UseInterceptors(FileInterceptor('image', multerOptionsVaction))
  async createVacation(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateVacationDto,
    @Req() res: any
  ) {
    try {
      let imagePath = null;
      if (file) {
        imagePath = `/uploads/vacations/${file.filename}`;
      }
      if (!dto.userId){
        dto.userId = res.user.id
      }
      if(!dto.branchId){

      }
      return await this.vacationService.createVacation(dto, imagePath);
    } catch (error) {
      throw new BadRequestException(`Failed to create vacation: ${error.message}`);
    }
  }

  // 🔹 Update single date status
  @Patch(':id/date-status')
  @Permissions(EPermission.VACATION_UPDATE)
  async updateDateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDateStatusDto
  ) {
    return await this.vacationService.updateDateStatus(id, dto);
  }

  @Get('for-mobile')
  @Permissions(EPermission.VACATION_READ)
  async getVacationsForMobile(
    @Req() req: any,
    @Query() query: VacationQueryDto
  ) {
    const transformedQuery = this.transformQueryParams(query);
    return await this.vacationService.getVacationsWithPagination(
      { user: { id: req.user.id } },
      transformedQuery.page,
      transformedQuery.limit,
      transformedQuery.sortBy,
      transformedQuery.sortOrder
    );
  }
  // 🔹 Get vacations by branch (summary)
  @Get('by-branch/:branchId')
  @Permissions(EPermission.VACATION_READ)
  async getVacationsByBranch(
    @Param('branchId') branchId: UUID,
    @Query() query: VacationQueryDto
  ) {
    const transformedQuery = this.transformQueryParams(query);
    return await this.vacationService.getVacationsWithPagination(
      { branch: { id: branchId } },
      transformedQuery.page,
      transformedQuery.limit,
      transformedQuery.sortBy,
      transformedQuery.sortOrder
    );
  }


  // 🔹 Get vacations by user (summary)
  @Get('by-user/:userId')
  @Permissions(EPermission.VACATION_READ)
  async getVacationsByUser(
    @Param('userId') userId: UUID,
    @Query() query: VacationQueryDto
  ) {
    const transformedQuery = this.transformQueryParams(query);
    return await this.vacationService.getVacationsWithPagination(
      { user: { id: userId } },
      transformedQuery.page,
      transformedQuery.limit,
      transformedQuery.sortBy,
      transformedQuery.sortOrder
    );
  }


  // 🔹 Get all vacations (summary)
  @Get()
  @Permissions(EPermission.VACATION_READ)
  async getAllVacations(@Query() query: any,@Req() req:any) {
    const transformedQuery = this.transformQueryParams(query);
    const mergedConditions = {
      ...transformedQuery.filters,
      status: transformedQuery.status || transformedQuery.filters?.status,
      search: transformedQuery.search,
    };

    return await this.vacationService.getVacationsWithPaginationProject(
      mergedConditions,
      transformedQuery.page,
      transformedQuery.limit,
      transformedQuery.sortBy,
      transformedQuery.sortOrder,
      req
    );
  }


  // // 🔹 Get user's vacation dates (summary)
  // @Get('user/:userId/dates')
  // @Permissions(EPermission.VACATION_READ)
  // async getUserVacations(@Param('userId') userId: string) {
  //   return await this.vacationService.getVacationsByUser(userId);
  // }

  // @Get('approved-dates/for-mobile')
  // @Permissions(EPermission.VACATION_READ)
  // async getApprovedDatesForMobile(
  //   @Req() req: any,
  //   @Query() query: ApprovedDatesQueryDto
  // ) {
  //   return await fthis.vacationService.getApprovedVacationDates(
  //     req.user.id,
  //     query.startDate,
  //     query.endDate
  //   );
  // }

  // // 🔹 Get approved dates for user
  // @Get('approved-dates/:userId')
  // @Permissions(EPermission.VACATION_READ)
  // async getApprovedDates(
  //   @Param('userId') userId: string,
  //   @Query() query: ApprovedDatesQueryDto
  // ) {
  //   return await this.vacationService.getApprovedVacationDates(
  //     userId,
  //     query.startDate,
  //     query.endDate
  //   );
  // }
  // 🔹 Get vacation by ID with full details
  @Get(':id')
  @Permissions(EPermission.VACATION_READ)
  async getVacation(@Param('id') id: string) {
    return await this.vacationService.getVacationById(id);
  }

  // // 🔹 Get date status summary
  // @Get(':id/date-summary')
  // @Permissions(EPermission.VACATION_READ)
  // async getDateStatusSummary(@Param('id') id: string) {
  //   return await this.vacationService.getDateStatusSummary(id);
  // }

  // 🔹 Delete vacation
  @Delete(':id')
  @Permissions(EPermission.VACATION_DELETE)
  async deleteVacation(@Param('id') id: string) {
    return await this.vacationService.vacationRepo.softDelete(id);
  }

  private transformQueryParams(query: any): any {
    return {
      page: query.page ? Number(query.page) : 1,
      limit: query.limit ? Number(query.limit) : 10,
      sortBy: query.sortBy || 'created_at',
      sortOrder: query.sortOrder || 'DESC',
      search: query.search,
      status: query.status,
      filters: query.filters,
    };
  }
}