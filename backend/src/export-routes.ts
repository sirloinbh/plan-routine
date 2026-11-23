import { type Response, Router } from 'express';
import type { Pool } from 'pg';

import { toCsv } from './export-csv.js';

// Bookkeeping of the migration runner, not the user's data.
const skippedTables = new Set(['schema_migrations']);

export const exportVersion = 1;

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

export function exportRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Real data: never cached, and downloaded as a file rather than shown.
  const download = (res: Response, name: string, type: string, body: string) => {
    res.setHeader('Content-Type', `${type}; charset=utf-8`);
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(body);
  };

  // Every table of the public schema, found at request time so a table added by a later migration is
  // included without changing this file. One read-only snapshot, so the tables agree with each other.
  router.get('/', async (_req, res) => {
    const current = today();
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const names = await client.query<{ name: string }>(
        `SELECT table_name AS name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      );
      const tables: Record<string, unknown[]> = {};
      for (const { name } of names.rows) {
        if (skippedTables.has(name)) continue;
        tables[name] = (
          await client.query(`SELECT * FROM ${quoteIdentifier(name)} ORDER BY 1`)
        ).rows;
      }
      await client.query('COMMIT');
      download(
        res,
        `plan-routine-export-${current}.json`,
        'application/json',
        JSON.stringify({ version: exportVersion, exportedOn: current, tables }, null, 2),
      );
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });

  router.get('/checks.csv', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT routine_checks.period_start AS date, routines.name AS routine, routines.cadence,
         routines.category, routine_checks.checked_at AS "checkedAt"
       FROM routine_checks
       JOIN routines ON routines.id = routine_checks.routine_id
       ORDER BY routine_checks.period_start, routines.cadence, routines.id`,
    );
    download(
      res,
      `plan-routine-checks-${today()}.csv`,
      'text/csv',
      toCsv(
        ['date', 'routine', 'cadence', 'category', 'checked_at'],
        rows.map((row) => [row.date, row.routine, row.cadence, row.category, row.checkedAt]),
      ),
    );
  });

  router.get('/diary.csv', async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT entry_date AS date, body, good_note AS "goodNote", regret_note AS "regretNote",
         tomorrow_note AS "tomorrowNote", mood, energy, updated_at AS "updatedAt"
       FROM diary_entries ORDER BY entry_date`,
    );
    download(
      res,
      `plan-routine-diary-${today()}.csv`,
      'text/csv',
      toCsv(
        [
          'date',
          'entry',
          'went_well',
          'could_be_better',
          'tomorrow',
          'mood',
          'energy',
          'updated_at',
        ],
        rows.map((row) => [
          row.date,
          row.body,
          row.goodNote,
          row.regretNote,
          row.tomorrowNote,
          row.mood,
          row.energy,
          row.updatedAt,
        ]),
      ),
    );
  });

  return router;
}
