import { meHandler } from '@sirloinbh/auth-client';
import express from 'express';
import type { Pool } from 'pg';
import { types } from 'pg';
import { z } from 'zod/v4';

import { tools } from './ai-tools.js';
import { checkRoutes } from './check-routes.js';
import { diaryRoutes } from './diary-routes.js';
import { exportRoutes } from './export-routes.js';
import { goalRoutes } from './goal-routes.js';
import { moodStatsRoutes } from './mood-stats-routes.js';
import { calendarDate, periodsFor } from './periods.js';
import { projectLinkRoutes } from './project-link-routes.js';
import { recordRoutes } from './record-routes.js';
import { routineRoutes } from './routine-routes.js';
import { routineAnchorDate } from './routines.js';
import { searchRoutes } from './search-routes.js';
import { setInt8Parser } from './standard/db.js';
import { errorHandler, notFound, requestLog, serviceDate } from './standard/http.js';
import { apiRateLimit } from './standard/rate-limit.js';
import { registerToolRoutes } from './standard/tools.js';
import { statsRoutes } from './stats-routes.js';
import { weeklyReviewRoutes } from './weekly-review-routes.js';

// DATE columns stay YYYY-MM-DD strings so the service time zone never shifts them.
types.setTypeParser(1082, (value) => value);
// BIGINT ids come back as numbers, and a value above 2^53 throws instead of rounding (ADR-0025).
setInt8Parser(types);

export const periodsQuery = z.object({ date: calendarDate.optional() });

export function createApp(
  pool: Pool,
  options: { today?: () => string; auth?: express.RequestHandler; toolsPublicKey?: string } = {},
) {
  const today = options.today ?? (() => serviceDate());
  const app = express();
  app.disable('x-powered-by');
  // project-standards#552: a request ID and one JSON log line for every request, a 401 included.
  app.use(requestLog);
  apiRateLimit(app);
  // #126: the shared sign-in guards every /api route except /api/health, before any route registers.
  if (options.auth) app.use('/api', options.auth);
  app.get('/api/me', meHandler);
  app.use(express.json({ limit: '256kb' }));
  app.get('/api/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true, service: 'plan-routine', today: today() });
  });
  app.get('/api/periods', async (req, res) => {
    const { date } = periodsQuery.parse(req.query);
    const current = today();
    const anchorDate = await routineAnchorDate(pool, current);
    const target = date ?? current;
    res.json({ date: target, anchorDate, periods: periodsFor(target, anchorDate) });
  });
  app.use('/api', checkRoutes(pool, today));
  app.use('/api/diary', diaryRoutes(pool, today));
  app.use('/api/export', exportRoutes(pool, today));
  app.use('/api/goals', goalRoutes(pool, today));
  app.use('/api/mood-stats', moodStatsRoutes(pool, today));
  app.use('/api/project-links', projectLinkRoutes(pool));
  app.use('/api/records', recordRoutes(pool, today));
  app.use('/api/search', searchRoutes(pool, today));
  app.use('/api/stats', statsRoutes(pool, today));
  app.use('/api/routines', routineRoutes(pool, today));
  app.use('/api/weekly-review', weeklyReviewRoutes(pool, today));
  // #711: shared-ai calls the AI tools here with a signed token. Outside /api, so the proxy never reaches it.
  registerToolRoutes(app, {
    app: 'plan-routine',
    tools,
    pool,
    publicKey: options.toolsPublicKey,
    requireBinding: true,
  });
  // Standard handlers (#145): the 404 and every error answer share one shape, and the error log carries the request ID.
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
