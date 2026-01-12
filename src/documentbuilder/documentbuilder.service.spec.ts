import { Test, TestingModule } from '@nestjs/testing';
import { DocumentbuilderService } from './documentbuilder.service';

describe('DocumentbuilderService', () => {
  let service: DocumentbuilderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentbuilderService],
    }).compile();

    service = module.get<DocumentbuilderService>(DocumentbuilderService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
