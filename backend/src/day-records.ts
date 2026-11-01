// Which daily routines count for a past day (confirmed on issue #10): any routine checked that day,
// plus those already created by that day and not archived on or before it. Dates are Asia/Seoul.
// `routine` is a table alias and `day` an SQL date expression, both written by this code.
export function dailyRoutineOn(routine: string, day: string) {
  const seoulDate = (column: string) => `(${routine}.${column} AT TIME ZONE 'Asia/Seoul')::date`;
  return `${routine}.cadence = 'daily' AND (
    EXISTS (
      SELECT 1 FROM routine_checks
      WHERE routine_checks.routine_id = ${routine}.id AND routine_checks.period_start = ${day}
    )
    OR (
      ${seoulDate('created_at')} <= ${day}
      AND (${routine}.archived_at IS NULL OR ${seoulDate('archived_at')} > ${day})
    )
  )`;
}
