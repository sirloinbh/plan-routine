import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool } from 'pg';

import { anchorSettingKey, routineAnchorDate } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

const routinesMigration = new URL('../../database/migrations/002_routines.sql', import.meta.url);

test(
  'routines migration re-runs safely and enforces routine and check rules',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(routinesMigration, 'utf8'));
      // Each rule runs in a rolled-back transaction so the test DB keeps no rows.
      const rejects = async (sql: string, code: string) => {
        await client.query('BEGIN');
        try {
          const { rows } = await client.query<{ id: number }>(
            "INSERT INTO routines (name, cadence, category) VALUES ('Wake up', 'daily', 'wake') RETURNING id",
          );
          await client.query(
            "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')",
            [rows[0].id],
          );
          await assert.rejects(client.query(sql.replaceAll(':id', String(rows[0].id))), { code });
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("INSERT INTO routines (name, cadence) VALUES ('Exercise', 'daily')", '23514');
      await rejects(
        "INSERT INTO routines (name, cadence, category) VALUES ('Clean', 'weekly', 'housework')",
        '23514',
      );
      await rejects("INSERT INTO routines (name, cadence) VALUES ('  ', 'weekly')", '23514');
      await rejects("INSERT INTO routines (name, cadence) VALUES ('Monthly', 'monthly')", '23514');
      await rejects(
        "INSERT INTO routine_checks (routine_id, period_start) VALUES (:id, '2026-10-22')",
        '23505',
      );
      await rejects('DELETE FROM routines WHERE id = :id', '23503');
    }),
);

test(
  'the first-use date is stored once and kept on later calls',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        const db = client as unknown as Pool;
        assert.equal(await routineAnchorDate(db, '2026-10-22'), '2026-10-22');
        assert.equal(await routineAnchorDate(db, '2026-11-20'), '2026-10-22');
      } finally {
        await client.query('ROLLBACK');
      }
    }),
);

test('a later anchor-date call does not write the row', { skip: !url, timeout: 30_000 }, () =>
  withClient(async (client) => {
    await client.query('BEGIN');
    try {
      await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
      const db = client as unknown as Pool;
      await routineAnchorDate(db, '2026-10-22');
      const xmin = () =>
        client.query<{ xmin: string }>('SELECT xmin::text FROM app_settings WHERE key = $1', [
          anchorSettingKey,
        ]);
      const before = (await xmin()).rows[0].xmin;
      await routineAnchorDate(db, '2026-11-20');
      assert.equal((await xmin()).rows[0].xmin, before);
    } finally {
      await client.query('ROLLBACK');
    }
  }),
);

test('simultaneous first calls agree on one first-use date', { skip: !url, timeout: 30_000 }, () =>
  withClient(async (client, pool) => {
    // Separate connections cannot share a rolled-back transaction, so restore the original row.
    const original = await client.query<{ value: string }>(
      'SELECT value FROM app_settings WHERE key = $1',
      [anchorSettingKey],
    );
    await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
    try {
      // One connection is held here, so the pool's other three run the calls concurrently.
      const dates = await Promise.all(
        ['2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'].map((today) =>
          routineAnchorDate(pool, today),
        ),
      );
      assert.equal(new Set(dates).size, 1);
    } finally {
      await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
      if (original.rows[0])
        await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
          anchorSettingKey,
          original.rows[0].value,
        ]);
    }
  }),
);

test(
  'daily routines are added, renamed, reordered and archived against the real DB',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: number[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            for (const name of ['Wake at 6', 'Drink water', 'Stretch']) {
              const { status, data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'wake' },
              });
              assert.equal(status, 201);
              created.push((data.routine as { id: number }).id);
            }
            const names = async () => {
              const { data } = await call('/api/routines?cadence=daily');
              return (data.routines as { id: number; name: string }[])
                .filter((routine) => created.includes(routine.id))
                .map((routine) => routine.name);
            };
            assert.deepEqual(await names(), ['Wake at 6', 'Drink water', 'Stretch']);
            // Adding a routine records the first-use date (or keeps an existing one).
            const anchor = await client.query<{ value: string }>(
              'SELECT value FROM app_settings WHERE key = $1',
              [anchorSettingKey],
            );
            assert.equal(anchor.rows[0]?.value, original.rows[0]?.value ?? '2026-10-22');

            const moved = await call(`/api/routines/${created[2]}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.equal(moved.status, 200);
            assert.deepEqual(await names(), ['Wake at 6', 'Stretch', 'Drink water']);
            // Moving the first item up leaves the order unchanged.
            await call(`/api/routines/${created[0]}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.deepEqual(await names(), ['Wake at 6', 'Stretch', 'Drink water']);

            const renamed = await call(`/api/routines/${created[0]}`, {
              method: 'PATCH',
              body: { name: 'Wake at 6:30' },
            });
            assert.equal(renamed.status, 200);

            await client.query(
              "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')",
              [created[1]],
            );
            const archived = await call(`/api/routines/${created[1]}/archive`, { method: 'POST' });
            assert.equal(archived.status, 200);
            assert.deepEqual(await names(), ['Wake at 6:30', 'Stretch']);
            // The archived routine keeps its check and can no longer be changed.
            const checks = await client.query(
              'SELECT 1 FROM routine_checks WHERE routine_id = $1',
              [created[1]],
            );
            assert.equal(checks.rowCount, 1);
            const again = await call(`/api/routines/${created[1]}/move`, {
              method: 'POST',
              body: { direction: 'down' },
            });
            assert.equal(again.status, 404);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM routine_checks WHERE routine_id = ANY($1::bigint[])', [
          created,
        ]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [created]);
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        if (original.rows[0])
          await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
            anchorSettingKey,
            original.rows[0].value,
          ]);
      }
    }),
);

test(
  'rows with the same order value come in number order, past where digits run out',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      // As text, 1000000 would sort before 999999. Ids are set so the test does not depend on
      // how far the sequences have run; the sequences themselves are left alone.
      const ids = Array.from({ length: 11 }, (_, index) => 999_995 + index);
      try {
        await client.query(
          `INSERT INTO routines (id, name, cadence, sort_order) OVERRIDING SYSTEM VALUE
           SELECT n, 'Sort ' || n, 'weekly', 0 FROM unnest($1::bigint[]) AS n`,
          [ids],
        );
        await withApi(
          pool,
          async (call) => {
            const inOrder = (rows: unknown) =>
              (rows as { id: number }[]).map((row) => row.id).filter((id) => ids.includes(id));

            const list = await call('/api/routines?cadence=weekly');
            assert.deepEqual(inOrder(list.data.routines), ids);

            const checklist = await call('/api/checklist?cadence=weekly&date=2026-10-22');
            assert.deepEqual(inOrder(checklist.data.items), ids);

            const before = (await call('/api/goals')).data.current as {
              period: { start: string };
            };
            const periodStart = before.period.start;
            await client.query(
              `INSERT INTO plans (id, horizon, period_start, title, sort_order)
               OVERRIDING SYSTEM VALUE
               SELECT n, 'twelve_week', $2::date, 'Sort ' || n, 0 FROM unnest($1::bigint[]) AS n`,
              [ids, periodStart],
            );
            const goals = await call('/api/goals');
            const { goals: current } = goals.data.current as { goals: unknown };
            assert.deepEqual(inOrder(current), ids);

            // Moving down from 999999 swaps it with 1000000, its neighbour by number.
            const moved = await call('/api/routines/999999/move', {
              method: 'POST',
              body: { direction: 'down' },
            });
            assert.equal(moved.status, 200);
            const after = await call('/api/routines?cadence=weekly');
            assert.deepEqual(inOrder(after.data.routines), [
              ...ids.slice(0, 4),
              1000000,
              999999,
              ...ids.slice(6),
            ]);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM plans WHERE id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        if (original.rows[0])
          await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
            anchorSettingKey,
            original.rows[0].value,
          ]);
      }
    }),
);
