import 'reflect-metadata';
import * as dotenv from 'dotenv';
// Load .env from root
dotenv.config({ path: __dirname + '/../../.env' });

import { DataSource } from 'typeorm';
import { Project } from '../../entities/project.entity';
import { Chain } from '../../entities/locations/chain.entity';

export const seedRoaming = async (dataSource: DataSource) => {
    const projectRepo = dataSource.getRepository(Project);
    const chainRepo = dataSource.getRepository(Chain);

    console.log('🚀 Seeding Roaming (Column Update)...');

    const projects = await projectRepo.find({ relations: ['chains'] });

    for (const project of projects) {
        if (!project.chains || project.chains.length === 0) {
            console.log(`Skipping project ${project.name}: No chains found`);
            continue;
        }

        let hasRoaming = project.chains.some(c => c.name === 'Roaming');

        if (hasRoaming) {
             console.log(`Project ${project.name} already has a roaming chain. Skipping.`);
             continue;
        }

        // Select the first chain to be the roaming chain
        const newChain = chainRepo.create({
            name: 'Roaming',
            project: project,
        });
        console.log(`Updating roaming=true for chain: ${newChain.name} in project: ${project.name}`);
        
        await chainRepo.save(newChain);
    }

    console.log('✅ Seeding Roaming Completed');
};

if (require.main === module) {
    const dbConfig = {
        type: 'postgres',
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '5432', 10),
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME, // Ensure this matches actual DB
        entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
        synchronize: true, 
    };
    
    // console.log('DB Config:', JSON.stringify({ ...dbConfig, password: '***' }, null, 2));

    const dataSource = new DataSource(dbConfig as any);

    dataSource
        .initialize()
        .then(async () => {
            await seedRoaming(dataSource);
            await dataSource.destroy();
            process.exit(0);
        })
        .catch(err => {
            console.error('❌ Roaming seeding failed:', err);
            process.exit(1);
        });
}
