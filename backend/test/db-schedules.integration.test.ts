import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'weekday and N-per-week routines follow their schedule in the checklist, records and week count',
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
            const add = async (body: unknown) => {
              const { status, data } = await call('/api/routines', { method: 'POST', body });
              assert.equal(status, 201);
              const routine = data.routine as { id: number };
              created.push(routine.id);
              return data.routine as Record<string, unknown>;
            };
            // Mon and Wed only (2026-10-19 is a Monday).
            const run = await add({
              name: 'Schedule run',
              cadence: 'daily',
              category: 'exercise',
              weekdays: [3, 1],
            });
            assert.deepEqual(run.weekdays, [1, 3]);
            // Records only list a routine from the day it was created on.
            await client.query("UPDATE routines SET created_at = '2026-01-01' WHERE id = $1", [
              run.id,
            ]);
            const read = await add({ name: 'Schedule read', cadence: 'weekly', timesPerWeek: 3 });
            assert.equal(read.timesPerWeek, 3);

            const listed = async (date: string, cadence = 'daily') => {
              const { data } = await call(`/api/checklist?cadence=${cadence}&date=${date}`);
              return data.items as { id: number; checked: boolean; weekChecks: number | null }[];
            };
            assert.ok((await listed('2026-10-19')).some((item) => item.id === run.id));
            assert.ok(!(await listed('2026-10-20')).some((item) => item.id === run.id));
            // A check on an off day still shows that day, so it can be undone.
            await call(`/api/routines/${run.id}/checks/2026-10-20`, { method: 'PUT' });
            assert.ok((await listed('2026-10-20')).some((item) => item.id === run.id));
            const record = await call('/api/records/2026-10-21');
            assert.ok(
              (record.data.routines as { id: number }[]).some((item) => item.id === run.id),
            );
            const off = await call('/api/records/2026-10-22');
            assert.ok(!(off.data.routines as { id: number }[]).some((item) => item.id === run.id));

            // N per week: one check per day, the week count adds them up.
            for (const date of ['2026-10-19', '2026-10-19', '2026-10-21'])
              assert.equal(
                (await call(`/api/routines/${read.id}/checks/${date}`, { method: 'PUT' })).status,
                200,
              );
            const week = (await listed('2026-10-21', 'weekly')).find((item) => item.id === read.id);
            assert.deepEqual([week?.checked, week?.weekChecks], [true, 2]);
            const other = (await listed('2026-10-20', 'weekly')).find(
              (item) => item.id === read.id,
            );
            assert.deepEqual([other?.checked, other?.weekChecks], [false, 2]);
            // A skip of the week is refused while it holds checks, and checks are refused after a skip.
            assert.equal(
              (await call(`/api/routines/${read.id}/skips/2026-10-21`, { method: 'PUT', body: {} }))
                .status,
              409,
            );
            await call(`/api/routines/${read.id}/checks/2026-10-19`, { method: 'DELETE' });
            await call(`/api/routines/${read.id}/checks/2026-10-21`, { method: 'DELETE' });
            assert.equal(
              (await call(`/api/routines/${read.id}/skips/2026-10-21`, { method: 'PUT', body: {} }))
                .status,
              200,
            );
            assert.equal(
              (await call(`/api/routines/${read.id}/checks/2026-10-20`, { method: 'PUT' })).status,
              409,
            );
          },
          { today: () => '2026-10-22' },
        );
        // The table refuses a schedule on the wrong cadence, whatever the API says.
        await assert.rejects(
          client.query(
            "INSERT INTO routines (name, cadence, weekdays) VALUES ('Bad', 'weekly', ARRAY[1]::smallint[])",
          ),
        );
      } finally {
        await client.query('DELETE FROM routine_skips WHERE routine_id = ANY($1::bigint[])', [
          created,
        ]);
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
