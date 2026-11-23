-- Weekly reviews (issue #242). Safe to re-run.
-- week_start is the Sunday that starts the week (backend/src/periods.ts). Limits mirror
-- backend/src/weekly-review-routes.ts. A note is NULL when left blank.
CREATE TABLE IF NOT EXISTS weekly_reviews (
  week_start date PRIMARY KEY CHECK (EXTRACT(DOW FROM week_start) = 0),
  went_well text CHECK (char_length(went_well) <= 1000),
  to_change text CHECK (char_length(to_change) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
