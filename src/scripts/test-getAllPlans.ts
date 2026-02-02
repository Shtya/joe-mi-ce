
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { JourneyController } from '../journey/journey.controller';
import { JourneyService } from '../journey/journey.service';
import { UsersService } from '../users/users.service';
import { User } from '../../entities/user.entity';
import { Branch } from '../../entities/branch.entity';
import { NotFoundException } from '@nestjs/common';

const run = async () => {
    console.log('🚀 Starting test for getAllPlansWithPagination with Branch Filter...');

    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        entities: [__dirname + '/../../entities/**/*.entity{.ts,.js}'],
        synchronize: false,
    });

    await dataSource.initialize();
    console.log('✅ Database connected');

    const userRepo = dataSource.getRepository(User);
    
    // Find a user WITH a branch
    let user = await userRepo.findOne({
        where: { username: 'test_supervisor' },
        relations: ['project', 'branch', 'branch.project']
    });

    if (!user || !user.branch) {
        console.log('⚠️ Test supervisor not found or has no branch. Searching for ANY user with a branch...');
         user = await userRepo.find({
            where: {
                // We want a user who has a branch relation not null
                 // Note: typeorm 'IsNull' logic might be needed but findOne with relations usually filters? No.
                 // Let's just find many and pick one
            },
            relations: ['project', 'branch', 'branch.project'],
            take: 50
        }).then(users => users.find(u => u.branch && u.branch.project) || (null as any));
    }

    if (!user) {
        console.error('❌ Could not find a suitable user with a branch for testing.');
        await dataSource.destroy();
        return;
    }

    console.log(`👤 Using user: ${user.username} (ID: ${user.id})`);
    console.log(`🏢 Branch: ${user.branch.name} (ID: ${user.branch.id})`);
    
    // Mocks
    const journeyServiceMock = {
        journeyPlanRepo: dataSource.getRepository('JourneyPlan'),
        journeyRepo: dataSource.getRepository('Journey'),
    } as any;

    const usersServiceMock = {
        resolveUserWithProject: async (id: string) => {
            return user; 
        },
        getUsersByBranch: async (branchId: string, projectId: string) => {
             // Mock response structure
             return {
                 branchId,
                 branchName: user.branch.name,
                 users: [
                     // Add a mock promoter
                     { id: 'mock-promoter-1', name: 'Mock Promoter', role: 'promoter' },
                     // Add a mock supervisor
                     { id: 'mock-supervisor-1', name: 'Mock Supervisor', role: 'supervisor' }
                 ]
             };
        }
    } as any;

    const controller = new JourneyController(journeyServiceMock, usersServiceMock);

    const req = { user: { id: user.id } };
    const query = { filters: {} };

    console.log('⚡ Calling getAllPlansWithPagination...');
    
    try {
        const result = await controller.getAllPlansWithPagination(
            query,
            req,
            1,
            10
        );

        console.log('✅ Success! Result data length:', result.data.length);

        // Verify that all returned plans belong to the user's branch
        const invalidPlans = result.data.filter((p: any) => p.branchName !== user.branch.name); // Checking by name as simple check, strictly should check ID if available in response
        
        if (invalidPlans.length > 0) {
             console.error('❌ TEST FAILED: Found plans from other branches!');
             invalidPlans.forEach((p: any) => console.log(`   - Plan Branch: ${p.branchName} (Expected: ${user.branch.name})`));
        } else {
             console.log('✅ VERIFICATION PASSED: All plans belong to the user\'s branch.');
        }

        // Verify promoters list
        if (result.promoters && Array.isArray(result.promoters)) {
             console.log(`✅ Promoters List: Found ${result.promoters.length} promoters.`);
             if(result.promoters.length > 0) {
                 console.log('   Sample:', result.promoters[0]);
             } else {
                 console.log('   (List is empty, check if branch has promoters)');
             }
        } else {
             console.error('❌ TEST FAILED: `promoters` field missing or not an array.');
        }

    } catch (error) {
        console.error('❌ Error executing controller method:', error);
    }

    await dataSource.destroy();
};

run().catch(e => {
    console.error(e);
    process.exit(1);
});
