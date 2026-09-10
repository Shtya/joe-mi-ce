import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  CreatePayrollAdjustmentDto,
  CreatePayrollLineDto,
  CreatePayrollPeriodDto,
  PayrollMonthQueryDto,
  PayrollPeriodFilterDto,
  ReplacePayrollViolationRulesDto,
  SalaryImportDto,
  SetPayrollEnabledDto,
  UpdatePayrollAdjustmentDto,
  UpdatePayrollLineDto,
} from "dto/payroll.dto";
import { Permissions } from "decorators/permissions.decorators";
import { EPermission } from "enums/Permissions.enum";
import { AuthGuard } from "src/auth/auth.guard";
import { PayrollService } from "./payroll.service";
import { Response } from "express";

@Controller()
@UseGuards(AuthGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  private tokenProjectId(req: any): string {
    const projectId = req.user?.project_id ?? req.user?.project?.id;
    if (!projectId)
      throw new BadRequestException("The authenticated user has no project");
    return projectId;
  }

  @Patch("payroll/my-project/settings")
  @Permissions(EPermission.PAYROLL_MANAGE)
  enableTokenProjectPayroll(
    @Body() dto: SetPayrollEnabledDto,
    @Req() req: any,
  ) {
    return this.payrollService.enableProjectPayroll(
      this.tokenProjectId(req),
      dto.enabled,
      req.user,
    );
  }

  @Get("payroll/my-project/violation-rules")
  @Permissions(EPermission.PAYROLL_READ)
  getTokenProjectViolationRules(@Req() req: any) {
    return this.payrollService.getViolationRules(
      this.tokenProjectId(req),
      req.user,
    );
  }

  @Post("payroll/my-project/import-salaries")
  @Permissions(EPermission.PAYROLL_MANAGE)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  importTokenProjectSalaries(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SalaryImportDto,
    @Req() req: any,
  ) {
    return this.payrollService.importSalaries(
      this.tokenProjectId(req),
      file,
      req.user,
      dto,
    );
  }

  @Post("payroll/my-project/sync")
  @Permissions(EPermission.PAYROLL_MANAGE)
  syncTokenProject(@Query() query: PayrollMonthQueryDto, @Req() req: any) {
    return this.payrollService.syncPeriod(
      this.tokenProjectId(req),
      query.month,
      req.user,
    );
  }

  @Get("payroll/my-project/periods")
  @Permissions(EPermission.PAYROLL_READ)
  listTokenProjectPeriods(
    @Query() query: PayrollPeriodFilterDto,
    @Req() req: any,
  ) {
    return this.payrollService.listPeriods(
      this.tokenProjectId(req),
      query,
      req.user,
    );
  }

  @Post("payroll/my-project/periods")
  @Permissions(EPermission.PAYROLL_MANAGE)
  createTokenProjectPeriod(
    @Body() dto: CreatePayrollPeriodDto,
    @Req() req: any,
  ) {
    return this.payrollService.createPendingPeriod(
      this.tokenProjectId(req),
      dto,
      req.user,
    );
  }

  @Post("payroll/my-project/periods/:periodId/lines")
  @Permissions(EPermission.PAYROLL_MANAGE)
  createTokenProjectLine(
    @Param("periodId") periodId: string,
    @Body() dto: CreatePayrollLineDto,
    @Req() req: any,
  ) {
    return this.payrollService.createPayrollLine(
      this.tokenProjectId(req),
      periodId,
      dto,
      req.user,
    );
  }

  @Patch("payroll/my-project/lines/:lineId")
  @Permissions(EPermission.PAYROLL_MANAGE)
  updateTokenProjectLine(
    @Param("lineId") lineId: string,
    @Body() dto: UpdatePayrollLineDto,
    @Req() req: any,
  ) {
    return this.payrollService.updatePayrollLine(lineId, dto, req.user);
  }

  @Post("payroll/my-project/lines/:lineId/adjustments")
  @Permissions(EPermission.PAYROLL_MANAGE)
  addTokenProjectAdjustment(
    @Param("lineId") lineId: string,
    @Body() dto: CreatePayrollAdjustmentDto,
    @Req() req: any,
  ) {
    return this.payrollService.addAdjustment(lineId, dto, req.user);
  }

  @Patch("payroll/my-project/adjustments/:adjustmentId")
  @Permissions(EPermission.PAYROLL_MANAGE)
  updateTokenProjectAdjustment(
    @Param("adjustmentId") adjustmentId: string,
    @Body() dto: UpdatePayrollAdjustmentDto,
    @Req() req: any,
  ) {
    return this.payrollService.updateAdjustment(adjustmentId, dto, req.user);
  }

  @Delete("payroll/my-project/adjustments/:adjustmentId")
  @Permissions(EPermission.PAYROLL_MANAGE)
  deleteTokenProjectAdjustment(
    @Param("adjustmentId") adjustmentId: string,
    @Req() req: any,
  ) {
    return this.payrollService.deleteAdjustment(adjustmentId, req.user);
  }

  @Patch("projects/:projectId/payroll")
  @Permissions(EPermission.PAYROLL_MANAGE)
  enablePayroll(
    @Param("projectId") projectId: string,
    @Body() dto: SetPayrollEnabledDto,
    @Req() req: any,
  ) {
    return this.payrollService.enableProjectPayroll(
      projectId,
      dto.enabled,
      req.user,
    );
  }

  @Get("projects/:projectId/payroll/violation-rules")
  @Permissions(EPermission.PAYROLL_READ)
  getViolationRules(@Param("projectId") projectId: string, @Req() req: any) {
    return this.payrollService.getViolationRules(projectId, req.user);
  }

  @Put("projects/:projectId/payroll/violation-rules")
  @Permissions(EPermission.PAYROLL_MANAGE)
  replaceViolationRules(
    @Param("projectId") projectId: string,
    @Body() dto: ReplacePayrollViolationRulesDto,
    @Req() req: any,
  ) {
    return this.payrollService.replaceViolationRules(projectId, dto, req.user);
  }

  @Get("payroll/import-salaries/template")
  getSalaryImportTemplate(@Res() res: Response) {
    return this.payrollService.getSalaryImportTemplate().then((buffer) => {
      res.set({
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          "attachment; filename=payroll-salary-import-template.xlsx",
        "Content-Length": buffer.length,
      });
      res.end(buffer);
    });
  }

  @Post("payroll/projects/:projectId/import-salaries")
  @Permissions(EPermission.PAYROLL_MANAGE)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, callback) =>
        callback(null, /\.(xlsx|xls)$/i.test(file.originalname)),
    }),
  )
  importSalaries(
    @Param("projectId") projectId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: SalaryImportDto,
    @Req() req: any,
  ) {
    return this.payrollService.importSalaries(projectId, file, req.user, dto);
  }

  @Post("payroll/projects/:projectId/sync")
  @Permissions(EPermission.PAYROLL_MANAGE)
  sync(
    @Param("projectId") projectId: string,
    @Query() query: PayrollMonthQueryDto,
    @Req() req: any,
  ) {
    return this.payrollService.syncPeriod(projectId, query.month, req.user);
  }

  @Get("payroll/projects/:projectId/periods/:month")
  @Permissions(EPermission.PAYROLL_READ)
  getPeriod(
    @Param("projectId") projectId: string,
    @Param("month") month: string,
    @Req() req: any,
  ) {
    return this.payrollService.getPeriod(projectId, month, req.user);
  }

  @Post("payroll/periods/:periodId/mark-paid")
  @Permissions(EPermission.PAYROLL_MANAGE)
  markPaid(@Param("periodId") periodId: string, @Req() req: any) {
    return this.payrollService.markPaid(periodId, req.user);
  }
}
