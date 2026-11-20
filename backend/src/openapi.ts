// The API's operation table. The document is built by the managed standard/openapi.ts from Zod schemas
// (z.toJSONSchema). `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date or
// when the table and the registered routes differ.
import { z } from 'zod/v4';

import { periodsQuery } from './app.js';
import { checklistQuery } from './check-routes.js';
import { diaryInput, diaryQuery } from './diary-routes.js';
import { goalInput, reviewsInput, routineLinksInput } from './goal-routes.js';
import { projectInput } from './project-link-routes.js';
import { monthQuery } from './record-routes.js';
import {
  listQuery as routineListQuery,
  moveInput,
  projectLinkInput,
  renameInput,
} from './routine-routes.js';
import { routineInput } from './routines.js';
import { buildOpenApi, type Operation } from './standard/openapi.js';

// Every registered route must appear here exactly once (checked when building).
// Every route that reads an id, a date, a body or a query also answers 400 when validation fails.
export const operations: Record<string, Operation> = {
  'GET /api/health': {
    summary: 'Check the server and database connection',
    status: [200, 500],
    public: true,
  },
  'GET /api/me': { summary: 'Get the signed-in user', status: [200, 401, 503] },
  'GET /api/periods': {
    summary: 'Get the daily, weekly, four-week and twelve-week periods that hold a date',
    query: periodsQuery,
    status: [200, 400],
  },

  'GET /api/checklist': {
    summary:
      'Get the routines of one cadence with their checked state for the period holding a date; only today and the 7 days before it can be viewed',
    query: checklistQuery,
    status: [200, 400],
  },
  'PUT /api/routines/:id/checks/:date': {
    params: { date: z.iso.date() },
    summary:
      'Check a routine for the period holding a date; repeating it changes nothing. Only today and the 7 days before it can change',
    status: [200, 400, 404],
  },
  'DELETE /api/routines/:id/checks/:date': {
    params: { date: z.iso.date() },
    summary:
      'Uncheck a routine for the period holding a date; repeating it changes nothing. Only today and the 7 days before it can change',
    status: [200, 400, 404],
  },

  'GET /api/diary': {
    summary: 'Get the diary entry of a day (or null) with the routine progress of that day',
    query: diaryQuery,
    status: [200, 400],
  },
  'PUT /api/diary/:date': {
    params: { date: z.iso.date() },
    summary: 'Write the diary entry of a day, replacing the existing one; no future dates',
    body: ['DiaryEntry', diaryInput],
    status: [200, 400],
  },

  'GET /api/goals': {
    summary: 'List the twelve-week goals of the current period and of past periods',
    status: [200],
  },
  'POST /api/goals': {
    summary: 'Add a goal to the current twelve-week period',
    body: ['Goal', goalInput],
    status: [201, 400],
  },
  'PUT /api/goals/reviews': {
    summary:
      'Save the reviews of goals of ended periods, all or nothing; clearing both answers marks a goal as not reviewed',
    body: ['GoalReviews', reviewsInput],
    status: [200, 400, 404],
  },
  'PATCH /api/goals/:id': {
    summary: 'Rename a goal of the current period',
    body: ['Goal', goalInput],
    status: [200, 400, 404],
  },
  'PUT /api/goals/:id/routines': {
    summary:
      'Replace the routines linked to a goal of the current period; only active daily and weekly routines',
    body: ['GoalRoutineLinks', routineLinksInput],
    status: [200, 400, 404],
  },
  'DELETE /api/goals/:id': {
    summary: 'Delete a goal of the current period',
    status: [200, 400, 404],
  },

  'GET /api/project-links': { summary: 'List project links', status: [200] },
  'POST /api/project-links': {
    summary: 'Add a project link; the URL is https:// or a private access address',
    body: ['ProjectLink', projectInput],
    status: [201, 400, 409],
  },
  'DELETE /api/project-links/:id': {
    summary: 'Delete a project link; routines linked to it lose the link',
    status: [200, 400, 404],
  },

  'GET /api/records': {
    summary: 'Get the daily routine progress and diary marks of each day of a month',
    query: monthQuery,
    status: [200, 400],
  },
  'GET /api/records/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the daily routines, their checks and the diary entry of one past day',
    status: [200, 400],
  },

  'GET /api/stats': {
    summary: 'Get routine achievement statistics, including archived routines',
    status: [200],
  },

  'GET /api/routines': {
    summary: 'List active routines, optionally of one cadence',
    query: routineListQuery,
    status: [200, 400],
  },
  'POST /api/routines': {
    summary:
      'Add a routine; a daily routine needs a category and other cadences take none. The first routine fixes the first-use date of four- and twelve-week periods',
    body: ['Routine', routineInput],
    status: [201, 400],
  },
  'PATCH /api/routines/:id': {
    summary: 'Rename an active routine',
    body: ['RoutineRename', renameInput],
    status: [200, 400, 404],
  },
  'POST /api/routines/:id/move': {
    summary: 'Move a routine one place up or down within its group; returns the group',
    body: ['RoutineMove', moveInput],
    status: [200, 400, 404],
  },
  'PUT /api/routines/:id/project-link': {
    summary: 'Link a routine to a project, or clear the link with null',
    body: ['RoutineProjectLink', projectLinkInput],
    status: [200, 400, 404],
  },
  'POST /api/routines/:id/archive': {
    summary: 'Archive a routine: it leaves the lists but its past checks stay',
    status: [200, 400, 404],
  },
};

const statusText: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  400: 'Input validation failed, or the date or item is not allowed for this action',
  401: 'Sign-in required (no session from the shared sign-in)',
  404: 'No target',
  409: 'Duplicate',
  500: 'Server error',
  503: 'The shared sign-in service is unavailable or not configured',
};

export const document = buildOpenApi({
  title: 'Plan Routine API',
  description:
    'Dates are YYYY-MM-DD (Asia/Seoul). Ids are positive integers (numbers, up to 15 digits). Every error response is { error: English message }.',
  errorDescription: 'English error message',
  operations,
  statusText,
});
