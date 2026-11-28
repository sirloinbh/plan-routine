-- Mandalarts (issue #345): a 9x9 goal chart. Safe to re-run.
-- block 4 position 4 is the main goal. Block 4 position b (b <> 4) is sub-goal b, and the centre of block b
-- (position 4) mirrors it; the server keeps the mirror (backend/src/mandalart-routes.ts), so only block 4 is
-- the source. All 81 cells are stored (empty text is ''); the API returns the full grid (decision on #345).
CREATE TABLE IF NOT EXISTS mandalarts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mandalart_cells (
  mandalart_id bigint NOT NULL REFERENCES mandalarts (id) ON DELETE CASCADE,
  block smallint NOT NULL CHECK (block BETWEEN 0 AND 8),
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 8),
  text text NOT NULL DEFAULT '' CHECK (char_length(text) <= 100),
  PRIMARY KEY (mandalart_id, block, position)
);
