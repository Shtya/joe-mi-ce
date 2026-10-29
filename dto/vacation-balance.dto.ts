import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class SetVacationJoiningDateDto {
  @IsDateString({ strict: true })
  joiningDate: string;
}

export class GrantCompensatoryDaysDto {
  @IsNumber({ maxDecimalPlaces: 4, allowNaN: false, allowInfinity: false })
  @Min(0.0001)
  @Max(365)
  days: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;
}
