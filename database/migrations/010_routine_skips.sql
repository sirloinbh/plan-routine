-- A routine period skipped on purpose (sick, travelling), with an optional one-line reason.
-- period_start is the first day of that routine's period, as in routine_checks. A period is either
-- checked or skipped; the API keeps the two exclusive (a cross-table rule), under a routine row lock.
CREATE TABLE IF NOT EXISTS routine_skips (
  routine_id bigint NOT NULL REFERENCES routines (id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 200),
  skipped_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (routine_id, period_start)
);

CREATE INDEX IF NOT EXISTS routine_skips_period_idx ON routine_skips (period_start);
