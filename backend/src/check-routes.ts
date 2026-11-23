import { type Request, type Response, Router } from 'express';
import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { addDays, type Cadence, calendarDate, daysBetween, periodFor } from './periods.js';
import { badRequest, noNul, nulMessage, requestBody } from './request-input.js';
import { routineColumns, routineId, routineNotFound } from './routine-routes.js';
import { checkAmount, routineAnchorDate, routineCadence } from './routines.js';

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

// A skip's optional reason: one line of at most 200 characters; blank means no reason.
export const skipReasonMaxLength = 200;
export const skipInput = z.object(
  {
    reason: z
      .string()
      .trim()
      .max(skipReasonMaxLength, `Reason must be at most ${skipReasonMaxLength} characters`)
      .refine(noNul, nulMessage)
      .nullish()
      .transform((value) => value || null),
  },
  badRequest,
);
// The body of a check: an optional amount in the routine's unit. Left out keeps the stored amount; null clears it.
export const checkInput = z.object({ amount: checkAmount.nullable().optional() }, badRequest);
const noUnit = 'This routine has no unit, so it cannot record an amount';
const skippedAlready = 'This period is skipped. Remove the skip before checking it';
const checkedAlready = 'This period is checked. Uncheck it before skipping it';

// ISO dates compare correctly as strings.
function dateRangeError(date: string, today: string) {
  if (date > today) return 'Future dates cannot be checked';
  if (date < addDays(today, -editableDays))
    return `You can only check today and the ${editableDays} days before it`;
  return null;
}

// Locks the active routine row (so a concurrent archive, check or skip of it waits, and a period is never
// both checked and skipped) and returns the period holding the date.
async function lockRoutinePeriod(client: PoolClient, id: number, date: string, current: string) {
  const target = await client.query<{
    cadence: Cadence;
    timesPerWeek: number | null;
    hasUnit: boolean;
  }>(
    `SELECT cadence, times_per_week AS "timesPerWeek", unit IS NOT NULL AS "hasUnit"
     FROM routines WHERE id = $1 AND archived_at IS NULL FOR UPDATE`,
    [id],
  );
  if (!target.rows[0]) throw new HttpError(404, routineNotFound);
  // After the existence check, so a 404 does not store the first-use date (#153).
  const anchorDate = await routineAnchorDate(client, current);
  const period = periodFor(target.rows[0].cadence, date, anchorDate);
  // An N-per-week routine checks single days of its week; the skip still covers the whole week (#245).
  return {
    period,
    checkStart: target.rows[0].timesPerWeek ? date : period.start,
    hasUnit: target.rows[0].hasUnit,
  };
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
         WHERE routine_checks.routine_id = routines.id
           AND routine_checks.period_start = CASE WHEN routines.times_per_week IS NULL THEN $2::date ELSE $3::date END
       ) AS checked,
       CASE WHEN routines.unit IS NULL THEN NULL ELSE (
         SELECT routine_checks.amount FROM routine_checks
         WHERE routine_checks.routine_id = routines.id
           AND routine_checks.period_start = CASE WHEN routines.times_per_week IS NULL THEN $2::date ELSE $3::date END
       ) END AS amount,
       CASE WHEN routines.times_per_week IS NULL THEN NULL ELSE (
         SELECT count(*)::int FROM routine_checks
         WHERE routine_checks.routine_id = routines.id
           AND routine_checks.period_start BETWEEN $2::date AND $4::date
       ) END AS "weekChecks",
       EXISTS (
         SELECT 1 FROM routine_skips
         WHERE routine_skips.routine_id = routines.id AND routine_skips.period_start = $2
       ) AS skipped,
       (SELECT s.reason FROM routine_skips s
        WHERE s.routine_id = routines.id AND s.period_start = $2) AS "skipReason",
       (SELECT p.name FROM project_links p WHERE p.id = routines.project_link_id) AS "linkName",
       (SELECT p.url FROM project_links p WHERE p.id = routines.project_link_id) AS "linkUrl"
       FROM routines
       WHERE archived_at IS NULL AND cadence = $1
         AND (
           weekdays IS NULL OR EXTRACT(DOW FROM $2::date)::int = ANY(weekdays)
           OR EXISTS (
             SELECT 1 FROM routine_checks
             WHERE routine_checks.routine_id = routines.id AND routine_checks.period_start = $2::date
           )
           OR EXISTS (
             SELECT 1 FROM routine_skips
             WHERE routine_skips.routine_id = routines.id AND routine_skips.period_start = $2::date
           )
         )
       ORDER BY category, sort_order, routines.id`,
      [cadence, period.start, target, period.end],
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
    // Only PUT carries a body; DELETE removes the check with its amount.
    const { amount } = checked ? checkInput.parse(requestBody(req.body)) : { amount: undefined };
    const current = today();
    const rangeError = dateRangeError(date, current);
    if (rangeError) throw new HttpError(400, rangeError);
    const reply = await inTransaction(pool, async (client) => {
      const { period, checkStart, hasUnit } = await lockRoutinePeriod(client, id, date, current);
      if (checked && amount != null && !hasUnit) throw new HttpError(400, noUnit);
      if (checked) {
        const skipped = await client.query(
          'SELECT 1 FROM routine_skips WHERE routine_id = $1 AND period_start = $2',
          [id, period.start],
        );
        if (skipped.rows[0]) throw new HttpError(409, skippedAlready);
      }
      await client.query(
        checked
          ? `INSERT INTO routine_checks (routine_id, period_start, amount) VALUES ($1, $2, $3)
             ON CONFLICT (routine_id, period_start) DO UPDATE
             SET amount = CASE WHEN $4::boolean THEN EXCLUDED.amount ELSE routine_checks.amount END`
          : 'DELETE FROM routine_checks WHERE routine_id = $1 AND period_start = $2',
        checked ? [id, checkStart, amount ?? null, amount !== undefined] : [id, checkStart],
      );
      return {
        status: 200,
        body: {
          routineId: id,
          date,
          period,
          checked,
          ...(checked && amount !== undefined ? { amount } : {}),
        },
      };
    });
    res.status(reply.status).json(reply.body);
  };

  router.put('/routines/:id/checks/:date', (req, res) => changeCheck(req, res, true));
  router.delete('/routines/:id/checks/:date', (req, res) => changeCheck(req, res, false));

  // Skips follow the same rules as checks: the editable days, one row per period, repeats change nothing.
  // PUT again with another reason replaces the reason. A checked period cannot be skipped (409).
  router.put('/routines/:id/skips/:date', async (req, res) => {
    const { id, date } = checkParams.parse(req.params);
    const { reason } = skipInput.parse(requestBody(req.body));
    const current = today();
    const rangeError = dateRangeError(date, current);
    if (rangeError) throw new HttpError(400, rangeError);
    const reply = await inTransaction(pool, async (client) => {
      const { period } = await lockRoutinePeriod(client, id, date, current);
      const checked = await client.query(
        `SELECT 1 FROM routine_checks
         WHERE routine_id = $1 AND period_start BETWEEN $2 AND $3`,
        [id, period.start, period.end],
      );
      if (checked.rows[0]) throw new HttpError(409, checkedAlready);
      await client.query(
        `INSERT INTO routine_skips (routine_id, period_start, reason) VALUES ($1, $2, $3)
         ON CONFLICT (routine_id, period_start) DO UPDATE SET reason = EXCLUDED.reason`,
        [id, period.start, reason],
      );
      return { status: 200, body: { routineId: id, date, period, skipped: true, reason } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.delete('/routines/:id/skips/:date', async (req, res) => {
    const { id, date } = checkParams.parse(req.params);
    const current = today();
    const rangeError = dateRangeError(date, current);
    if (rangeError) throw new HttpError(400, rangeError);
    const reply = await inTransaction(pool, async (client) => {
      const { period } = await lockRoutinePeriod(client, id, date, current);
      await client.query('DELETE FROM routine_skips WHERE routine_id = $1 AND period_start = $2', [
        id,
        period.start,
      ]);
      return { status: 200, body: { routineId: id, date, period, skipped: false, reason: null } };
    });
    res.status(reply.status).json(reply.body);
  });

  return router;
}
