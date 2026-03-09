import { DataSource } from 'typeorm';
import { Journey } from './entities/all_plans.entity';
import { User } from './entities/user.entity';
import { Role } from './entities/employee/roles.entity';
import { Branch } from './entities/branch.entity';
import { Chain } from './entities/chains.entity';

const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DATABASE_HOST || "127.0.0.1",
  port: parseInt(process.env.DATABASE_PORT || "5432"),
  username: process.env.DATABASE_USER || "postgres",
  password: process.env.DATABASE_PASSWORD || "postgres",
  database: process.env.DATABASE_NAME || "joe_mi_ce",
  entities: [Journey, User, Role, Branch, Chain, __dirname + '/entities/**/*.entity.{ts,js}'],
});

async function run() {
  await AppDataSource.initialize();
  console.log("Connected to DB");
  
  const journeys = await AppDataSource.getRepository(Journey).find({
    where: { date: '2026-03-08' as any }, // Assuming date is stored as string/date
    relations: ['user', 'user.role', 'branch', 'branch.chain'],
  });
  
  console.log(`Journeys on Mar 8: ${journeys.length}`);
  const userSamples = journeys.slice(0, 3).map(j => j.user?.name);
  console.log(`Sample users on Mar 8:`, userSamples);
  
  const nabeelJourneys = journeys.filter(j => j.user?.name?.toLowerCase().includes('nabeel'));
  console.log('Nabeel:', JSON.stringify(nabeelJourneys.map(j => ({
    id: j.id, date: j.date, status: j.status, role: j.user?.role?.name, project: j.projectId
  })), null, 2));

  // Also query users for Nabeel
  const users = await AppDataSource.getRepository(User).find({ where: {} });
  const n = users.filter(u => u.name?.toLowerCase().includes('nabeel'));
  console.log('Users named Nabeel:', n.length > 0 ? n.map(u => ({ id: u.id, name: u.name })) : 'None found');
  
  await AppDataSource.destroy();
}
run().catch(console.error);
