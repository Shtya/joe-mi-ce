// src/permissions/permissions.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';
import { Permission } from 'entities/permissions.entity';
import { AuthModule } from 'src/auth/auth.module';
 
@Module({
  imports: [TypeOrmModule.forFeature([Permission]) , AuthModule ],
  providers: [PermissionsService],
  controllers: [PermissionsController],
  exports: [PermissionsService],
})
export class PermissionsModule {}
