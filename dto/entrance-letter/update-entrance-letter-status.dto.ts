import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { EEntranceLetterStatus } from '../../entities/entrance-letter.entity';

export class UpdateEntranceLetterStatusDto {
  @IsNotEmpty()
  @IsEnum(EEntranceLetterStatus)
  status: EEntranceLetterStatus;

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
