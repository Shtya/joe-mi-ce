import { IsBoolean, IsNotEmpty, IsObject, IsString, IsOptional } from 'class-validator';

export class CreateAppVersionDto {
  @IsString()
  @IsNotEmpty()
  latestVersion: string;

  @IsString()
  @IsNotEmpty()
  latestBuildNumber: string;

  @IsBoolean()
  @IsOptional()
  isForcedUpdate?: boolean;

  @IsString()
  @IsOptional()
  updateMessage?: string;

  @IsObject()
  @IsNotEmpty()
  downloadUrl: { android: string; ios: string };
}
