import { IsString, IsOptional, IsUrl, IsUUID } from 'class-validator';

export class CreateCompetitorDto {
  @IsString()
  name: string;

  @IsOptional()
  logo_url: string;

  @IsUUID()
  projectId: string;
}

export class UpdateCompetitorDto {
  @IsString()
  @IsOptional()
  name: string;

  @IsOptional()
  logo_url: string;

  @IsUUID()
  projectId: string;
}
