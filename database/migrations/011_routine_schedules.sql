-- Routines on chosen weekdays, or a number of times per week (issue #245). Safe to re-run.
-- weekdays: daily routines only; 0 = Sunday ... 6 = Saturday (PostgreSQL's DOW). NULL means every day.
-- times_per_week: weekly routines only; the week is done at this many checks. Such a routine stores one
-- check per day (period_start is the day), at most one per day. NULL keeps the one check per week.
ALTER TABLE routines ADD COLUMN IF NOT EXISTS weekdays smallint[];
ALTER TABLE routines ADD COLUMN IF NOT EXISTS times_per_week smallint;

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_weekdays_check;
ALTER TABLE routines ADD CONSTRAINT routines_weekdays_check CHECK (
  weekdays IS NULL OR (
    cadence = 'daily'
    AND cardinality(weekdays) BETWEEN 1 AND 6
    AND weekdays <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::smallint[]
  )
);

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_times_per_week_check;
ALTER TABLE routines ADD CONSTRAINT routines_times_per_week_check CHECK (
  times_per_week IS NULL OR (cadence = 'weekly' AND times_per_week BETWEEN 2 AND 7)
);
