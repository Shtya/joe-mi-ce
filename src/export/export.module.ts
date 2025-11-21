import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
	imports : [
		TypeOrmModule.forFeature([]),
		HttpModule, 
	],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService], // <-- add this line
})
export class ExportModule {}
