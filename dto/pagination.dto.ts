// src/common/dto/pagination-query.dto.ts

import { IsOptional, IsEnum, IsNumberString, IsString } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: number;

  @IsOptional()
  @IsNumberString()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'], {
    message: 'sortOrder must be either ASC or DESC',
  })
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  filters?: Record<string, any>;

  @IsOptional()
  relations?: string[];
}
