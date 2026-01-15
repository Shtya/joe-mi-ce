import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards, Patch, Request } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { CreateCountryDto, CreateCityDto, CreateRegionDto, CreateChainDto, BulkCreateCountriesDto, BulkCreateCitiesDto, BulkCreateRegionsDto, BulkCreateChainsDto, UpdateChainDto, UpdateCityDto, UpdateRegionDto, UpdateCountryDto } from 'dto/locations.dto';
import { PaginationQueryDto } from 'dto/pagination.dto';
import { CRUD } from 'common/crud.service';
import { AuthGuard } from 'src/auth/auth.guard';
import { Permissions } from 'decorators/permissions.decorators';
import { EPermission } from 'enums/Permissions.enum';

@UseGuards(AuthGuard)
@Controller('')
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  // Bulk Create Endpoints
  @Post('countries')
  @Permissions(EPermission.LOCATION_CREATE)
  bulkCreateCountries(@Body() dto: BulkCreateCountriesDto) {
    return this.locationsService.bulkCreateCountries(dto);
  }

  @Post('regions')
  @Permissions(EPermission.LOCATION_CREATE)
  bulkCreateRegions(@Body() dto: BulkCreateRegionsDto) {
    return this.locationsService.bulkCreateRegions(dto);
  }

  @Post('cities')
  @Permissions(EPermission.LOCATION_CREATE)
  bulkCreateCities(@Body() dto: BulkCreateCitiesDto) {
    return this.locationsService.bulkCreateCities(dto);
  }

  @Post('chains')
  @Permissions(EPermission.LOCATION_CREATE)
  bulkCreateChains(@Body() dto: BulkCreateChainsDto) {
    return this.locationsService.bulkCreateChains(dto); 
  }
  @Post('chains/project')
  @Permissions(EPermission.LOCATION_CREATE)
  bulkCreateChainsWithProject(@Body() dto: CreateChainDto, @Request() req: any) {
    return this.locationsService.createChainsWithProject(dto,req.user.id); 
  }
  // Get Regions by Country
  @Get('countries/:countryId/regions')
  @Permissions(EPermission.LOCATION_READ)
  getRegionsByCountry(@Param('countryId') countryId: string, @Query() query: PaginationQueryDto) {
    return CRUD.findAll(this.locationsService.regionRepo, 'region', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['country'], ['name'], { country: { id: countryId } });
  }

  // Get Cities by Region
  @Get('regions/:regionId/cities')
  @Permissions(EPermission.LOCATION_READ)
  getCitiesByRegion(@Param('regionId') regionId: string, @Query() query: PaginationQueryDto) {
    return CRUD.findAll(this.locationsService.cityRepo, 'city', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['region'], ['name'], { region: { id: regionId } });
  }

  // Country
  @Get('countries')
  @Permissions(EPermission.LOCATION_READ)
  findAllCountries(@Query() query: PaginationQueryDto) {
    return CRUD.findAll(this.locationsService.countryRepo, 'country', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['regions'], ['name'], query.filters);
  }

  @Get('countries/:id')
  @Permissions(EPermission.LOCATION_READ)
  findCountry(@Param(':id') id: string) {
    return CRUD.findOne(this.locationsService.countryRepo, 'country', id, ['regions']);
  }

  @Delete('countries/:id')
  @Permissions(EPermission.LOCATION_DELETE)
  deleteCountry(@Param('id') id: string) {
    return CRUD.delete(this.locationsService.countryRepo, 'country', id);
  }

  // Regions
  @Get('regions')
  @Permissions(EPermission.LOCATION_READ)
  findAllRegions(@Query() query) {
    return CRUD.findAll(this.locationsService.regionRepo, 'region', query.search, query.page, query.limit, query.sortBy, query.sortOrder, ['country'], ['name'], query.filters);
  }

  @Delete('regions/:id')
  @Permissions(EPermission.LOCATION_DELETE)
  deleteRegion(@Param('id') id: string) {
    return CRUD.delete(this.locationsService.regionRepo, 'region', id);
  }

  // Cities
  @Get('cities')
  @Permissions(EPermission.LOCATION_READ)
  findAllCities(@Query() query: PaginationQueryDto) {
    return CRUD.findAll(this.locationsService.cityRepo, 'city', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [], ['name'], query.filters);
  }

  @Delete('cities/:id')
  @Permissions(EPermission.LOCATION_DELETE)
  deleteCity(@Param('id') id: string) {
    return CRUD.delete(this.locationsService.cityRepo, 'city', id);
  }

  // Chains
  @Get('chains')
  @Permissions(EPermission.LOCATION_READ)
  async findAllChains(@Query() query: PaginationQueryDto,@Request() req: any) {
    const userId = req.user.id;
    const projectId = await this.locationsService.userService.resolveProjectIdFromUser(userId);

    return CRUD.findAll(this.locationsService.chainRepo, 'chain', query.search, query.page, query.limit, query.sortBy, query.sortOrder, [], ['name'], { ...query.filters, project: { id: projectId } });
  }

  @Delete('chains/:id')
  @Permissions(EPermission.LOCATION_DELETE)
  deleteChain(@Param('id') id: string) {
    return CRUD.delete(this.locationsService.chainRepo, 'chain', id);
  }

  @Patch('chains/:id')
  @Permissions(EPermission.LOCATION_UPDATE)
  updateChain(@Param('id') id: string, @Body() dto: UpdateChainDto) {
    return this.locationsService.updateChain(id, dto);
  }

  @Patch('cities/:id')
  @Permissions(EPermission.LOCATION_UPDATE)
  updateCity(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.locationsService.updateCity(id, dto);
  }

  @Patch('regions/:id')
  @Permissions(EPermission.LOCATION_UPDATE)
  updateRegion(@Param('id') id: string, @Body() dto: UpdateRegionDto) {
    return this.locationsService.updateRegion(id, dto);
  }

  @Patch('countries/:id')
  @Permissions(EPermission.LOCATION_UPDATE)
  updateCountry(@Param('id') id: string, @Body() dto: UpdateCountryDto) {
    return this.locationsService.updateCountry(id, dto);
  }
}
