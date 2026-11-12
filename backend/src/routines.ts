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
    if (value.cadence !== 'daily' && value.category)
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: 'Only daily routines can have a category',
      });
  });

export const anchorSettingKey = 'routine_anchor_date';

// The first call stores today as the first-use date; later calls return the stored date.
// The no-op DO UPDATE always returns the row, even when a concurrent first call wins the insert
// (DO NOTHING plus a SELECT would miss that row under READ COMMITTED).
export async function routineAnchorDate(db: Pool | PoolClient, today: string) {
  const { rows } = await db.query<{ value: string }>(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = app_settings.value
     RETURNING value`,
    [anchorSettingKey, today],
  );
  return rows[0].value;
}
