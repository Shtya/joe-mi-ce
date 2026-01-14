import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audit } from 'entities/audit.entity';
import { Branch } from 'entities/branch.entity';
import { User } from 'entities/user.entity';
import { AuditsController } from './audit.controller';
import { AuditsService } from './audit.service';
import { Product } from 'entities/products/product.entity';
import { AuditExportService } from './audit-export.service';
import { Brand } from 'entities/products/brand.entity';
import { Competitor } from 'entities/competitor.entity';
import { AuditCompetitor } from 'entities/audit-competitor.entity';
import { UsersService } from 'src/users/users.service';
import { Project } from 'entities/project.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Audit, Branch, User , Product,Brand,Competitor,AuditCompetitor,User,Project])],
  controllers: [AuditsController],
  providers: [AuditsService,AuditExportService,UsersService],
  exports: [AuditsService],
})
export class AuditsModule {}
