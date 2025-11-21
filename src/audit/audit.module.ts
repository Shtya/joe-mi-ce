import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Audit } from 'entities/audit.entity';
import { Branch } from 'entities/branch.entity';
import { User } from 'entities/user.entity';
import { AuditsController } from './audit.controller';
import { AuditsService } from './audit.service';
import { Product } from 'entities/products/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Audit, Branch, User , Product])],
  controllers: [AuditsController],
  providers: [AuditsService],
  exports: [AuditsService],
})
export class AuditsModule {}
