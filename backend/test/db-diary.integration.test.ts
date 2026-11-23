import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

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
      const created: number[] = [];
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
              body: { body: ' First entry ', goodNote: 'Good points', regretNote: '  ' },
            });
            assert.equal(first.status, 200);
            assert.deepEqual(first.data.entry, {
              date: '2026-10-22',
              body: 'First entry',
              goodNote: 'Good points',
              regretNote: null,
              tomorrowNote: null,
              mood: null,
              energy: null,
            });

            // Scores save and reload, and saving without them clears them.
            const scored = await call(path, {
              method: 'PUT',
              body: { body: 'Scored', mood: 4, energy: 1 },
            });
            assert.equal(scored.status, 200);
            const scoredAgain = await call('/api/diary?date=2026-10-22');
            assert.deepEqual(
              [
                (scoredAgain.data.entry as { mood: number }).mood,
                (scoredAgain.data.entry as { energy: number }).energy,
              ],
              [4, 1],
            );

            const second = await call(path, { method: 'PUT', body: { body: 'Edited text' } });
            assert.equal(second.status, 200);
            const reread = await call('/api/diary?date=2026-10-22');
            assert.equal((reread.data.entry as { body: string }).body, 'Edited text');
            // Saving without a note clears the note it had.
            assert.equal((reread.data.entry as { goodNote: unknown }).goodNote, null);

            const both = await Promise.all(
              ['Concurrent save 1', 'Concurrent save 2'].map((text) =>
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
              body: { body: '😀'.repeat(2500), goodNote: 'a'.repeat(1000) },
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
            for (const name of ['Diary progress 1', 'Diary progress 2']) {
              const { data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence: 'daily', category: 'care' },
              });
              created.push((data.routine as { id: number }).id);
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

const scoresMigration = new URL('../../database/migrations/009_diary_scores.sql', import.meta.url);

test(
  'diary scores migration re-runs safely and the table only accepts scores from 1 to 5',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(scoresMigration, 'utf8'));
      await client.query(readFileSync(scoresMigration, 'utf8'));
      const insert = (mood: string, energy: string) =>
        client.query(
          `INSERT INTO diary_entries (entry_date, body, mood, energy) VALUES ('2001-02-03', 'a', ${mood}, ${energy})`,
        );
      for (const [mood, energy] of [
        ['0', 'NULL'],
        ['NULL', '6'],
      ]) {
        await client.query('BEGIN');
        try {
          await assert.rejects(insert(mood, energy), { code: '23514' });
        } finally {
          await client.query('ROLLBACK');
        }
      }
      await client.query('BEGIN');
      try {
        await insert('1', '5');
      } finally {
        await client.query('ROLLBACK');
      }
    }),
);
