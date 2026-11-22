// Shared rules for what a request sends, so every refusal stays in English.

const badRequestMessage = 'Invalid request format';

/** For z.object: a body that is an array rather than an object. */
export const badRequest = { error: badRequestMessage };

// PostgreSQL text cannot hold a NUL character; without this check it would answer a 500.
export const noNul = (value: string) => !value.includes('\0');
export const nulMessage = 'Contains characters that are not allowed';

// Express leaves req.body undefined without a JSON body; parse {} so field messages stay English.
export const requestBody = (value: unknown) => value ?? {};

/** True for a PostgreSQL error with this SQLSTATE, such as '23505' (unique) or '23503' (foreign key). */
export function hasPgCode(error: unknown, code: string) {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === code;
}

/** The shared tail of the "too early" message for diary entries and records (2000-01-01 is the earliest date). */
export const fromEarliestDate = 'from 2000-01-01 on';
