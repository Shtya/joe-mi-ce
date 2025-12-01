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
  @Get("mobile/list/:categoryId/:brandId")
  @Permissions(EPermission.BRAND_READ)
  findAllForMobile(
 @Param('categoryId', new ParseUUIDPipe()) categoryId: string,
 @Param('brandId', new ParseUUIDPipe()) brandId: string,

  @Query() query: PaginationQueryDto,
  ) {
    return this.productService.findAllForMobile(query, categoryId ,brandId);
  }
  @Get()
  @Permissions(EPermission.PRODUCT_READ)
  findAll(@Query() q: any) {

   const filters = { ...q.filters}
   const relations = ['brand', 'category', 'project', 'stock', 'stock.branch'];


   const searchFields = ['name', 'model', 'sku'];
       return CRUD.findAll2(
        this.productService.productRepository, 'product', q.search, q.page, q.limit, q.sortBy, (q.sortOrder as 'ASC' | 'DESC') ?? 'DESC', relations, searchFields, filters
      );
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
