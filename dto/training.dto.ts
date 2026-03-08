import { IsString, IsNotEmpty, IsOptional, IsUUID, IsUrl } from 'class-validator';

export class CreateTrainingDto {


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
