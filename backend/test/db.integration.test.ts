import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { Pool, type PoolClient } from 'pg';

import { anchorSettingKey, routineAnchorDate } from '../src/routines.js';
import { withApi } from './helpers.js';

const url = process.env.TEST_DATABASE_URL;

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

const routinesMigration = new URL('../../database/migrations/002_routines.sql', import.meta.url);

// Cleanup lives in finally blocks: pool.end() waits for checked-out clients, so it must run
// after release() regardless of hook order.
async function withClient(run: (client: PoolClient, pool: Pool) => Promise<void>) {
  const pool = new Pool({ connectionString: url, max: 4 });
  try {
    const client = await pool.connect();
    try {
      await run(client, pool);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

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
          const { rows } = await client.query<{ id: string }>(
            "INSERT INTO routines (name, cadence, category) VALUES ('기상', 'daily', 'wake') RETURNING id",
          );
          await client.query(
            "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')",
            [rows[0].id],
          );
          await assert.rejects(client.query(sql.replaceAll(':id', rows[0].id)), { code });
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("INSERT INTO routines (name, cadence) VALUES ('운동', 'daily')", '23514');
      await rejects(
        "INSERT INTO routines (name, cadence, category) VALUES ('청소', 'weekly', 'housework')",
        '23514',
      );
      await rejects("INSERT INTO routines (name, cadence) VALUES ('  ', 'weekly')", '23514');
      await rejects("INSERT INTO routines (name, cadence) VALUES ('월간', 'monthly')", '23514');
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
  'checks persist, never duplicate, and leave the checklist with an archived routine',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: string[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            for (const name of ['체크 대상', '체크 안 함']) {
              const { data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'care' },
              });
              created.push((data.routine as { id: string }).id);
            }
            const [target, other] = created;
            const checked = async (date: string) => {
              const { status, data } = await call(`/api/checklist?date=${date}`);
              assert.equal(status, 200);
              return (data.items as { id: string; checked: boolean }[])
                .filter((item) => created.includes(item.id))
                .map((item) => [item.id, item.checked]);
            };
            const checkRows = async () =>
              (
                await client.query<{ period_start: string }>(
                  'SELECT period_start FROM routine_checks WHERE routine_id = $1 ORDER BY 1',
                  [target],
                )
              ).rows.map((row) => row.period_start);

            assert.deepEqual(await checked('2026-10-22'), [
              [target, false],
              [other, false],
            ]);
            // Repeating a check and two simultaneous checks still store one row.
            const path = `/api/routines/${target}/checks/2026-10-22`;
            assert.equal((await call(path, { method: 'PUT' })).status, 200);
            assert.equal((await call(path, { method: 'PUT' })).status, 200);
            const both = await Promise.all([
              call(`/api/routines/${target}/checks/2026-10-21`, { method: 'PUT' }),
              call(`/api/routines/${target}/checks/2026-10-21`, { method: 'PUT' }),
            ]);
            assert.deepEqual(
              both.map((response) => response.status),
              [200, 200],
            );
            assert.deepEqual(await checkRows(), ['2026-10-21', '2026-10-22']);
            assert.deepEqual(await checked('2026-10-22'), [
              [target, true],
              [other, false],
            ]);
            // Each day has its own check; unchecking twice is the same as once.
            assert.equal((await call(path, { method: 'DELETE' })).status, 200);
            assert.equal((await call(path, { method: 'DELETE' })).status, 200);
            assert.deepEqual(await checkRows(), ['2026-10-21']);
            assert.deepEqual(await checked('2026-10-21'), [
              [target, true],
              [other, false],
            ]);
            // The archived routine leaves the checklist, keeps its check and refuses changes.
            await call(`/api/routines/${target}/archive`, { method: 'POST' });
            assert.deepEqual(await checked('2026-10-21'), [[other, false]]);
            assert.deepEqual(await checkRows(), ['2026-10-21']);
            assert.equal((await call(path, { method: 'PUT' })).status, 404);
            assert.deepEqual(await checkRows(), ['2026-10-21']);
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

const diaryMigration = new URL('../../database/migrations/003_diary.sql', import.meta.url);

test(
  'diary migration re-runs safely and its table enforces the limits',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(diaryMigration, 'utf8'));
      const rejects = async (values: string) => {
        await client.query('BEGIN');
        try {
          await assert.rejects(
            client.query(
              `INSERT INTO diary_entries (entry_date, body, good_note) VALUES ${values}`,
            ),
            { code: '23514' },
          );
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("('2001-02-03', '   ', NULL)");
      await rejects("('2001-02-03', repeat('a', 5001), NULL)");
      await rejects("('2001-02-03', 'a', repeat('a', 1001))");
    }),
);

test(
  'one diary entry per day: saving again updates it, also when saved at the same time',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: string[] = [];
      const dates = ['2026-10-22', '2026-10-21', '2001-02-03'];
      try {
        await withApi(
          pool,
          async (call) => {
            const empty = await call('/api/diary?date=2026-10-22');
            assert.equal(empty.status, 200);
            assert.equal(empty.data.entry, null);

            const path = '/api/diary/2026-10-22';
            const first = await call(path, {
              method: 'PUT',
              body: { body: ' 첫 글 ', goodNote: '잘한 점', regretNote: '  ' },
            });
            assert.equal(first.status, 200);
            assert.deepEqual(first.data.entry, {
              date: '2026-10-22',
              body: '첫 글',
              goodNote: '잘한 점',
              regretNote: null,
              tomorrowNote: null,
            });

            const second = await call(path, { method: 'PUT', body: { body: '고친 글' } });
            assert.equal(second.status, 200);
            const reread = await call('/api/diary?date=2026-10-22');
            assert.equal((reread.data.entry as { body: string }).body, '고친 글');
            // Saving without a note clears the note it had.
            assert.equal((reread.data.entry as { goodNote: unknown }).goodNote, null);

            const both = await Promise.all(
              ['동시 저장 1', '동시 저장 2'].map((text) =>
                call(path, { method: 'PUT', body: { body: text } }),
              ),
            );
            assert.deepEqual(
              both.map((response) => response.status),
              [200, 200],
            );
            const rows = await client.query('SELECT 1 FROM diary_entries WHERE entry_date = $1', [
              '2026-10-22',
            ]);
            assert.equal(rows.rowCount, 1);

            // Each day has its own entry, and past days have no time limit.
            for (const date of ['2026-10-21', '2001-02-03']) {
              const past = await call(`/api/diary/${date}`, {
                method: 'PUT',
                body: { body: date },
              });
              assert.equal(past.status, 200);
            }
            const yesterday = await call('/api/diary?date=2026-10-21');
            assert.equal((yesterday.data.entry as { body: string }).body, '2026-10-21');

            // The progress counts active daily routines and that day's checks only.
            const baseline = (await call('/api/diary?date=2026-10-22')).data.progress as {
              checked: number;
              total: number;
            };
            for (const name of ['일기 진행률 1', '일기 진행률 2']) {
              const { data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'care' },
              });
              created.push((data.routine as { id: string }).id);
            }
            await call(`/api/routines/${created[0]}/checks/2026-10-22`, { method: 'PUT' });
            await call(`/api/routines/${created[1]}/checks/2026-10-21`, { method: 'PUT' });
            assert.deepEqual((await call('/api/diary?date=2026-10-22')).data.progress, {
              checked: baseline.checked + 1,
              total: baseline.total + 2,
            });
            await call(`/api/routines/${created[0]}/archive`, { method: 'POST' });
            assert.deepEqual((await call('/api/diary?date=2026-10-22')).data.progress, {
              checked: baseline.checked,
              total: baseline.total + 1,
            });
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM diary_entries WHERE entry_date = ANY($1)', [dates]);
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
  'daily routines are added, renamed, reordered and archived against the real DB',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: string[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            for (const name of ['6시 기상', '물 한 잔', '스트레칭']) {
              const { status, data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'wake' },
              });
              assert.equal(status, 201);
              created.push((data.routine as { id: string }).id);
            }
            const names = async () => {
              const { data } = await call('/api/routines?cadence=daily');
              return (data.routines as { id: string; name: string }[])
                .filter((routine) => created.includes(routine.id))
                .map((routine) => routine.name);
            };
            assert.deepEqual(await names(), ['6시 기상', '물 한 잔', '스트레칭']);
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
            assert.deepEqual(await names(), ['6시 기상', '스트레칭', '물 한 잔']);
            // Moving the first item up leaves the order unchanged.
            await call(`/api/routines/${created[0]}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.deepEqual(await names(), ['6시 기상', '스트레칭', '물 한 잔']);

            const renamed = await call(`/api/routines/${created[0]}`, {
              method: 'PATCH',
              body: { name: '6시 30분 기상' },
            });
            assert.equal(renamed.status, 200);

            await client.query(
              "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2026-10-22')",
              [created[1]],
            );
            const archived = await call(`/api/routines/${created[1]}/archive`, { method: 'POST' });
            assert.equal(archived.status, 200);
            assert.deepEqual(await names(), ['6시 30분 기상', '스트레칭']);
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
