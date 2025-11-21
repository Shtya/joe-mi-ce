import { forwardRef, Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RolesController } from './roles.controller';
import { Permission } from 'entities/permissions.entity';
import { Role } from 'entities/role.entity';
import { AuthModule } from 'src/auth/auth.module';
import { User } from 'entities/user.entity';
 
@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role , User]) , AuthModule ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
