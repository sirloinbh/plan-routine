-- Other personal web apps a routine can link to (issue #12). Safe to re-run.
-- Limits mirror backend/src/project-link-routes.ts. Removing a project clears the routines' link.
CREATE TABLE IF NOT EXISTS project_links (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  url text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS project_links_name_idx ON project_links (lower(name));

ALTER TABLE routines
  ADD COLUMN IF NOT EXISTS project_link_id bigint REFERENCES project_links (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS routines_project_link_idx ON routines (project_link_id);
