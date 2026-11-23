import { Router } from 'express';
import type { Pool } from 'pg';

import { dailyRoutineOn } from './day-records.js';
import { addDays, weekStart } from './periods.js';

// Twelve weeks (Sunday to Saturday, as on the stats page), the current one included.
export const moodWeeks = 12;

type DayRow = { date: string; checked: number; total: number };
type ScoreRow = { date: string; mood: number | null; energy: number | null };

export type MoodWeek = {
  start: string;
  end: string;
  /** Daily routines checked and expected over the week's days up to today, skipped ones left out (#262), as on the stats page. */
  checked: number;
  total: number;
  /** Average score to one decimal, or null when no day of the week has one. */
  mood: number | null;
  energy: number | null;
  moodDays: number;
  energyDays: number;
};

const average = (values: number[]) =>
  values.length === 0
    ? null
    : Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;

/** Puts per-day tallies and scores into weeks, oldest first. */
export function buildMoodWeeks(today: string, days: DayRow[], scores: ScoreRow[]): MoodWeek[] {
  const first = addDays(weekStart(today), -7 * (moodWeeks - 1));
  return Array.from({ length: moodWeeks }, (_, index) => {
    const start = addDays(first, 7 * index);
    const end = addDays(start, 6);
    const inWeek = (date: string) => date >= start && date <= end;
    const weekDays = days.filter((day) => inWeek(day.date));
    const weekScores = scores.filter((score) => inWeek(score.date));
    const moods = weekScores.flatMap((score) => (score.mood === null ? [] : [score.mood]));
    const energies = weekScores.flatMap((score) => (score.energy === null ? [] : [score.energy]));
    return {
      start,
      end,
      checked: weekDays.reduce((sum, day) => sum + day.checked, 0),
      total: weekDays.reduce((sum, day) => sum + day.total, 0),
      mood: average(moods),
      energy: average(energies),
      moodDays: moods.length,
      energyDays: energies.length,
    };
  });
}

export function moodStatsRoutes(pool: Pool, today: () => string) {
  const router = Router();

  // Read-only. Weekly averages of the diary scores next to the daily routine completion of the same
  // weeks, so mood can be compared with practice (no correlation number).
  router.get('/', async (_req, res) => {
    const current = today();
    const first = addDays(weekStart(current), -7 * (moodWeeks - 1));
    const days = await pool.query<DayRow>(
      `SELECT days.date,
         (SELECT count(*)::int FROM routines WHERE ${dailyRoutineOn('routines', 'days.date')}
            AND NOT EXISTS (
              SELECT 1 FROM routine_skips
              WHERE routine_skips.routine_id = routines.id AND routine_skips.period_start = days.date
            )) AS total,
         (SELECT count(*)::int FROM routine_checks
          JOIN routines ON routines.id = routine_checks.routine_id
          WHERE routines.cadence = 'daily' AND routine_checks.period_start = days.date) AS checked
       FROM (
         SELECT generate_series($1::date, $2::date, interval '1 day')::date AS date
       ) AS days
       ORDER BY days.date`,
      [first, current],
    );
    const scores = await pool.query<ScoreRow>(
      `SELECT entry_date AS date, mood, energy FROM diary_entries
       WHERE entry_date BETWEEN $1 AND $2 AND (mood IS NOT NULL OR energy IS NOT NULL)`,
      [first, current],
    );
    res.json({ today: current, weeks: buildMoodWeeks(current, days.rows, scores.rows) });
  });

  return router;
}
