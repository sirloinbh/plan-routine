import type { Pool, PoolClient } from 'pg';

import { withTransaction } from './standard/db.js';

/** What a route answers after its transaction: the status and the JSON body. */
export type Reply = { status: number; body: unknown };

class Refused {
  constructor(readonly reply: Reply) {}
}

/**
 * Runs `run` in one transaction and returns its reply. A reply with status 400 or above rolls the transaction back
 * (the route found it must not change anything); any other reply commits. BEGIN, COMMIT and ROLLBACK are in the
 * managed withTransaction.
 */
export async function inTransaction(
  pool: Pool,
  run: (client: PoolClient) => Promise<Reply>,
): Promise<Reply> {
  try {
    return await withTransaction(pool, async (client: PoolClient) => {
      const reply = await run(client);
      if (reply.status >= 400) throw new Refused(reply);
      return reply;
    });
  } catch (error) {
    if (error instanceof Refused) return error.reply;
    throw error;
  }
}
