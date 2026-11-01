import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { applyMigrations } from '../src/migrate.js';

function fakePool(failOn?: string) {
  const queries: string[] = [];
  let released = 0;
  const client = {
    query: async (sql: string) => {
      queries.push(sql);
      if (failOn && sql === failOn) throw new Error('syntax error');
      return { rows: [] };
    },
    release: () => {
      released += 1;
    },
  };
  return {
    pool: { connect: async () => client } as unknown as Pool,
    queries,
    released: () => released,
  };
}

function withFiles(files: Record<string, string>, run: (directory: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'migrations-'));
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(directory, name), content);
  return run(directory).finally(() => rmSync(directory, { recursive: true }));
}

test('applies .sql files in number order, each in its own transaction, under a lock', () =>
  withFiles(
    { '002_b.sql': 'two', '010_c.sql': 'ten', '001_a.sql': 'one', 'README.md': 'no' },
    async (dir) => {
      const { pool, queries, released } = fakePool();
      assert.deepEqual(await applyMigrations(pool, dir), ['001_a.sql', '002_b.sql', '010_c.sql']);
      assert.deepEqual(queries, [
        'SELECT pg_advisory_lock($1)',
        'BEGIN',
        'one',
        'COMMIT',
        'BEGIN',
        'two',
        'COMMIT',
        'BEGIN',
        'ten',
        'COMMIT',
        'SELECT pg_advisory_unlock($1)',
      ]);
      assert.equal(released(), 1);
    },
  ));

test('a failing migration rolls back, stops the run and names the file', () =>
  withFiles({ '001_a.sql': 'one', '002_b.sql': 'two', '003_c.sql': 'three' }, async (dir) => {
    const { pool, queries, released } = fakePool('two');
    await assert.rejects(applyMigrations(pool, dir), /Migration 002_b\.sql failed: syntax error/);
    assert.ok(queries.includes('ROLLBACK'));
    assert.ok(!queries.includes('three'));
    assert.equal(queries.at(-1), 'SELECT pg_advisory_unlock($1)');
    assert.equal(released(), 1);
  }));

test('a directory with no migrations is an error, not a silent success', () =>
  withFiles({ 'README.md': 'no' }, async (dir) => {
    const { pool, queries } = fakePool();
    await assert.rejects(applyMigrations(pool, dir), /No migrations found/);
    assert.deepEqual(queries, []);
  }));
