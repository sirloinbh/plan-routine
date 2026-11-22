import { expect, test } from 'vitest';

import { RequestError } from './lib/api';
import { isPassingFailure } from './use-date-change';

test('a load is tried again after the server was unreachable, timed out, failed or asked to slow down', () => {
  expect(isPassingFailure(new RequestError('x', undefined, 'network'))).toBe(true);
  expect(isPassingFailure(new RequestError('x', undefined, 'timeout'))).toBe(true);
  expect(isPassingFailure(new RequestError('x', 500, 'http'))).toBe(true);
  expect(isPassingFailure(new RequestError('x', 503, 'http'))).toBe(true);
  expect(isPassingFailure(new RequestError('x', 408, 'http'))).toBe(true);
  expect(isPassingFailure(new RequestError('x', 429, 'http'))).toBe(true);
});

test('a load is not tried again after another 4xx, an aborted request or a broken answer', () => {
  expect(isPassingFailure(new RequestError('x', 400, 'http'))).toBe(false);
  expect(isPassingFailure(new RequestError('x', 404, 'http'))).toBe(false);
  expect(isPassingFailure(new RequestError('x', undefined, 'abort'))).toBe(false);
  expect(isPassingFailure(new RequestError('x', undefined, 'body'))).toBe(false);
  expect(isPassingFailure(new Error('not a request error'))).toBe(false);
  expect(isPassingFailure('text')).toBe(false);
});
