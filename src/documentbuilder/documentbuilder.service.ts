import { Injectable } from '@nestjs/common';
import { CreateDocumentbuilderDto } from './dto/create-documentbuilder.dto';
import { UpdateDocumentbuilderDto } from './dto/update-documentbuilder.dto';

@Injectable()
export class DocumentbuilderService {
  create(createDocumentbuilderDto: CreateDocumentbuilderDto) {
    return 'This action adds a new documentbuilder';
  }

  findAll() {
    return `This action returns all documentbuilder`;
  }

  findOne(id: number) {
    return `This action returns a #${id} documentbuilder`;
  }

  update(id: number, updateDocumentbuilderDto: UpdateDocumentbuilderDto) {
    return `This action updates a #${id} documentbuilder`;
  }

  remove(id: number) {
    return `This action removes a #${id} documentbuilder`;
  }
}
