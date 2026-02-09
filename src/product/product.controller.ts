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
            name: mapColumn(['name', 'product_name', 'product',"model"]),
            description: mapColumn(['description', 'desc']),
            price: parseFloat(mapColumn(['price', 'price_amount']) || '0'),
            discount: parseFloat(mapColumn(['discount', 'discount_percent', 'discount_%']) || '0'),
            model: mapColumn(['model', 'model_number']),
            sku: mapColumn(['sku', 'product_code','model']),
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
  /**
   * Helper to detect header row dynamically
   */
  private findHeaderRow(rows: any[][]): { headerRowIndex: number; headers: string[] } {
    const MAX_SCAN_ROWS = 20;
    const knownHeaders = [
      'name', 'product_name', 'product', 'device', 'nom', 'description', 'desc', 
      'price', 'cost', 'sku', 'stock', 'quantity', 'category', 'brand', 'model', 
      'barcode', 'image', 'url', 'الوصف', 'اسم_المنتج', 'سعر', 'كمية', 'مخزون', 'تصنيف', 'ماركة', 'موديل', 'باركود', 'صورة', 'رابط'
    ];
    
    // Helper to normalize a header string
    const normalize = (h: any) => (h?.toString() || '').trim().toLowerCase()
      .replace(/\s+/g, '_').replace(/[^\w\u0600-\u06FF_]/g, '');

    let bestScore = 0;
    let bestRowIndex = 0;
    let bestHeaders: string[] = [];

    // Scan the first few rows
    const limit = Math.min(rows.length, MAX_SCAN_ROWS);
    
    for (let i = 0; i < limit; i++) {
        const row = rows[i];
        if (!Array.isArray(row) || row.length === 0) continue;
        
        const normalizedHeaders = row.map(normalize);
        
        // Count matches
        let matchCount = 0;
        for (const header of normalizedHeaders) {
            if (knownHeaders.some(k => header.includes(k) || k.includes(header))) {
                matchCount++;
            }
        }
        
        // If we find 'name' or 'product_name' specifically, give it a huge boost
        if (normalizedHeaders.some(h => 
            ['name', 'product_name', 'model',"Model",'product', 'device', 'اسم_المنتج', 'اسم_الصنف'].includes(h)
        )) {
            matchCount += 5;
        }

        if (matchCount > bestScore) {
            bestScore = matchCount;
            bestRowIndex = i;
            bestHeaders = normalizedHeaders;
        }
    }
    
    // If no good match found, default to first row if it exists
    if (bestScore === 0 && rows.length > 0) {
        return { 
            headerRowIndex: 0, 
            headers: rows[0].map(normalize)
        };
    }

    return { headerRowIndex: bestRowIndex, headers: bestHeaders };
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
        if (records.length === 0) return;

        // Detect header row
        const { headerRowIndex, headers } = this.findHeaderRow(records);
        console.log(`CSV Headers detected at row ${headerRowIndex + 1}: ${headers.join(', ')}`);

        let batch: any[] = [];
        let processedRows = 0;
    
        console.log(`Total CSV rows: ${records.length}`);
    
        for (let i = headerRowIndex + 1; i < records.length; i++) {
          const record = records[i];
          const rowNumber = i + 1;
    
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
    
          batch.push({ data: mappedRow, index: rowNumber });
    
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
          // Use header: 1 to get raw array of arrays
          const rows: any[][] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
            header: 1,
            defval: '',
            raw: false,
            dateNF: 'yyyy-mm-dd'
          });
    
          console.log(`XLS file loaded. Total rows: ${rows.length}`);
    
          if (rows.length === 0) {
            throw new BadRequestException('Excel file contains no data');
          }
    
          // Detect header
          const { headerRowIndex, headers } = this.findHeaderRow(rows);
          console.log(`Excel Headers detected at row ${headerRowIndex + 1}: ${headers.join(', ')}`);
    
          for (let i = headerRowIndex + 1; i < rows.length; i++) {
            const rowArray = rows[i];
            
            // Convert array to object using detected headers
            const row: any = {};
            headers.forEach((header, index) => {
              if (rowArray[index] !== undefined && rowArray[index] !== null) {
                row[header] = rowArray[index].toString().trim();
              }
            });
            
            const mappedRow = this.mapRowFields(row);
    
            batch.push({ data: mappedRow, index: i + 1 });
    
            if (batch.length >= batchSize) {
              const currentBatch = [...batch];
              batch = [];
              await this.processBatch(currentBatch, projectId, result);
            }
          }
    
          result.totalRows = rows.length - (headerRowIndex + 1);
        } else {
          // For .xlsx files using ExcelJS with streaming
          const workbook = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
            sharedStrings: 'cache',
            hyperlinks: 'ignore',
            worksheets: 'emit',
            entries: 'emit',
          });
    
          let worksheetProcessed = false;
          let totalRows = 0;
    
          for await (const worksheetReader of workbook) {
            if (worksheetProcessed) {
              console.warn('Multiple worksheets found, only processing first worksheet');
              break;
            }
    
            worksheetProcessed = true;
            
            // Buffered reading to find header
            let isHeaderFound = false;
            let headers: string[] = [];
            let headerRowIndex = -1;
            let rowBuffer: { values: any[], index: number }[] = [];
            const MAX_BUFFER = 20;

            let rowCounter = 0;
    
            for await (const row of worksheetReader) {
              rowCounter++;
              
              // Extract values from row
              const values: any[] = [];
              row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                let value = cell.value;
                 // Convert dates to string
                 if (value instanceof Date) {
                    value = value.toISOString().split('T')[0];
                  } else if (value && typeof value === 'object') {
                    value = value.toString();
                  }
                values[colNumber - 1] = value;
              });

              if (!isHeaderFound) {
                rowBuffer.push({ values, index: rowCounter });
                
                // If buffer is full or we are at the beginning, try to find header
                if (rowBuffer.length >= MAX_BUFFER) {
                   const { headerRowIndex: foundIndex, headers: foundHeaders } = this.findHeaderRow(rowBuffer.map(r => r.values));
                   
                  //  The foundIndex is relative to the buffer (0 to 19)
                   headerRowIndex = foundIndex; 
                   headers = foundHeaders;
                   isHeaderFound = true;
                   console.log(`Excel Headers detected at row ${rowBuffer[headerRowIndex].index}: ${headers.join(', ')}`);

                   // Process rows in buffer that are AFTER the header
                   for (let i = headerRowIndex + 1; i < rowBuffer.length; i++) {
                      await this.processRowFromValues(rowBuffer[i].values, headers, rowBuffer[i].index, batch, batchSize, projectId, result);
                   }
                   // Clear buffer we don't need it anymore
                   rowBuffer = [];
                }
              } else {
                // Determine headers from cache, process row
                await this.processRowFromValues(values, headers, rowCounter, batch, batchSize, projectId, result);
              }
              
              totalRows++;
            }
            
            // If we finished loop but still haven't found header (file < 20 rows)
            if (!isHeaderFound && rowBuffer.length > 0) {
                 const { headerRowIndex: foundIndex, headers: foundHeaders } = this.findHeaderRow(rowBuffer.map(r => r.values));
                 headers = foundHeaders;
                 console.log(`Excel Headers detected at row ${rowBuffer[foundIndex].index}: ${headers.join(', ')}`);
                 
                 for (let i = foundIndex + 1; i < rowBuffer.length; i++) {
                    await this.processRowFromValues(rowBuffer[i].values, headers, rowBuffer[i].index, batch, batchSize, projectId, result);
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
     * Helper to process a row from array values
     */
    private async processRowFromValues(
      values: any[], 
      headers: string[], 
      rowIndex: number, 
      batch: any[], 
      batchSize: number, 
      projectId: string, 
      result: any
    ) {
        const rowData: any = {};
        let hasData = false;
        
        headers.forEach((header, index) => {
            if (values[index] !== undefined && values[index] !== null) {
                rowData[header] = values[index].toString().trim();
                hasData = true;
            }
        });
        
        if (!hasData) return;
        
        const mappedRow = this.mapRowFields(rowData);
        batch.push({ data: mappedRow, index: rowIndex });
        
        if (batch.length >= batchSize) {
           const currentBatch = [...batch];
           batch.length = 0; // Clear in-place
           await this.processBatch(currentBatch, projectId, result);
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
    name: ['name', 'product_name', 'product', 'device', 'product_name2', 'nom' ,'Product Name2','Product Name',"product_name_2","Product Name 2", "الوصف", "اسم_الصنف", "اسم_المنتج", "model", "Model"],

    // SKU mappings
    sku: ['sku', 'product_code', 'reference', 'product_reference', 'item_code', 'extra_sku', "الكود", "رمز_الصنف","model"],

    // Model mappings
    model: ['model', 'device_model', 'device_name', 'model_number', 'modele', "رقم_الصنف", "الموديل"],

    // Description mappings
    description: ['description', 'desc', 'device_description', 'product_description', 'details', "الوصف", "تفاصيل"],

    // Price mappings
    price: ['price', 'device_price', 'cost', 'unit_price', 'prix', "السعر", "الثمن"],

    // Category mappings
    category_name: ['category_name', 'category', 'product_category', 'categorie', 'type', "التصنيف", "النوع", "الفئة", "فئة_الصنف"],

    // Brand mappings
    brand_name: ['brand_name', 'brand', 'manufacturer', 'fabricant', 'marque', "الماركة", "العلامة_التجارية", "الشركة_المصنعة"],

    // Quantity mappings
    quantity: ['quantity', 'stock', 'stock_quantity', 'qty', 'inventory', 'quantite', "الكمية", "المخزون", "العدد"],

    // Image URL mappings
    image_url: ['image_url', 'image', 'image_link', 'picture', 'device_image_url', 'photo_url', "الصورة", "رابط_الصورة"],

    // Priority mappings
    product_priority: ['product_priority', 'priority', 'is_high_priority', 'high_priority', 'priorite', "الأولوية", "هام"],

    // Branches mappings
    branches: ['branches', 'branch_names', 'branch', 'locations', 'branches_list', "الفروع", "المواقع"],

    // All branches flag mappings
    all_branches: ['all_branches', 'all_branch', 'allbranches', 'apply_to_all', "كل_الفروع", "جميع_الفروع"],

    // Origin country mappings
    origin_country: ['origin_country', 'country', 'made_in', 'country_of_origin', "بلد_المنشأ", "الصنع"],

    // Discount mappings
    discount: ['discount', 'discount_percent', 'discount_%', 'reduction', 'rabais', "الخصم", "نسبة_الخصم"],

    // Extra SKU mappings
    extra_sku: ['extra_sku', 'additional_sku', 'sku2', 'secondary_sku','sku', "كود_إضافي"],

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