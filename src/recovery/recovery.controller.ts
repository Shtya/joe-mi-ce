import {
  BadRequestException,
  Controller,
  Headers,
  Post,
  Query,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { RecoveryService } from "./recovery.service";
import { RecoveryReportType, RecoveryResult } from "./recovery.types";

const VALID_TYPES: RecoveryReportType[] = ["attendance", "branches", "stock", "monthly"];

/**
 * Database recovery endpoint.
 *
 * POST /recovery/import?type=attendance|branches|stock&project=gatemea&dryRun=true
 * Multipart field: file (the Excel report).
 *
 * - dryRun defaults to true: everything runs inside a transaction that is
 *   rolled back, so the response shows exactly what WOULD be created/updated
 *   without touching the database.
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
  ): Promise<RecoveryResult> {
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
    return this.recoveryService.importReport({
      type,
      projectName: project,
      dryRun: dryRun !== "false",
      fileBuffer: file.buffer,
      saleDate,
    });
  }
}
