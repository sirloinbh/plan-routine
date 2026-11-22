import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';

import { closeOnSignals } from '../src/shutdown.js';
import { listenHost } from '../src/standard/auth.js';
import { createPool } from '../src/standard/db.js';

test('an idle connection error on the pool is logged and does not throw', () => {
  const pool = new EventEmitter();
  const logged: string[] = [];
  createPool(pool, (message) => logged.push(message));
  const client = new EventEmitter();
  pool.emit('connect', client);
  assert.doesNotThrow(() => {
    pool.emit('error', new Error('terminating connection'));
    client.emit('error', new Error('terminating connection'));
  });
  assert.deepEqual(logged, ['Database connection failed']);
});

test('the listen host is HOST, else localhost without sign-in', () => {
  assert.equal(listenHost(false, {}), '127.0.0.1');
  assert.equal(listenHost(false, { HOST: '0.0.0.0' }), '0.0.0.0');
});

test('SIGTERM and SIGINT both close the server and then the pool', () => {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    const proc = new EventEmitter();
    const calls: string[] = [];
    const server = { close: (cb?: () => void) => (calls.push('server'), cb?.(), server) };
    closeOnSignals(server as never, { end: async () => void calls.push('pool') }, proc);
    proc.emit(signal);
    assert.deepEqual(calls, ['server', 'pool']);
  }
});
