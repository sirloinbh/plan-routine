// The API's operation table. The document is built by the managed standard/openapi.ts from Zod schemas
// (z.toJSONSchema). `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date or
// when the table and the registered routes differ.
import { z } from 'zod/v4';

import { periodsQuery } from './app.js';
import { checkInput, checklistQuery, skipInput } from './check-routes.js';
import { diaryInput, diaryQuery } from './diary-routes.js';
import { goalInput, reviewsInput, routineLinksInput } from './goal-routes.js';
import { projectInput } from './project-link-routes.js';
import { monthQuery } from './record-routes.js';
import {
  amountInput,
  listQuery as routineListQuery,
  moveInput,
  projectLinkInput,
  renameInput,
  scheduleInput,
} from './routine-routes.js';
import { routineInput } from './routines.js';
import { searchQuery } from './search-routes.js';
import { buildOpenApi, type Operation } from './standard/openapi.js';
import { reviewInput, reviewQuery } from './weekly-review-routes.js';

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
    body: ['Check', checkInput],
    summary:
      'Check a routine for the period holding a date; repeating it changes nothing. A skipped period cannot be checked (409). Only today and the 7 days before it can change',
    status: [200, 400, 404, 409],
  },
  'DELETE /api/routines/:id/checks/:date': {
    params: { date: z.iso.date() },
    summary:
      'Uncheck a routine for the period holding a date; repeating it changes nothing. Only today and the 7 days before it can change',
    status: [200, 400, 404],
  },

  'PUT /api/routines/:id/skips/:date': {
    params: { date: z.iso.date() },
    body: ['Skip', skipInput],
    summary:
      'Skip a routine for the period holding a date, with an optional reason of up to 200 characters; repeating it replaces the reason. A checked period cannot be skipped (409). Only today and the 7 days before it can change',
    status: [200, 400, 404, 409],
  },
  'DELETE /api/routines/:id/skips/:date': {
    params: { date: z.iso.date() },
    summary:
      'Remove the skip of a routine for the period holding a date; repeating it changes nothing. Only today and the 7 days before it can change',
    status: [200, 400, 404],
  },

  'GET /api/diary': {
    summary:
      'Get the diary entry of a day (or null) with the daily routines of that day and whether each was checked',
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

  'GET /api/export': {
    summary:
      'Download every table (found at request time, migration bookkeeping left out) as one versioned JSON file; real data, never cached',
    status: [200],
  },
  'GET /api/export/checks.csv': {
    summary: 'Download the routine checks as UTF-8 CSV, formula-like cells neutralized',
    status: [200],
  },
  'GET /api/export/diary.csv': {
    summary: 'Download the diary entries and scores as UTF-8 CSV, formula-like cells neutralized',
    status: [200],
  },

  'GET /api/stats': {
    summary: 'Get routine achievement statistics, including archived routines',
    status: [200],
  },

  'GET /api/mood-stats': {
    summary:
      'Get the weekly average mood and energy scores of the last 12 weeks next to the daily routine completion of the same weeks',
    status: [200],
  },
  'GET /api/weekly-review': {
    summary:
      'Get the completion rate of daily and weekly routines for a week, its most-missed routines and the two notes; the week is the one holding the date, this week when omitted',
    query: reviewQuery,
    status: [200, 400],
  },
  'PUT /api/weekly-review/:week': {
    params: { week: z.iso.date() },
    summary:
      'Save the notes of a week (its Sunday), replacing the existing ones; a blank note clears it; no weeks that have not started',
    body: ['WeeklyReviewNotes', reviewInput],
    status: [200, 400],
  },

  'GET /api/search': {
    summary:
      'Search diary entries (body and the three notes) and the reasons of skipped daily routines by text in a date range, newest first and paged; with a routine, only the days it was done or missed and its own skip reasons. Needs a word or a routine',
    query: searchQuery,
    status: [200, 400],
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
  'PUT /api/routines/:id/schedule': {
    summary:
      "Set the weekdays of a daily routine or the times per week of a weekly one; sends the whole schedule. It applies to the whole history. Switching a weekly routine between once a week and N times a week converts its checks (N to once: one check per week, on the week's first day, with the amounts added up) in one transaction and writes an audit entry",
    body: ['RoutineSchedule', scheduleInput],
    status: [200, 400, 404],
  },
  'PUT /api/routines/:id/amount': {
    summary:
      'Set the unit and target amount of an active routine; sends the whole setting, so repeating it changes nothing. Amounts already recorded keep their numbers and are hidden while there is no unit',
    body: ['RoutineAmount', amountInput],
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
