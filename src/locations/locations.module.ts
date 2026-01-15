import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { Country } from 'entities/locations/country.entity';
import { City } from 'entities/locations/city.entity';
import { Region } from 'entities/locations/region.entity';
import { Chain } from 'entities/locations/chain.entity';
import { User } from 'entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { Project } from 'entities/project.entity';
import { Branch } from 'entities/branch.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Country,Branch, City, Region, Chain, User,Project])],
  providers: [LocationsService,UsersService],
  controllers: [LocationsController],
  exports: [LocationsService],
})
export class LocationsModule {}
