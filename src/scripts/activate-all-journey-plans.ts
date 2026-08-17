import "reflect-metadata";
import * as dotenv from "dotenv";
dotenv.config();

import { DataSource } from "typeorm";

const run = async () => {
  const dataSource = new DataSource({
    type: "postgres",
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || "5432", 10),
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    entities: [__dirname + "/../../entities/**/*.entity{.ts,.js}"],
    synchronize: false,
  });

  await dataSource.initialize();

  try {
    const result = await dataSource
      .createQueryBuilder()
      .update("journey_plans")
      .set({ is_active: true })
      .where("is_active = :isActive", { isActive: false })
      .execute();

    console.log(`Activated ${result.affected ?? 0} journey plan(s).`);
  } catch (error) {
    console.error("Failed to activate journey plans:", error);
    process.exitCode = 1;
  } finally {
    await dataSource.destroy();
  }
};

run();
