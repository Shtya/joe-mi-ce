/* Run from the backend directory. Requires an approved external JSON payload.
 * Default is a fully verified transaction that is rolled back. --apply commits.
 * No credentials are embedded in this script or printed in its output. */
const fs = require("fs");
const crypto = require("crypto");
const assert = require("assert/strict");
const { Client } = require("pg");
const argon2 = require("argon2");
require("dotenv").config({ quiet: true });

const PROJECT = "7ea269b3-058f-4475-a162-989823e78205";
const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];
const TABLES = new Set([
  "countries",
  "regions",
  "cities",
  "chains",
  "branches",
  "brands",
  "categories",
  "products",
  "users",
  "shifts",
  "journey_plans",
  "journeys",
]);
const payloadPath = process.env.INATURAL_IMPORT_FILE;
const apply = process.argv.includes("--apply");
const backupPath = process.env.INATURAL_BACKUP_MANIFEST;
const qid = (value) => {
  if (!/^[A-Za-z_][A-Za-z_0-9]*$/.test(value))
    throw new Error("Invalid identifier");
  return '"' + value + '"';
};

async function run() {
  if (!payloadPath || !backupPath)
    throw new Error(
      "Approved payload and verified backup manifest paths are required",
    );
  const input = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  // The uploaded roster contains sequence numbers and names, never passwords.
  // Generate the user's approved login/password pattern on the destination only.
  for (const user of input.users) {
    assert.ok(
      Number.isInteger(user.sequence) &&
        user.sequence >= 1 &&
        user.sequence <= 38,
    );
    user.username = "inat#" + user.sequence;
    user.initial_password_preview = user.username;
  }
  assert.equal(input.existing_project.id, PROJECT);
  assert.equal(input.locations.length, 27);
  assert.equal(input.users.length, 38);
  assert.equal(input.products.length, 24);
  assert.equal(
    input.users.reduce((n, u) => n + u.shift_keys.length, 0),
    60,
  );
  assert.equal(new Set(input.users.map((u) => u.username)).size, 38);
  for (const u of input.users) {
    assert.equal(u.username, "inat#" + u.sequence);
    assert.equal(u.initial_password_preview, u.username);
  }
  for (const l of input.locations) {
    assert.ok(
      Number.isFinite(l.resolution.lat) && Number.isFinite(l.resolution.lng),
    );
    assert.ok(
      Math.abs(l.resolution.lat) <= 90 && Math.abs(l.resolution.lng) <= 180,
    );
  }
  assert.ok(
    Date.now() - Date.parse(backup.created_at) < 24 * 60 * 60 * 1000,
    "Backup is older than 24 hours",
  );
  assert.equal(fs.statSync(backup.path).size, backup.bytes);
  const sha = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(backup.path)) sha.update(chunk);
  assert.equal(
    sha.digest("hex"),
    backup.sha256,
    "Backup checksum does not match",
  );

  const c = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT || 5432),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    application_name: "inatural_approved_import",
    connectionTimeoutMillis: 15000,
  });
  const created = {},
    reused = {};
  async function ensure(table, where, values) {
    assert.ok(TABLES.has(table));
    const keys = Object.keys(where),
      params = Object.values(where);
    const found = await c.query(
      `SELECT * FROM ${qid(table)} WHERE ${keys.map((k, i) => qid(k) + "=$" + (i + 1)).join(" AND ")}`,
      params,
    );
    assert.ok(found.rows.length <= 1, `Ambiguous ${table} identity`);
    if (found.rows.length) {
      assert.ok(
        !found.rows[0].deleted_at,
        `Refusing to reuse deleted ${table}`,
      );
      reused[table] = (reused[table] || 0) + 1;
      return found.rows[0];
    }
    const fields = { ...where, ...values };
    const columns = Object.keys(fields);
    const inserted = await c.query(
      `INSERT INTO ${qid(table)} (${columns.map(qid).join(",")}) VALUES (${columns.map((_, i) => "$" + (i + 1)).join(",")}) RETURNING *`,
      Object.values(fields),
    );
    created[table] = (created[table] || 0) + 1;
    return inserted.rows[0];
  }
  try {
    await c.connect();
    await c.query("BEGIN");
    await c.query("SET LOCAL lock_timeout='10s'");
    await c.query("SET LOCAL statement_timeout='30s'");
    await c.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "inatural-import:" + PROJECT,
    ]);
    const project = (
      await c.query(
        "SELECT * FROM project WHERE id=$1 AND deleted_at IS NULL FOR UPDATE",
        [PROJECT],
      )
    ).rows[0];
    assert.ok(
      project && project.is_active && project.name === "Inatural",
      "Wrong or inactive target project",
    );
    const owner = (
      await c.query("SELECT id,username FROM users WHERE id=$1", [
        project.owner_id,
      ])
    ).rows[0];
    assert.equal(owner.username, "Inatural13");
    const roles = await c.query(
      "SELECT id FROM roles WHERE name='promoter' AND deleted_at IS NULL",
    );
    assert.equal(roles.rows.length, 1);
    const roleId = roles.rows[0].id;
    // Geography is reused only under its correct parent. Unrelated legacy city
    // rows with missing regions are left intact instead of being rewritten.
    const country = await ensure("countries", { name: "Saudi Arabia" }, {});
    const regionNames = { ER: "Eastern", WR: "Western", CR: "Central" },
      regionIds = new Map(),
      cityIds = new Map(),
      chainIds = new Map(),
      branchIds = new Map();
    for (const l of input.locations) {
      if (!regionIds.has(l.region)) {
        const region = await ensure(
          "regions",
          { name: regionNames[l.region], countryId: country.id },
          {},
        );
        regionIds.set(l.region, region.id);
      }
      const cityKey = l.region + ":" + l.city;
      if (!cityIds.has(cityKey)) {
        const city = await ensure(
          "cities",
          { name: l.city, regionId: regionIds.get(l.region) },
          {},
        );
        cityIds.set(cityKey, city.id);
      }
      if (!chainIds.has(l.chain)) {
        assert.ok(l.chain && !l.chain.toLowerCase().includes("roaming"));
        const chain = await ensure(
          "chains",
          { name: l.chain, projectId: PROJECT },
          {},
        );
        chainIds.set(l.chain, chain.id);
      }
      const branch = await ensure(
        "branches",
        { name: l.arabic, projectId: PROJECT },
        {
          code: "INAT-" + String(l.row - 8).padStart(2, "0"),
          geo: JSON.stringify({ lat: l.resolution.lat, lng: l.resolution.lng }),
          geofence_radius_meters: 300,
          cityId: cityIds.get(cityKey),
          chainId: chainIds.get(l.chain),
          autoCreateSalesTargets: false,
        },
      );
      assert.equal(branch.geofence_radius_meters, 300);
      assert.equal(branch.geo.lat, l.resolution.lat);
      assert.equal(branch.geo.lng, l.resolution.lng);
      branchIds.set(l.row, branch.id);
    }
    const brand = await ensure(
      "brands",
      { name: "inatural", project_id: PROJECT },
      { ownerUserId: owner.id },
    );
    const categoryIds = new Map();
    for (const p of input.products) {
      if (!categoryIds.has(p.category)) {
        const category = await ensure(
          "categories",
          { name: p.category, project_id: PROJECT },
          { ownerUserId: owner.id },
        );
        categoryIds.set(p.category, category.id);
      }
      const categoryId = categoryIds.get(p.category);
      await c.query(
        "INSERT INTO brand_categories (brand_id,category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
        [brand.id, categoryId],
      );
      const product = await ensure(
        "products",
        { name: p.name, project_id: PROJECT },
        {
          price: Number(p.original_price),
          discount: Number(p.discount_percent),
          brand_id: brand.id,
          category_id: categoryId,
          is_active: true,
        },
      );
      assert.equal(Number(product.price), Number(p.original_price));
      assert.equal(Number(product.discount), Number(p.discount_percent));
      assert.equal(product.brand_id, brand.id);
      assert.equal(product.category_id, categoryId);
      assert.equal(
        Math.round(
          Number(product.price) * (1 - Number(product.discount) / 100) * 100,
        ) / 100,
        Number(p.target_price),
      );
      for (const branchId of branchIds.values())
        await c.query(
          "INSERT INTO product_branches (product_id,branch_id) VALUES ($1,$2) ON CONFLICT DO NOTHING",
          [product.id, branchId],
        );
    }
    const shiftIds = new Map();
    for (const s of input.proposed_shifts) {
      const shift = await ensure(
        "shifts",
        { name: s.name, project_id: PROJECT },
        { startTime: s.start_time, endTime: s.end_time },
      );
      assert.equal(shift.startTime.slice(0, 5), s.start_time);
      assert.equal(shift.endTime.slice(0, 5), s.end_time);
      shiftIds.set(s.key, shift.id);
    }
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    for (const u of input.users) {
      const branchId = branchIds.get(
        u.branch_source_row ?? u.proposed_branch_source_row,
      );
      assert.ok(branchId, "Missing planned branch");
      const old = await c.query(
        "SELECT id,name,project_id,username,password,deleted_at FROM users WHERE lower(username)=lower($1)",
        [u.username],
      );
      assert.ok(old.rows.length <= 1, "Ambiguous username");
      let user;
      if (old.rows.length) {
        user = old.rows[0];
        assert.equal(
          user.project_id,
          PROJECT,
          "Username belongs to another project",
        );
        assert.equal(user.name, u.name);
        assert.ok(!user.deleted_at);
        assert.ok(
          await argon2.verify(user.password, u.initial_password_preview),
          "Existing password differs; refusing to reset",
        );
        reused.users = (reused.users || 0) + 1;
      } else {
        user = await ensure(
          "users",
          { username: u.username },
          {
            password: await argon2.hash(u.initial_password_preview),
            name: u.name,
            project_id: PROJECT,
            roleId,
            branchId,
            manager_id: owner.id,
            created_by_id: owner.id,
            is_active: true,
            mobile: null,
            brandAssignmentMode: "all",
          },
        );
        assert.ok(
          await argon2.verify(user.password, u.initial_password_preview),
        );
      }
      for (const key of u.shift_keys) {
        const shiftId = shiftIds.get(key);
        assert.ok(shiftId);
        const plan = await ensure(
          "journey_plans",
          { projectId: PROJECT, userId: user.id, branchId, shiftId },
          { days: DAYS, createdById: owner.id, is_active: true },
        );
        assert.deepEqual([...plan.days].sort(), [...DAYS].sort());
        assert.ok(plan.is_active);
        await ensure(
          "journeys",
          {
            projectId: PROJECT,
            userId: user.id,
            shiftId,
            date,
            journeyPlanId: plan.id,
          },
          {
            branchId,
            type: "planned",
            status: "absent",
            createdById: owner.id,
            is_active: true,
          },
        );
      }
    }
    const expected = {
      branches: 27,
      products: 24,
      categories: 7,
      brands: 1,
      shifts: 3,
      journey_plans: 60,
      users: 39,
    };
    const counts = {};
    for (const [table, total] of Object.entries(expected)) {
      const projectCol = [
        "users",
        "products",
        "categories",
        "brands",
        "shifts",
      ].includes(table)
        ? "project_id"
        : "projectId";
      const result = await c.query(
        `SELECT count(*)::int AS n FROM ${qid(table)} WHERE ${qid(projectCol)}=$1 AND deleted_at IS NULL`,
        [PROJECT],
      );
      counts[table] = result.rows[0].n;
      assert.equal(counts[table], total, `${table} count differs`);
    }
    const links = await c.query(
      "SELECT count(*)::int AS n FROM product_branches pb JOIN products p ON p.id=pb.product_id WHERE p.project_id=$1",
      [PROJECT],
    );
    assert.equal(links.rows[0].n, 648);
    const journeys = await c.query(
      'SELECT count(*)::int AS n FROM journeys WHERE "projectId"=$1 AND date=$2 AND deleted_at IS NULL',
      [PROJECT, date],
    );
    assert.equal(journeys.rows[0].n, 60);
    await c.query(apply ? "COMMIT" : "ROLLBACK");
    console.log(
      JSON.stringify({
        mode: apply ? "committed" : "dry_run_rolled_back",
        projectId: PROJECT,
        created,
        reused,
        counts,
        productBranchLinks: 648,
        journeysForDate: 60,
        date,
        timezone: "Asia/Riyadh",
        days: DAYS,
        backup: backup.path,
      }),
    );
  } catch (error) {
    await c.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await c.end();
  }
}
run().catch((error) => {
  console.error(JSON.stringify({ error: error.message }));
  process.exitCode = 1;
});
