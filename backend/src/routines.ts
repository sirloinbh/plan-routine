import type { Pool, PoolClient } from 'pg';
import { z } from 'zod/v4';

import { cadences } from './periods.js';
import { badRequest, noNul, nulMessage } from './request-input.js';

export const routineCategories = [
  'wake',
  'exercise',
  'diet',
  'housework',
  'care',
  'study',
  'reading',
] as const;

export const routineCategoryLabels: Record<(typeof routineCategories)[number], string> = {
  wake: 'Wake-up',
  exercise: 'Exercise',
  diet: 'Diet',
  housework: 'Housework',
  care: 'Self-care',
  study: 'Study',
  reading: 'Reading',
};

const weekdayMessage = 'Weekdays must be numbers from 0 to 6';

export const routineCadence = z.enum(cadences, {
  error: 'Routine cadence must be daily, weekly, four-week, or twelve-week',
});

// Not .min()/.max(): those also run on a non-string with a length and add a second message.
export const routineName = z
  .string({
    error: (issue) =>
      issue.input === undefined ? 'Enter a routine name' : 'The routine name must be text',
  })
  .trim()
  .refine((value) => value.length >= 1, 'Enter a routine name')
  .refine((value) => value.length <= 100, 'The routine name must be 100 characters or fewer')
  .refine(noNul, nulMessage);

// Mirrors the routines table checks so bad input fails with an English message before the DB.
export const routineInput = z
  .object(
    {
      name: routineName,
      cadence: routineCadence,
      category: z.enum(routineCategories, { error: 'Invalid daily routine category' }).nullish(),
      // Daily routines only: the days of the week it applies to (0 = Sunday ... 6 = Saturday).
      weekdays: z
        .array(
          z
            .number({ error: weekdayMessage })
            .int(weekdayMessage)
            .min(0, weekdayMessage)
            .max(6, weekdayMessage),
          { error: weekdayMessage },
        )
        .nullish(),
      // Weekly routines only: how many days of the week it is done on (2 to 7).
      timesPerWeek: z
        .number({ error: 'Times per week must be a number from 2 to 7' })
        .int('Times per week must be a number from 2 to 7')
        .min(2, 'Times per week must be a number from 2 to 7')
        .max(7, 'Times per week must be a number from 2 to 7')
        .nullish(),
    },
    badRequest,
  )
  .superRefine((value, ctx) => {
    if (value.cadence === 'daily' && !value.category)
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: 'Choose a category for a daily routine',
      });
    if (value.weekdays) {
      if (value.cadence !== 'daily')
        ctx.addIssue({
          code: 'custom',
          path: ['weekdays'],
          message: 'Only daily routines can have weekdays',
        });
      else if (value.weekdays.length === 0)
        ctx.addIssue({
          code: 'custom',
          path: ['weekdays'],
          message: 'Choose at least one weekday',
        });
    }
    if (value.timesPerWeek && value.cadence !== 'weekly')
      ctx.addIssue({
        code: 'custom',
        path: ['timesPerWeek'],
        message: 'Only weekly routines can have times per week',
      });
    if (value.cadence !== 'daily' && value.category)
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: 'Only daily routines can have a category',
      });
  });

export const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Sorted and without duplicates; every day of the week means no restriction (null). */
export function normalizeWeekdays(weekdays: number[] | null | undefined) {
  if (!weekdays) return null;
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  return sorted.length === 7 ? null : sorted;
}

export const anchorSettingKey = 'routine_anchor_date';

const dateValue = /^\d{4}-\d{2}-\d{2}$/;

function storedDate(value: string) {
  if (!dateValue.test(value))
    throw new Error(`The stored ${anchorSettingKey} is not a YYYY-MM-DD date: ${value}`);
  return value;
}

// Reads the stored first-use date with a plain SELECT, so a GET takes no write lock (#153). Only when no row exists
// does the first call store today. The no-op DO UPDATE always returns the row, even when a concurrent first call wins
// the insert (DO NOTHING plus a SELECT would miss that row under READ COMMITTED).
export async function routineAnchorDate(db: Pool | PoolClient, today: string) {
  const existing = await db.query<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = $1',
    [anchorSettingKey],
  );
  if (existing.rows[0]) return storedDate(existing.rows[0].value);
  const { rows } = await db.query<{ value: string }>(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = app_settings.value
     RETURNING value`,
    [anchorSettingKey, today],
  );
  return storedDate(rows[0].value);
}
