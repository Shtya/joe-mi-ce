// sale.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  Query,
  Res,
  UseGuards,
  Req,
  Put,
  Header,
  ParseUUIDPipe,
} from "@nestjs/common";
import { SaleService } from "./sale.service";
import { CreateSaleDto, UpdateSaleDto, ReassignSalesDto } from "dto/sale.dto";
import { CRUD } from "common/crud.service";
import { AuthGuard } from "src/auth/auth.guard";
import { Permissions } from "decorators/permissions.decorators";
import { EPermission } from "enums/Permissions.enum";
import { UsersService } from "src/users/users.service";

@UseGuards(AuthGuard)
@Controller("sales")
export class SaleController {
  constructor(
    private readonly saleService: SaleService,
    private readonly userService: UsersService,
  ) {}

  private parseSalesDates(query: any): { startDate: Date; endDate: Date } {
    const rawStart =
      query.start_date || query.filters?.fromDate || query.fromDate;
    const rawEnd = query.end_date || query.filters?.toDate || query.toDate;

    let startDate: Date;
    let endDate: Date;

    const parseDateStr = (d: string) => {
      if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
        const [day, month, year] = d.split("-").map(Number);
        return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      }
      return d;
    };

    if (rawStart || rawEnd) {
      if (rawStart) {
        const dateStr = parseDateStr(rawStart);
        startDate = new Date(`${dateStr}T07:00:00.000+03:00`);
      } else {
        const shiftedNow = new Date(Date.now() - 7 * 60 * 60 * 1000);
        const saudiDateStr = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Riyadh",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(shiftedNow);
        startDate = new Date(`${saudiDateStr}T07:00:00.000+03:00`);
      }

      if (rawEnd) {
        const dateStr = parseDateStr(rawEnd);
        const targetDate = new Date(`${dateStr}T16:00:00.000+03:00`);
        endDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);
      } else {
        endDate = new Date(startDate.getTime() + 33 * 60 * 60 * 1000);
      }
    } else {
      const shiftedNow = new Date(Date.now() - 7 * 60 * 60 * 1000);
      const saudiDateStr = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Riyadh",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(shiftedNow);
      startDate = new Date(`${saudiDateStr}T07:00:00.000+03:00`);
      endDate = new Date(startDate.getTime() + 33 * 60 * 60 * 1000);
    }

    return { startDate, endDate };
  }

  private applyShorthandFilters(mergedFilters: any) {
    if (mergedFilters.brand?.id) {
      mergedFilters["product.brand.id"] = mergedFilters.brand.id;
      delete mergedFilters.brand;
    }
    if (mergedFilters.category?.id) {
      mergedFilters["product.category.id"] = mergedFilters.category.id;
      delete mergedFilters.category;
    }
    if (mergedFilters.chain?.id) {
      mergedFilters["branch.chain.id"] = mergedFilters.chain.id;
      delete mergedFilters.chain;
    }
    if (mergedFilters.city?.id) {
      mergedFilters["branch.city.id"] = mergedFilters.city.id;
      delete mergedFilters.city;
    }
    if (mergedFilters.user?.id) {
      mergedFilters["user.id"] = mergedFilters.user.id;
      delete mergedFilters.user;
    }
    if (mergedFilters.branch?.id) {
      mergedFilters["branch.id"] = mergedFilters.branch.id;
      delete mergedFilters.branch;
    }
  }

  // 🔹 Export sales data to Excel
  @Get("/export")
  @Permissions(EPermission.SALE_EXPORT)
  async exportData(@Query() query: any, @Req() req: any, @Res() res: any) {
    const project = await this.userService.resolveProjectIdFromUser(
      req.user.id,
    );
    const mergedFilters: any = {
      projectId: project,
      ...query.filters,
    };

    if (query.filters?.project?.id) {
      mergedFilters.projectId = query.filters.project.id;
      delete mergedFilters.project;
    }

    if (query.filters?.fromDate || query.filters?.toDate) {
      mergedFilters.created_at = {};

      const normalizeDate = (d: string) => {
        if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
          const [day, month, year] = d.split("-").map(Number);
          return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
        return d;
      };

      if (query.filters.fromDate) {
        const d = normalizeDate(query.filters.fromDate);
        mergedFilters.created_at.gte = d.includes("T")
          ? d
          : `${d}T00:00:00.000+03:00`;
      }
      if (query.filters.toDate) {
        const d = normalizeDate(query.filters.toDate);
        mergedFilters.created_at.lte = d.includes("T")
          ? d
          : `${d}T23:59:59.999+03:00`;
      }
    }

    if (mergedFilters.fromDate) delete mergedFilters.fromDate;
    if (mergedFilters.toDate) delete mergedFilters.toDate;
    if (mergedFilters.date) delete mergedFilters.date;
    if (mergedFilters.sale_date_from) delete mergedFilters.sale_date_from;
    if (mergedFilters.sale_date_to) delete mergedFilters.sale_date_to;
    if (mergedFilters.project) delete mergedFilters.project;

    this.applyShorthandFilters(mergedFilters);

    return CRUD.exportEntityToExcel2(
      this.saleService.saleRepo,
      "sale",
      "sales_report",
      res,
      {
        exportLimit: query.limit,
        search: query.search,
        filters: mergedFilters,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        relations: [
          "user",
          "product",
          "branch",
          "branch.chain",
          "branch.city",
          "product.brand",
          "product.category",
        ],
        searchFields: ["user.name", "user.username", "product.name"],
      },
    );
  }

  @Get()
  @Permissions(EPermission.SALE_READ)
  async findAll(@Query() query: any, @Req() req: any) {
    // const mergedFilters: any = {
    //   ...parsedFilters,
    // };6b140f73-7d36-44ad-89b2-492d482e8997

    // if (query.filters.fromDate) {
    //   mergedFilters.audit_date_from = query.filters.fromDate; // will map to audit.audit_date >= fromDate
    // }
    // if (query.filters.toDate) {
    //   mergedFilters.audit_date_to = query.filters.toDate; // will map to audit.audit_date <= toDate
    // }
    const project = await this.userService.resolveProjectIdFromUser(
      req.user.id,
    );
    const mergedFilters: any = {
      projectId: project,
      ...query.filters, // This might spread 'fromDate'/'toDate' if they exist in query.filters
    };

    if (query.filters?.project?.id) {
      mergedFilters.projectId = query.filters.project.id;
      delete mergedFilters.project;
    }

    if (query.filters?.fromDate || query.filters?.toDate) {
      mergedFilters.created_at = {};

      const normalizeDate = (d: string) => {
        if (/^\d{2}-\d{2}-\d{4}$/.test(d)) {
          const [day, month, year] = d.split("-").map(Number);
          return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        }
        return d;
      };

      if (query.filters.fromDate) {
        const d = normalizeDate(query.filters.fromDate);
        mergedFilters.created_at.gte = d.includes("T")
          ? d
          : `${d}T00:00:00.000+03:00`;
      }
      if (query.filters.toDate) {
        const d = normalizeDate(query.filters.toDate);
        mergedFilters.created_at.lte = d.includes("T")
          ? d
          : `${d}T23:59:59.999+03:00`;
      }
    }

    if (mergedFilters.fromDate) delete mergedFilters.fromDate;
    if (mergedFilters.toDate) delete mergedFilters.toDate;
    if (mergedFilters.date) delete mergedFilters.date;
    if (mergedFilters.sale_date_from) delete mergedFilters.sale_date_from;
    if (mergedFilters.sale_date_to) delete mergedFilters.sale_date_to;
    if (mergedFilters.project) delete mergedFilters.project;

    this.applyShorthandFilters(mergedFilters);

    return CRUD.findAll2(
      this.saleService.saleRepo,
      "sale",
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      [
        "user",
        "product",
        "branch",
        "branch.chain",
        "branch.city",
        "product.brand",
        "product.category",
      ],
      ["user.name", "user.username", "product.name"],
      mergedFilters,
    );
  }
  @Post()
  @Permissions(EPermission.SALE_CREATE)
  create(@Body() dto: CreateSaleDto) {
    return this.saleService.create(dto);
  }

  @Get("promoter/:id/today")
  @Permissions(EPermission.SALE_READ)
  async getPromoterSalesForToday(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Query() query: any,
  ) {
    // Shift current time backward by 5 hours so that 00:00 to 05:00 AM counts as "today"
    const shiftedNow = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const saudiDateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(shiftedNow);

    // Set exactly from 00:00 KSA today to 04:59:59 KSA the next day
    const startDate = new Date(`${saudiDateStr}T00:00:00.000+03:00`);
    const endDate = new Date(
      new Date(`${saudiDateStr}T23:59:59.999+03:00`).getTime() +
        5 * 60 * 60 * 1000,
    );

    const filters = { ...query.filters };
    if (query.filters?.fromDate) delete filters.fromDate;
    if (query.filters?.toDate) delete filters.toDate;
    if (query.filters?.date) delete filters.date;

    return this.saleService.findSalesByUserOptimized(
      id,
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      filters,
      startDate,
      endDate,
    );
  }

  @Get("invoice-summary")
  getInvoiceSummary(@Req() req: any, @Query() query: any) {
    const { startDate, endDate } = this.parseSalesDates(query);

    const filters = { ...query.filters };
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    const groupBy =
      query.groupBy === "product" || query.groupBy === "category"
        ? query.groupBy
        : "category";

    return this.saleService.getInvoiceSummaryByUser(
      req.user.id,
      query.search,
      { ...filters },
      startDate,
      endDate,
      query.brand_id,
      query.category_id,
    );
  }

  @Get("my-sales")
  @Permissions(EPermission.SALE_READ)
  async getMySales(@Req() req: any, @Query() query: any) {
    const filters = { ...query.filters };
    let startDate: Date | undefined;
    let endDate: Date | undefined;

    if (query.startDate) startDate = new Date(query.startDate);
    if (query.endDate) endDate = new Date(query.endDate);

    // Also support filters.fromDate / toDate standard we use elsewhere
    if (query.filters?.fromDate) {
      startDate = new Date(query.filters.fromDate);
      delete filters.fromDate;
    }
    if (query.filters?.toDate) {
      endDate = new Date(query.filters.toDate);
      delete filters.toDate;
    }

    return this.saleService.findSalesByUserOptimized(
      req.user.id,
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      filters,
      startDate,
      endDate,
    );
  }

  @Put(":id")
  @Permissions(EPermission.SALE_UPDATE)
  update(@Param("id") id: string, @Body() dto: UpdateSaleDto) {
    return this.saleService.update(id, dto);
  }
  @Patch("reassign-project")
  @Permissions(EPermission.SALE_UPDATE)
  reassignProject(@Body() dto: ReassignSalesDto) {
    return this.saleService.reassignProject(dto.saleIds, dto.projectId);
  }

  // 🔹 Get sale by ID
  @Get(":id")
  @Permissions(EPermission.SALE_READ)
  findOne(@Param("id") id: string) {
    return CRUD.findOne(this.saleService.saleRepo, "sale", id, [
      "product",
      "user",
      "branch",
    ]);
  }

  // 🔹 Delete sale
  @Delete(":id")
  @Permissions(EPermission.SALE_DELETE)
  remove(@Param("id") id: string) {
    return this.saleService.delete(id);
  }

  @Patch(":id/restore")
  @Permissions(EPermission.SALE_DELETE)
  restore(@Param("id") id: string) {
    return this.saleService.restore(id);
  }

  @Post(":id/cancel")
  @Permissions(EPermission.SALE_RETURN)
  cancelSale(@Param("id") id: string) {
    return this.saleService.cancelSale(id);
  }

  @Post(":id/return")
  @Permissions(EPermission.SALE_RETURN)
  cancelOrReturn(@Param("id") id: string) {
    return this.saleService.cancelOrReturn(id);
  }

  @Get("by-branch/:branchId")
  @Permissions(EPermission.SALE_READ)
  findByBranch(@Param("branchId") branchId: string, @Query() query: any) {
    const filters = { ...query.filters };
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    this.applyShorthandFilters(filters);

    return this.saleService.findSalesWithBrand(
      "sale",
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ["user", "product", "branch", "branch.salesTargets"],
      ["user.name", "user.username", "product.name"],
      { branch: { id: branchId }, ...filters },
    );
  }

  @Get("by-product/:productId")
  @Permissions(EPermission.SALE_READ)
  findByProduct(@Param("productId") productId: string, @Query() query: any) {
    const filters = { ...query.filters };
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    this.applyShorthandFilters(filters);

    return this.saleService.findSalesWithBrand(
      "sale",
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      ["user", "product", "branch"],
      ["user.name", "user.username", "product.name"],
      { product: { id: productId }, ...filters },
    );
  }

  @Get("by-user/:userId")
  @Permissions(EPermission.SALE_READ)
  findByUser(@Param("userId") userId: string, @Query() query: any) {
    const { startDate, endDate } = this.parseSalesDates(query);

    const filters = { ...query.filters };
    delete filters.fromDate;
    delete filters.toDate;
    delete filters.date;

    this.applyShorthandFilters(filters);

    return this.saleService.findSalesByUserOptimized(
      userId,
      query.search,
      query.page,
      query.limit,
      query.sortBy,
      query.sortOrder,
      { ...filters },
      startDate,
      endDate,
      query.brand_id,
      query.category_id,
    );
  }

  @Get("branch/:branchId/progress")
  @Permissions(EPermission.SALE_READ)
  getSalesWithTargetProgress(
    @Param("branchId") branchId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.saleService.getSalesWithTargetProgress(branchId, start, end);
  }

  @Get("branch/:branchId/performance")
  @Permissions(EPermission.SALE_READ)
  getSalesPerformance(
    @Param("branchId") branchId: string,
    @Query("period") period: "day" | "week" | "month" | "quarter" = "month",
  ) {
    return this.saleService.getSalesPerformanceByBranch(branchId, period);
  }

  @Get("branch/:branchId/product-summary")
  @Permissions(EPermission.SALE_READ)
  getProductSummary(
    @Param("branchId") branchId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.saleService.getSalesSummaryByProduct(branchId, start, end);
  }

  // @Post('bulk')
  // @Permissions(EPermission.SALE_CREATE)
  // bulkCreate(@Body() body: { sales: CreateSaleDto[] }) {
  //   return this.saleService.bulkCreateSales(body.sales);
  // }
}
