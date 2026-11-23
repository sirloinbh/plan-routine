// Which daily routines count for a past day (confirmed on issue #10): any routine checked that day,
// plus those already created by that day and not archived on or before it. Dates are Asia/Seoul.
// `routine` and `day` are spliced into the SQL, so only these literals are allowed: the types stop other strings at
// compile time, and the allow lists stop a value that was widened to `string` at run time (#155).
const routineAliases = ['routines'] as const;
const dayExpressions = ['$1::date', 'days.date'] as const;
export type RoutineAlias = (typeof routineAliases)[number];
export type DayExpression = (typeof dayExpressions)[number];

export function dailyRoutineOn(routine: RoutineAlias, day: DayExpression) {
  if (!(routineAliases as readonly string[]).includes(routine))
    throw new Error(`Unexpected routine alias: ${routine}`);
  if (!(dayExpressions as readonly string[]).includes(day))
    throw new Error(`Unexpected day expression: ${day}`);
  const seoulDate = (column: string) => `(${routine}.${column} AT TIME ZONE 'Asia/Seoul')::date`;
  return `${routine}.cadence = 'daily' AND (
    EXISTS (
      SELECT 1 FROM routine_checks
      WHERE routine_checks.routine_id = ${routine}.id AND routine_checks.period_start = ${day}
    )
    OR EXISTS (
      SELECT 1 FROM routine_skips
      WHERE routine_skips.routine_id = ${routine}.id AND routine_skips.period_start = ${day}
    )
    OR (
      ${seoulDate('created_at')} <= ${day}
      AND (${routine}.archived_at IS NULL OR ${seoulDate('archived_at')} > ${day})
    )
  )`;
}
