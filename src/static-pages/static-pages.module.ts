import { Module } from '@nestjs/common';
import { StaticPagesService } from './static-pages.service';
import { StaticPagesController } from './static-pages.controller';
import { StaticPage } from 'entities/static-page.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StaticPage]),AuthModule,
  ],
  controllers: [StaticPagesController],
  providers: [StaticPagesService],
})
export class StaticPagesModule {}
