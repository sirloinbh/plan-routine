-- Routines and their per-period checks (issue #3). Safe to re-run.
-- Period rules live in backend/src/periods.ts: weeks start on Sunday, and four/twelve-week
-- periods count from the Sunday of the first-use week stored in app_settings.routine_anchor_date.
CREATE TABLE IF NOT EXISTS routines (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'four_week', 'twelve_week')),
  -- Daily routines belong to one of the fixed categories; longer cadences have none.
  category text CHECK (
    category IN ('wake', 'exercise', 'diet', 'housework', 'care', 'study', 'reading')
  ),
  sort_order integer NOT NULL DEFAULT 0,
  -- Archiving hides a routine but keeps its past checks.
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT routines_daily_category CHECK ((cadence = 'daily') = (category IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS routines_active_idx
  ON routines (cadence, sort_order, id) WHERE archived_at IS NULL;

-- One check per routine per period; period_start is the first day of that routine's period.
CREATE TABLE IF NOT EXISTS routine_checks (
  routine_id bigint NOT NULL REFERENCES routines (id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (routine_id, period_start)
);

CREATE INDEX IF NOT EXISTS routine_checks_period_idx ON routine_checks (period_start);
