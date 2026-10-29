import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Request } from "express";
import { User } from "entities/user.entity";
import { AuthGuard } from "src/auth/auth.guard";
import { Permissions } from "decorators/permissions.decorators";
import { EPermission } from "enums/Permissions.enum";
import {
  GrantCompensatoryDaysDto,
  SetVacationJoiningDateDto,
} from "dto/vacation-balance.dto";
import { VacationBalanceService } from "./vacation-balance.service";

type EmployeeRequest = Request & { user: User };

@Controller("vacations/balance")
@UseGuards(AuthGuard)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class VacationBalanceController {
  constructor(private readonly balances: VacationBalanceService) {}

  @Get("me")
  @Permissions(EPermission.VACATION_READ)
  mine(@Req() request: EmployeeRequest) {
    return this.balances.getBalance(request.user.id, request.user);
  }

  @Get(":userId")
  @Permissions(EPermission.VACATION_READ)
  employee(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Req() request: EmployeeRequest,
  ) {
    return this.balances.getBalance(userId, request.user);
  }

  @Put(":userId/joining-date")
  @Permissions(EPermission.VACATION_UPDATE)
  joiningDate(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: SetVacationJoiningDateDto,
    @Req() request: EmployeeRequest,
  ) {
    return this.balances.setJoiningDate(userId, dto.joiningDate, request.user);
  }

  @Post(":userId/compensatory")
  @Permissions(EPermission.VACATION_UPDATE)
  compensatory(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: GrantCompensatoryDaysDto,
    @Req() request: EmployeeRequest,
  ) {
    return this.balances.grantCompensatory(
      userId,
      dto.days,
      dto.reason,
      request.user,
    );
  }
}
