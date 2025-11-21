import {
  IsOptional,
  IsUUID,
  IsBooleanString,
  IsNumberString,
  IsIn,
  IsString,
} from 'class-validator';

export class ProductFilterQueryDto {
  @IsOptional() @IsUUID()
  projectId?: string;

  @IsOptional() @IsUUID()
  brandId?: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsOptional() @IsUUID()
  branchId?: string; // products which have stock rows in this branch

  @IsOptional() @IsBooleanString()
  inStock?: string; // 'true' | 'false' → EXISTS stock.quantity > 0

  @IsOptional() @IsBooleanString()
  isActive?: string; // 'true' | 'false'

  @IsOptional() @IsNumberString()
  minPrice?: string;

  @IsOptional() @IsNumberString()
  maxPrice?: string;

  @IsOptional() @IsString()
  search?: string; // name/model/sku ILIKE

  @IsOptional() @IsIn(['name', 'price', 'created_at', 'updated_at'])
  sortBy?: 'name' | 'price' | 'created_at' | 'updated_at';

  @IsOptional() @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional() @IsNumberString()
  page?: string; // default 1

  @IsOptional() @IsNumberString()
  limit?: string; // default 10 (capped 100)
}
