import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RecoveryService } from "./recovery.service";
import { RecoveryReportType } from "./recovery.types";

const VALID_TYPES: RecoveryReportType[] = ["attendance", "branches", "stock", "monthly"];

/**
 * Database recovery endpoint.
 *
 * POST /recovery/import?type=attendance|branches|stock|monthly&project=gatemea&dryRun=true
 * Multipart field: file (the Excel report).
 *
 * Imports run asynchronously to avoid gateway timeouts on large reports.
 * The response contains a jobId; poll GET /recovery/jobs/:jobId for status
 * and results.
 *
 * - dryRun defaults to true: the job runs inside a transaction that is rolled
 *   back, so the result shows exactly what WOULD be created/updated.
 * - Pass dryRun=false to actually apply (upsert: create missing, update
 *   differing, skip identical — safe to run repeatedly).
 * - If RECOVERY_TOKEN is set in the environment, every call must send it in
 *   the x-recovery-token header.
 */
@Controller("recovery")
export class RecoveryController {
  constructor(private readonly recoveryService: RecoveryService) {}

  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  async importReport(
    @UploadedFile() file: Express.Multer.File,
    @Query("type") type: RecoveryReportType,
    @Query("project") project = "gatemea",
    @Query("dryRun") dryRun = "true",
    @Query("saleDate") saleDate?: string,
    @Headers("x-recovery-token") token?: string,
  ): Promise<{ jobId: string; status: string; message: string }> {
    const expectedToken = process.env.RECOVERY_TOKEN;
    if (expectedToken && token !== expectedToken) {
      throw new UnauthorizedException("invalid x-recovery-token");
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException("Excel file is required (multipart field 'file')");
    }
    if (!VALID_TYPES.includes(type)) {
      throw new BadRequestException(
        `Query param 'type' must be one of: ${VALID_TYPES.join(", ")}`,
      );
    }

    const job = await this.recoveryService.startImportJob({
      type,
      projectName: project,
      dryRun: dryRun !== "false",
      fileBuffer: file.buffer,
      saleDate,
    });

    return {
      jobId: job.id,
      status: job.status,
      message: "Import started. Poll GET /recovery/jobs/${job.id} for results.",
    };
  }

  @Get("jobs/:id")
  async getJob(@Param("id") id: string) {
    return this.recoveryService.getJob(id);
  }
}
