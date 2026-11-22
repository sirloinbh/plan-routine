import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'stats count only periods a routine was active in, by the Seoul calendar',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      const created: number[] = [];
      const add = async (
        name: string,
        cadence: string,
        category: string | null,
        createdAt: string,
        archivedAt: string | null = null,
      ) => {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO routines (name, cadence, category, created_at, archived_at)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
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
            const daily = await add('Stats daily', 'daily', 'care', '2030-01-13T15:30:00Z');
            // 15:30 UTC on 01-15 is 00:30 on 01-16 in Seoul.
            const archived = await add(
              'Stats archived',
              'daily',
              'care',
              '2030-01-13T15:30:00Z',
              '2030-01-15T15:30:00Z',
            );
            const weekly = await add('Stats weekly', 'weekly', null, '2030-01-06T00:00:00Z');
            const fourWeek = await add('Stats 4-week', 'four_week', null, '2030-01-06T00:00:00Z');
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
              id: number;
              archived: boolean;
              checked: number;
              total: number;
              periods: { start: string; status: string }[];
            };
            const item = (id: number) => (data.items as Item[]).find((entry) => entry.id === id)!;
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
