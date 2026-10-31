-- Twelve-week goals and their reviews (issue #8). Safe to re-run.
-- period_start is the first day of the goal's period (backend/src/periods.ts). Limits mirror
-- backend/src/goal-routes.ts. achieved stays NULL until the goal is reviewed as met or not met.
CREATE TABLE IF NOT EXISTS twelve_week_goals (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  period_start date NOT NULL,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 200),
  sort_order integer NOT NULL DEFAULT 0,
  achieved boolean,
  review_note text CHECK (char_length(review_note) <= 1000),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS twelve_week_goals_period_idx
  ON twelve_week_goals (period_start, sort_order, id);

-- The checklist item from the issue. Looked up including archived rows, so archiving it sticks.
INSERT INTO routines (name, cadence)
SELECT U&'\BAA9\D45C \C7AC\C124\C815', 'twelve_week'
WHERE NOT EXISTS (
  SELECT 1 FROM routines WHERE cadence = 'twelve_week' AND name = U&'\BAA9\D45C \C7AC\C124\C815'
);
