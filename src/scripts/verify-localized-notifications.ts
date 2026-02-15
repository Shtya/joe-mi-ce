
import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { Journey, JourneyStatus, JourneyType, CheckIn, JourneyPlan } from '../../entities/all_plans.entity';
import { User } from '../../entities/user.entity';
import { Branch } from '../../entities/branch.entity';
import { Shift } from '../../entities/employee/shift.entity';
import { Notification, NotificationType } from '../../entities/notification.entity';
import { VacationDate } from '../../entities/employee/vacation-date.entity';
import { NotificationService } from '../notification/notification.service';
import { JourneyService } from '../journey/journey.service';
import { Logger } from '@nestjs/common';

const run = async () => {
    const dataSource = new DataSource({
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        entities: [__dirname + '/../../entities/**/*.entity{.ts,.js}'],
        synchronize: false, // Don't sync in prod-like envs usually, but okay here if just testing
    });

    await dataSource.initialize();
    
    // Repos
    const journeyRepo = dataSource.getRepository(Journey);
    const checkInRepo = dataSource.getRepository(CheckIn);
    const userRepo = dataSource.getRepository(User);
    const branchRepo = dataSource.getRepository(Branch);
    const shiftRepo = dataSource.getRepository(Shift);
    const journeyPlanRepo = dataSource.getRepository(JourneyPlan);
    const notificationRepo = dataSource.getRepository(Notification);
    const vacationDateRepo = dataSource.getRepository(VacationDate);

    // Mock Logger
    const loggerSpy = {
        log: (msg: string) => console.log(`[LOG] ${msg}`),
        error: (msg: string) => console.error(`[ERR] ${msg}`),
        warn: (msg: string) => console.warn(`[WARN] ${msg}`),
    };

    // Instantiate Services
    const notificationService = new NotificationService(notificationRepo);
    (notificationService as any).logger = loggerSpy;

    const journeyService = new JourneyService(
        journeyPlanRepo,
        journeyRepo,
        checkInRepo,
        userRepo,
        branchRepo,
        shiftRepo,
        vacationDateRepo,
        notificationService
    );

    // --- SETUP DATA ---
    console.log('🏗️  Setting up test data...');

    // 1. Find or create Supervisor
    let supervisor = await userRepo.findOne({ where: { username: 'test_supervisor' } });
    if (!supervisor) {
        supervisor = userRepo.create({
            username: 'test_supervisor',
            password: 'password',
            name: 'Test Supervisor',
            is_active: true
        });
        await userRepo.save(supervisor);
    }

    // 2. Find or create Promoter
    let promoter = await userRepo.findOne({ where: { username: 'test_promoter' } });
    if (!promoter) {
        promoter = userRepo.create({
            username: 'test_promoter',
            password: 'password',
            name: 'Test Promoter',
            is_active: true
        });
        await userRepo.save(promoter);
    }

    // 3. Find or create Branch assigned to Supervisor
    let branch = await branchRepo.findOne({ where: { supervisor: { id: supervisor.id } }, relations: ['supervisor', 'chain'] });
    if (!branch) {
        // Find a chain first (needed for logic?)
        // Just create a simple branch
        branch = branchRepo.create({
            name: 'Test Branch',
            supervisor: supervisor,
            geo:{
                lat: 0,
            lng: 0,
            },
            geofence_radius_meters: 1000
        });
        // We might need to handle chain assignment if strict, but let's try strict save.
        // Assuming minimal requirements.
        try {
             await branchRepo.save(branch);
        } catch (e) {
             // If fails (e.g. city/region required), try to pick ANY existing branch and assign supervisor
             const existing = await branchRepo.findOne({ where: {}, relations: ['supervisor'] });
             if (existing) {
                 branch = existing;
                 branch.supervisor = supervisor;
                 await branchRepo.save(branch);
             } else {
                 console.error('Cannot create or find branch. Aborting.');
                 return;
             }
        }
    }
    
    // 4. Find or create Shift
    let shift = await shiftRepo.findOne({ where: {} });
    if(!shift) { console.error('No shift found'); return; }

    // 5. Create Journey
    const today = new Date().toISOString().split('T')[0];
    let journey = await journeyRepo.findOne({ 
        where: { 
            user: { id: promoter.id }, 
            date: today,
            branch: { id: branch.id }
        },
        relations: ['branch', 'branch.supervisor', 'user', 'shift']
    });

    if (!journey) {
        journey = journeyRepo.create({
            user: promoter,
            branch: branch,
            shift: shift,
            date: today,
            type: JourneyType.PLANNED,
            status: JourneyStatus.ABSENT,
            projectId: branch.project.id || '00000000-0000-0000-0000-000000000000'
        });
        await journeyRepo.save(journey);
    }

    // Ensure relations are loaded for the test
    journey = await journeyRepo.findOne({
         where: { id: journey.id },
         relations: ['branch', 'branch.supervisor', 'shift', 'user', 'branch.chain']
    });
    
    // --- TEST 1: Check-In (English) ---
    console.log('\n🧪 TEST 1: Check-In (English)...');
    const checkInDto = {
        journeyId: journey!.id,
        checkInTime: new Date(),
        checkInDocument: 'path/to/doc',
        geo: { lat: 0, lng: 0 },
        image: 'path/to/image'
    };

    // We rely on 'Roaming' or distance check. Let's force Roaming if possible or mock distance.
    // The service uses `this.isWithinGeofence`. We can't easily mock private method, 
    // but the logic `chainName !== 'Roaming' ? true : false` means if default, it checks geofence.
    // If we set geo to 0,0 and branch to 0,0 it should pass.
    
    await journeyService.checkInOut(checkInDto as any, 'en');

    // Verify Notifications
    const notifsEn = await notificationRepo.find({
        where: { journey: { id: journey!.id } },
        order: { created_at: 'DESC' },
        take: 2
    });

    console.log(`Found ${notifsEn.length} notifications.`);
    const supervisorNotifEn = notifsEn.find(n => n.user.id === supervisor!.id);
    const promoterNotifEn = notifsEn.find(n => n.user.id === promoter!.id);

    if (supervisorNotifEn && supervisorNotifEn.title === 'New check-in on your branch') console.log('✅ Supervisor Notification (EN): OK');
    else console.error(`❌ Supervisor Notification (EN): FAIL. Got: ${supervisorNotifEn?.title}`);

    if (promoterNotifEn && promoterNotifEn.title === 'Check-in Successful') console.log('✅ Promoter Notification (EN): OK');
    else console.error(`❌ Promoter Notification (EN): FAIL. Got: ${promoterNotifEn?.title}`);


    // --- TEST 2: Check-Out (Arabic) ---
    console.log('\n🧪 TEST 2: Check-Out (Arabic)...');
    
    // Wait a bit to ensure timestamps differ if needed, or just update
    const checkOutDto = {
        journeyId: journey!.id,
        checkInTime: checkInDto.checkInTime, // needed for update logic? No, checkInOut handles partials for existing checkIn?
        // Service logic: if checkIn exists...
        // if dto.checkOutTime matches...
        checkOutTime: new Date(),
        checkOutDocument: 'path/to/doc_out',
    };

    await journeyService.checkInOut(checkOutDto as any, 'ar');

    const notifsAr = await notificationRepo.find({
        where: { journey: { id: journey!.id } },
        order: { created_at: 'DESC' },
        take: 2
    });

    const supervisorNotifAr = notifsAr.find(n => n.user.id === supervisor!.id && n.type === NotificationType.JOURNEY_CHECKOUT);
    const promoterNotifAr = notifsAr.find(n => n.user.id === promoter!.id && n.type === NotificationType.JOURNEY_CHECKOUT);

    if (supervisorNotifAr && supervisorNotifAr.title === 'تم تسجيل الخروج في فرعك') console.log('✅ Supervisor Notification (AR): OK');
    else console.error(`❌ Supervisor Notification (AR): FAIL. Got: ${supervisorNotifAr?.title}`);

    if (promoterNotifAr && promoterNotifAr.title === 'تم تسجيل الخروج بنجاح') console.log('✅ Promoter Notification (AR): OK');
    else console.error(`❌ Promoter Notification (AR): FAIL. Got: ${promoterNotifAr?.title}`);


    await dataSource.destroy();
};

run().catch(e => {
    console.error(e);
    process.exit(1);
});
