import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'an amount is stored on a check, shown on the checklist, records and stats, and never changes done',
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
            const read = await add({
              name: 'Amount read',
              cadence: 'daily',
              category: 'reading',
              unit: 'pages',
              targetAmount: 20,
            });
            assert.deepEqual([read.unit, read.targetAmount], ['pages', 20]);
            const plain = await add({ name: 'Amount plain', cadence: 'daily', category: 'care' });
            await client.query("UPDATE routines SET created_at = '2026-01-01' WHERE id = ANY($1)", [
              created,
            ]);

            const put = (id: unknown, date: string, body?: unknown) =>
              call(`/api/routines/${id}/checks/${date}`, { method: 'PUT', body });
            assert.equal((await put(read.id, '2026-10-21', { amount: 12.5 })).status, 200);
            assert.equal((await put(read.id, '2026-10-20', { amount: 0 })).status, 200);
            // A plain check keeps the amount; null clears it; a routine without a unit refuses one.
            assert.equal((await put(read.id, '2026-10-21')).status, 200);
            assert.equal((await put(plain.id, '2026-10-21', { amount: 3 })).status, 400);
            assert.equal((await put(plain.id, '2026-10-21')).status, 200);

            const { data } = await call('/api/checklist?date=2026-10-21');
            const item = (
              data.items as { id: number; amount: number | null; unit: string | null }[]
            ).find((entry) => entry.id === read.id);
            assert.deepEqual([item?.amount, item?.unit], [12.5, 'pages']);
            const day = await call('/api/records/2026-10-21');
            const row = (day.data.routines as { id: number; amount: number | null }[]).find(
              (entry) => entry.id === read.id,
            );
            assert.equal(row?.amount, 12.5);

            const stats = await call('/api/stats');
            const entry = (
              stats.data.items as {
                id: number;
                checked: number;
                amountTotals: { weeks: { total: number }[] } | null;
              }[]
            ).find((candidate) => candidate.id === read.id);
            assert.equal(entry?.amountTotals?.weeks[0].total, 12.5);
            // The amount 0 still counts as a check.
            assert.equal(entry?.checked, 2);

            assert.equal((await put(read.id, '2026-10-21', { amount: null })).status, 200);
            const cleared = await call('/api/checklist?date=2026-10-21');
            assert.equal(
              (cleared.data.items as { id: number; amount: number | null }[]).find(
                (candidate) => candidate.id === read.id,
              )?.amount,
              null,
            );
          },
          { today: () => '2026-10-22' },
        );
        // The table refuses a target without a unit and a negative amount.
        await assert.rejects(
          client.query(
            "INSERT INTO routines (name, cadence, category, target_amount) VALUES ('Bad', 'daily', 'care', 5)",
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

test(
  'the unit and target of a routine can be added, changed and removed; amounts are hidden, not deleted',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const created: number[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            const { data } = await call('/api/routines', {
              method: 'POST',
              body: { name: 'Amount edit', cadence: 'daily', category: 'study' },
            });
            const id = (data.routine as { id: number }).id;
            created.push(id);
            const put = (body: unknown) =>
              call(`/api/routines/${id}/amount`, { method: 'PUT', body });
            assert.equal((await put({ targetAmount: 5 })).status, 400);
            const added = await put({ unit: 'minutes', targetAmount: 60 });
            assert.deepEqual(
              [
                (added.data.routine as { unit: string }).unit,
                (added.data.routine as { targetAmount: number }).targetAmount,
              ],
              ['minutes', 60],
            );
            const cleared = await put({ unit: 'minutes' });
            assert.equal((cleared.data.routine as { targetAmount: unknown }).targetAmount, null);
            assert.equal((await put({ unit: 'hours' })).status, 200);
            // Removing the unit hides the amounts on checks, adding one again shows them.
            const day = '2026-10-21';
            await call(`/api/routines/${id}/checks/${day}`, { method: 'PUT', body: { amount: 7 } });
            const amountOn = async () => {
              const { data: list } = await call(`/api/checklist?date=${day}`);
              return (list.items as { id: number; amount: number | null }[]).find(
                (item) => item.id === id,
              )?.amount;
            };
            assert.equal(await amountOn(), 7);
            assert.equal((await put({})).status, 200);
            assert.equal(await amountOn(), null);
            assert.equal((await put({ unit: 'laps' })).status, 200);
            assert.equal(await amountOn(), 7);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM routine_checks WHERE routine_id = ANY($1::bigint[])', [
          created,
        ]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [created]);
      }
    }),
);
