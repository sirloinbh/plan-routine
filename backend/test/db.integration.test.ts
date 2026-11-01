import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { Client, Pool, type PoolClient } from 'pg';

import { migrate, readMigrations } from '../src/migrations.js';
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

// Returns once a request on another connection is waiting for this connection's lock, so the test
// does not depend on timing. A request that never waits is what the test is there to catch.
async function waitUntilBlockedBy(pool: Pool, pid: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const { rowCount } = await pool.query(
      'SELECT 1 FROM pg_stat_activity WHERE $1 = ANY(pg_blocking_pids(pid))',
      [pid],
    );
    if (rowCount) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail('The check request did not wait for the uncommitted archive');
}

test(
  'a check waiting for an uncommitted archive gets a 404 and stores nothing',
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
            const { data } = await call('/api/routines', {
              method: 'POST',
              body: { name: '보관과 체크 경합', cadence: 'daily', category: 'care' },
            });
            const id = (data.routine as { id: string }).id;
            created.push(id);
            const { rows } = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');

            await client.query('BEGIN');
            let answer: ReturnType<typeof call> | undefined;
            try {
              await client.query('UPDATE routines SET archived_at = now() WHERE id = $1', [id]);
              answer = call(`/api/routines/${id}/checks/2026-10-22`, { method: 'PUT' });
              await waitUntilBlockedBy(pool, rows[0].pid);
              await client.query('COMMIT');
            } catch (error) {
              await client.query('ROLLBACK').catch(() => {});
              await answer?.catch(() => {});
              throw error;
            }

            assert.equal((await answer).status, 404);
            const checks = await client.query(
              'SELECT 1 FROM routine_checks WHERE routine_id = $1',
              [id],
            );
            assert.equal(checks.rowCount, 0);
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
            // The longest allowed text is stored whole, counting an emoji as JavaScript does.
            const longest = await call('/api/diary/2026-10-21', {
              method: 'PUT',
              body: { body: '😀'.repeat(2500), goodNote: '가'.repeat(1000) },
            });
            assert.equal(longest.status, 200);
            assert.equal((longest.data.entry as { body: string }).body.length, 5000);
            assert.equal((longest.data.entry as { goodNote: string }).goodNote.length, 1000);
            await call('/api/diary/2026-10-21', { method: 'PUT', body: { body: '2026-10-21' } });
            const yesterday = await call('/api/diary?date=2026-10-21');
            assert.equal((yesterday.data.entry as { body: string }).body, '2026-10-21');

            // The progress counts the routines of that day and that day's checks only.
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
            // They have to exist by the day asked about; the injected today is not the real clock.
            await client.query('UPDATE routines SET created_at = $2 WHERE id = ANY($1::bigint[])', [
              created,
              '2026-10-01T00:00:00Z',
            ]);
            const checks = await Promise.all([
              call(`/api/routines/${created[0]}/checks/2026-10-22`, { method: 'PUT' }),
              call(`/api/routines/${created[1]}/checks/2026-10-21`, { method: 'PUT' }),
            ]);
            assert.deepEqual(
              checks.map((response) => response.status),
              [200, 200],
            );
            assert.deepEqual((await call('/api/diary?date=2026-10-22')).data.progress, {
              checked: baseline.checked + 1,
              total: baseline.total + 2,
            });
            // Archived before that day and not checked on it: no longer counted.
            await client.query('UPDATE routines SET archived_at = $2 WHERE id = $1', [
              created[1],
              '2026-10-15T00:00:00Z',
            ]);
            assert.deepEqual((await call('/api/diary?date=2026-10-22')).data.progress, {
              checked: baseline.checked + 1,
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
  'a weekly check holds for its whole week, once, and a new week starts empty',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: string[] = [];
      let today = '2026-10-22';
      try {
        await withApi(
          pool,
          async (call) => {
            const added = await call('/api/routines', {
              method: 'POST',
              body: { name: '주간 청소', cadence: 'weekly' },
            });
            assert.equal(added.status, 201);
            const { id, category } = added.data.routine as { id: string; category: unknown };
            created.push(id);
            assert.equal(category, null);

            const week = async () => {
              const { status, data } = await call('/api/checklist?cadence=weekly');
              assert.equal(status, 200);
              const item = (data.items as { id: string; checked: boolean }[]).find(
                (entry) => entry.id === id,
              );
              return { period: data.period, checked: item?.checked };
            };
            const rows = async () =>
              (
                await client.query<{ period_start: string }>(
                  'SELECT period_start FROM routine_checks WHERE routine_id = $1 ORDER BY 1',
                  [id],
                )
              ).rows.map((row) => row.period_start);
            const thisWeek = { start: '2026-10-18', end: '2026-10-24' };
            assert.deepEqual(await week(), { period: thisWeek, checked: false });

            // Thursday's check holds until Saturday; checking again that week adds no row.
            const put = await call(`/api/routines/${id}/checks/2026-10-22`, { method: 'PUT' });
            assert.equal(put.status, 200);
            assert.deepEqual(put.data.period, thisWeek);
            today = '2026-10-24';
            assert.deepEqual(await week(), { period: thisWeek, checked: true });
            const again = await call(`/api/routines/${id}/checks/2026-10-24`, { method: 'PUT' });
            assert.equal(again.status, 200);
            assert.deepEqual(await rows(), ['2026-10-18']);

            // Sunday starts a new week and last week's record stays.
            today = '2026-10-25';
            assert.deepEqual(await week(), {
              period: { start: '2026-10-25', end: '2026-10-31' },
              checked: false,
            });
            assert.deepEqual(await rows(), ['2026-10-18']);
            const next = await call(`/api/routines/${id}/checks/2026-10-25`, { method: 'PUT' });
            assert.equal(next.status, 200);
            assert.deepEqual(await rows(), ['2026-10-18', '2026-10-25']);

            // Weekly routines have no category, so their group is matched on NULL.
            const second = await call('/api/routines', {
              method: 'POST',
              body: { name: '주간 가계부', cadence: 'weekly' },
            });
            const secondId = (second.data.routine as { id: string }).id;
            created.push(secondId);
            const moved = await call(`/api/routines/${secondId}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.equal(moved.status, 200);
            const order = (moved.data.routines as { id: string }[]).map((routine) => routine.id);
            assert.ok(order.indexOf(secondId) < order.indexOf(id));
            const renamed = await call(`/api/routines/${secondId}`, {
              method: 'PATCH',
              body: { name: '주간 가계부 정리' },
            });
            assert.equal(renamed.status, 200);

            // Unchecking removes that week's check only.
            const removed = await call(`/api/routines/${id}/checks/2026-10-25`, {
              method: 'DELETE',
            });
            assert.equal(removed.status, 200);
            assert.deepEqual(await rows(), ['2026-10-18']);
          },
          { today: () => today },
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
  'a four-week check holds for its period from the first-use week, then resets',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
      const created: string[] = [];
      let today = '2026-10-22';
      try {
        await withApi(
          pool,
          async (call) => {
            // The first routine records first use: Thursday, so periods count from Sunday 10-18.
            const added = await call('/api/routines', {
              method: 'POST',
              body: { name: '이불빨래', cadence: 'four_week' },
            });
            assert.equal(added.status, 201);
            const { id } = added.data.routine as { id: string };
            created.push(id);

            const period = async () => {
              const { status, data } = await call('/api/checklist?cadence=four_week');
              assert.equal(status, 200);
              const item = (data.items as { id: string; checked: boolean }[]).find(
                (entry) => entry.id === id,
              );
              return {
                period: data.period,
                remainingDays: data.remainingDays,
                endsSoon: data.endsSoon,
                checked: item?.checked,
              };
            };
            const rows = async () =>
              (
                await client.query<{ period_start: string }>(
                  'SELECT period_start FROM routine_checks WHERE routine_id = $1 ORDER BY 1',
                  [id],
                )
              ).rows.map((row) => row.period_start);
            const first = { start: '2026-10-18', end: '2026-11-14' };
            assert.deepEqual(await period(), {
              period: first,
              remainingDays: 23,
              endsSoon: false,
              checked: false,
            });

            const put = await call(`/api/routines/${id}/checks/2026-10-22`, { method: 'PUT' });
            assert.equal(put.status, 200);
            assert.deepEqual(put.data.period, first);

            // The last day of the period: still checked, and checking again adds no row.
            today = '2026-11-14';
            assert.deepEqual(await period(), {
              period: first,
              remainingDays: 0,
              endsSoon: true,
              checked: true,
            });
            const again = await call(`/api/routines/${id}/checks/2026-11-14`, { method: 'PUT' });
            assert.equal(again.status, 200);
            assert.deepEqual(await rows(), ['2026-10-18']);

            // The next day starts a new period and the last record stays.
            today = '2026-11-15';
            assert.deepEqual(await period(), {
              period: { start: '2026-11-15', end: '2026-12-12' },
              remainingDays: 27,
              endsSoon: false,
              checked: false,
            });
            assert.deepEqual(await rows(), ['2026-10-18']);
          },
          { today: () => today },
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

const goalsMigration = new URL(
  '../../database/migrations/004_twelve_week_goals.sql',
  import.meta.url,
);

test(
  'goals migration re-runs safely, enforces its limits and adds the checklist item once',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(goalsMigration, 'utf8'));
      await client.query(readFileSync(goalsMigration, 'utf8'));
      const seeded = await client.query(
        "SELECT 1 FROM routines WHERE cadence = 'twelve_week' AND name = '목표 재설정'",
      );
      assert.equal(seeded.rowCount, 1);
      // Archiving it sticks when the migration runs again. Rolled back to keep the shared row.
      await client.query('BEGIN');
      try {
        await client.query(
          "UPDATE routines SET archived_at = now() WHERE cadence = 'twelve_week' AND name = '목표 재설정'",
        );
        await client.query(readFileSync(goalsMigration, 'utf8'));
        const active = await client.query(
          "SELECT 1 FROM routines WHERE cadence = 'twelve_week' AND name = '목표 재설정' AND archived_at IS NULL",
        );
        assert.equal(active.rowCount, 0);
      } finally {
        await client.query('ROLLBACK');
      }
      const rejects = async (values: string) => {
        await client.query('BEGIN');
        try {
          await assert.rejects(
            client.query(
              `INSERT INTO twelve_week_goals (period_start, title, review_note) VALUES ${values}`,
            ),
            { code: '23514' },
          );
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("('2001-02-04', '   ', NULL)");
      await rejects("('2001-02-04', repeat('a', 201), NULL)");
      await rejects("('2001-02-04', 'a', repeat('a', 1001))");
    }),
);

test(
  'goals stay with their period, move to review when it ends, and reviews save all or nothing',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
      const created: string[] = [];
      let today = '2026-10-22';
      try {
        await withApi(
          pool,
          async (call) => {
            type Period = {
              period: { start: string };
              goals: {
                id: string;
                title: string;
                achieved: boolean | null;
                reviewNote: string | null;
                reviewedAt: unknown;
              }[];
            };
            const page = async () => (await call('/api/goals')).data;
            const add = async (title: string) => {
              const { status, data } = await call('/api/goals', {
                method: 'POST',
                body: { title },
              });
              assert.equal(status, 201);
              const { id } = data.goal as { id: string };
              created.push(id);
              return id;
            };
            // Thursday first use, so the period counts from Sunday 10-18.
            const first = await add('책 읽기');
            const second = await add('달리기');
            const before = await page();
            assert.equal(before.remainingWeeks, 12);
            const current = before.current as Period;
            assert.deepEqual(current.period, { start: '2026-10-18', end: '2027-01-09' });
            assert.deepEqual(
              current.goals.map((goal) => goal.id),
              [first, second],
            );

            const renamed = await call(`/api/goals/${second}`, {
              method: 'PATCH',
              body: { title: '5km 달리기' },
            });
            assert.equal(renamed.status, 200);
            const removable = await add('지울 목표');
            const removed = await call(`/api/goals/${removable}`, { method: 'DELETE' });
            assert.equal(removed.status, 200);

            // A running period cannot be reviewed.
            const tooEarly = await call('/api/goals/reviews', {
              method: 'PUT',
              body: { reviews: [{ id: first, achieved: true }] },
            });
            assert.equal(tooEarly.status, 400);

            // The next period: the goals become past ones, with nothing reviewed yet.
            today = '2027-01-10';
            const later = await page();
            assert.deepEqual((later.current as Period).goals, []);
            const past = later.past as Period[];
            const last = past.find((entry) => entry.period.start === '2026-10-18')!;
            assert.deepEqual(
              last.goals.map((goal) => [goal.title, goal.reviewedAt]),
              [
                ['책 읽기', null],
                ['5km 달리기', null],
              ],
            );
            const next = await add('새 목표');

            // A past goal keeps its text.
            const pastEdit = await call(`/api/goals/${first}`, {
              method: 'PATCH',
              body: { title: '다른 이름' },
            });
            assert.equal(pastEdit.status, 400);
            assert.equal((await call(`/api/goals/${first}`, { method: 'DELETE' })).status, 400);

            // One goal of the running period cancels the whole request.
            const mixed = await call('/api/goals/reviews', {
              method: 'PUT',
              body: {
                reviews: [
                  { id: first, achieved: true, note: '남으면 안 됨' },
                  { id: next, achieved: true },
                ],
              },
            });
            assert.equal(mixed.status, 400);
            const untouched = await client.query(
              'SELECT achieved, review_note, reviewed_at FROM twelve_week_goals WHERE id = $1',
              [first],
            );
            assert.deepEqual(untouched.rows[0], {
              achieved: null,
              review_note: null,
              reviewed_at: null,
            });

            const saved = await call('/api/goals/reviews', {
              method: 'PUT',
              body: {
                reviews: [
                  { id: first, achieved: true, note: ' 10권 읽음 ' },
                  { id: second, achieved: false },
                ],
              },
            });
            assert.equal(saved.status, 200);
            const reviewedPast = (await page()).past as Period[];
            const reviewed = reviewedPast.find((entry) => entry.period.start === '2026-10-18')!;
            assert.deepEqual(
              reviewed.goals.map((goal) => [goal.achieved, goal.reviewNote, !!goal.reviewedAt]),
              [
                [true, '10권 읽음', true],
                [false, null, true],
              ],
            );

            // Clearing both answers takes a goal back to "not reviewed yet".
            const cleared = await call('/api/goals/reviews', {
              method: 'PUT',
              body: { reviews: [{ id: second, achieved: null, note: '' }] },
            });
            assert.equal(cleared.status, 200);
            const row = await client.query(
              'SELECT reviewed_at FROM twelve_week_goals WHERE id = $1',
              [second],
            );
            assert.equal(row.rows[0].reviewed_at, null);
          },
          { today: () => today },
        );
      } finally {
        await client.query('DELETE FROM twelve_week_goals WHERE id = ANY($1::bigint[])', [created]);
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
  'records count the routines of that day, in the Seoul calendar, and match the calendar',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const created: string[] = [];
      // Created at 15:30 UTC on 03-09, which is 00:30 on 03-10 in Seoul.
      const add = async (
        name: string,
        archivedAt: string | null,
        createdAt = '2025-03-09T15:30:00Z',
      ) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO routines (name, cadence, category, sort_order, created_at, archived_at)
           VALUES ($1, 'daily', 'care', $2, $3, $4) RETURNING id::text AS id`,
          [name, created.length, createdAt, archivedAt],
        );
        created.push(rows[0].id);
        return rows[0].id;
      };
      const steady = await add('계속 있는 루틴', null);
      // Archived at 15:30 UTC on 03-14, which is 00:30 on 03-15 in Seoul.
      const archived = await add('보관한 루틴', '2025-03-14T15:30:00Z');
      const backfilled = await add('나중에 만든 루틴', null, '2025-03-20T00:00:00Z');
      const archivedChecked = await add('그날 보관하고 체크한 루틴', '2025-03-15T01:00:00Z');
      for (const [id, day] of [
        [steady, '2025-03-10'],
        [backfilled, '2025-03-12'],
        [archivedChecked, '2025-03-15'],
      ])
        await client.query(
          'INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, $2)',
          [id, day],
        );
      await client.query(
        `INSERT INTO diary_entries (entry_date, body) VALUES ('2025-03-12', '그날의 일기')`,
      );
      try {
        await withApi(
          pool,
          async (call) => {
            const names = async (date: string) => {
              const { data } = await call(`/api/records/${date}`);
              return (data.routines as { id: string; name: string; checked: boolean }[])
                .filter((routine) => created.includes(routine.id))
                .map((routine) => [routine.name, routine.checked]);
            };
            // Before the Seoul creation date, nothing existed yet.
            assert.deepEqual(await names('2025-03-09'), []);
            assert.deepEqual(await names('2025-03-10'), [
              ['계속 있는 루틴', true],
              ['보관한 루틴', false],
              ['그날 보관하고 체크한 루틴', false],
            ]);
            // A routine made later still counts on a day it was checked.
            assert.deepEqual(await names('2025-03-12'), [
              ['계속 있는 루틴', false],
              ['보관한 루틴', false],
              ['나중에 만든 루틴', true],
              ['그날 보관하고 체크한 루틴', false],
            ]);
            // The last day before archiving, then the archive day itself.
            assert.deepEqual(await names('2025-03-14'), [
              ['계속 있는 루틴', false],
              ['보관한 루틴', false],
              ['그날 보관하고 체크한 루틴', false],
            ]);
            assert.deepEqual(await names('2025-03-15'), [
              ['계속 있는 루틴', false],
              ['그날 보관하고 체크한 루틴', true],
            ]);
            // Created later and not checked: not counted on an earlier day.
            assert.deepEqual(await names('2025-03-19'), [['계속 있는 루틴', false]]);
            assert.deepEqual(await names('2025-03-20'), [
              ['계속 있는 루틴', false],
              ['나중에 만든 루틴', false],
            ]);
            const archivedDay = await call('/api/records/2025-03-14');
            assert.equal(
              (archivedDay.data.routines as { id: string; archived: boolean }[]).find(
                (routine) => routine.id === archived,
              )?.archived,
              true,
            );

            // The calendar agrees with the day's own record, and every day of the month is there.
            const month = await call('/api/records?month=2025-03');
            assert.equal(month.status, 200);
            const days = month.data.days as {
              date: string;
              checked: number;
              total: number;
              hasDiary: boolean;
            }[];
            assert.equal(days.length, 31);
            assert.equal(days[0].date, '2025-03-01');
            assert.equal(days[30].date, '2025-03-31');
            for (const date of [
              '2025-03-09',
              '2025-03-10',
              '2025-03-12',
              '2025-03-15',
              '2025-03-20',
            ]) {
              const { data } = await call(`/api/records/${date}`);
              const summary = days.find((day) => day.date === date)!;
              assert.deepEqual(
                { checked: summary.checked, total: summary.total },
                data.progress,
                date,
              );
            }
            assert.deepEqual(
              days.filter((day) => day.hasDiary).map((day) => day.date),
              ['2025-03-12'],
            );
            const written = await call('/api/records/2025-03-12');
            assert.equal((written.data.diary as { body: string }).body, '그날의 일기');
            const empty = await call('/api/records/2025-03-09');
            assert.equal(empty.data.diary, null);

            // The diary page counts the same way.
            assert.deepEqual(
              (await call('/api/diary?date=2025-03-15')).data.progress,
              (await call('/api/records/2025-03-15')).data.progress,
            );
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM diary_entries WHERE entry_date = $1', ['2025-03-12']);
        await client.query('DELETE FROM routine_checks WHERE routine_id = ANY($1::bigint[])', [
          created,
        ]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [created]);
      }
    }),
);

test(
  'stats count only periods a routine was active in, by the Seoul calendar',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: string[] = [];
      const add = async (
        name: string,
        cadence: string,
        category: string | null,
        createdAt: string,
        archivedAt: string | null = null,
      ) => {
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO routines (name, cadence, category, created_at, archived_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING id::text AS id`,
          [name, cadence, category, createdAt, archivedAt],
        );
        created.push(rows[0].id);
        return rows[0].id;
      };
      try {
        await withApi(
          pool,
          async (call) => {
            await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
            await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
              anchorSettingKey,
              '2030-01-06',
            ]);
            type Tally = { start: string; end: string; checked: number; total: number };
            // Any routines already in the DB count in these periods too, so measure the change.
            type Stats = { daily: { weeks: Tally[] }; weekly: Tally[]; fourWeek: Tally[] };
            const before = (await call('/api/stats')).data as Stats;
            // 15:30 UTC on 01-13 is 00:30 on 01-14 in Seoul.
            const daily = await add('통계 하루', 'daily', 'care', '2030-01-13T15:30:00Z');
            // 15:30 UTC on 01-15 is 00:30 on 01-16 in Seoul.
            const archived = await add(
              '통계 보관',
              'daily',
              'care',
              '2030-01-13T15:30:00Z',
              '2030-01-15T15:30:00Z',
            );
            const weekly = await add('통계 주간', 'weekly', null, '2030-01-06T00:00:00Z');
            const fourWeek = await add('통계 4주', 'four_week', null, '2030-01-06T00:00:00Z');
            for (const [id, start] of [
              [daily, '2030-01-14'],
              [archived, '2030-01-15'],
              [weekly, '2030-01-06'],
              [fourWeek, '2030-01-06'],
            ])
              await client.query(
                'INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, $2)',
                [id, start],
              );
            const { status, data } = await call('/api/stats');
            assert.equal(status, 200);
            type Item = Tally & {
              id: string;
              archived: boolean;
              checked: number;
              total: number;
              periods: { start: string; status: string }[];
            };
            const item = (id: string) => (data.items as Item[]).find((entry) => entry.id === id)!;
            const statusOn = (entry: Item, date: string) =>
              entry.periods.find((period) => period.start === date)?.status;

            // Today is Thursday 01-17. Made in Seoul on 01-14, not 01-13.
            assert.equal(statusOn(item(daily), '2030-01-13'), 'none');
            assert.equal(statusOn(item(daily), '2030-01-14'), 'done');
            assert.equal(statusOn(item(daily), '2030-01-15'), 'missed');
            assert.equal(statusOn(item(daily), '2030-01-17'), 'open');
            assert.deepEqual([item(daily).checked, item(daily).total], [1, 3]);

            // Archived in Seoul on 01-16: that day and after no longer count.
            assert.equal(item(archived).archived, true);
            assert.equal(statusOn(item(archived), '2030-01-14'), 'missed');
            assert.equal(statusOn(item(archived), '2030-01-15'), 'done');
            assert.equal(statusOn(item(archived), '2030-01-16'), 'none');
            assert.deepEqual([item(archived).checked, item(archived).total], [1, 2]);

            // This week: 01-14 two routines (1 done), 01-15 two (1 done), 01-16 one, not today.
            const daySummary = (data.daily as { weeks: Tally[] }).weeks[0];
            assert.deepEqual(
              [
                daySummary.start,
                daySummary.checked - before.daily.weeks[0].checked,
                daySummary.total - before.daily.weeks[0].total,
              ],
              ['2030-01-13', 2, 5],
            );

            // The week of 01-06 was done and this running week is not counted yet.
            const weeks = data.weekly as Tally[];
            assert.deepEqual(
              [
                weeks[0].start,
                weeks[0].checked - before.weekly[0].checked,
                weeks[0].total - before.weekly[0].total,
              ],
              ['2030-01-13', 0, 0],
            );
            assert.deepEqual(
              [
                weeks[1].start,
                weeks[1].checked - before.weekly[1].checked,
                weeks[1].total - before.weekly[1].total,
              ],
              ['2030-01-06', 1, 1],
            );

            // The four-week period is still running but done, so it counts.
            const fours = data.fourWeek as Tally[];
            assert.deepEqual(
              [
                fours[0].start,
                fours[0].end,
                fours[0].checked - before.fourWeek[0].checked,
                fours[0].total - before.fourWeek[0].total,
              ],
              ['2030-01-06', '2030-02-02', 1, 1],
            );
            assert.equal(statusOn(item(fourWeek), '2030-01-06'), 'done');
          },
          { today: () => '2030-01-17' },
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

const goalLinksMigration = new URL(
  '../../database/migrations/005_goal_routines.sql',
  import.meta.url,
);

test(
  'goal links replace in one step, take active daily and weekly routines, and go with the goal',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      await client.query(readFileSync(goalLinksMigration, 'utf8'));
      await client.query(readFileSync(goalLinksMigration, 'utf8'));
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const routines: string[] = [];
      const goals: string[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            const addRoutine = async (name: string, cadence: string, category?: string) => {
              const { data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence, category },
              });
              const { id } = data.routine as { id: string };
              routines.push(id);
              return id;
            };
            const daily = await addRoutine('연결 하루', 'daily', 'care');
            const weekly = await addRoutine('연결 주간', 'weekly');
            const fourWeek = await addRoutine('연결 4주', 'four_week');
            const created = await call('/api/goals', {
              method: 'POST',
              body: { title: '연결 목표' },
            });
            const goalId = (created.data.goal as { id: string }).id;
            goals.push(goalId);
            const path = `/api/goals/${goalId}/routines`;
            const put = (routineIds: string[]) =>
              call(path, { method: 'PUT', body: { routineIds } });
            const shown = async () => {
              const { data } = await call('/api/goals');
              const { goals: list } = data.current as {
                goals: { id: string; routines: { id: string; name: string }[] }[];
              };
              return list.find((goal) => goal.id === goalId)!.routines;
            };

            assert.deepEqual(await shown(), []);
            const linked = await put([weekly, daily]);
            assert.equal(linked.status, 200);
            const both = [
              { id: daily, name: '연결 하루' },
              { id: weekly, name: '연결 주간' },
            ];
            assert.deepEqual(linked.data.routines, both);
            assert.deepEqual(await shown(), both);

            // A refused list changes nothing.
            assert.equal((await put([daily, fourWeek])).status, 400);
            assert.deepEqual(await shown(), both);

            assert.equal((await put([weekly])).status, 200);
            assert.deepEqual(await shown(), [{ id: weekly, name: '연결 주간' }]);

            // An archived routine leaves the goal's list and cannot be linked again.
            await call(`/api/routines/${weekly}/archive`, { method: 'POST' });
            assert.deepEqual(await shown(), []);
            assert.equal((await put([weekly])).status, 400);

            assert.equal((await put([daily])).status, 200);
            assert.equal((await put([])).status, 200);
            assert.deepEqual(await shown(), []);

            // Removing the goal removes its links and leaves the routine.
            assert.equal((await put([daily])).status, 200);
            await call(`/api/goals/${goalId}`, { method: 'DELETE' });
            const left = await client.query(
              'SELECT 1 FROM twelve_week_goal_routines WHERE goal_id = $1',
              [goalId],
            );
            assert.equal(left.rowCount, 0);
            const kept = await client.query('SELECT 1 FROM routines WHERE id = $1', [daily]);
            assert.equal(kept.rowCount, 1);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM twelve_week_goals WHERE id = ANY($1::bigint[])', [goals]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [routines]);
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
      const ids = Array.from({ length: 11 }, (_, index) => String(999_995 + index));
      try {
        await client.query(
          `INSERT INTO routines (id, name, cadence, sort_order) OVERRIDING SYSTEM VALUE
           SELECT n, '정렬 ' || n, 'weekly', 0 FROM unnest($1::bigint[]) AS n`,
          [ids],
        );
        await withApi(
          pool,
          async (call) => {
            const inOrder = (rows: unknown) =>
              (rows as { id: string }[]).map((row) => row.id).filter((id) => ids.includes(id));

            const list = await call('/api/routines?cadence=weekly');
            assert.deepEqual(inOrder(list.data.routines), ids);

            const checklist = await call('/api/checklist?cadence=weekly&date=2026-10-22');
            assert.deepEqual(inOrder(checklist.data.items), ids);

            const before = (await call('/api/goals')).data.current as {
              period: { start: string };
            };
            const periodStart = before.period.start;
            await client.query(
              `INSERT INTO twelve_week_goals (id, period_start, title, sort_order)
               OVERRIDING SYSTEM VALUE
               SELECT n, $2::date, '정렬 ' || n, 0 FROM unnest($1::bigint[]) AS n`,
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
              '1000000',
              '999999',
              ...ids.slice(6),
            ]);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM twelve_week_goals WHERE id = ANY($1::bigint[])', [ids]);
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
      for (const table of ['app_settings', 'routines', 'twelve_week_goal_routines'])
        assert.ok(names.includes(table), table);

      // A later run applies nothing, so a seeded item the user renamed does not come back.
      await client.query("UPDATE routines SET name = '바꾼 이름' WHERE name = '목표 재설정'");
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

test(
  'a project link reaches the checklist, and removing the project only clears it',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      let routineId = '';
      let projectId = '';
      try {
        await withApi(
          pool,
          async (call) => {
            const routine = await call('/api/routines', {
              method: 'POST',
              body: { name: '연결 루틴', cadence: 'weekly' },
            });
            routineId = (routine.data.routine as { id: string }).id;
            const project = await call('/api/project-links', {
              method: 'POST',
              body: { name: '연결 테스트', url: 'https://books.example' },
            });
            assert.equal(project.status, 201);
            projectId = (project.data.project as { id: string; url: string }).id;
            assert.equal((project.data.project as { url: string }).url, 'https://books.example/');

            const same = await call('/api/project-links', {
              method: 'POST',
              body: { name: '연결 테스트', url: 'https://other.example' },
            });
            assert.equal(same.status, 409);

            const item = async () => {
              const { data } = await call('/api/checklist?cadence=weekly&date=2026-10-22');
              return (data.items as { id: string; linkName: unknown; linkUrl: unknown }[]).find(
                (entry) => entry.id === routineId,
              )!;
            };
            assert.equal((await item()).linkUrl, null);

            const path = `/api/routines/${routineId}/project-link`;
            const linked = await call(path, { method: 'PUT', body: { projectLinkId: projectId } });
            assert.equal(linked.status, 200);
            assert.equal(
              (linked.data.routine as { projectLinkId: string }).projectLinkId,
              projectId,
            );
            const shown = await item();
            assert.equal(shown.linkName, '연결 테스트');
            assert.equal(shown.linkUrl, 'https://books.example/');

            const missing = await call(path, {
              method: 'PUT',
              body: { projectLinkId: '999999999' },
            });
            assert.equal(missing.status, 404);

            const cleared = await call(path, { method: 'PUT', body: { projectLinkId: null } });
            assert.equal(cleared.status, 200);
            assert.equal((await item()).linkUrl, null);

            await call(path, { method: 'PUT', body: { projectLinkId: projectId } });
            await call(`/api/project-links/${projectId}`, { method: 'DELETE' });
            assert.equal((await item()).linkUrl, null);
            const list = await call('/api/routines?cadence=weekly');
            const kept = (list.data.routines as { id: string; projectLinkId: unknown }[]).find(
              (entry) => entry.id === routineId,
            );
            assert.equal(kept?.projectLinkId, null);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        if (projectId) await client.query('DELETE FROM project_links WHERE id = $1', [projectId]);
        if (routineId) await client.query('DELETE FROM routines WHERE id = $1', [routineId]);
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        if (original.rows[0])
          await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
            anchorSettingKey,
            original.rows[0].value,
          ]);
      }
    }),
);
