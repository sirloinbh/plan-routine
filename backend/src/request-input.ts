// Shared rules for what a request sends, so every refusal stays in English.

const badRequestMessage = 'Invalid request format';

/** For z.object: a body that is an array rather than an object. */
export const badRequest = { error: badRequestMessage };

// PostgreSQL text cannot hold a NUL character; without this check it would answer a 500.
export const noNul = (value: string) => !value.includes('\0');
export const nulMessage = 'Contains characters that are not allowed';

// Express leaves req.body undefined without a JSON body; parse {} so field messages stay English.
export const requestBody = (value: unknown) => value ?? {};

/** What to answer for an error Express or its JSON parser raised, such as broken JSON. */
export function requestFailure(err: unknown) {
  const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : 0;
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;
  if (status === 413) return { status, error: 'The request is too large' };
  if (status === 415) return { status, error: 'Unsupported request format' };
  return { status: 400, error: badRequestMessage };
}
