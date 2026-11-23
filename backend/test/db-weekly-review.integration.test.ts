import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { url, withClient } from './db-helpers.js';

const migration = new URL('../../database/migrations/008_weekly_reviews.sql', import.meta.url);

test(
  'weekly reviews migration re-runs safely and enforces its limits',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client) => {
      await client.query(readFileSync(migration, 'utf8'));
      await client.query(readFileSync(migration, 'utf8'));
      const rejects = async (values: string) => {
        await client.query('BEGIN');
        try {
          await assert.rejects(
            client.query(
              `INSERT INTO weekly_reviews (week_start, went_well, to_change) VALUES ${values}`,
            ),
            { code: '23514' },
          );
        } finally {
          await client.query('ROLLBACK');
        }
      };
      await rejects("('2001-02-05', NULL, NULL)"); // a Monday
      await rejects("('2001-02-04', repeat('a', 1001), NULL)");
      await rejects("('2001-02-04', NULL, repeat('a', 1001))");
      await client.query('BEGIN');
      try {
        await client.query(
          "INSERT INTO weekly_reviews (week_start, went_well) VALUES ('2001-02-04', repeat('a', 1000))",
        );
      } finally {
        await client.query('ROLLBACK');
      }
    }),
);
