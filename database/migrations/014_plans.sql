-- Plans for four horizons (issue #341): week (1 week), twelve_week (84 days), year (52 weeks), decade (10 years).
-- period_start is the first day of the plan's period (backend/src/periods.ts, planPeriodFor): a Sunday for the
-- week-based horizons' whole-week periods, January 1 for a decade. Limits mirror backend/src/plan-routes.ts.
-- twelve_week_goals stays as it is; a later card moves those rows onto this table. Safe to re-run.
CREATE TABLE IF NOT EXISTS plans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  horizon text NOT NULL CHECK (horizon IN ('week', 'twelve_week', 'year', 'decade')),
  period_start date NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  description text CHECK (char_length(description) <= 2000),
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'done', 'dropped')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_period_start_check CHECK (
    CASE WHEN horizon = 'decade'
      THEN EXTRACT(MONTH FROM period_start) = 1 AND EXTRACT(DAY FROM period_start) = 1
      ELSE EXTRACT(DOW FROM period_start) = 0
    END
  )
);

CREATE INDEX IF NOT EXISTS plans_horizon_period_idx
  ON plans (horizon, period_start, sort_order, id);
