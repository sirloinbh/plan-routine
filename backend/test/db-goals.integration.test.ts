import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

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
      const created: number[] = [];
      let today = '2026-10-22';
      try {
        await withApi(
          pool,
          async (call) => {
            type Period = {
              period: { start: string };
              goals: {
                id: number;
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
              const { id } = data.goal as { id: number };
              created.push(id);
              return id;
            };
            // Thursday first use, so the period counts from Sunday 10-18.
            const first = await add('Read a book');
            const second = await add('Run');
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
              body: { title: 'Run 5 km' },
            });
            assert.equal(renamed.status, 200);
            const removable = await add('Goal to delete');
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
                ['Read a book', null],
                ['Run 5 km', null],
              ],
            );
            const next = await add('New goal');

            // A past goal keeps its text.
            const pastEdit = await call(`/api/goals/${first}`, {
              method: 'PATCH',
              body: { title: 'Other name' },
            });
            assert.equal(pastEdit.status, 400);
            assert.equal((await call(`/api/goals/${first}`, { method: 'DELETE' })).status, 400);

            // One goal of the running period cancels the whole request.
            const mixed = await call('/api/goals/reviews', {
              method: 'PUT',
              body: {
                reviews: [
                  { id: first, achieved: true, note: 'Must not remain' },
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
                  { id: first, achieved: true, note: ' Read 10 books ' },
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
                [true, 'Read 10 books', true],
                [false, null, true],
              ],
            );

            // Saving the same answers again leaves reviewed_at and updated_at alone; a changed note moves them.
            const stamps = () =>
              client.query<{ reviewed_at: Date; updated_at: Date }>(
                'SELECT reviewed_at, updated_at FROM twelve_week_goals WHERE id = $1',
                [first],
              );
            const beforeResave = (await stamps()).rows[0];
            const resaved = await call('/api/goals/reviews', {
              method: 'PUT',
              body: { reviews: [{ id: first, achieved: true, note: 'Read 10 books' }] },
            });
            assert.equal(resaved.status, 200);
            assert.deepEqual((await stamps()).rows[0], beforeResave);
            await call('/api/goals/reviews', {
              method: 'PUT',
              body: { reviews: [{ id: first, achieved: true, note: 'Read 11 books' }] },
            });
            assert.ok((await stamps()).rows[0].reviewed_at > beforeResave.reviewed_at);

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
      const routines: number[] = [];
      const goals: number[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            const addRoutine = async (name: string, cadence: string, category?: string) => {
              const { data } = await call('/api/routines', {
                method: 'POST',
                body: { name, cadence, category },
              });
              const { id } = data.routine as { id: number };
              routines.push(id);
              return id;
            };
            const daily = await addRoutine('Link daily', 'daily', 'care');
            const weekly = await addRoutine('Link weekly', 'weekly');
            const fourWeek = await addRoutine('Link 4-week', 'four_week');
            const created = await call('/api/goals', {
              method: 'POST',
              body: { title: 'Link goal' },
            });
            const goalId = (created.data.goal as { id: number }).id;
            goals.push(goalId);
            const path = `/api/goals/${goalId}/routines`;
            const put = (routineIds: number[]) =>
              call(path, { method: 'PUT', body: { routineIds } });
            const shown = async () => {
              const { data } = await call('/api/goals');
              const { goals: list } = data.current as {
                goals: { id: number; routines: { id: number; name: string }[] }[];
              };
              return list.find((goal) => goal.id === goalId)!.routines;
            };

            assert.deepEqual(await shown(), []);
            const linked = await put([weekly, daily]);
            assert.equal(linked.status, 200);
            const both = [
              { id: daily, name: 'Link daily' },
              { id: weekly, name: 'Link weekly' },
            ];
            assert.deepEqual(linked.data.routines, both);
            assert.deepEqual(await shown(), both);

            // A refused list changes nothing.
            assert.equal((await put([daily, fourWeek])).status, 400);
            assert.deepEqual(await shown(), both);

            assert.equal((await put([weekly])).status, 200);
            assert.deepEqual(await shown(), [{ id: weekly, name: 'Link weekly' }]);

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
