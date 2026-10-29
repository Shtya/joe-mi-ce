// --- File: feedback/feedback.controller.ts ---
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Req,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { FeedbackService } from "./feedback.service";
import { AuthGuard } from "../auth/auth.guard";
import { CreateFeedbackDto, UpdateFeedbackStatusDto } from "dto/feedback.dto";
import { EPermission } from "enums/Permissions.enum";
import { Permissions } from "decorators/permissions.decorators";
import { FilesInterceptor } from "@nestjs/platform-express";
import { CRUD } from "common/crud.service";
import { Feedback } from "entities/feedback.entity";
import { multerOptionsFeedbackTmp } from "common/multer.config";

import { UsersService } from "src/users/users.service";

@UseGuards(AuthGuard)
@Controller("feedback")
export class FeedbackController {
  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly usersService: UsersService,
  ) {}

  @Post()
  @UseInterceptors(FilesInterceptor("files", 10, multerOptionsFeedbackTmp))
  async createFeedback(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() dto: CreateFeedbackDto,
    @Req() req,
  ) {
    const attachmentUrls =
      files?.map((f) => `/uploads/feedback/${f.filename}`) ?? [];
    return this.feedbackService.create(dto, attachmentUrls, req.user);
  }

  // List feedback with filters + pagination
  @Get()
  async getFeedbackList(
    @Query() query: any,
    @Query("page") page: number = 1,
    @Query("limit") limit: number = 10,
    @Query("search") search?: string,
    @Query("projectId") projectId?: string,
    @Query("userId") userId?: string,
    @Query("type") type?: string,
    @Query("is_resolved") is_resolved?: string,
    @Req() req?: any,
  ) {
    const filters: any = { ...query.filters };

    // Resolve project ID from user
    const resolvedProjectId = await this.usersService.resolveProjectIdFromUser(
      req.user.id,
    );
    filters.project = { id: resolvedProjectId };

    if (userId) filters.user = { id: userId };
    if (type) filters.type = type;
    if (is_resolved !== undefined && is_resolved !== "") {
      // ?is_resolved=true | false
      filters.is_resolved = is_resolved === "true";
    }

    return CRUD.findAllRelation<Feedback>(
      this.feedbackService.feedbackRepo, // repo exposed from service
      "feedback", // root alias
      search, // search string
      page,
      limit,
      "created_at", // sortBy
      "DESC",
      ["user", "project", "resolvedBy"], // relations
      ["message", "type"], // searchFields
      filters,
    );
  }

  @Get("export")
  async exportFeedback(
    @Query() query: any,
    @Query("search") search: string,
    @Query("userId") userId: string,
    @Query("type") type: string,
    @Query("is_resolved") is_resolved: string,
    @Res() res: Response,
    @Req() req: any,
  ) {
    const projectId = await this.usersService.resolveProjectIdFromUser(
      req.user.id,
    );
    const queryFilters =
      query.filters && typeof query.filters === "object" ? query.filters : {};
    const workbook = await this.feedbackService.exportToExcel({
      projectId,
      search,
      userId,
      type,
      is_resolved,
      start_date: queryFilters.start_date ?? query.start_date,
      end_date: queryFilters.end_date ?? query.end_date,
      created_at: queryFilters.created_at ?? query.created_at,
      publicBaseUrl:
        process.env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=feedback-export-${new Date().toISOString().slice(0, 10)}.xlsx`,
    );
    res.send(workbook);
  }

  // Get single feedback
  @Get(":id")
  async getFeedback(@Param("id") id: string) {
    return this.feedbackService.findOne(id);
  }

  // Resolve / unresolve feedback
  @Patch(":id/resolve")
  async resolveFeedback(
    @Param("id") id: string,
    @Body() dto: UpdateFeedbackStatusDto,
    @Req() req,
  ) {
    return this.feedbackService.resolve(id, dto, req.user);
  }

  // Delete feedback
  @Delete(":id")
  async deleteFeedback(@Param("id") id: string) {
    return this.feedbackService.remove(id);
  }
}
