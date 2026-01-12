import { PartialType } from '@nestjs/mapped-types';
import { CreateDocumentbuilderDto } from './create-documentbuilder.dto';

export class UpdateDocumentbuilderDto extends PartialType(CreateDocumentbuilderDto) {}
