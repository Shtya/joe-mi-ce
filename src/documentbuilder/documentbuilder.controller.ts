import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { DocumentbuilderService } from './documentbuilder.service';
import { CreateDocumentbuilderDto } from './dto/create-documentbuilder.dto';
import { UpdateDocumentbuilderDto } from './dto/update-documentbuilder.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { User } from 'entities/user.entity';

@UseGuards(AuthGuard)
@Controller('documentbuilder')
export class DocumentbuilderController {
  constructor(private readonly documentbuilderService: DocumentbuilderService) {}

  @Post()
  create(@Body() createDocumentbuilderDto: CreateDocumentbuilderDto, @Req() req: any) {
    return this.documentbuilderService.create(createDocumentbuilderDto, req.user as User);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.documentbuilderService.findAll(req.user as User);
  }

  @Get('main')
  findMain() {
    return this.documentbuilderService.findMain();
  }

  @Get('task-fields')
  findAllTaskFields() {
    return this.documentbuilderService.findAllTaskFields();
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: any) {
    return this.documentbuilderService.findOne(id, req.user as User);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDocumentbuilderDto: UpdateDocumentbuilderDto, @Req() req: any) {
    return this.documentbuilderService.update(id, updateDocumentbuilderDto, req.user as User);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @Req() req: any) {
    return this.documentbuilderService.duplicate(id, req.user as User);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: any) {
    return this.documentbuilderService.remove(id, req.user as User);
  }
}
