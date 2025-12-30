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

  const projectId = user.project?.id || user.project_id;
  const filePath = file.path;
  const BATCH_SIZE = 50; // Reduced from 100 to be more memory efficient

  try {
    const result = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [] as string[],
      processed: 0,
      totalRows: 0
    };

    // Determine file type and process accordingly
    if (file.mimetype === 'text/csv') {
      await this.processCSVInBatches(filePath, projectId, BATCH_SIZE, result);
    } else if (file.mimetype.includes('excel') || file.mimetype.includes('spreadsheet')) {
      await this.processExcelInBatches(filePath, projectId, BATCH_SIZE, result);
    } else {
      throw new BadRequestException('Unsupported file format. Please use CSV or Excel files.');
    }

    // Clean up temp file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log(`Import completed: Created: ${result.created}, Updated: ${result.updated}, Failed: ${result.failed}`);
    return result;
  } catch (err) {
    // Clean up on error
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    console.error('Import error:', err);
    throw new BadRequestException(`Import failed: ${err.message}`);
  }
}


private async processCSVInBatches(
  filePath: string,
  projectId: string,
  batchSize: number,
  result: any
): Promise<void> {
  try {
    console.log(`Starting CSV processing for file: ${filePath}`);

    // Read file content
    const csvContent = fs.readFileSync(filePath, 'utf8');

    // Parse CSV with papaparse
    const parseResult = parse(csvContent, {
      delimiter: ',',
      skipEmptyLines: true,
      quoteChar: '"',
      header: false, // We'll handle headers manually
    });

    const records = parseResult.data as string[][];
    let headers: string[] = [];
    let batch: any[] = [];
    let processedRows = 0;

    console.log(`Total CSV rows: ${records.length}`);

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      const rowNumber = i + 1;

      // First row is headers
      if (rowNumber === 1) {
        headers = record.map((h: string) =>
          (h || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '')
        );
        console.log(`CSV Headers found: ${headers.join(', ')}`);
        continue;
      }

      // Convert array to object
      const row: any = {};
      headers.forEach((header, colIndex) => {
        if (record[colIndex] !== undefined && record[colIndex] !== null) {
          row[header] = record[colIndex].toString().trim();
        }
      });

      // Skip empty rows
      const hasData = Object.values(row).some(v =>
        v && v.toString().trim() !== '' && v.toString().trim().toLowerCase() !== 'null'
      );

      if (!hasData) {
        continue;
      }

      // Map all possible field names to standard format
      const mappedRow = this.mapRowFields(row);
      processedRows++;

      batch.push({ data: mappedRow, index: rowNumber - 1 });

      // Process batch when size is reached
      if (batch.length >= batchSize) {
        await this.processBatch(batch, projectId, result);
        batch = [];
      }
    }

    // Process remaining rows
    if (batch.length > 0) {
      await this.processBatch(batch, projectId, result);
    }

    result.totalRows = processedRows;
    console.log(`CSV processing complete. Processed rows: ${processedRows}`);

  } catch (error) {
    console.error('CSV processing error:', error);
    throw error;
  }
}
/**
 * Process Excel file in batches
 */
private async processExcelInBatches(
  filePath: string,
  projectId: string,
  batchSize: number,
  result: any
): Promise<void> {
  let batch: any[] = [];

  console.log(`Processing Excel file: ${filePath}`);

  try {
    if (filePath.endsWith('.xls')) {
      // For .xls files
      const workbook = XLSX.readFile(filePath, {
        cellDates: true,
        cellStyles: false,
        sheetStubs: false,
      });
      const sheetName = workbook.SheetNames[0];
      const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
        defval: '',
        raw: false,
        dateNF: 'yyyy-mm-dd'
      });

      console.log(`XLS file loaded. Total rows: ${rows.length}`);

      if (rows.length === 0) {
        throw new BadRequestException('Excel file contains no data');
      }

      // Get headers from first row
      const headers = Object.keys(rows[0]).map(key =>
        key.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/g, '')
      );
      console.log(`Excel Headers found: ${headers.join(', ')}`);

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const mappedRow = this.mapRowFields(row);

        batch.push({ data: mappedRow, index: i + 1 });

        if (batch.length >= batchSize) {
          const currentBatch = [...batch];
          batch = [];
          await this.processBatch(currentBatch, projectId, result);
        }
      }

      result.totalRows = rows.length;
    } else {
      // For .xlsx files using ExcelJS with streaming
      const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
        sharedStrings: 'cache',
        hyperlinks: 'ignore',
        worksheets: 'emit',
        entries: 'emit',
        // parserOptions: {
        //   ignoreNodes: ['dataValidations', 'sheetProtection', 'autoFilter']
        // }
      });

      let worksheetProcessed = false;
      let totalRows = 0;

      for await (const worksheetReader of workbook) {
        if (worksheetProcessed) {
          console.warn('Multiple worksheets found, only processing first worksheet');
          break;
        }

        worksheetProcessed = true;
        let rowIndex = 0;
        let headers: string[] = [];

        for await (const row of worksheetReader) {
          rowIndex++;

          if (rowIndex === 1) {
            // Extract headers from first row
            headers = [];
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
              const header = cell.value?.toString().trim() || `column_${colNumber}`;
              headers[colNumber - 1] = header
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^\w_]/g, '');
            });
            console.log(`Excel Headers found: ${headers.join(', ')}`);
            continue;
          }

          const rowData: any = {};
          let hasData = false;

          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const header = headers[colNumber - 1];
            if (header) {
              let value = cell.value;

              // Convert dates to string
              if (value instanceof Date) {
                value = value.toISOString().split('T')[0];
              } else if (value && typeof value === 'object') {
                // Handle ExcelJS rich text or formula result
                value = value.toString();
              }

              if (value !== null && value !== undefined) {
                rowData[header] = value.toString().trim();
                hasData = true;
              }
            }
          });

          if (!hasData) {
            continue;
          }

          const mappedRow = this.mapRowFields(rowData);
          totalRows++;

          batch.push({ data: mappedRow, index: rowIndex - 1 });

          if (batch.length >= batchSize) {
            const currentBatch = [...batch];
            batch = [];
            await this.processBatch(currentBatch, projectId, result);
          }
        }

        result.totalRows = totalRows;
        console.log(`Excel rows processed: ${totalRows}`);
      }
    }

    // Process remaining rows
    if (batch.length > 0) {
      await this.processBatch(batch, projectId, result);
    }

  } catch (error) {
    console.error('Excel processing error:', error);
    throw error;
  }
}

/**
 * Map all possible field names from various formats to standard format
 */
private mapRowFields(row: any): any {
  const mappedRow: any = {};

  // Comprehensive field mapping
  const fieldMappings = {
    // Product name mappings
    name: ['name', 'product_name', 'product', 'device', 'product_name2', 'nom' ,'Product Name2','Product Name',"product_name_2","Product Name 2"],

    // SKU mappings
    sku: ['sku', 'product_code', 'reference', 'product_reference', 'item_code', 'extra_sku'],

    // Model mappings
    model: ['model', 'device_model', 'device_name', 'model_number', 'modele'],

    // Description mappings
    description: ['description', 'desc', 'device_description', 'product_description', 'details'],

    // Price mappings
    price: ['price', 'device_price', 'cost', 'unit_price', 'prix'],

    // Category mappings
    category_name: ['category_name', 'category', 'product_category', 'categorie', 'type'],

    // Brand mappings
    brand_name: ['brand_name', 'brand', 'manufacturer', 'fabricant', 'marque'],

    // Quantity mappings
    quantity: ['quantity', 'stock', 'stock_quantity', 'qty', 'inventory', 'quantite'],

    // Image URL mappings
    image_url: ['image_url', 'image', 'image_link', 'picture', 'device_image_url', 'photo_url'],

    // Priority mappings
    product_priority: ['product_priority', 'priority', 'is_high_priority', 'high_priority', 'priorite'],

    // Branches mappings
    branches: ['branches', 'branch_names', 'branch', 'locations', 'branches_list'],

    // All branches flag mappings
    all_branches: ['all_branches', 'all_branch', 'allbranches', 'apply_to_all'],

    // Origin country mappings
    origin_country: ['origin_country', 'country', 'made_in', 'country_of_origin'],

    // Discount mappings
    discount: ['discount', 'discount_percent', 'discount_%', 'reduction', 'rabais'],

    // Extra SKU mappings
    extra_sku: ['extra_sku', 'additional_sku', 'sku2', 'secondary_sku','sku'],

    // Saco SKU mappings
    saco_sku: ['saco_sku', 'saco_sku_code', 'supplier_sku'],


  };

  // Apply mappings
  Object.entries(fieldMappings).forEach(([standardField, possibleFields]) => {
    for (const field of possibleFields) {
      if (row[field] !== undefined && row[field] !== null && row[field] !== '') {
        mappedRow[standardField] = row[field];
        break;
      }
    }
  });

  // Copy any unmapped fields
  Object.keys(row).forEach(key => {
    if (!mappedRow[key] && row[key] !== undefined && row[key] !== null && row[key] !== '') {
      mappedRow[key] = row[key];
    }
  });

  // Clean and standardize values
  this.cleanRowValues(mappedRow);

  return mappedRow;
}

/**
 * Clean and standardize row values
 */
private cleanRowValues(row: any): void {
  // Clean boolean values
  if (row.all_branches !== undefined) {
    const allBranchesStr = String(row.all_branches).toLowerCase().trim();
    row.all_branches = ['true', '1', 'yes', 'oui', 'vrai'].includes(allBranchesStr);
  }

  if (row.product_priority !== undefined) {
    const priorityStr = String(row.product_priority).toLowerCase().trim();
    row.product_priority = ['true', '1', 'yes', 'high', 'urgent', 'prioritaire'].includes(priorityStr);
  }

  // Clean numeric values
  if (row.price !== undefined) {
    row.price = this.parseNumericValue(row.price);
  }

  if (row.quantity !== undefined) {
    row.quantity = this.parseNumericValue(row.quantity);
  }

  if (row.discount !== undefined) {
    row.discount = this.parseNumericValue(row.discount);
  }

  // Clean image URL - remove port numbers if present
  if (row.image_url && typeof row.image_url === 'string') {
    row.image_url = row.image_url.replace(/:\d+/, '');
  }

  // Clean SKU values
  if (row.saco_sku) {
    const sacoSkuStr = String(row.saco_sku).toLowerCase().trim();
    row.saco_sku = ['not actv', 'not active', 'inactive', 'na'].includes(sacoSkuStr) ? null : row.saco_sku;
  }

  // Trim all string values
  Object.keys(row).forEach(key => {
    if (typeof row[key] === 'string') {
      row[key] = row[key].trim();
    }
  });
}

/**
 * Parse numeric value safely
 */
private parseNumericValue(value: any): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  // Remove any non-numeric characters except decimal point and minus sign
  const numericString = String(value)
    .replace(/[^\d.-]/g, '')
    .replace(/(\..*)\./g, '$1'); // Remove multiple decimal points

  const parsed = parseFloat(numericString);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Process a batch of rows
 */
private async processBatch(
  batch: Array<{ data: any; index: number }>,
  projectId: string,
  result: any
): Promise<void> {
  if (batch.length === 0) {
    return;
  }

  try {
    const batchResult = await this.productService.importAndUpdateProductsBatch(
      batch.map(b => b.data),
      projectId,
      batch.map(b => b.index)
    );

    // Aggregate results
    result.created += batchResult.created;
    result.updated += batchResult.updated;
    result.failed += batchResult.failed;
    result.processed += batchResult.created + batchResult.updated + batchResult.failed;
    result.errors.push(...batchResult.errors);

    // Log progress
    console.log(`Batch processed: ${batch.length} rows. Progress: ${result.processed}/${result.totalRows || '?'}`);

    // Force garbage collection if available
    if (global.gc) {
      try {
        global.gc();
      } catch (e) {
        // Ignore GC errors
      }
    }

    // Small delay to prevent overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (error) {
    console.error(`Batch processing failed:`, error);
    // Mark all rows in this batch as failed
    result.failed += batch.length;
    result.processed += batch.length;
    result.errors.push(`Batch failed at rows ${batch[0]?.index}-${batch[batch.length-1]?.index}: ${error.message}`);
  }
}
}