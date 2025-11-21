import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Checkout } from './checkout.entity';
import { CheckoutsService } from './checkout.service';
import { CheckoutsController } from './checkout.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Checkout])],
  controllers: [CheckoutsController],
  providers: [CheckoutsService],
  exports: [CheckoutsService],
})
export class CheckoutsModule {}
