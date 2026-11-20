// The AI tools of Plan Routine (project-standards#711, ADR-0017). shared-ai lists and calls them over /internal/tools;
// standard/tools.ts checks the signed call, the scope, and writes the audit row.
import { z } from 'zod/v4';

import { type Db, listQuery, listRoutines } from './routine-routes.js';
import { defineTool } from './standard/tools.js';

// A tool never returns the whole list at once.
const listInput = listQuery.extend({ limit: z.int().min(1).max(200).default(50) });

export const tools = [
  defineTool({
    name: 'list_routines',
    description:
      'List the active routines (at most 200, default 50), grouped by cadence (daily, weekly, four_week, twelve_week) then category, in the order shown in the app. Optionally only one cadence.',
    input: listInput,
    access: 'read',
    action: 'read',
    entity: 'routine',
    run: async ({ cadence, limit }, { db }: { db: Db }) => ({
      result: await listRoutines(db, cadence, limit),
    }),
  }),
];
