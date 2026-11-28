import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

const plansMigration = new URL('../../database/migrations/014_plans.sql', import.meta.url);

test(
  'plans migration re-runs safely and enforces its limits',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(plansMigration, 'utf8'));
      await client.query(readFileSync(plansMigration, 'utf8'));
      const rejects = async (values: string) => {
        await client.query('BEGIN');
        try {
          await assert.rejects(
            client.query(
              `INSERT INTO plans (horizon, period_start, title, description, status) VALUES ${values}`,
            ),
            { code: '23514' },
          );
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("('month', '2026-10-18', 'a', NULL, 'planned')");
      await rejects("('week', '2026-10-18', '   ', NULL, 'planned')");
      await rejects("('week', '2026-10-18', repeat('a', 201), NULL, 'planned')");
      await rejects("('week', '2026-10-18', 'a', repeat('a', 2001), 'planned')");
      await rejects("('week', '2026-10-18', 'a', NULL, 'late')");
      // A week starts on Sunday; a decade on January 1.
      await rejects("('week', '2026-10-19', 'a', NULL, 'planned')");
      await rejects("('decade', '2026-02-01', 'a', NULL, 'planned')");
    }),
);

test(
  'plans are listed per horizon and period, in order, and every change leaves an audit row',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      await client.query(readFileSync(plansMigration, 'utf8'));
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
      const created: number[] = [];
      try {
        await withApi(
          pool,
          async (call) => {
            type Plan = { id: number; periodStart: string; periodEnd: string; title: string };
            const add = async (body: Record<string, unknown>) => {
              const { status, data } = await call('/api/plans', { method: 'POST', body });
              assert.equal(status, 201);
              const row = data.plan as Plan;
              created.push(row.id);
              return row;
            };
            const list = async (horizon: string, periodStart = '') => {
              const suffix = periodStart ? `&periodStart=${periodStart}` : '';
              const { data } = await call(`/api/plans?horizon=${horizon}${suffix}`);
              return data as { plans: Plan[] };
            };
            const has = (found: { plans: Plan[] }, id: number) =>
              found.plans.some((row) => row.id === id);
            // First use on Thursday 2026-10-22, so the period starts on Sunday 2026-10-18.
            const week = await add({ horizon: 'week', title: 'Week plan' });
            const secondWeek = await add({ horizon: 'week', title: 'Second' });
            const twelve = await add({ horizon: 'twelve_week', title: '12 weeks' });
            const year = await add({ horizon: 'year', title: 'Year' });
            const decade = await add({
              horizon: 'decade',
              periodStart: '2030-05-05',
              title: 'Decade',
            });
            assert.deepEqual(
              [week, twelve, year, decade].map((row) => [row.periodStart, row.periodEnd]),
              [
                ['2026-10-18', '2026-10-24'],
                ['2026-10-18', '2027-01-09'],
                ['2026-10-18', '2027-10-16'],
                ['2030-01-01', '2039-12-31'],
              ],
            );

            const weeks = await list('week');
            assert.deepEqual(
              weeks.plans.filter((row) => created.includes(row.id)).map((row) => row.id),
              [week.id, secondWeek.id],
            );
            assert.equal(has(await list('decade', '2035-03-03'), decade.id), true);
            assert.equal(has(await list('decade'), decade.id), false);

            // Moving a plan to another period puts it at the end there.
            const moved = await call(`/api/plans/${week.id}`, {
              method: 'PATCH',
              body: { periodStart: '2026-10-28', status: 'done' },
            });
            assert.equal(moved.status, 200);
            assert.equal((moved.data.plan as Plan).periodStart, '2026-10-25');
            assert.equal(has(await list('week', '2026-10-25'), week.id), true);

            assert.equal((await call(`/api/plans/${year.id}`, { method: 'DELETE' })).status, 200);
            assert.equal((await call(`/api/plans/${year.id}`, { method: 'DELETE' })).status, 404);
            const missing = await call('/api/plans/999999999', {
              method: 'PATCH',
              body: { title: 'x' },
            });
            assert.equal(missing.status, 404);

            const audit = await client.query<{ action: string }>(
              `SELECT action FROM audit_log WHERE entity = 'plan' AND entity_id = $1 ORDER BY id`,
              [String(week.id)],
            );
            assert.deepEqual(
              audit.rows.map((row) => row.action),
              ['create', 'update'],
            );
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        await client.query('DELETE FROM plans WHERE id = ANY($1::bigint[])', [created]);
        await client.query(
          `DELETE FROM audit_log WHERE entity = 'plan' AND entity_id = ANY($1::text[])`,
          [created.map(String)],
        );
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        if (original.rows[0])
          await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
            anchorSettingKey,
            original.rows[0].value,
          ]);
      }
    }),
);
