import * as dotenv from 'dotenv';
dotenv.config();
import { User } from 'entities/user.entity';
import { DataSource, Repository } from 'typeorm';
import * as argon from 'argon2';
import { ERole } from 'enums/Role.enum';
import { Role } from 'entities/role.entity';
import { Permission } from 'entities/permissions.entity';
import { Country } from 'entities/locations/country.entity';
import { City } from 'entities/locations/city.entity';
import { Region } from 'entities/locations/region.entity';
import { Chain } from 'entities/locations/chain.entity';
import { Branch } from 'entities/branch.entity';
import { Project } from 'entities/project.entity';
import { ProjectStatus } from 'enums/projects.enum';
import { Brand } from 'entities/products/brand.entity';
import { Category } from 'entities/products/category.entity';
import { Product } from 'entities/products/product.entity';
import { Stock } from 'entities/products/stock.entity';
import { EPermission } from 'enums/Permissions.enum';
import { seedSurveys, seedSurveyFeedbacks } from './survey.seeder';
import { seedRoaming } from './roaming.seeder';

export const seedPermissions = async (dataSource: DataSource) => {
  const permissionRepository = dataSource.getRepository(Permission);
  const queryRunner = dataSource.createQueryRunner();

  console.log('🚀 Seeding permissions...');
  await queryRunner.query(`TRUNCATE TABLE "role_permissions" RESTART IDENTITY CASCADE;`);

  // ✅ Step 2: Delete old permissions safely
  await permissionRepository.delete({});

  // ✅ Step 3: Prepare permissions from enum
  const permissions = Object.values(EPermission).map(permission =>
    permissionRepository.create({
      name: permission,
      description: `${permission
        .split('_')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')} permission`,
    }),
  );

  // ✅ Step 4: Insert them
  await permissionRepository.save(permissions);

  console.log(`✅ Seeded ${permissions.length} permissions successfully`);
};

export const seedSuperAdminRole = async (dataSource: DataSource) => {
  const roleRepository = dataSource.getRepository(Role);
  const permissionRepository = dataSource.getRepository(Permission);

  console.log('🚀 Checking Super Admin role...');

  // ✅ Fetch all existing permissions
  const allPermissions = await permissionRepository.find();
  if (!allPermissions.length) {
    throw new Error('⚠️ No permissions found. Please seed permissions first.');
  }

  // ✅ Check if SUPER_ADMIN exists
  let superAdmin = await roleRepository.findOne({
    where: { name: ERole.SUPER_ADMIN },
    relations: ['permissions'],
  });

  // ✅ If not exist → create new
  if (!superAdmin) {
    superAdmin = roleRepository.create({
      name: ERole.SUPER_ADMIN,
      description: 'Full system access',
      permissions: allPermissions,
    });

    await roleRepository.save(superAdmin);
    console.log('🟢 Created Super Admin role and granted all permissions.');
  } else {
    // ✅ If exists → update its permissions (add all)
    superAdmin.permissions = allPermissions;
    await roleRepository.save(superAdmin);
    console.log('🟢 Updated Super Admin role with all permissions.');
  }

  console.log('✅ Super Admin seeding complete.');
};

export const seedRoles = async (dataSource: DataSource) => {
  const roleRepository = dataSource.getRepository(Role);
  const permissionRepository = dataSource.getRepository(Permission);

  const allPermissions = await permissionRepository.find();

  await roleRepository.delete({}); // Force delete all rows from the roles table
  const roles = [
    {
      name: ERole.SUPER_ADMIN,
      description: 'Full system access',
      permissions: allPermissions, // All permissions for super admin
    },
    {
      name: ERole.PROJECT_ADMIN,
      description: 'Manages a single project',
      permissions: allPermissions.filter(permission => permission.name !== 'special_permission'), // Filter permissions for project admins
    },
    {
      name: ERole.SUPERVISOR,
      description: 'Oversees promoters in branches',
      permissions: allPermissions.filter(permission => permission.name !== 'audit_permission'), // Filter permissions for supervisors
    },
    {
      name: ERole.PROMOTER,
      description: 'Field staff performing audits/sales',
      permissions: allPermissions.filter(permission => permission.name === 'field_permission'), // Specific permissions for promoters
    },
    {
      name: ERole.AUDITOR,
      description: 'Specialized audit role (optional)',
      permissions: allPermissions.filter(permission => permission.name === 'audit_permission'), // Only audit-related permissions
    },
  ];

  await roleRepository.save(roles);
  console.log('✅ Seeded roles successfully');
};

export const seedUsers = async (dataSource: DataSource) => {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);

  console.log("🚀 Seeding users...");

  const roles = await roleRepository.find();
  if (roles.length === 0) {
    throw new Error("⚠️ No roles found. Seed roles first.");
  }

  await userRepository.delete({});

  const users = [];

  for (const role of roles) {
    // convert "super_admin" → "superadmin"
    const username = role.name.toLowerCase().replace(/_/g, "");

    const hashedPassword = await argon.hash("123456");

    users.push(
      userRepository.create({
        name: `${role.name} User`,
        username,
        password: hashedPassword,
        role
      })
    );
  }

  await userRepository.save(users);

  console.log(`✅ Seeded ${users.length} users with simple usernames.`);
};


export const seedCountries = async (dataSource: DataSource) => {
  const countryRepository = dataSource.getRepository(Country);

  const countries = [{ name: 'Saudi Arabia' }, { name: 'United Arab Emirates' }, { name: 'Egypt' }, { name: 'Jordan' }, { name: 'Morocco' }, { name: 'Kuwait' }, { name: 'Qatar' }, { name: 'Bahrain' }, { name: 'Oman' }, { name: 'Lebanon' }];

  await countryRepository.save(countries);
  console.log('✅ Seeded countries successfully');
};

export const seedRegions = async (dataSource: DataSource) => {
  const regionRepository = dataSource.getRepository(Region);
  const countryRepository = dataSource.getRepository(Country);

  const countries = await countryRepository.find();

  const regions = countries.flatMap((country, index) => [
    { name: `Central Region ${index + 1}`, country },
    { name: `Northern Region ${index + 1}`, country },
  ]);

  await regionRepository.save(regions);
  console.log('✅ Seeded regions successfully');
};

export const seedCities = async (dataSource: DataSource) => {
  const cityRepository = dataSource.getRepository(City);
  const regionRepository = dataSource.getRepository(Region);

  const regions = await regionRepository.find({ relations: ['country'] });

  const cities: Partial<City>[] = [];

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    for (let j = 1; j <= 3; j++) {
      cities.push({
        name: `${region.name.split(' ')[0]} City ${j}`,
        region,
      });
    }
  }

  await cityRepository.save(cities);
  console.log('✅ Seeded cities successfully');
};

export const seedChains = async (dataSource: DataSource) => {
  const chainRepository = dataSource.getRepository(Chain);

  const chains = [
    { name: 'Starbucks', logoUrl: 'https://logo.clearbit.com/starbucks.com' },
    { name: "McDonald's", logoUrl: 'https://logo.clearbit.com/mcdonalds.com' },
    { name: 'KFC', logoUrl: 'https://logo.clearbit.com/kfc.com' },
    { name: 'Pizza Hut', logoUrl: 'https://logo.clearbit.com/pizzahut.com' },
    { name: 'Domino’s Pizza', logoUrl: 'https://logo.clearbit.com/dominos.com' },
    { name: 'Costa Coffee', logoUrl: 'https://logo.clearbit.com/costa.co.uk' },
    { name: 'Burger King', logoUrl: 'https://logo.clearbit.com/bk.com' },
    { name: 'Subway', logoUrl: 'https://logo.clearbit.com/subway.com' },
    { name: 'Tim Hortons', logoUrl: 'https://logo.clearbit.com/timhortons.com' },
  ];

  await chainRepository.save(chains);
  console.log('✅ Seeded chains successfully');
};

export const seedProjects = async (dataSource: DataSource) => {
  const projectRepository = dataSource.getRepository(Project);
  const userRepository = dataSource.getRepository(User);

  const users = await userRepository.find();
  if (users.length < 2) {
    throw new Error('⚠️ Please seed at least 2 users to use as owner and supervisor');
  }

  const sampleProjects = ['Retail Monitoring System', 'Warehouse Tracker', 'Field Audit Platform', 'Salesforce Management', 'Marketing Analytics', 'Operations Tracker', 'Customer Engagement System', 'Inventory System', 'Delivery Monitoring', 'Chain Management Tool'];

  // const projects = sampleProjects.map((name, i) => {
  //   return projectRepository.create({
  //     name,
  //     image_url: `https://via.placeholder.com/300x200?text=${encodeURIComponent(name)}`,
  //     status: i % 2 === 0 ? ProjectStatus.ACTIVE : ProjectStatus.INACTIVE,
  //     owner: users[i % users.length],
  //     supervisor: users[(i + 1) % users.length],
  //   });
  // });

  // await projectRepository.save(projects);
  console.log('✅ Seeded projects successfully');
};

export const seedBranches = async (dataSource: DataSource) => {
  const branchRepository = dataSource.getRepository(Branch);
  const projectRepository = dataSource.getRepository(Project);
  const cityRepository = dataSource.getRepository(City);
  const chainRepository = dataSource.getRepository(Chain);

  const projects = await projectRepository.find();
  const cities = await cityRepository.find();
  const chains = await chainRepository.find();

  if (projects.length === 0 || cities.length === 0) {
    throw new Error('⚠️ Please seed projects and cities before seeding branches');
  }

  const sampleBranches = ['Downtown Branch', 'Airport Road Branch', 'City Center Branch', 'North Side Branch', 'South Plaza Branch', 'Central Park Branch', 'Mall Entrance Branch', 'University Area Branch', 'Business District Branch', 'Residential Zone Branch'];

  const branches = sampleBranches.map((name, i) => {
    const project = projects[i % projects.length];
    const city = cities[i % cities.length];
    const chain = i < chains.length ? chains[i] : null;

    return branchRepository.create({
  name: 'Main Branch',
  geo: {
    lat: 31.137456290460786,
    lng: 33.81889064234188,
  },
      geofence_radius_meters: 500 + (i % 3) * 100,
      image_url: `https://via.placeholder.com/300x200?text=${encodeURIComponent(name)}`,
      project,
      city,
      chain,
    });
  });

  await branchRepository.save(branches);
  console.log('✅ Seeded branches successfully');
};

export const seedBrands = async (dataSource: DataSource) => {
  const brandRepository = dataSource.getRepository(Brand);

  const brands = [
    {
      name: 'Nike',
      description: 'Just Do It',
      logo_url: 'https://example.com/nike-logo.png',
    },
    {
      name: 'Adidas',
      description: 'Impossible is Nothing',
      logo_url: 'https://example.com/adidas-logo.png',
    },
    {
      name: 'Apple',
      description: 'Think Different',
      logo_url: 'https://example.com/apple-logo.png',
    },
    {
      name: 'Samsung',
      description: "Do What You Can't",
      logo_url: 'https://example.com/samsung-logo.png',
    },
    {
      name: 'Puma',
      description: 'Forever Faster',
      logo_url: 'https://example.com/puma-logo.png',
    },
  ];

  await brandRepository.save(brands);
  console.log('✅ Seeded brands successfully');
};

export const seedCategories = async (dataSource: DataSource) => {
  const categoryRepository = dataSource.getRepository(Category);

  const categories = [
    {
      name: 'Footwear',
      description: 'Shoes and related products',
    },
    {
      name: 'Electronics',
      description: 'Electronic devices and accessories',
    },
    {
      name: 'Apparel',
      description: 'Clothing items',
    },
    {
      name: 'Accessories',
      description: 'Fashion and tech accessories',
    },
    {
      name: 'Sports Equipment',
      description: 'Equipment for various sports',
    },
  ];

  await categoryRepository.save(categories);
  console.log('✅ Seeded categories successfully');
};

export const seedProducts = async (dataSource: DataSource) => {
  const productRepository = dataSource.getRepository(Product);
  const brandRepository = dataSource.getRepository(Brand);
  const categoryRepository = dataSource.getRepository(Category);

  const [brands, categories] = await Promise.all([brandRepository.find(), categoryRepository.find()]);

  const nike = brands.find(b => b.name === 'Nike');
  const adidas = brands.find(b => b.name === 'Adidas');
  const apple = brands.find(b => b.name === 'Apple');
  const samsung = brands.find(b => b.name === 'Samsung');

  const footwear = categories.find(c => c.name === 'Footwear');
  const electronics = categories.find(c => c.name === 'Electronics');
  const apparel = categories.find(c => c.name === 'Apparel');

  const products = [
    {
      name: 'Air Max 90',
      brand: nike,
      category: footwear,
      is_high_priority: true,
      image_url: 'https://example.com/airmax90.jpg',
    },
    {
      name: 'iPhone 13',
      brand: apple,
      category: electronics,
      is_high_priority: false,
      image_url: 'https://example.com/iphone13.jpg',
    },
    {
      name: 'Ultraboost 21',
      brand: adidas,
      category: footwear,
      is_high_priority: true,
      image_url: 'https://example.com/ultraboost.jpg',
    },
    {
      name: 'Galaxy S21',
      brand: samsung,
      category: electronics,
      is_high_priority: true,
      image_url: 'https://example.com/galaxys21.jpg',
    },
    {
      name: 'Dry-Fit T-Shirt',
      brand: nike,
      category: apparel,
      is_high_priority: false,
      image_url: 'https://example.com/dryfit-tshirt.jpg',
    },
  ];

  await productRepository.save(products);
  console.log('✅ Seeded products successfully');
};

export const seedStocks = async (dataSource: DataSource) => {
  const stockRepository = dataSource.getRepository(Stock);
  const productRepository = dataSource.getRepository(Product);
  const branchRepository = dataSource.getRepository(Branch);

  const [products, branches] = await Promise.all([productRepository.find(), branchRepository.find()]);

  const airMax = products.find(p => p.name === 'Air Max 90');
  const iphone = products.find(p => p.name === 'iPhone 13');
  const ultraboost = products.find(p => p.name === 'Ultraboost 21');
  const galaxy = products.find(p => p.name === 'Galaxy S21');
  const tshirt = products.find(p => p.name === 'Dry-Fit T-Shirt');

  const stocks = [
    {
      product: airMax,
      branch: branches[0], // First branch
      quantity: 50,
      model: '2023-AM90-WHITE',
    },
    {
      product: iphone,
      branch: branches[1], // Second branch
      quantity: 25,
      model: 'IP13-BLACK-128',
    },
    {
      product: ultraboost,
      branch: branches[0],
      quantity: 30,
      model: 'UB21-RED',
    },
    {
      product: galaxy,
      branch: branches[1],
      quantity: 20,
      model: 'GS21-GRAY-256',
    },
    {
      product: tshirt,
      branch: branches[0],
      quantity: 100,
      model: 'DFT-BLACK-M',
    },
  ];

  await stockRepository.save(stocks);
  console.log('✅ Seeded stocks successfully');
};
export const seedSuperAdminUser = async (dataSource: DataSource) => {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);

  const superAdminRole = await roleRepository.findOne({
    where: { name: ERole.SUPER_ADMIN },
  });

  const password = await argon.hash('123456');

  const superAdmin = userRepository.create({
    name: 'Super Admin',
    username: 'superadmin',
    password,
    role: superAdminRole,
  });

  await userRepository.save(superAdmin);
  console.log('✅ Seeded Super Admin user');

  return superAdmin;
};

export const seedProjectAdmin = async (
  dataSource: DataSource,
  project: Project,
  branch: Branch,
) => {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);

  const projectAdminRole = await roleRepository.findOne({
    where: { name: ERole.PROJECT_ADMIN },
  });

  const password = await argon.hash('123456');

  const projectAdmin = userRepository.create({
    name: 'Project Admin',
    username: 'projectadmin',
    password,
    role: projectAdminRole,

    project,
    project_id: project.id,
    branch,
  });

  await userRepository.save(projectAdmin);

  console.log('✅ Seeded Project Admin (owner + assigned to project & branch)');

  return projectAdmin;
};
export const seedProjectStaff = async (
  dataSource: DataSource,
  project: Project,
  branch: Branch,
) => {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);

  const supervisorRole = await roleRepository.findOne({
    where: { name: ERole.SUPERVISOR },
  });
  const promoterRole = await roleRepository.findOne({
    where: { name: ERole.PROMOTER },
  });

  const password = await argon.hash('123456');

  const users = [
    userRepository.create({
      name: 'Supervisor',
      username: 'supervisor',
      password,
      role: supervisorRole,
      project,
      project_id: project.id,
      branch,
    }),
    userRepository.create({
      name: 'Promoter',
      username: 'promoter',
      password,
      role: promoterRole,
      project,
      project_id: project.id,
      branch,
    }),
  ];

  await userRepository.save(users);
  console.log('✅ Seeded supervisor & promoter');
};
export const seedProjectAdminUserOnly = async (dataSource: DataSource) => {
  const userRepository = dataSource.getRepository(User);
  const roleRepository = dataSource.getRepository(Role);

  const role = await roleRepository.findOne({
    where: { name: ERole.PROJECT_ADMIN },
  });

  const password = await argon.hash('123456');

  const user = userRepository.create({
    name: 'Project Admin',
    username: 'projectadmin2',
    password,
    role,
  });

  await userRepository.save(user);
  return user;
};
export const seedProjectWithBranch = async (
  dataSource: DataSource,
  owner: User,
) => {
  const projectRepository = dataSource.getRepository(Project);
  const branchRepository = dataSource.getRepository(Branch);
  const cityRepository = dataSource.getRepository(City);
  const chainRepository = dataSource.getRepository(Chain);

  // 🟢 Create Project
  const project = projectRepository.create({
    name: 'Main Project',
    owner,
    image_url: 'https://via.placeholder.com/300x200?text=Main+Project',
  });

  await projectRepository.save(project);

  // 🟢 Create Branch
const city = await cityRepository.findOne({
  where: {},
});  const chain = await chainRepository.findOne({
  where:{}
});

  if (!city) throw new Error('⚠️ City required for branch');

  const branch = branchRepository.create({
    name: 'Main Branch',
  geo: {
    lat: 31.137456290460786,
    lng: 33.81889064234188,
  },    geofence_radius_meters: 500,
    project,
    city,
    chain,
    image_url: 'https://via.placeholder.com/300x200?text=Main+Branch',
  });

  await branchRepository.save(branch);

  console.log('✅ Seeded project + branch (owner = project admin)');

  return { project, branch };
};

async function runSeeder() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'], // Adjusted path
    synchronize: true,
  });

  try {
    await dataSource.initialize();
    // const tables = await dataSource.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'; `);
    // const tableNames = tables.map((t: { tablename: string }) => `"${t.tablename}"`).join(', ');

    // await dataSource.query(`TRUNCATE ${tableNames} RESTART IDENTITY CASCADE;`);

    // await seedRoles(dataSource);
    // await seedUsers(dataSource);

    // await seedPermissions(dataSource);
    // await seedPermissions(dataSource);
    // await seedRoles(dataSource);
    // await seedUsers(dataSource);

    // // Optional
    // await seedCountries(dataSource);
    // await seedRegions(dataSource);
    // await seedCities(dataSource);
    // await seedChains(dataSource);
		// await seedSuperAdminRole(dataSource);

    // await seedCountries(dataSource);
    // await seedRegions(dataSource);
    // await seedCities(dataSource);
    // await seedChains(dataSource);

    // await seedProjects(dataSource);
    // await seedBranches(dataSource);


    // await seedPermissions(dataSource);
    // await seedRoles(dataSource);

    // // Locations
    // await seedCountries(dataSource);
    // await seedRegions(dataSource);
    // await seedCities(dataSource);
    // await seedChains(dataSource);

    // // Users
    // await seedSuperAdminUser(dataSource);
    // const projectAdmin = await seedProjectAdminUserOnly(dataSource);

    // // Project + Branch
    // const { project, branch } = await seedProjectWithBranch(
    //   dataSource,
    //   projectAdmin,
    // );

    // // Assign project & branch to admin
    // await seedProjectAdmin(dataSource, project, branch);

    // // Staff
    // await seedProjectStaff(dataSource, project, branch);

    // // Surveys
    // await seedSurveys(dataSource);
    // await seedSurveyFeedbacks(dataSource);
    
    // Only running Roaming Seeder as requested
    await seedRoaming(dataSource);

    console.log('✅ Seeding completed successfully!');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

runSeeder();
