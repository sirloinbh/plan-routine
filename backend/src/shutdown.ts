import type { Server } from 'node:http';

type Signalled = { on: (signal: 'SIGTERM' | 'SIGINT', listener: () => void) => unknown };

/** Closes the HTTP server, then the pool, on SIGTERM (container stop) and SIGINT (Ctrl+C in a local run). */
export function closeOnSignals(
  server: Pick<Server, 'close'>,
  pool: { end: () => Promise<void> },
  proc: Signalled = process,
) {
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    proc.on(signal, () =>
      server.close(() => {
        void pool.end();
      }),
    );
  }
}
