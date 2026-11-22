import assert from 'node:assert/strict';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'records count the routines of that day, in the Seoul calendar, and match the calendar',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const created: number[] = [];
      // Created at 15:30 UTC on 03-09, which is 00:30 on 03-10 in Seoul.
      const add = async (
        name: string,
        archivedAt: string | null,
        createdAt = '2025-03-09T15:30:00Z',
      ) => {
        const { rows } = await client.query<{ id: number }>(
          `INSERT INTO routines (name, cadence, category, sort_order, created_at, archived_at)
           VALUES ($1, 'daily', 'care', $2, $3, $4) RETURNING id`,
          [name, created.length, createdAt, archivedAt],
        );
        created.push(rows[0].id);
        return rows[0].id;
      };
      const steady = await add('Ongoing routine', null);
      // Archived at 15:30 UTC on 03-14, which is 00:30 on 03-15 in Seoul.
      const archived = await add('Archived routine', '2025-03-14T15:30:00Z');
      const backfilled = await add('Routine added later', null, '2025-03-20T00:00:00Z');
      const archivedChecked = await add('Archived and checked that day', '2025-03-15T01:00:00Z');
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
        `INSERT INTO diary_entries (entry_date, body) VALUES ('2025-03-12', 'Diary of that day')`,
      );
      try {
        await withApi(
          pool,
          async (call) => {
            const names = async (date: string) => {
              const { data } = await call(`/api/records/${date}`);
              return (data.routines as { id: number; name: string; checked: boolean }[])
                .filter((routine) => created.includes(routine.id))
                .map((routine) => [routine.name, routine.checked]);
            };
            // Before the Seoul creation date, nothing existed yet.
            assert.deepEqual(await names('2025-03-09'), []);
            assert.deepEqual(await names('2025-03-10'), [
              ['Ongoing routine', true],
              ['Archived routine', false],
              ['Archived and checked that day', false],
            ]);
            // A routine made later still counts on a day it was checked.
            assert.deepEqual(await names('2025-03-12'), [
              ['Ongoing routine', false],
              ['Archived routine', false],
              ['Routine added later', true],
              ['Archived and checked that day', false],
            ]);
            // The last day before archiving, then the archive day itself.
            assert.deepEqual(await names('2025-03-14'), [
              ['Ongoing routine', false],
              ['Archived routine', false],
              ['Archived and checked that day', false],
            ]);
            assert.deepEqual(await names('2025-03-15'), [
              ['Ongoing routine', false],
              ['Archived and checked that day', true],
            ]);
            // Created later and not checked: not counted on an earlier day.
            assert.deepEqual(await names('2025-03-19'), [['Ongoing routine', false]]);
            assert.deepEqual(await names('2025-03-20'), [
              ['Ongoing routine', false],
              ['Routine added later', false],
            ]);
            const archivedDay = await call('/api/records/2025-03-14');
            assert.equal(
              (archivedDay.data.routines as { id: number; archived: boolean }[]).find(
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
            assert.equal((written.data.diary as { body: string }).body, 'Diary of that day');
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
