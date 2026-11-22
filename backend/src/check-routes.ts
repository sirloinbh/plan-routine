import { type Request, type Response, Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { addDays, type Cadence, calendarDate, daysBetween, periodFor } from './periods.js';
import { routineColumns, routineId, routineNotFound } from './routine-routes.js';
import { routineAnchorDate, routineCadence } from './routines.js';

// Checks can change for today and the seven days before it (confirmed on issue #5).
const editableDays = 7;
// A period's last 7 days, when unfinished four-week routines join the daily page (issue #7).
const endingDays = 7;
import { HttpError } from './standard/http.js';
import { inTransaction } from './transaction.js';

export const checklistQuery = z.object({
  cadence: routineCadence.default('daily'),
  date: calendarDate.optional(),
});
const checkParams = z.object({ id: routineId, date: calendarDate });

// ISO dates compare correctly as strings.
function dateRangeError(date: string, today: string) {
  if (date > today) return 'Future dates cannot be checked';
  if (date < addDays(today, -editableDays))
    return `You can only check the last ${editableDays} days`;
  return null;
}

export function checkRoutes(pool: Pool, today: () => string) {
  const router = Router();

  router.get('/checklist', async (req, res) => {
    const { cadence, date } = checklistQuery.parse(req.query);
    const current = today();
    const target = date ?? current;
    const rangeError = dateRangeError(target, current);
    if (rangeError) throw new HttpError(400, rangeError);
    const anchorDate = await routineAnchorDate(pool, current);
    const period = periodFor(cadence, target, anchorDate);
    // Active routines only; an archived routine keeps its checks but leaves the checklist.
    const { rows } = await pool.query(
      `SELECT ${routineColumns}, EXISTS (
         SELECT 1 FROM routine_checks
         WHERE routine_checks.routine_id = routines.id AND routine_checks.period_start = $2
       ) AS checked,
       (SELECT p.name FROM project_links p WHERE p.id = routines.project_link_id) AS "linkName",
       (SELECT p.url FROM project_links p WHERE p.id = routines.project_link_id) AS "linkUrl"
       FROM routines
       WHERE archived_at IS NULL AND cadence = $1
       ORDER BY category, sort_order, routines.id`,
      [cadence, period.start],
    );
    // From today, not from the requested date; a period already over has none left.
    const daysLeft = daysBetween(current, period.end);
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
      remainingDays: Math.max(daysLeft, 0),
      endsSoon: daysLeft >= 0 && daysLeft < endingDays,
      items: rows,
    });
  });

  // PUT and DELETE both answer with the final state, so repeating either changes nothing.
  const changeCheck = async (req: Request, res: Response, checked: boolean) => {
    const { id, date } = checkParams.parse(req.params);
    const current = today();
    const rangeError = dateRangeError(date, current);
    if (rangeError) throw new HttpError(400, rangeError);
    const reply = await inTransaction(pool, async (client) => {
      // FOR SHARE makes a concurrent archive wait, so an archived routine cannot gain a check.
      const target = await client.query<{ cadence: Cadence }>(
        'SELECT cadence FROM routines WHERE id = $1 AND archived_at IS NULL FOR SHARE',
        [id],
      );
      if (!target.rows[0]) throw new HttpError(404, routineNotFound);
      // After the existence check, so a 404 does not store the first-use date (#153).
      const anchorDate = await routineAnchorDate(client, current);
      const period = periodFor(target.rows[0].cadence, date, anchorDate);
      await client.query(
        checked
          ? `INSERT INTO routine_checks (routine_id, period_start) VALUES ($1, $2)
             ON CONFLICT (routine_id, period_start) DO NOTHING`
          : 'DELETE FROM routine_checks WHERE routine_id = $1 AND period_start = $2',
        [id, period.start],
      );
      return { status: 200, body: { routineId: id, date, period, checked } };
    });
    res.status(reply.status).json(reply.body);
  };

  router.put('/routines/:id/checks/:date', (req, res) => changeCheck(req, res, true));
  router.delete('/routines/:id/checks/:date', (req, res) => changeCheck(req, res, false));

  return router;
}
