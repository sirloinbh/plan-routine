-- Optional mood and energy scores for a diary entry (issue #247). Safe to re-run.
-- 1 to 5, or NULL when not scored. Limits mirror backend/src/diary-routes.ts.
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS mood smallint;
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS energy smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diary_entries_mood_range') THEN
    ALTER TABLE diary_entries
      ADD CONSTRAINT diary_entries_mood_range CHECK (mood BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'diary_entries_energy_range') THEN
    ALTER TABLE diary_entries
      ADD CONSTRAINT diary_entries_energy_range CHECK (energy BETWEEN 1 AND 5);
  END IF;
END
$$;
