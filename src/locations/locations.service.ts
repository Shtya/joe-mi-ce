// --- File: locations/locations.service.ts ---
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Country } from 'entities/locations/country.entity';
import { City } from 'entities/locations/city.entity';
import { Region } from 'entities/locations/region.entity';
import { Chain } from 'entities/locations/chain.entity';

import { BulkCreateCountriesDto, BulkCreateCitiesDto, BulkCreateRegionsDto, BulkCreateChainsDto, UpdateCountryDto, UpdateRegionDto, UpdateCityDto, UpdateChainDto, CreateChainDto } from 'dto/locations.dto';
import { UsersService } from 'src/users/users.service';
import { Project } from 'entities/project.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Country)
    public readonly countryRepo: Repository<Country>,

    @InjectRepository(Region)
    public readonly regionRepo: Repository<Region>,

    @InjectRepository(City)
    public readonly cityRepo: Repository<City>,

    @InjectRepository(Chain)
    public readonly chainRepo: Repository<Chain>,

    @InjectRepository(Project)
    public readonly projectRepo: Repository<Project>,

    public readonly userService:UsersService
  ) {}

  // --------- COUNTRY (bulk create) ---------
  async bulkCreateCountries(dto: BulkCreateCountriesDto): Promise<Country[]> {
    const existing = await this.countryRepo.find({
      where: { name: In(dto.countries.map(c => c.name)) },
    });

    if (existing.length > 0) {
      throw new ConflictException(`Countries already exist: ${existing.map(c => c.name).join(', ')}`);
    }

    return this.countryRepo.save(dto.countries);
  }

  // --------- REGION (bulk create) ---------
  async bulkCreateRegions(dto: BulkCreateRegionsDto): Promise<Region[]> {
    const countryIds = [...new Set(dto.regions.map(r => r.countryId))];
    const countries = await this.countryRepo.findBy({ id: In(countryIds) });

    if (countries.length !== countryIds.length) {
      const missing = countryIds.filter(id => !countries.some(c => c.id === id));
      throw new ConflictException(`Countries not found: ${missing.join(', ')}`);
    }

    const existing = await this.regionRepo
      .createQueryBuilder('region')
      .where('region.name IN (:...names)', { names: dto.regions.map(r => r.name) })
      .andWhere('region.countryId IN (:...countryIds)', { countryIds })
      .getMany();

    if (existing.length > 0) {
      throw new ConflictException(`Regions already exist: ${existing.map(r => r.name).join(', ')}`);
    }

    const regions = dto.regions.map(regionDto => ({
      ...regionDto,
      country: countries.find(c => c.id === regionDto.countryId),
    }));

    return this.regionRepo.save(regions);
  }

  // --------- CITY (bulk create) ---------
  async bulkCreateCities(dto: BulkCreateCitiesDto): Promise<City[]> {
    const regionIds = [...new Set(dto.cities.map(c => c.regionId))];
    const regions = await this.regionRepo.findBy({ id: In(regionIds) });

    if (regions.length !== regionIds.length) {
      const missing = regionIds.filter(id => !regions.some(r => r.id === id));
      throw new ConflictException(`Regions not found: ${missing.join(', ')}`);
    }

    const existingCities = await this.cityRepo
      .createQueryBuilder('city')
      .where('city.name IN (:...names)', { names: dto.cities.map(c => c.name) })
      .andWhere('city.regionId IN (:...regionIds)', { regionIds })
      .getMany();

    if (existingCities.length > 0) {
      throw new ConflictException(`Cities already exist: ${existingCities.map(c => c.name).join(', ')}`);
    }

    const cities = dto.cities.map(cityDto => ({
      ...cityDto,
      region: regions.find(r => r.id === cityDto.regionId),
    }));

    return this.cityRepo.save(cities);
  }

  // --------- CHAIN (bulk create) ---------
  async bulkCreateChains(dto: BulkCreateChainsDto): Promise<Chain[]> {


    const existing = await this.chainRepo.find({
      where: { name: In(dto.chains.map(c => c.name)) },
    });

    if (existing.length > 0) {
      throw new ConflictException(`Chains already exist: ${existing.map(c => c.name).join(', ')}`);
    }

    return this.chainRepo.save(dto.chains);
  }
  async createChainsWithProject(dto: CreateChainDto, userId:string): Promise<Chain> {
    const projectId = await this.userService.resolveProjectIdFromUser(userId)
    const project = await this.projectRepo.findOne({ where: { id: projectId } })
    if (!project) throw new NotFoundException('Project not found');
    

    const existing = await this.chainRepo.find({
      where: { name: dto.name  , project},
    });

    if (existing.length > 0) {
      throw new ConflictException(`Chains already exist: ${existing.map(c => c.name).join(', ')}`);
    }

    return this.chainRepo.save({project,...dto});
  }
  // ===================== Updates (Edit) =====================

  // COUNTRY
  async updateCountry(id: string, dto: UpdateCountryDto): Promise<Country> {
    const country = await this.countryRepo.findOne({ where: { id } });
    if (!country) throw new NotFoundException('Country not found');

    if (dto.name) {
      const dup = await this.countryRepo.findOne({ where: { name: dto.name, id: Not(id) } });
      if (dup) throw new ConflictException(`Country already exists with name: ${dto.name}`);
    }

    const merged = this.countryRepo.merge(country, dto);
    return this.countryRepo.save(merged);
  }

  // REGION
  async updateRegion(id: string, dto: UpdateRegionDto): Promise<Region> {
    const region = await this.regionRepo.findOne({ where: { id }, relations: ['country'] });
    if (!region) throw new NotFoundException('Region not found');

    // If countryId changes, verify it
    let targetCountryId = region.country?.id;
    if (dto.countryId && dto.countryId !== targetCountryId) {
      const newCountry = await this.countryRepo.findOne({ where: { id: dto.countryId } });
      if (!newCountry) throw new NotFoundException(`Country not found with id: ${dto.countryId}`);
      region.country = newCountry;
      targetCountryId = newCountry.id;
    }

    // Uniqueness: region name per country
    if (dto.name || dto.countryId) {
      const nameToCheck = dto.name ?? region.name;
      const dup = await this.regionRepo.findOne({
        where: { name: nameToCheck, country: { id: targetCountryId }, id: Not(id) },
        relations: ['country'],
      });
      if (dup) throw new ConflictException(`Region "${nameToCheck}" already exists for this country`);
    }

    const merged = this.regionRepo.merge(region, { ...dto, country: region.country });
    return this.regionRepo.save(merged);
  }

  // CITY
  async updateCity(id: string, dto: UpdateCityDto): Promise<City> {
    const city = await this.cityRepo.findOne({ where: { id }, relations: ['region'] });
    if (!city) throw new NotFoundException('City not found');

    // If regionId changes, verify it
    let targetRegionId = city.region?.id;
    if (dto.regionId && dto.regionId !== targetRegionId) {
      const newRegion = await this.regionRepo.findOne({ where: { id: dto.regionId } });
      if (!newRegion) throw new NotFoundException(`Region not found with id: ${dto.regionId}`);
      city.region = newRegion;
      targetRegionId = newRegion.id;
    }

    // Uniqueness: city name per region
    if (dto.name || dto.regionId) {
      const nameToCheck = dto.name ?? city.name;
      const dup = await this.cityRepo.findOne({
        where: { name: nameToCheck, region: { id: targetRegionId }, id: Not(id) },
        relations: ['region'],
      });
      if (dup) throw new ConflictException(`City "${nameToCheck}" already exists for this region`);
    }

    const merged = this.cityRepo.merge(city, { ...dto, region: city.region });
    return this.cityRepo.save(merged);
  }

  // CHAIN
  async updateChain(id: string, dto: UpdateChainDto): Promise<Chain> {
    const chain = await this.chainRepo.findOne({ where: { id } });
    if (!chain) throw new NotFoundException('Chain not found');

    if (dto.name) {
      const dup = await this.chainRepo.findOne({ where: { name: dto.name, id: Not(id) } });
      if (dup) throw new ConflictException(`Chain already exists with name: ${dto.name}`);
    }

    const merged = this.chainRepo.merge(chain, dto);
    return this.chainRepo.save(merged);
  }
}
