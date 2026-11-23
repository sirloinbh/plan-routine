import assert from 'node:assert/strict';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

type Result = { kind: string; date: string; field: string; snippet: string };

// Uses its own old dates (March 2001) and a test routine, and removes them afterwards.
test(
  'search matches the body and notes, escapes wildcards, filters by range and routine, and pages newest first',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const dates = ['2001-03-01', '2001-03-02', '2001-03-03', '2001-03-04'];
      const routine = await client.query<{ id: number }>(
        `INSERT INTO routines (name, cadence, category, created_at, archived_at)
         VALUES ('Search test run', 'daily', 'care', '2001-03-02 12:00+09', '2001-03-04 12:00+09')
         RETURNING id`,
      );
      const id = routine.rows[0].id;
      // A second routine with no diary entries on its days: due 03-05 to 03-08, done on 03-06 only.
      const other = await client.query<{ id: number }>(
        `INSERT INTO routines (name, cadence, category, created_at, archived_at)
         VALUES ('Search test read', 'daily', 'care', '2001-03-05 12:00+09', '2001-03-09 12:00+09')
         RETURNING id`,
      );
      const otherId = other.rows[0].id;
      try {
        await client.query(
          `INSERT INTO diary_entries (entry_date, body, good_note) VALUES
             ('2001-03-01', 'Alpha 100% sure', NULL),
             ('2001-03-02', 'Plain day', 'alpha in a note'),
             ('2001-03-03', 'Gamma_day', NULL),
             ('2001-03-04', 'Alpha again', NULL)`,
        );
        // Done on 03-02 only. Due 03-02 and 03-03 (created on 03-02, archived on 03-04), so missed on 03-03.
        await client.query(
          "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2001-03-02')",
          [id],
        );
        await client.query(
          "INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, '2001-03-06')",
          [otherId],
        );
        // A skip with a reason on 03-03, the day the routine was not done.
        await client.query(
          "INSERT INTO routine_skips (routine_id, period_start, reason) VALUES ($1, '2001-03-03', 'Knee hurts today')",
          [id],
        );
        await withApi(
          pool,
          async (call) => {
            const dateList = async (path: string) => {
              const { status, data } = await call(path);
              assert.equal(status, 200, path);
              return (data.results as Result[]).map((result) => result.date);
            };
            const range = 'from=2001-03-01&to=2001-03-04';
            // Case-insensitive, body and notes, newest first.
            assert.deepEqual(await dateList(`/api/search?q=ALPHA&${range}`), [
              '2001-03-04',
              '2001-03-02',
              '2001-03-01',
            ]);
            const note = await call(`/api/search?q=in%20a%20note&${range}`);
            assert.deepEqual(note.data.results, [
              { kind: 'diary', date: '2001-03-02', field: 'goodNote', snippet: 'alpha in a note' },
            ]);
            // % and _ are matched as typed, not as wildcards.
            assert.deepEqual(await dateList(`/api/search?q=100%25&${range}`), ['2001-03-01']);
            assert.deepEqual(await dateList(`/api/search?q=%25&${range}`), ['2001-03-01']);
            assert.deepEqual(await dateList(`/api/search?q=Gamm_&${range}`), []);
            assert.deepEqual(await dateList(`/api/search?q=ma_d&${range}`), ['2001-03-03']);
            assert.deepEqual(await dateList(`/api/search?q=Gamma_&${range}`), ['2001-03-03']);
            // Date range.
            assert.deepEqual(await dateList('/api/search?q=alpha&from=2001-03-02&to=2001-03-03'), [
              '2001-03-02',
            ]);
            // Routine: done, and missed (only days it was due and not checked).
            assert.deepEqual(await dateList(`/api/search?routineId=${id}&result=done&${range}`), [
              '2001-03-02',
            ]);
            // Missed: the diary entry of 03-03 and the skip reason of that day, one result per source.
            const missed = await call(`/api/search?routineId=${id}&${range}`);
            assert.deepEqual(
              (missed.data.results as Result[]).map(({ kind, date }) => [kind, date]),
              [
                ['diary', '2001-03-03'],
                ['skip', '2001-03-03'],
              ],
            );
            // Missed days without a diary entry are listed for a routine alone, newest first, with no text.
            const days = async (path: string) => {
              const { data } = await call(path);
              return (data.results as Result[]).map(({ kind, date }) => `${kind} ${date}`);
            };
            assert.deepEqual(await days(`/api/search?routineId=${otherId}`), [
              'missed 2001-03-08',
              'missed 2001-03-07',
              'missed 2001-03-05',
            ]);
            // The range narrows them; the day before the routine existed and after it was archived are not there.
            assert.deepEqual(
              await days(`/api/search?routineId=${otherId}&from=2001-03-06&to=2001-03-07`),
              ['missed 2001-03-07'],
            );
            assert.deepEqual(
              await days(`/api/search?routineId=${otherId}&from=2001-03-09&to=2001-03-20`),
              [],
            );
            // Text or "done" asks for something else: no missed-day results.
            assert.deepEqual(await days(`/api/search?routineId=${otherId}&q=zzz`), []);
            assert.deepEqual(await days(`/api/search?routineId=${otherId}&result=done`), []);
            // A missed day with a diary entry stays one diary result, not two.
            assert.deepEqual(await days(`/api/search?routineId=${id}&${range}`), [
              'diary 2001-03-03',
              'skip 2001-03-03',
            ]);
            // Skip reasons are found by text, with the routine name; other dates stay out.
            const knee = await call(`/api/search?q=KNEE&${range}`);
            assert.deepEqual(knee.data.results, [
              {
                kind: 'skip',
                date: '2001-03-03',
                field: 'skipReason',
                snippet: 'Knee hurts today',
                routineId: id,
                routineName: 'Search test run',
              },
            ]);
            assert.deepEqual(
              await dateList('/api/search?q=knee&from=2001-03-04&to=2001-03-05'),
              [],
            );
            assert.deepEqual(
              await dateList(`/api/search?q=knee&routineId=${id}&result=done&${range}`),
              [],
            );
            assert.deepEqual(await dateList(`/api/search?routineId=${id}&q=alpha&${range}`), []);
            // Paging keeps the total.
            const page = await call(`/api/search?q=alpha&${range}&limit=1&offset=1`);
            assert.equal(page.data.total, 3);
            assert.deepEqual(
              (page.data.results as Result[]).map((result) => result.date),
              ['2001-03-02'],
            );
            const past = await call(`/api/search?q=alpha&${range}&offset=50`);
            assert.deepEqual(past.data, { limit: 20, offset: 50, total: 0, results: [] });
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        const ids = [id, otherId];
        await client.query('DELETE FROM routine_skips WHERE routine_id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM routine_checks WHERE routine_id = ANY($1::bigint[])', [
          ids,
        ]);
        await client.query('DELETE FROM routines WHERE id = ANY($1::bigint[])', [ids]);
        await client.query('DELETE FROM diary_entries WHERE entry_date = ANY($1::date[])', [dates]);
      }
    }),
);
