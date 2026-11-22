import { afterEach } from 'vitest';

// Screens swallow some failed loads on purpose, so a throw inside a fake fetch alone can pass
// unnoticed. Every unknown request is also remembered here and fails the test that made it.
const unexpected: string[] = [];

afterEach(() => {
  const seen = unexpected.splice(0);
  if (seen.length > 0) throw new Error(`Unexpected requests in this test: ${seen.join(', ')}`);
});

/** For a fake `fetch` that does not know the request: fails the test with a clear message. */
export function unexpectedRequest(method: string, url: string): never {
  const { pathname } = new URL(url, 'http://localhost');
  const text = `${method} ${pathname}`;
  unexpected.push(text);
  throw new Error(`Unexpected request: ${text}`);
}

/** Returns and forgets the unknown requests so far; only for testing this helper itself. */
export const takeUnexpected = () => unexpected.splice(0);
