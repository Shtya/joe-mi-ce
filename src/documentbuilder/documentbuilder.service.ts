import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskField, DocumentBuilder, DocumentElement } from '../../entities/documentbuilder.entity';
import { User } from '../../entities/user.entity';

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

  async create(createDocumentbuilderDto: CreateDocumentbuilderDto, user: User) {
    const { paperSize, elements, taskData, timestamp, isMain } =
      createDocumentbuilderDto;

    const doc = this.documentBuilderRepository.create({
      paperSize,
      taskData,
      isMain: isMain || false,
      timestamp: new Date(timestamp),
      user,
    });

    const savedDoc = await this.documentBuilderRepository.save(doc);

    if (elements && elements.length > 0) {
      const elementEntities: DocumentElement[] = [];
      for (const el of elements) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...rest } = el;
        const entity = this.documentElementRepository.create({
          ...rest,
          documentBuilder: savedDoc,
        } as unknown as DocumentElement);
        elementEntities.push(entity);
      }
      await this.documentElementRepository.save(elementEntities);
    }

    return this.findOne(savedDoc.id, user);
  }

  findAll(user: User) {
    return this.documentBuilderRepository.find({
      where: [
        { user: { id: user.id } },
        { isMain: true }
      ],
      relations: ['elements'],
      order: {
        created_at: 'DESC',
      }
    });
  }

  async findMain() {
    return this.documentBuilderRepository.findOne({
      where: { isMain: true },
      relations: ['elements'],
    });
  }2501550079

  async findAllTaskFields() {
    return await this.taskFieldRepository.find();
  }

  async findOne(id: string, user: User) {
    const doc = await this.documentBuilderRepository.findOne({
      where: { id },
      relations: ['elements', 'user'],
    });

    if (!doc) return null;

    // Check visibility: Owner OR Main
    if (doc.isMain || (doc.user && doc.user.id === user.id)) {
        return doc;
    }

    return null; // Or throw forbidden
  }

  async update(id: string, updateDocumentbuilderDto: UpdateDocumentbuilderDto, user: User) {
    const doc = await this.findOne(id, user);
    if (!doc) {
      throw new Error('Document not found or access denied');
    }

    // Ownership check for update - only owner can update (unless admin, but simplifying for now)
    // Main docs might be editable by everyone if we don't strict check, but usually only admins edit main.
    // For now, allow if found (which means isMain or isOwner). 
    // If specific logic needed: "Users cannot edit Main docs", add:
    if (doc.isMain && (!doc.user || doc.user.id !== user.id)) {
        // Decide if users can edit main docs. Usually NO. 
        // Assuming users clone main docs to edit them.
        // But keeping it open if the user is the CREATOR of the main doc (e.g. admin).
        // If doc.isMain is true, usually it's a template.
        // Let's assume only owner can edit.
    }
    
    // Strict ownership check:
    if (doc.user && doc.user.id !== user.id) {
       throw new Error('You can only update your own documents.');
    }

    const { paperSize, elements, taskData, timestamp, isMain } =
      updateDocumentbuilderDto;

    // Update document properties
    if (paperSize) doc.paperSize = paperSize;
    if (taskData) doc.taskData = taskData;
    if (isMain !== undefined) doc.isMain = isMain;
    if (timestamp) doc.timestamp = new Date(timestamp);

    await this.documentBuilderRepository.save(doc);

    // Update elements if provided
    if (elements) {
      // Delete existing elements - simplified approach for "save" functionality
      await this.documentElementRepository.delete({ documentBuilder: { id } });

      // Create new elements
      const elementEntities: DocumentElement[] = [];
      for (const el of elements) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: elId, ...rest } = el; // Drop incoming ID
        const entity = this.documentElementRepository.create({
          ...rest,
          documentBuilder: doc,
        } as unknown as DocumentElement);
        elementEntities.push(entity);
      }
      await this.documentElementRepository.save(elementEntities);
    }

    return this.findOne(id, user);
  }

  async duplicate(id: string, user: User) {
    // We allow duplicating any visible doc (Own or Main)
    const original = await this.findOne(id, user);
    if (!original) {
      throw new Error('Document not found or access denied');
    }

    // Clone document
    const { id: _, created_at, updated_at, deleted_at, elements, user: __, ...docData } = original;
    const newDoc = this.documentBuilderRepository.create({
      ...docData,
      isMain: false, // Duplicates are private
      timestamp: new Date(),
      user: user, // Assign to current user
    });
    const savedDoc = await this.documentBuilderRepository.save(newDoc);

    // Clone elements
    if (elements && elements.length > 0) {
      const elementEntities: DocumentElement[] = [];
      for (const el of elements) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id: elId, created_at, updated_at, deleted_at, ...elData } = el;
        const entity = this.documentElementRepository.create({
          ...elData,
          documentBuilder: savedDoc,
        } as unknown as DocumentElement);
        elementEntities.push(entity);
      }
      await this.documentElementRepository.save(elementEntities);
    }

    return this.findOne(savedDoc.id, user);
  }

  async remove(id: string, user: User) {
     const doc = await this.findOne(id, user);
     if (!doc) {
       throw new Error('Document not found');
     }
     if (doc.user && doc.user.id !== user.id) {
         throw new Error('Cannot delete document you do not own');
     }
    return this.documentBuilderRepository.delete(id);
  }
}
