import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskField, DocumentBuilder, DocumentElement } from '../../entities/documentbuilder.entity';
import { CreateDocumentbuilderDto } from './dto/create-documentbuilder.dto';
import { UpdateDocumentbuilderDto } from './dto/update-documentbuilder.dto';

@Injectable()
export class DocumentbuilderService {
  constructor(
    @InjectRepository(TaskField)
    private readonly taskFieldRepository: Repository<TaskField>,
    @InjectRepository(DocumentBuilder)
    private readonly documentBuilderRepository: Repository<DocumentBuilder>,
    @InjectRepository(DocumentElement)
    private readonly documentElementRepository: Repository<DocumentElement>,
  ) {}

  async create(createDocumentbuilderDto: CreateDocumentbuilderDto) {
    const { paperSize, elements, taskData, timestamp } = createDocumentbuilderDto;

    const doc = this.documentBuilderRepository.create({
      paperSize,
      taskData,
      timestamp: new Date(timestamp),
    });

    const savedDoc = await this.documentBuilderRepository.save(doc);

    if (elements && elements.length > 0) {
      // Create instances one by one to ensure we get a flat array of entities
      const elementEntities: DocumentElement[] = [];
      for (const el of elements) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...rest } = el;
        const entity = this.documentElementRepository.create({
          ...rest,
          documentBuilder: savedDoc,
        } as unknown as DocumentElement); // Assert type to avoid ambiguity
        elementEntities.push(entity);
      }
      await this.documentElementRepository.save(elementEntities);
    }

    return this.findOne(savedDoc.id);
  }

  findAll() {
    return this.documentBuilderRepository.find({
      relations: ['elements'],
    });
  }

  async findMain() {
    return this.documentBuilderRepository.findOne({
      where: { isMain: true },
      relations: ['elements'],
    });
  }

  async findAllTaskFields() {
    return await this.taskFieldRepository.find();
  }

  findOne(id: string) {
    return this.documentBuilderRepository.findOne({
      where: { id },
      relations: ['elements'],
    });
  }

  update(id: string, updateDocumentbuilderDto: UpdateDocumentbuilderDto) {
    return `This action updates a #${id} documentbuilder`;
  }

  remove(id: string) {
    return `This action removes a #${id} documentbuilder`;
  }
}
