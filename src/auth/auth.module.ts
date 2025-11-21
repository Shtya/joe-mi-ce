import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
 import { MailService } from 'common/nodemailer';
import { User } from 'entities/user.entity';
import { Role } from 'entities/role.entity';
import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';
  

@Module({
  imports: [TypeOrmModule.forFeature([User, Role, Project , Branch])],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService , TypeOrmModule.forFeature([User])],
})
export class AuthModule {}

