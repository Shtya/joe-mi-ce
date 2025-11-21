// --- File: dto/feedback.dto.ts ---
import { IsUUID, IsOptional, IsString, IsEnum, IsArray, IsBoolean } from 'class-validator';

export class CreateFeedbackDto {
  // if omitted, we’ll use req.user.id in the controller/service
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsString()
  type: string;

  @IsString()
  message: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachment_urls?: string[];
}

export class UpdateFeedbackStatusDto {
  @IsBoolean()
  is_resolved: boolean;

  @IsOptional()
  @IsUUID()
  resolvedById?: string;
}
