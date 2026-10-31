-- One diary entry per day (issue #9). Safe to re-run.
-- The body is required; the three notes are optional. Limits mirror backend/src/diary-routes.ts.
CREATE TABLE IF NOT EXISTS diary_entries (
  entry_date date PRIMARY KEY,
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  good_note text CHECK (char_length(good_note) <= 1000),
  regret_note text CHECK (char_length(regret_note) <= 1000),
  tomorrow_note text CHECK (char_length(tomorrow_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
