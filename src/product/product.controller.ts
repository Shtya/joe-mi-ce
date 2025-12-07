import { Controller, Get, Post, Body, Param, Put, Delete, UseGuards, Query, ParseUUIDPipe } from '@nestjs/common';
import { CreateProductDto, GetProductsByBranchDto, UpdateProductDto } from 'dto/product.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { CRUD } from 'common/crud.service';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { ProductService } from 'src/product/product.service';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';
import { ProductFilterQueryDto } from 'dto/product-filters.dto';

@UseGuards(AuthGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Post()
  @Permissions(EPermission.PRODUCT_CREATE)
  create(@Body() createProductDto: CreateProductDto) {
    return this.productService.create(createProductDto);
  }
  @Get()
  @Permissions(EPermission.PRODUCT_READ)
  findAll(@Query() q: any) {
    // Parse filters manually
    const filters: any = {};
    
    // Check for nested filter syntax
    if (q['filters[project][id]']) {
      filters.project = { id: q['filters[project][id]'] };
    }
    
    // Or try dot notation
    if (!filters.project && q['filters.project.id']) {
      filters.project = { id: q['filters.project.id'] };
    }
    
    console.log('Manually parsed filters:', filters);
    
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
  ) {
    return this.productService.findAllForMobile(query, categoryId ,brandId);
  }

  @Get(':id')
  @Permissions(EPermission.PRODUCT_READ)
  findOne(@Param('id') id: string) {
    return this.productService.findOne(id);
  }

  @Put(':id')
  @Permissions(EPermission.PRODUCT_UPDATE)
  update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    return this.productService.update(id, updateProductDto);
  }

  @Delete(':id')
  @Permissions(EPermission.PRODUCT_DELETE)
  remove(@Param('id') id: string) {
    return CRUD.softDelete(this.productService.productRepository, 'product', id);
  }
}
// In findAll2, replace the flatten function with this debug version:
function flatten(obj: any, prefix = ''): Record<string, any> {
  console.log('Flattening:', obj, 'prefix:', prefix);
  const out: Record<string, any> = {};
  if (!obj || typeof obj !== 'object') {
    console.log('Not an object, returning empty');
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    console.log(`Processing key "${k}" with value:`, v);
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      console.log(`Recursing into "${k}"`);
      Object.assign(out, flatten(v, key));
    } else {
      console.log(`Setting ${key} = ${v}`);
      out[key] = v;
    }
  }
  console.log('Flatten result:', out);
  return out;
}