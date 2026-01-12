import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { DocumentbuilderService } from './documentbuilder.service';
import { CreateDocumentbuilderDto } from './dto/create-documentbuilder.dto';
import { UpdateDocumentbuilderDto } from './dto/update-documentbuilder.dto';

@Controller('documentbuilder')
export class DocumentbuilderController {
  constructor(private readonly documentbuilderService: DocumentbuilderService) {}

  @Post()
  create(@Body() createDocumentbuilderDto: CreateDocumentbuilderDto) {
    return this.documentbuilderService.create(createDocumentbuilderDto);
  }

  @Get()
  findAll() {
    return this.documentbuilderService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.documentbuilderService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDocumentbuilderDto: UpdateDocumentbuilderDto) {
    return this.documentbuilderService.update(+id, updateDocumentbuilderDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.documentbuilderService.remove(+id);
  }
}
