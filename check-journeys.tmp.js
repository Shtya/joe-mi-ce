/* Read-only investigation: why supervisor/all rows were null on 2026-08-16 */
require("dotenv").config();
const { Client } = require("pg");

const planIds = [
  "191ecd67-7a53-4074-8409-904e2d4b89d2",
  "245f310a-d23b-4e4f-8b50-14b3734d4737",
  "b99b0ee2-95c7-4282-b850-a654a83da002",
  "18f77b7a-201e-4e33-8589-4114cdbbdca9",
  "f7d06260-5d70-4833-946a-cdbb99db5a41",
  "5095068e-b1ab-4994-818b-4e51d455826b",
  "e28b8d34-d8e4-4e08-8534-1f2db02a907d",
  "6844ef47-317d-4483-9c44-8a968eeac91c",
];
const promoterIds = [
  "fcf70dc9-b81e-4f38-92e2-55093a7ff1c3",
  "9b92e0a8-83bf-4b3d-b6fe-e75c3e3cdff3",
  "db98c709-2152-4d1a-9589-eb0bf10f208d",
  "dcdc7886-3e64-4fec-a1ce-1f9b3f727439",
  "8f635b63-c1b1-4318-afc7-676f34e40fe2",
  "5bab0748-f853-4043-9205-4a8323c38006",
  "d5d55c46-ec5a-42a3-b73b-431316142d87",
  "1a0ef1d6-f071-476a-b9eb-97182418c172",
  "eddd3f36-b6f7-429f-8dbb-86d7f9b71ad5",
  "d5437fd8-be71-4236-b868-223eedce9563",
];

(async () => {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT, 10),
    user: process.env.DATABASE_USER,
    password: String(process.env.DATABASE_PASSWORD || ""),
    database: process.env.DATABASE_NAME,
  });
  await client.connect();

  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema='public' AND (table_name ILIKE '%journey%' OR table_name ILIKE '%plan%' OR table_name ILIKE '%user%' OR table_name ILIKE '%checkin%')`
  );
  console.log("TABLES:", tables.rows.map((r) => r.table_name).join(", "));

  const planCols = await client.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='journey_plan' ORDER BY ordinal_position`
  ).catch(() => ({ rows: [] }));
  if (planCols.rows.length)
    console.log("journey_plan cols:", planCols.rows.map((r) => r.column_name).join(", "));
  await client.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
