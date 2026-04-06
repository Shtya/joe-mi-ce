// controllers/users.controller.ts
import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  UnauthorizedException,
  Delete,
  Req,
  Body,
  Post,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import {
  UserResponseDto,
  UsersByBranchResponseDto,
  ProjectUsersResponseDto,
} from "dto/users.dto";
import { AuthGuard } from "src/auth/auth.guard";
import { UsersService } from "./users.service";
import { JourneyService } from "src/journey/journey.service";
import { Permissions } from "decorators/permissions.decorators";
import { EPermission } from "enums/Permissions.enum";
import { FileInterceptor } from "@nestjs/platform-express";
import { multerOptions } from "common/multer.config";
import * as fs from "fs";
import * as ExcelJS from "exceljs";
import * as XLSX from "xlsx";
import { parse } from "papaparse";

@Controller("user")
@UseGuards(AuthGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly journeyService: JourneyService,
  ) {}

  // Get current user profile (using token)
  @Get("profile")
  async getProfile(@Request() req): Promise<UserResponseDto> {
    return this.usersService.getUserProfile(req.user.id);
  }

  @Get("project")
  async getProjectUsers(@Request() req): Promise<ProjectUsersResponseDto> {
    return this.usersService.getProjectUsers(req?.user?.project?.id);
  }

  // Get users by branch in current user's project
  @Get("project/branches")
  async getUsersByBranches(
    @Request() req,
  ): Promise<UsersByBranchResponseDto[]> {
    return this.usersService.getUsersByBranches(req.user.project_id);
  }

  // Get users for a specific branch
  @Get("branch/:branchId")
  async getUsersByBranch(
    @Param("branchId", ParseUUIDPipe) branchId: string,
    @Request() req,
  ): Promise<UsersByBranchResponseDto> {
    return this.usersService.getUsersByBranch(branchId, req.user.project_id);
  }

  // Get specific user by ID (within same project)
  @Get(":userId")
  async getUserById(
    @Param("userId", ParseUUIDPipe) userId: string,
    @Request() req,
  ): Promise<UserResponseDto> {
    return this.usersService.getUserById(userId, req.user.project_id);
  }

  // Alternative: Get users with query parameter for branch
  @Get()
  async getUsers(
    @Query("branchId") branchId?: string,
    @Query("projectId") projectId?: string,
    @Request() req?,
  ) {
    if (branchId) {
      const projectIdToUse =
        projectId || req.user.project_id || req.user.project?.id;
      return this.usersService.getUsersByBranch(branchId, projectIdToUse);
    }

    // If projectId is provided, return all users in project
    if (projectId) {
      return this.usersService.getProjectUsers(projectId);
    }

    // Default: return users in current user's project
    return this.usersService.getUsersInProject(req.user.project_id);
  }

  @Get("project/promoters-supervisors")
  async getPromotersAndSupervisors(@Request() req) {
    // 🔐 Resolve project strictly from DB user
    const projectId = await this.usersService.resolveProjectIdFromUser(
      req.user.id,
    );

    return this.usersService.getPromotersAndSupervisorsByProject(projectId);
  }
  //   @Delete('delete/account')
  //   async deleteUser(
  //     @Body('userId') userId: string, // optional
  //  @Req() req
  //   ) {

  //     const lang = req.headers['lang']?.toLowerCase() || 'en';
  //     const user = userId || req.user.id
  //     return this.usersService.deleteUser(user, lang);
  //   }

  @Get("stats/:userId")
  @Permissions(EPermission.JOURNEY_READ)
  async getUserStats(@Param("userId", ParseUUIDPipe) userId: string) {
    return this.journeyService.getUserStats(userId);
  }

  @Post("fcm-token")
  @HttpCode(HttpStatus.OK)
  async registerFcmToken(@Req() req, @Body("token") token: string) {
    return this.usersService.registerFcmToken(req.user.id, token);
  }

  @Post("import-users")
  @Permissions(EPermission.USER_UPDATE)
  @UseInterceptors(FileInterceptor("file", multerOptions))
  async importUsers(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException("File is required");
    }

    const filePath = file.path;
    let rows: any[] = [];

    try {
      if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
        const csvContent = fs.readFileSync(filePath, "utf8");
        const result = parse(csvContent, {
          header: true,
          skipEmptyLines: true,
        });
        rows = result.data;
      } else if (
        file.mimetype === "application/vnd.ms-excel" ||
        file.originalname.endsWith(".xls")
      ) {
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          defval: "",
        });
      } else {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const sheet = workbook.getWorksheet(1);

        const headers: string[] = [];
        sheet.getRow(1).eachCell((cell, i) => {
          headers[i - 1] = cell.value?.toString() || "";
        });

        for (let i = 2; i <= sheet.rowCount; i++) {
          const row = sheet.getRow(i);
          const obj: any = {};
          headers.forEach((h, idx) => {
            const v = row.getCell(idx + 1).value;
            if (v !== null && v !== undefined) {
              obj[h] = v.toString().trim();
            }
          });
          rows.push(obj);
        }
      }

      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

      return await this.usersService.importUsersData(rows);
    } catch (err) {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      throw err;
    }
  }
}
