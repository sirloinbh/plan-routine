import { Router } from 'express';
import type { Pool } from 'pg';

import { buildStats, type StatsCheck, type StatsRoutine, statsStart } from './routine-stats.js';
import { routineAnchorDate } from './routines.js';

export function statsRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Archived routines are included: their past periods still count (issue #11).
  router.get('/', async (_req, res) => {
    const current = today();
    const anchorDate = await routineAnchorDate(pool, current);
    const routines = await pool.query<StatsRoutine>(
      `SELECT id::text AS id, name, cadence, category, sort_order AS "sortOrder",
         (created_at AT TIME ZONE 'Asia/Seoul')::date AS "createdOn",
         (archived_at AT TIME ZONE 'Asia/Seoul')::date AS "archivedOn"
       FROM routines
       ORDER BY cadence, category, sort_order, id`,
    );
    const checks = await pool.query<StatsCheck>(
      `SELECT routine_id::text AS "routineId", period_start AS "periodStart"
       FROM routine_checks WHERE period_start >= $1`,
      [statsStart(current, anchorDate)],
    );
    res.json(
      buildStats({
        today: current,
        anchorDate,
        routines: routines.rows,
        checks: checks.rows,
      }),
    );
  });

  return router;
}
