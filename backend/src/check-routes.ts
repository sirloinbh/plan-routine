import { type Request, type Response, Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';

import { addDays, type Cadence, calendarDate, periodFor } from './periods.js';
import { notFound, routineColumns, routineId } from './routine-routes.js';
import { routineAnchorDate, routineCadence } from './routines.js';

// Checks can change for today and the seven days before it (confirmed on issue #5).
const editableDays = 7;

const checklistQuery = z.object({
  cadence: routineCadence.default('daily'),
  date: calendarDate.optional(),
});
const checkParams = z.object({ id: routineId, date: calendarDate });

// ISO dates compare correctly as strings.
function dateRangeError(date: string, today: string) {
  if (date > today) return '미래 날짜는 체크할 수 없습니다';
  if (date < addDays(today, -editableDays))
    return `최근 ${editableDays}일까지만 체크할 수 있습니다`;
  return null;
}

export function checkRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/checklist', async (req, res) => {
    const { cadence, date } = checklistQuery.parse(req.query);
    const current = today();
    const target = date ?? current;
    const rangeError = dateRangeError(target, current);
    if (rangeError) {
      res.status(400).json({ error: rangeError });
      return;
    }
    const anchorDate = await routineAnchorDate(pool, current);
    const period = periodFor(cadence, target, anchorDate);
    // Active routines only; an archived routine keeps its checks but leaves the checklist.
    const { rows } = await pool.query(
      `SELECT ${routineColumns}, EXISTS (
         SELECT 1 FROM routine_checks
         WHERE routine_checks.routine_id = routines.id AND routine_checks.period_start = $2
       ) AS checked
       FROM routines
       WHERE archived_at IS NULL AND cadence = $1
       ORDER BY category, sort_order, id`,
      [cadence, period.start],
    );
    const neighbour = (days: number) => {
      const other = addDays(target, days);
      return dateRangeError(other, current) ? null : other;
    };
    res.json({
      date: target,
      today: current,
      previousDate: neighbour(-1),
      nextDate: neighbour(1),
      period,
      items: rows,
    });
  });

  // PUT and DELETE both answer with the final state, so repeating either changes nothing.
  const changeCheck = async (req: Request, res: Response, checked: boolean) => {
    const { id, date } = checkParams.parse(req.params);
    const current = today();
    const rangeError = dateRangeError(date, current);
    if (rangeError) {
      res.status(400).json({ error: rangeError });
      return;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const anchorDate = await routineAnchorDate(client, current);
      // FOR SHARE makes a concurrent archive wait, so an archived routine cannot gain a check.
      const target = await client.query<{ cadence: Cadence }>(
        'SELECT cadence FROM routines WHERE id = $1 AND archived_at IS NULL FOR SHARE',
        [id],
      );
      if (!target.rows[0]) {
        await client.query('ROLLBACK');
        res.status(404).json(notFound);
        return;
      }
      const period = periodFor(target.rows[0].cadence, date, anchorDate);
      await client.query(
        checked
          ? `INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, $2)
             ON CONFLICT (routine_id, period_start) DO NOTHING`
          : 'DELETE FROM routine_checks WHERE routine_id = $1 AND period_start = $2',
        [id, period.start],
      );
      await client.query('COMMIT');
      res.json({ routineId: id, date, period, checked });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  };

  router.put('/routines/:id/checks/:date', (req, res) => changeCheck(req, res, true));
  router.delete('/routines/:id/checks/:date', (req, res) => changeCheck(req, res, false));

  return router;
}
