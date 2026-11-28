-- Moves the twelve-week goals onto plans (issue #344). Safe to re-run.
-- Plans of the twelve_week horizon now hold the goals, their review answers and their routine links, so there is
-- one table of plans. twelve_week_goals and twelve_week_goal_routines are copied, not changed or dropped: no code
-- writes to them any more, and a later card drops them after one release (take a backup first).
ALTER TABLE plans ADD COLUMN IF NOT EXISTS achieved boolean;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS review_note text CHECK (char_length(review_note) <= 1000);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
-- The id of the goal a plan was copied from; makes the copy below run once per goal, however often this file runs.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS legacy_goal_id bigint UNIQUE;

-- Which daily and weekly routines serve a twelve_week plan (was twelve_week_goal_routines, issue #52). Removing a plan
-- removes its links, not the routines or their checks.
CREATE TABLE IF NOT EXISTS plan_routines (
  plan_id bigint NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  routine_id bigint NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, routine_id)
);

CREATE INDEX IF NOT EXISTS plan_routines_routine_idx ON plan_routines (routine_id);

-- A goal met becomes a done plan, a goal not met a dropped one, an unreviewed goal a planned one (the review in
-- backend/src/goal-routes.ts keeps the status in step from now on).
INSERT INTO plans (horizon, period_start, title, sort_order, status, achieved, review_note, reviewed_at,
                   created_at, updated_at, legacy_goal_id)
SELECT 'twelve_week', g.period_start, g.title, g.sort_order,
       CASE g.achieved WHEN true THEN 'done' WHEN false THEN 'dropped' ELSE 'planned' END,
       g.achieved, g.review_note, g.reviewed_at, g.created_at, g.updated_at, g.id
FROM twelve_week_goals g
WHERE NOT EXISTS (SELECT 1 FROM plans p WHERE p.legacy_goal_id = g.id)
ORDER BY g.id;

INSERT INTO plan_routines (plan_id, routine_id, created_at)
SELECT p.id, l.routine_id, l.created_at
FROM twelve_week_goal_routines l
JOIN plans p ON p.legacy_goal_id = l.goal_id
ON CONFLICT DO NOTHING;
