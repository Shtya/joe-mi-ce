import { IsString, IsNotEmpty, IsOptional, IsUUID, IsUrl } from 'class-validator';

export class CreateTrainingDto {
  @IsUUID()
  @IsNotEmpty()
  projectId: string;

  @IsUrl()
  @IsOptional()
  video_url?: string;

  @IsString()
  @IsNotEmpty()
  title_ar: string;

  @IsString()
  @IsNotEmpty()
  title_en: string;

  @IsString()
  @IsOptional()
  description_ar?: string;

  @IsString()
  @IsOptional()
  description_en?: string;
}

export class UpdateTrainingDto {
  @IsUrl()
  @IsOptional()
  video_url?: string;

  @IsString()
  @IsOptional()
  title_ar?: string;

  @IsString()
  @IsOptional()
  title_en?: string;

  @IsString()
  @IsOptional()
  description_ar?: string;

  @IsString()
  @IsOptional()
  description_en?: string;
}
