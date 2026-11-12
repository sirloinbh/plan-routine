import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { dailyRoutineOn } from './day-records.js';
import { entryColumns } from './diary-routes.js';
import { addDays, calendarDate, shiftMonth } from './periods.js';

// Same floor as the diary: PostgreSQL has no year 0000.
const earliestDate = '2000-01-01';

const monthQuery = z.object({
  month: z
    .string({ error: 'Month must be in YYYY-MM format' })
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Month must be in YYYY-MM format')
    .optional(),
});
const dateParam = z.object({ date: calendarDate });

export function recordRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // One month for the calendar. Future days are left out: they have no record yet.
  router.get('/', async (req, res) => {
    const { month: requested } = monthQuery.parse(req.query);
    const current = today();
    const thisMonth = current.slice(0, 7);
    const month = requested ?? thisMonth;
    if (month > thisMonth) {
      res.status(400).json({ error: 'Records for a future month cannot be viewed' });
      return;
    }
    const firstDay = `${month}-01`;
    if (firstDay < earliestDate) {
      res.status(400).json({ error: 'Records can only be viewed from the year 2000 on' });
      return;
    }
    const lastDay = addDays(`${shiftMonth(month, 1)}-01`, -1);
    const { rows } = await pool.query(
      `SELECT days.date,
         (SELECT count(*)::int FROM routines WHERE ${dailyRoutineOn('routines', 'days.date')}) AS total,
         (SELECT count(*)::int FROM routine_checks
          JOIN routines ON routines.id = routine_checks.routine_id
          WHERE routines.cadence = 'daily' AND routine_checks.period_start = days.date) AS checked,
         EXISTS (SELECT 1 FROM diary_entries WHERE entry_date = days.date) AS "hasDiary"
       FROM (
         SELECT generate_series($1::date, $2::date, interval '1 day')::date AS date
       ) AS days
       ORDER BY days.date`,
      [firstDay, lastDay < current ? lastDay : current],
    );
    const previous = shiftMonth(month, -1);
    res.json({
      today: current,
      month,
      previousMonth: `${previous}-01` < earliestDate ? null : previous,
      nextMonth: month < thisMonth ? shiftMonth(month, 1) : null,
      days: rows,
    });
  });

  // One day's record. Read-only: changes happen on the checklist and diary pages under their rules.
  router.get('/:date', async (req, res) => {
    const { date } = dateParam.parse(req.params);
    const current = today();
    if (date > current) {
      res.status(400).json({ error: 'Records for a future date cannot be viewed' });
      return;
    }
    if (date < earliestDate) {
      res.status(400).json({ error: 'Records can only be viewed from the year 2000 on' });
      return;
    }
    const routines = await pool.query<{ checked: boolean }>(
      `SELECT routines.id::text AS id, routines.name, routines.cadence, routines.category,
         routines.sort_order AS "sortOrder",
         routines.archived_at IS NOT NULL AS archived,
         EXISTS (
           SELECT 1 FROM routine_checks
           WHERE routine_checks.routine_id = routines.id AND routine_checks.period_start = $1
         ) AS checked
       FROM routines
       WHERE ${dailyRoutineOn('routines', '$1::date')}
       ORDER BY routines.category, routines.sort_order, routines.id`,
      [date],
    );
    const diary = await pool.query(
      `SELECT ${entryColumns} FROM diary_entries WHERE entry_date = $1`,
      [date],
    );
    res.json({
      date,
      today: current,
      progress: {
        checked: routines.rows.filter((routine) => routine.checked).length,
        total: routines.rows.length,
      },
      routines: routines.rows,
      diary: diary.rows[0] ?? null,
    });
  });

  return router;
}
