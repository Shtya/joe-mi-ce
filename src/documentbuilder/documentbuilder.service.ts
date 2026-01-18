import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskField } from '../../entities/documentbuilder.entity';
import { CreateDocumentbuilderDto } from './dto/create-documentbuilder.dto';
import { UpdateDocumentbuilderDto } from './dto/update-documentbuilder.dto';

@Injectable()
export class DocumentbuilderService {
  constructor(
    @InjectRepository(TaskField)
    private readonly taskFieldRepository: Repository<TaskField>,
  ) {}

  create(createDocumentbuilderDto: CreateDocumentbuilderDto) {
    return 'This action adds a new documentbuilder';
  }

  findAll() {
    return `This action returns all documentbuilder`;
  }

  async findAllTaskFields() {
    return await this.taskFieldRepository.find();
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
