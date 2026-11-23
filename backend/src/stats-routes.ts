import { Router } from 'express';
import type { Pool } from 'pg';

import { buildStats, type StatsCheck, type StatsRoutine, type StatsSkip } from './routine-stats.js';
import { routineAnchorDate } from './routines.js';

export function statsRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Archived routines are included: their past periods still count (issue #11). All checks and skips are
  // read, because a best streak can reach back to a routine's first record (#244).
  router.get('/', async (_req, res) => {
    const current = today();
    const anchorDate = await routineAnchorDate(pool, current);
    const routines = await pool.query<StatsRoutine>(
      `SELECT id, name, cadence, category, sort_order AS "sortOrder",
         (created_at AT TIME ZONE 'Asia/Seoul')::date AS "createdOn",
         (archived_at AT TIME ZONE 'Asia/Seoul')::date AS "archivedOn",
         weekdays, times_per_week AS "timesPerWeek"
       FROM routines
       ORDER BY cadence, category, sort_order, routines.id`,
    );
    const checks = await pool.query<StatsCheck>(
      `SELECT routine_id AS "routineId", period_start AS "periodStart"
       FROM routine_checks`,
    );
    const skips = await pool.query<StatsSkip>(
      `SELECT routine_id AS "routineId", period_start AS "periodStart"
       FROM routine_skips`,
    );
    res.json(
      buildStats({
        today: current,
        anchorDate,
        routines: routines.rows,
        checks: checks.rows,
        skips: skips.rows,
      }),
    );
  });

  return router;
}
