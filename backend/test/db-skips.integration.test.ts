import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'a skip and a check exclude each other, and a skip shows on the checklist and the records',
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
              body: { name: 'Skip me', cadence: 'daily', category: 'care' },
            });
            const id = (data.routine as { id: number }).id;
            created.push(id);
            const skipPath = `/api/routines/${id}/skips/2026-10-21`;
            const checkPath = `/api/routines/${id}/checks/2026-10-21`;
            const item = async () => {
              const list = await call('/api/checklist?date=2026-10-21');
              return (list.data.items as { id: number }[]).find((entry) => entry.id === id);
            };

            assert.equal(
              (await call(skipPath, { method: 'PUT', body: { reason: 'Sick' } })).status,
              200,
            );
            // Repeating replaces the reason and still stores one row.
            assert.equal(
              (await call(skipPath, { method: 'PUT', body: { reason: 'Flu' } })).status,
              200,
            );
            assert.equal(
              (await client.query('SELECT 1 FROM routine_skips WHERE routine_id = $1', [id]))
                .rowCount,
              1,
            );
            assert.partialDeepStrictEqual(await item(), {
              skipped: true,
              skipReason: 'Flu',
              checked: false,
            });
            assert.equal((await call(checkPath, { method: 'PUT' })).status, 409);

            const record = await call('/api/records/2026-10-21');
            const routine = (
              record.data.routines as { id: number; skipped: boolean; skipReason: string }[]
            ).find((entry) => entry.id === id);
            assert.deepEqual([routine?.skipped, routine?.skipReason], [true, 'Flu']);

            assert.equal((await call(skipPath, { method: 'DELETE' })).status, 200);
            assert.equal((await call(skipPath, { method: 'DELETE' })).status, 200);
            assert.equal((await call(checkPath, { method: 'PUT' })).status, 200);
            assert.equal((await call(skipPath, { method: 'PUT', body: {} })).status, 409);
          },
          { today: () => '2026-10-22' },
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
