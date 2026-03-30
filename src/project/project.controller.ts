import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Req,
  Query,
  Patch,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { ProjectService } from "./project.service";
import { AuthGuard } from "../auth/auth.guard";
import { CreateProjectDto, UpdateProjectDto } from "dto/project.dto";
import { UUID } from "crypto";
import { CRUD } from "common/crud.service";
import { Permissions } from "decorators/permissions.decorators";
import { EPermission } from "enums/Permissions.enum";
import { Brackets } from "typeorm";

@Controller("projects")
@UseGuards(AuthGuard)
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  // 🔹 List all projects (super admin only)
  @Get("")
  @Permissions(EPermission.PROJECT_READ)
  async findAllProjects(@Req() req: any, @Query() query: any) {
    if (req.user.role?.name !== "super_admin") {
      throw new ForbiddenException("Only super admin can view all projects");
    }

    return CRUD.findAll(
      this.projectService.projectRepo,
      "project",
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ["branches", "products", "owner"],
      ["name", "username", "mobile"],
      query.filters,
    );
  }

  // 🔹 Get teams of a specific project

  @Get(":projectId/teams")
  @Permissions(EPermission.PROJECT_READ)
  async getTeamsByProject(
    @Param("projectId") projectId: string,
    @Query() query: any,
  ) {
    // Robustly parse nested filters from query parameters
    const filters: any = {};

    // If query.filters is already an object (parsed by qs), use it
    if (query.filters && typeof query.filters === "object") {
      Object.assign(filters, query.filters);
    }

    // Also look for bracket notation in top-level query keys (handle non-standard parsing)
    Object.keys(query).forEach((key) => {
      if (key.startsWith("filters[")) {
        const path = this.parseBracketNotation(key);
        if (path[0] === "filters") {
          this.setNestedValue(filters, path.slice(1), query[key]);
        }
      }
    });

    // Remap filters.project.id to direct project_id column to avoid conflict with 'owned project' relation
    if (filters.project && filters.project.id) {
      filters.project_id = filters.project.id;
      delete filters.project;
    }

    // Ensure we are filtering by the project ID from the URL
    filters.project_id = projectId;

    return CRUD.findAllRelation(
      this.projectService.userRepo,
      "users",
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ["role"], // Join role for filtering/display, but omit 'project' to avoid confusion with owned project
      ["name", "mobile", "username"],
      filters,
    );
  }

  // Helper method to parse bracket notation
  private parseBracketNotation(key: string): string[] {
    const parts = key.split("[");
    const path = [];

    for (const part of parts) {
      const cleaned = part.replace(/\]/g, "");
      if (cleaned) {
        path.push(cleaned);
      }
    }

    return path;
  }

  // Helper method to set nested value
  private setNestedValue(obj: any, path: string[], value: any) {
    let current = obj;

    for (let i = 0; i < path.length; i++) {
      const isLast = i === path.length - 1;

      if (isLast) {
        current[path[i]] = value;
      } else {
        if (!current[path[i]] || typeof current[path[i]] !== "object") {
          current[path[i]] = {};
        }
        current = current[path[i]];
      }
    }
  }

  // 🔹 Get the current user's project
  @Get("my-project")
  @Permissions(EPermission.PROJECT_READ)
  async find(@Req() req: any) {
    return this.projectService.find(req?.user);
  }

  // 🔹 Get current user's project info
  @Get("my-info")
  async findInfo(@Req() req: any) {
    return this.projectService.findInfo(req?.user);
  }

  // 🔹 Update project (for owner)
  @Put("")
  @Permissions(EPermission.PROJECT_UPDATE)
  async update(@Body() dto: UpdateProjectDto, @Req() req: any) {
    return this.projectService.put(dto, req.user.id);
  }

  // 🔹 Soft delete project (super admin only)
  @Delete(":id")
  @Permissions(EPermission.PROJECT_DELETE)
  async delete(@Param("id") id: UUID, @Req() req: any) {
    if (req.user.role?.name !== "super_admin") {
      throw new ForbiddenException("Only super admin can delete projects");
    }
    return CRUD.softDelete(this.projectService.projectRepo, "project", id);
  }

  // 🔹 Inactivate project (super admin only)
  @Patch(":id/inactivate")
  @Permissions(EPermission.PROJECT_INACTIVATE)
  async inactivateProject(@Param("id") id: UUID, @Req() req: any) {
    if (req.user.role?.name !== "super_admin") {
      throw new ForbiddenException("Only super admin can inactivate projects");
    }

    return this.projectService.inactivate(id);
  }
  @Get(":projectId")
  @Permissions(EPermission.PROJECT_READ)
  async findById(@Param("projectId") projectId: string, @Req() req: any) {
    return this.projectService.findByProjectId(projectId, req.user);
  }

  @Post(":id/reset-plans")
  @Permissions(EPermission.PROJECT_UPDATE) // Or a specific permission if exists
  async resetPlans(@Param("id") id: string, @Req() req: any) {
    // Optional: Check if user is super admin or project owner
    if (req.user.role?.name !== "super_admin" && req.user.project_id !== id) {
      // throw new ForbiddenException('Only super admin or project owner can reset plans');
    }
    return this.projectService.resetProjectPlans(id);
  }
}
