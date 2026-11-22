import assert from 'node:assert/strict';
import { test } from 'node:test';

import { Pool } from 'pg';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'checks persist, never duplicate, and leave the checklist with an archived routine',
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
            for (const name of ['To check', 'Not checked']) {
              const { data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'care' },
              });
              created.push((data.routine as { id: number }).id);
            }
            const [target, other] = created;
            const checked = async (date: string) => {
              const { status, data } = await call(`/api/checklist?date=${date}`);
              assert.equal(status, 200);
              return (data.items as { id: number; checked: boolean }[])
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
      const created: number[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            const { data } = await call('/api/routines', {
              method: 'POST',
              body: { name: 'Archive and check race', cadence: 'daily', category: 'care' },
            });
            const id = (data.routine as { id: number }).id;
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

test(
  'a weekly check holds for its whole week, once, and a new week starts empty',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: number[] = [];
      let today = '2026-10-22';
      try {
        await withApi(
          pool,
          async (call) => {
            const added = await call('/api/routines', {
              method: 'POST',
              body: { name: 'Weekly cleaning', cadence: 'weekly' },
            });
            assert.equal(added.status, 201);
            const { id, category } = added.data.routine as { id: number; category: unknown };
            created.push(id);
            assert.equal(category, null);

            const week = async () => {
              const { status, data } = await call('/api/checklist?cadence=weekly');
              assert.equal(status, 200);
              const item = (data.items as { id: number; checked: boolean }[]).find(
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
              body: { name: 'Weekly budget', cadence: 'weekly' },
            });
            const secondId = (second.data.routine as { id: number }).id;
            created.push(secondId);
            const moved = await call(`/api/routines/${secondId}/move`, {
              method: 'POST',
              body: { direction: 'up' },
            });
            assert.equal(moved.status, 200);
            const order = (moved.data.routines as { id: number }[]).map((routine) => routine.id);
            assert.ok(order.indexOf(secondId) < order.indexOf(id));
            const renamed = await call(`/api/routines/${secondId}`, {
              method: 'PATCH',
              body: { name: 'Weekly budget tidy' },
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
      const created: number[] = [];
      let today = '2026-10-22';
      try {
        await withApi(
          pool,
          async (call) => {
            // The first routine records first use: Thursday, so periods count from Sunday 10-18.
            const added = await call('/api/routines', {
              method: 'POST',
              body: { name: 'Wash bedding', cadence: 'four_week' },
            });
            assert.equal(added.status, 201);
            const { id } = added.data.routine as { id: number };
            created.push(id);

            const period = async () => {
              const { status, data } = await call('/api/checklist?cadence=four_week');
              assert.equal(status, 200);
              const item = (data.items as { id: number; checked: boolean }[]).find(
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
