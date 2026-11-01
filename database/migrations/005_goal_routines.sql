-- Which daily and weekly routines serve a twelve-week goal (issue #52). Safe to re-run.
-- A goal can have many routines and a routine can serve many goals. Removing a goal removes its
-- links, not the routines or their checks. Routines are archived rather than deleted.
CREATE TABLE IF NOT EXISTS twelve_week_goal_routines (
  goal_id bigint NOT NULL REFERENCES twelve_week_goals (id) ON DELETE CASCADE,
  routine_id bigint NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (goal_id, routine_id)
);

CREATE INDEX IF NOT EXISTS twelve_week_goal_routines_routine_idx
  ON twelve_week_goal_routines (routine_id);
