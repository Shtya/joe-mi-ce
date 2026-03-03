import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateEntranceLetterDto {
  @IsNotEmpty()
  @IsUUID()
  promoterId: string;

  @IsNotEmpty()
  @IsUUID()
  projectId: string;

  @IsNotEmpty()
  @IsUUID()
  branchId: string;
}
