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
  wake: '기상',
  exercise: '운동',
  diet: '식단',
  housework: '가사',
  care: '관리',
  study: '공부',
  reading: '독서',
};

export const routineCadence = z.enum(cadences, {
  error: '루틴 주기는 매일, 매주, 4주, 12주 중 하나여야 합니다',
});

// Not .min()/.max(): those also run on a non-string with a length and add a second message.
export const routineName = z
  .string({
    error: (issue) =>
      issue.input === undefined ? '루틴 이름을 입력해 주세요' : '루틴 이름은 글자여야 합니다',
  })
  .trim()
  .refine((value) => value.length >= 1, '루틴 이름을 입력해 주세요')
  .refine((value) => value.length <= 100, '루틴 이름은 100자 이하로 입력해 주세요')
  .refine(noNul, nulMessage);

// Mirrors the routines table checks so bad input fails with a Korean message before the DB.
export const routineInput = z
  .object(
    {
      name: routineName,
      cadence: routineCadence,
      category: z
        .enum(routineCategories, { error: '하루 루틴 카테고리가 올바르지 않습니다' })
        .nullish(),
    },
    badRequest,
  )
  .superRefine((value, ctx) => {
    if (value.cadence === 'daily' && !value.category)
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: '하루 루틴은 카테고리를 선택해 주세요',
      });
    if (value.cadence !== 'daily' && value.category)
      ctx.addIssue({
        code: 'custom',
        path: ['category'],
        message: '카테고리는 하루 루틴에만 지정할 수 있습니다',
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
