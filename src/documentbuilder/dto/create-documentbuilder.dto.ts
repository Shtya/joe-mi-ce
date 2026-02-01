import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class PaperSizeDto {
    @IsNumber()
    width: number;

    @IsNumber()
    height: number;
}

export class FieldStyleDto {
    @IsString()
    @IsOptional()
    color?: string;

    @IsNumber()
    @IsOptional()
    fontSize?: number;

    @IsString()
    @IsOptional()
    fontWeight?: string;
}

export class TableDataDto {
    @IsNumber()
    @IsOptional()
    cols?: number;

    @IsNumber()
    @IsOptional()
    rows?: number;

    @IsArray()
    @IsOptional()
    cells?: any[][];

    @IsNumber()
    @IsOptional()
    fontSize?: number;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    columnFields?: string[];

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    columnLabels?: string[];

    @IsString()
    @IsOptional()
    cellTextColor?: string;

    @IsString()
    @IsOptional()
    headerTextColor?: string;

    @IsString()
    @IsOptional()
    cellBackgroundColor?: string;

    @IsString()
    @IsOptional()
    headerBackgroundColor?: string;
}

export class DocumentElementDto {
    @IsString()
    @IsOptional()
    id?: string;

    @IsString()
    @IsOptional()
    created_at?: string;

    @IsString()
    @IsOptional()
    updated_at?: string;

    @IsString()
    @IsOptional()
    deleted_at?: string | null;

    @IsString()
    type: string;

    @IsNumber()
    x: number;

    @IsNumber()
    y: number;

    @IsNumber()
    width: number;

    @IsNumber()
    height: number;

    @IsNumber()
    rotation: number;

    @IsString()
    @IsOptional()
    content?: string;

    @IsString()
    @IsOptional()
    fieldKey?: string;

    @IsString()
    @IsOptional()
    fieldDisplayType?: string;

    @ValidateNested()
    @Type(() => FieldStyleDto)
    @IsOptional()
    fieldLabelStyle?: FieldStyleDto;

    @ValidateNested()
    @Type(() => FieldStyleDto)
    @IsOptional()
    fieldValueStyle?: FieldStyleDto;

    @IsString()
    @IsOptional()
    imageUrl?: string;

    @ValidateNested()
    @Type(() => TableDataDto)
    @IsOptional()
    tableData?: TableDataDto;

    @IsString()
    @IsOptional()
    lineStyle?: string;

    @IsString()
    @IsOptional()
    lineOrientation?: string;

    @IsNumber()
    @IsOptional()
    lineWidth?: number;
}

export class CreateDocumentbuilderDto {
  



    @ValidateNested()
    @Type(() => PaperSizeDto)
    paperSize: PaperSizeDto;

    @IsString()
    timestamp: string;

    @IsOptional()
    taskData?: any;

    @IsBoolean()
    @IsOptional()
    isMain?: boolean;

    @ValidateNested({ each: true })
    @Type(() => DocumentElementDto)
    @IsArray()
    elements: DocumentElementDto[];
}
