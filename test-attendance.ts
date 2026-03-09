import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Journey } from './entities/all_plans.entity';
import * as dayjs from 'dayjs';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const journeyRepo = app.get(getRepositoryToken(Journey));
  
  const journeys = await journeyRepo.find({
    where: { date: '2026-03-08' },
    relations: ['user', 'user.role', 'branch', 'branch.chain'],
  });
  
  console.log(`Total journeys on 2026-03-08: ${journeys.length}`);
  const nabeel = journeys.filter(j => j.user?.name?.includes('Nabeel'));
  console.log('Nabeel journeys:', JSON.stringify(nabeel.map(j => ({ id: j.id, date: j.date, status: j.status, role: j.user?.role?.name, project: j.projectId })), null, 2));

  await app.close();
}
bootstrap();
