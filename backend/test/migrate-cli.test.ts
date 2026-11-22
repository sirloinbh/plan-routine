import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));
const entry = fileURLToPath(new URL('../src/migrate.ts', import.meta.url));

function run(args: string[], env: Record<string, string>) {
  return spawnSync(tsx, [entry, ...args], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

test('an unreachable database exits 1 with one line and no stack trace', () => {
  const result = run([], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none' });
  assert.equal(result.status, 1);
  const lines = result.stderr.trim().split('\n');
  assert.equal(lines.length, 1, result.stderr);
  assert.match(lines[0], /^Migration failed: /);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});

test('an unknown option exits 1 with a usage line before it touches the database', () => {
  const result = run(['--stauts'], { DATABASE_URL: 'postgres://u:p@127.0.0.1:1/none' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unknown option: --stauts\. Usage: db:migrate \[--status\]/);
  assert.doesNotMatch(result.stderr, /Migration failed/);
});
