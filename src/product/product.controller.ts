import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query, ParseUUIDPipe, Res, HttpStatus, UseInterceptors, BadRequestException, UploadedFile, Req } from '@nestjs/common';
import { Response } from 'express';
import * as fs from 'fs';
import { CreateProductDto, GetProductsByBranchDto, ImportProductsDto, UpdateProductDto } from 'dto/product.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { CRUD } from 'common/crud.service';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { ProductService } from 'src/product/product.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { ProductFilterQueryDto } from 'dto/product-filters.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerOptions } from 'common/multer.config';
import { parse } from 'papaparse';
import * as ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';

@UseGuards(AuthGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Permissions(EPermission.PRODUCT_CREATE)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }
  @Get('import/template')
  @Permissions(EPermission.PRODUCT_CREATE)
  async downloadTemplate(
    @Req() req: any,
    @Res() res: Response
  ) {
    try {
      const user = await this.productService.userRepository.findOne({where:{id:req.user.id}, relations:['project']});
      const projectId = user.project?.id || user.project_id
      const buffer = await this.productService.generateImportTemplate(projectId);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=product-import-template-${projectId}.csv`);
      res.send(buffer);
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({
        message: error.message
      });
    }
  }

  /**
   * Import products from file
   */
  @Post('import')
  @Permissions(EPermission.PRODUCT_CREATE)
 @UseInterceptors(FileInterceptor('file', multerOptions))
  async importProducts(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,

  ) {
    const user = await this.productService.userRepository.findOne({where:{id:req.user.id}, relations:['project']});

    if (!file) {
      throw new BadRequestException('File is required');
    }

    const filePath = file.path;
    let products: any[] = [];

    try {
      // Parse file based on type
      if (file.mimetype.includes('csv')) {
        // Parse CSV
        const csvContent = fs.readFileSync(filePath, 'utf-8');
        const result = parse<any>(csvContent, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header) => header.trim().toLowerCase().replace(/\s+/g, '_'),
          transform: (value) => value?.toString().trim() || ''
        });

        products = result.data.filter((row: any) => row.name); // Filter out empty rows
      } else {
        // Parse Excel
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(filePath);
        const worksheet = workbook.getWorksheet(1);

        if (!worksheet) {
          throw new BadRequestException('Excel file has no data');
        }

        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber - 1] = cell.value?.toString().trim().toLowerCase().replace(/\s+/g, '_') || '';
        });

        for (let i = 2; i <= worksheet.rowCount; i++) {
          const row = worksheet.getRow(i);
          const product: any = {};
          let hasData = false;

          headers.forEach((header, index) => {
            const cellValue = row.getCell(index + 1).value;
            if (cellValue !== null && cellValue !== undefined) {
              product[header] = cellValue.toString().trim();
              hasData = true;
            }
          });

          if (hasData && product.name) {
            products.push(product);
          }
        }
      }

      // Clean up temp file
      fs.unlinkSync(filePath);

      // Prepare import data
      const importDto: ImportProductsDto = {
        project_id: user.project?.id || user.project_id,
        products: products.map(row => {
          // Map column names (flexible mapping)
          const mapColumn = (possibleNames: string[], defaultValue: any = undefined) => {
            for (const name of possibleNames) {
              if (row[name] !== undefined) return row[name];
            }
            return defaultValue;
          };

          return {
            name: mapColumn(['name', 'product_name', 'product']),
            description: mapColumn(['description', 'desc']),
            price: parseFloat(mapColumn(['price', 'price_amount']) || '0'),
            discount: parseFloat(mapColumn(['discount', 'discount_percent', 'discount_%']) || '0'),
            model: mapColumn(['model', 'model_number']),
            sku: mapColumn(['sku', 'product_code']),
            image_url: mapColumn(['image_url', 'image', 'image_link']),
            is_high_priority: ['true', '1', 'yes'].includes((mapColumn(['is_high_priority', 'high_priority', 'priority']) || '').toLowerCase()),
            category_name: mapColumn(['category_name', 'category', 'product_category']),
            brand_name: mapColumn(['brand_name', 'brand', 'manufacturer']),
            origin_country: mapColumn(['origin_country', 'country', 'made_in']),
            quantity: parseInt(mapColumn(['quantity', 'stock', 'stock_quantity']) || '0'),
            all_branches: ['true', '1', 'yes'].includes((mapColumn(['all_branches', 'all_branch', 'allbranches']) || '').toLowerCase()),
            branches: mapColumn(['branches', 'branch_names', 'branch'])
          };
        }).filter(product => product.name && product.category_name) // Must have name and category
      };

      // Import products
      return await this.productService.importProducts(importDto,req.user);
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      throw error;
    }
  }

@Get()
@Permissions(EPermission.PRODUCT_READ)
async findAll(@Query() q: any, @Req() req: any) {
  const user = req.user;

  // 🔐 Always resolve project from user (never from query)
  const projectId = await this.productService.userService
    .resolveProjectIdFromUser(user.id);

  const filters: any = {
    project: { id: projectId },
  };

  // ✅ Support filters[brand][id]
  if (q?.filters?.brand?.id) {
    filters.brand = { id: q.filters.brand.id };
  }

  // ✅ Support filters[category][id]
  if (q?.filters?.category?.id) {
    filters.category = { id: q.filters.category.id };
  }

  const relations = ['brand', 'category', 'project', 'stock', 'stock.branch'];
  const searchFields = ['name', 'model', 'sku'];

  return CRUD.findAll2(
    this.productService.productRepository,
    'product',
    q.search,
    q.page,
    q.limit,
    q.sortBy,
    (q.sortOrder as 'ASC' | 'DESC') ?? 'DESC',
    relations,
    searchFields,
    filters
  );
}

  @Get("mobile/list/:categoryId/:brandId")
  @Permissions(EPermission.BRAND_READ)
  findAllForMobile(
 @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
 @Param('brandId', new ParseUUIDPipe()) brandId: string,

  @Query() query: PaginationQueryDto,
  @Req() user:any
  ) {
    return this.productService.findAllForMobile(query, categoryId ,brandId,user);
  }

  @Get(':id')
  @Permissions(EPermission.PRODUCT_READ)
  findOne(@Param('id') id: string,
  @Req() user:any
) {
    return this.productService.findOne(id,user);
  }

  @Put(':id')
  @Permissions(EPermission.PRODUCT_UPDATE)
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto,
  @Req() user:any

) {
    return this.productService.update(id, updateProductDto,user);
  }

  @Delete(':id')
  @Permissions(EPermission.PRODUCT_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.softDelete(this.productService.productRepository, 'product', id);
  }
@Post('import/update')
@Permissions(EPermission.PRODUCT_UPDATE)
@UseInterceptors(FileInterceptor('file', multerOptions))
async importAndUpdateProducts(
  @UploadedFile() file: Express.Multer.File,
  @Req() req: any,
) {
  const user = await this.productService.userRepository.findOne({
    where: { id: req.user.id },
    relations: ['project'],
  });

  if (!file) {
    throw new BadRequestException('File is required');
  }

  const filePath = file.path;
  let rows: any[] = [];

  try {
    if (file.mimetype === 'text/csv') {
      // ✅ CSV
      const csvContent = fs.readFileSync(filePath, 'utf8');
      const result = parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim(),
      });

      // Filter out empty rows
      rows = result.data.filter((row: any) => {
        // Check if row has any meaningful data
        return Object.values(row).some(value =>
          value !== undefined &&
          value !== null &&
          value.toString().trim() !== ''
        );
      });

    } else if (file.mimetype === 'application/vnd.ms-excel') {
      // ✅ REAL .xls
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const data = XLSX.utils.sheet_to_json(
        workbook.Sheets[sheetName],
        { defval: '' },
      );

      // Filter out empty rows
      rows = data.filter((row: any) => {
        return Object.values(row).some(value =>
          value !== undefined &&
          value !== null &&
          value.toString().trim() !== ''
        );
      });

    } else {
      // ✅ .xlsx
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(filePath);
      const sheet = workbook.getWorksheet(1);

      const headers: string[] = [];
      sheet.getRow(1).eachCell((cell, i) => {
        headers[i - 1] = cell.value?.toString().trim() || '';
      });

      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const obj: any = {};
        let hasData = false;

        headers.forEach((h, idx) => {
          const v = row.getCell(idx + 1).value;
          if (v !== null && v !== undefined && v.toString().trim() !== '') {
            obj[h] = v.toString().trim();
            hasData = true;
          }
        });

        if (hasData) {
          rows.push(obj);
        }
      }
    }

    console.log(`Processing ${rows.length} rows from file`);

    fs.unlinkSync(filePath);

    /** 2️⃣ Call service */
    return await this.productService.importAndUpdateProducts(
      rows,
      user.project?.id || user.project_id
    );
  } catch (err) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    console.error('Import error:', err);
    throw err;
  }
}

}
