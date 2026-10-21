import type { Pool } from 'pg';
import { z } from 'zod';
import { cadences } from './periods.js';

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

// Mirrors the routines table checks so bad input fails with a Korean message before the DB.
export const routineInput = z
  .object({
    name: z
      .string({
        required_error: '루틴 이름을 입력해 주세요',
        invalid_type_error: '루틴 이름은 글자여야 합니다',
      })
      .trim()
      .min(1, '루틴 이름을 입력해 주세요')
      .max(100, '루틴 이름은 100자 이하로 입력해 주세요'),
    cadence: z.enum(cadences, {
      errorMap: () => ({ message: '루틴 주기는 매일, 매주, 4주, 12주 중 하나여야 합니다' }),
    }),
    category: z
      .enum(routineCategories, {
        errorMap: () => ({ message: '하루 루틴 카테고리가 올바르지 않습니다' }),
      })
      .nullish(),
  })
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
// The CTE's insert is invisible to the outer SELECT, so UNION ALL covers both cases in one query.
export async function routineAnchorDate(pool: Pool, today: string) {
  const { rows } = await pool.query<{ value: string }>(
    `WITH inserted AS (
       INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO NOTHING
       RETURNING value
     )
     SELECT value FROM inserted
     UNION ALL
     SELECT value FROM app_settings WHERE key = $1
     LIMIT 1`,
    [anchorSettingKey, today],
  );
  return rows[0].value;
}
