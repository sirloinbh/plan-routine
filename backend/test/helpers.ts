import type { Server } from 'node:http';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';

const closeServer = (server: Server) =>
  new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );

// fetch refuses some ports ("bad port"), all of them 10080 or lower, and Windows can hand those out
// for port 0. Without this a test fails now and then for no reason of its own.
const highestRefusedPort = 10080;

async function listen(app: ReturnType<typeof createApp>) {
  for (;;) {
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP address');
    if (address.port > highestRefusedPort) return { server, port: address.port };
    await closeServer(server);
  }
}

export async function withApi(
  pool: Pool,
  run: (
    call: (
      path: string,
      request?: { method: string; body?: unknown; raw?: string; contentType?: string },
    ) => Promise<{ status: number; data: Record<string, unknown> }>,
  ) => Promise<void>,
  options: { today?: () => string } = {},
) {
  const { server, port } = await listen(createApp(pool, options));
  try {
    await run(async (path, request) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: request?.method,
        headers:
          request?.body === undefined && request?.raw === undefined
            ? undefined
            : { 'Content-Type': request.contentType ?? 'application/json' },
        body:
          request?.raw ?? (request?.body === undefined ? undefined : JSON.stringify(request.body)),
      });
      return { status: response.status, data: (await response.json()) as Record<string, unknown> };
    });
  } finally {
    await closeServer(server);
  }
}
