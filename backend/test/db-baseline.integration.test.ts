import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client, Pool } from 'pg';

import { readMigrations } from '../src/standard/migrations.js';
import { migrate, url } from './db-helpers.js';
import { withApi } from './helpers.js';

// Requires a dedicated test DB with database/migrations applied. Skipped (not passed) without it.
test(
  'baseline schema is applied and health answers against the real database',
  { skip: !url, timeout: 30_000 },
  async (t) => {
    const pool = new Pool({ connectionString: url });
    t.after(() => pool.end());
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'app_settings'",
    );
    assert.equal(tables.rowCount, 1, 'Apply database/migrations/001_initial.sql to the test DB');
    await withApi(pool, async (call) => {
      const { status, data } = await call('/api/health');
      assert.equal(status, 200);
      assert.equal(data.ok, true);
    });
  },
);

const migrationsDirectory = fileURLToPath(new URL('../../database/migrations', import.meta.url));

test(
  'the migration runner fills an empty database, then applies only what is new',
  { skip: !url, timeout: 60_000 },
  async () => {
    // A schema of its own is an empty database as far as the migrations can tell.
    const schema = 'migrate_runner_test';
    const admin = new Pool({ connectionString: url, max: 1 });
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const client = new Client({ connectionString: url, options: `-c search_path=${schema}` });
    await client.connect();
    try {
      const files = await readMigrations(migrationsDirectory);
      const applied = await migrate(client, files);
      assert.deepEqual(
        applied,
        files.map((file) => file.name),
      );
      const created = await admin.query(
        'SELECT table_name FROM information_schema.tables WHERE table_schema = $1',
        [schema],
      );
      const names = created.rows.map((row: { table_name: string }) => row.table_name);
      for (const table of [
        'app_settings',
        'routines',
        'twelve_week_goal_routines',
        'plans',
        'plan_routines',
      ])
        assert.ok(names.includes(table), table);

      // A later run applies nothing, so a seeded item the user renamed does not come back.
      await client.query("UPDATE routines SET name = 'Renamed' WHERE name = '목표 재설정'");
      assert.deepEqual(await migrate(client, files), []);
      const seeded = await client.query("SELECT 1 FROM routines WHERE name = '목표 재설정'");
      assert.equal(seeded.rowCount, 0);

      // A database brought up without history (Docker's first run) gets every file recorded.
      await client.query('DROP TABLE schema_migrations');
      const again = await migrate(client, files);
      assert.equal(again.length, files.length);
    } finally {
      await client.end();
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
  },
);
