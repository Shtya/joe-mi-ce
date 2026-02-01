import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource, SelectQueryBuilder } from 'typeorm';
import { Journey, JourneyStatus, JourneyType } from '../entities/all_plans.entity';
import { CRUD } from '../common/crud.service';
import { User } from '../entities/user.entity';
import { Branch } from '../entities/branch.entity';
import { Shift } from '../entities/employee/shift.entity';

// Helper to simulate Controller logic
async function getJourneys(
    journeyRepo: any,
    filters: any,
    extraWhere?: (qb: SelectQueryBuilder<any>) => void
) {
    return await CRUD.findAllRelation(
        journeyRepo,
        'journey',
        undefined,
        1,
        100,
        'date',
        'ASC',
        [], // No need for relations for this test
        undefined,
        filters,
        extraWhere
    );
}

const run = async () => {
    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        entities: [__dirname + '/../entities/**/*.entity{.ts,.js}'],
        synchronize: true, // Be careful, but okay for local dev/verification
    });

    await dataSource.initialize();
    const journeyRepo = dataSource.getRepository(Journey);
    
    console.log('🧹 Cleaning up journeys...');
    await journeyRepo.delete({}); // Clear all for clean test

    // --- SEED DATA ---
    // We need at least one user, branch, shift for constraints (if any), 
    // but often we can just insert with nulls if constraints allow, 
    // OR we just create minimal valid entities.
    // Assuming simple structure for the sake of checking DATE filtering.
    // If relations are strict, we might need to fetch existing ones.
    
    // Let's try to just insert raw or use existing if strict.
    // For safety, let's just make valid dummy objects if possible or assume loose constraints.
    // Given the entities provided earlier, they are likely relations.
    // Let's check constraints by trying to save a simple one.
    
    // Valid dates
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // Minimal mocks for Foreign Keys (assuming they exist in DB)
    // If this fails due to FK, I will fetch one real user/branch/shift.
    const userRepo = dataSource.getRepository(User);
    const branchRepo = dataSource.getRepository(Branch);
    const shiftRepo = dataSource.getRepository(Shift);

    // Create a valid user
    let user = await userRepo.findOne({ where: {} });
    if (!user) {
        user = userRepo.create({ 
            username: 'testuser_' + Date.now(), 
            password: 'password', // required
            name: 'Test User' 
        });
        await userRepo.save(user);
    }
    
    // Get valid branch and shift
    const branch = await branchRepo.findOne({ where: {}, relations: ['project'] }); 
    const shift = await shiftRepo.findOne({ where: {} });

    if (!branch || !shift) {
        console.error('❌ Need Branch and Shift to exist to run this test.');
        process.exit(1);
    }
    
    const projectId = branch.project?.id || '00000000-0000-0000-0000-000000000000'; // Fallback UUID if no project

    console.log(`🌱 Seeding Journeys for dates: ${yesterday}, ${today}, ${tomorrow}, ${nextWeek}`);
    
    const dates = [yesterday, today, tomorrow, nextWeek];
    const journeys: Journey[] = [];

    for (const date of dates) {
        const j = journeyRepo.create({
            date,
            status: JourneyStatus.ABSENT,
            type: JourneyType.PLANNED,
            user,
            branch,
            shift,
            projectId: projectId
        });
        journeys.push(j);
    }

    await journeyRepo.save(journeys);

    // --- TESTS ---

    // 1. Default (No filters) -> Should see Yesterday and Today only
    console.log('\n--- TEST 1: Default (No filters) ---');
    console.log('Expected: Yesterday, Today');
    const defaultFilters = {};
    const defaultExtraWhere = (qb: any) => qb.andWhere('journey.date <= :today', { today: new Date() });
    
    const res1 = await getJourneys(journeyRepo, defaultFilters, defaultExtraWhere);
    console.log('Result Dates:', res1.records.map((r: any) => r.date));
    
    if (res1.records.find((r: any) => r.date === tomorrow || r.date === nextWeek)) console.error('FAIL: Future dates found');
    else console.log('PASS');


    // 2. Filter fromDate = Tomorrow -> Should see Tomorrow and NextWeek
    // Note: Controller logic removes extraWhere if hasDateFilters is true.
    console.log('\n--- TEST 2: From Tomorrow ---');
    console.log('Expected: Tomorrow, Next Week');
    const filters2 = { date_from: tomorrow };
    const res2 = await getJourneys(journeyRepo, filters2, undefined); // No extraWhere
    console.log('Result Dates:', res2.records.map((r: any) => r.date));
    
    if (res2.records.length === 2 && res2.records.every((r: any) => r.date >= tomorrow)) console.log('PASS');
    else console.error('FAIL');


    // 3. Filter Range (Yesterday to Today) -> Should see Yesterday, Today
    console.log('\n--- TEST 3: Range Yesterday to Today ---');
    console.log('Expected: Yesterday, Today');
    const filters3 = { date_from: yesterday, date_to: today };
    const res3 = await getJourneys(journeyRepo, filters3, undefined);
    console.log('Result Dates:', res3.records.map((r: any) => r.date));
    
    if (res3.records.length === 2 && res3.records.find((r: any) => r.date === yesterday) && res3.records.find((r: any) => r.date === today)) console.log('PASS');
    else console.error('FAIL');

    await dataSource.destroy();
};

run().catch(console.error);
