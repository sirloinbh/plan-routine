-- An optional amount with a unit ("20 pages", "60 minutes") for routines, and an amount on checks (issue #246).
-- Safe to re-run. A check counts as done whatever its amount; the target is only shown.
ALTER TABLE routines ADD COLUMN IF NOT EXISTS unit text;
ALTER TABLE routines ADD COLUMN IF NOT EXISTS target_amount double precision;
ALTER TABLE routine_checks ADD COLUMN IF NOT EXISTS amount double precision;

ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_unit_check;
ALTER TABLE routines ADD CONSTRAINT routines_unit_check CHECK (
  unit IS NULL OR char_length(btrim(unit)) BETWEEN 1 AND 20
);

-- A target needs a unit to mean anything.
ALTER TABLE routines DROP CONSTRAINT IF EXISTS routines_target_amount_check;
ALTER TABLE routines ADD CONSTRAINT routines_target_amount_check CHECK (
  target_amount IS NULL OR (unit IS NOT NULL AND target_amount > 0 AND target_amount < 1000000000)
);

ALTER TABLE routine_checks DROP CONSTRAINT IF EXISTS routine_checks_amount_check;
ALTER TABLE routine_checks ADD CONSTRAINT routine_checks_amount_check CHECK (
  amount IS NULL OR (amount >= 0 AND amount < 1000000000)
);
