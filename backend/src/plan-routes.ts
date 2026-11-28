import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { pathId } from './ids.js';
import {
  calendarDate,
  lastPlanDate,
  type PlanHorizon,
  planHorizons,
  planPeriodFor,
} from './periods.js';
import { badRequest, noNul, nulMessage, requestBody } from './request-input.js';
import { routineAnchorDate } from './routines.js';
import { auditContext, writeAudit } from './standard/audit.js';
import { HttpError } from './standard/http.js';
import { inTransaction } from './transaction.js';

export const planStatuses = ['planned', 'in_progress', 'done', 'dropped'] as const;

const planColumns = `id, horizon, period_start AS "periodStart", title, description,
  sort_order AS "sortOrder", status`;
const planNotFound = 'Plan not found';

const idParam = z.object({ id: pathId('Invalid plan ID') });

const horizon = z.enum(planHorizons, {
  error: (issue) =>
    issue.input === undefined
      ? 'Choose a horizon'
      : `Horizon must be one of ${planHorizons.join(', ')}`,
});
const periodStart = calendarDate.refine(
  (value) => value >= '2000-01-01' && value <= lastPlanDate,
  `Period start must be from 2000-01-01 to ${lastPlanDate}`,
);
const title = z
  .string({
    error: (issue) => (issue.input === undefined ? 'Enter a title' : 'The title must be text'),
  })
  .trim()
  .refine((value) => value.length >= 1, 'Enter a title')
  .refine((value) => value.length <= 200, 'The title must be 200 characters or fewer')
  .refine(noNul, nulMessage);
// A blank description is the same as none.
const description = z
  .string({ error: 'The description must be text' })
  .trim()
  .refine((value) => value.length <= 2000, 'The description must be 2000 characters or fewer')
  .refine(noNul, nulMessage)
  .nullish()
  .transform((value) => value || null);
const status = z.enum(planStatuses, {
  error: `Status must be one of ${planStatuses.join(', ')}`,
});

export const planQuery = z.object({ horizon, periodStart: periodStart.optional() }, badRequest);

export const planInput = z.object(
  { horizon, periodStart: periodStart.optional(), title, description, status: status.optional() },
  badRequest,
);

// The horizon of a plan never changes; a plan on another horizon is a new plan.
export const planPatchInput = z
  .object(
    {
      periodStart: periodStart.optional(),
      title: title.optional(),
      description: description.optional(),
      status: status.optional(),
    },
    badRequest,
  )
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    error: 'Send at least one field to change',
  });

type PlanRow = {
  id: number;
  horizon: PlanHorizon;
  periodStart: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: (typeof planStatuses)[number];
};

const withEnd = (row: PlanRow, anchorDate: string) => ({
  ...row,
  periodEnd: planPeriodFor(row.horizon, row.periodStart, anchorDate).end,
});

export function planRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // A date picks its period: any day of it names it. Without a date, the period holding today.
  const periodOf = async (db: Pool, which: PlanHorizon, date: string | undefined) => {
    const anchorDate = await routineAnchorDate(db, today());
    return { anchorDate, period: planPeriodFor(which, date ?? today(), anchorDate) };
  };

  router.get('/', async (req, res) => {
    const query = planQuery.parse(req.query);
    const { anchorDate, period } = await periodOf(pool, query.horizon, query.periodStart);
    const { rows } = await pool.query<PlanRow>(
      `SELECT ${planColumns} FROM plans WHERE horizon = $1 AND period_start = $2
       ORDER BY sort_order, id`,
      [query.horizon, period.start],
    );
    res.json({
      horizon: query.horizon,
      period,
      plans: rows.map((row) => withEnd(row, anchorDate)),
    });
  });

  router.post('/', async (req, res) => {
    const input = planInput.parse(requestBody(req.body));
    const reply = await inTransaction(pool, async (client) => {
      const anchorDate = await routineAnchorDate(client, today());
      const period = planPeriodFor(input.horizon, input.periodStart ?? today(), anchorDate);
      const { rows } = await client.query<PlanRow>(
        `INSERT INTO plans (horizon, period_start, title, description, status, sort_order)
         SELECT $1, $2::date, $3, $4, $5, COALESCE(MAX(sort_order) + 1, 0) FROM plans
         WHERE horizon = $1 AND period_start = $2::date
         RETURNING ${planColumns}`,
        [input.horizon, period.start, input.title, input.description, input.status ?? 'planned'],
      );
      await writeAudit(client, {
        ...auditContext(req, res),
        action: 'create',
        entity: 'plan',
        entityId: rows[0].id,
        after: rows[0],
      });
      return { status: 201, body: { plan: withEnd(rows[0], anchorDate) } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const input = planPatchInput.parse(requestBody(req.body));
    const reply = await inTransaction(pool, async (client) => {
      const current = await client.query<PlanRow>(
        `SELECT ${planColumns} FROM plans WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const before = current.rows[0];
      if (!before) throw new HttpError(404, planNotFound);
      const anchorDate = await routineAnchorDate(client, today());
      const start = input.periodStart
        ? planPeriodFor(before.horizon, input.periodStart, anchorDate).start
        : before.periodStart;
      // A plan moved to another period goes to the end of that period's list.
      const { rows } = await client.query<PlanRow>(
        `UPDATE plans SET title = $1, description = $2, status = $3, period_start = $4::date,
           sort_order = CASE WHEN $4::date = period_start THEN sort_order ELSE
             (SELECT COALESCE(MAX(sort_order) + 1, 0) FROM plans WHERE horizon = $5 AND period_start = $4::date) END,
           updated_at = now()
         WHERE id = $6 RETURNING ${planColumns}`,
        [
          input.title ?? before.title,
          input.description === undefined ? before.description : input.description,
          input.status ?? before.status,
          start,
          before.horizon,
          id,
        ],
      );
      await writeAudit(client, {
        ...auditContext(req, res),
        action: 'update',
        entity: 'plan',
        entityId: id,
        before,
        after: rows[0],
      });
      return { status: 200, body: { plan: withEnd(rows[0], anchorDate) } };
    });
    res.status(reply.status).json(reply.body);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const reply = await inTransaction(pool, async (client) => {
      const { rows } = await client.query<PlanRow>(
        `DELETE FROM plans WHERE id = $1 RETURNING ${planColumns}`,
        [id],
      );
      if (!rows[0]) throw new HttpError(404, planNotFound);
      await writeAudit(client, {
        ...auditContext(req, res),
        action: 'delete',
        entity: 'plan',
        entityId: id,
        before: rows[0],
      });
      return { status: 200, body: { id } };
    });
    res.status(reply.status).json(reply.body);
  });

  return router;
}
