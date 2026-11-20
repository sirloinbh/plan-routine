import { z } from 'zod/v4';

import { ID_PATTERN } from './standard/http.js';

// Ids are numbers on the wire (ADR-0025). ID_PATTERN allows at most 15 digits, so every accepted id is exact as a JS number.
const MAX_ID = 999_999_999_999_999;

/** A path id: up to 15 digits in the URL, a number after parsing. */
export function pathId(message: string) {
  return z
    .string({ error: message })
    .regex(ID_PATTERN, message)
    .transform((value) => Number(value));
}

/** An id in a JSON body: a positive integer of up to 15 digits. */
export function bodyId(message: string) {
  return z.number({ error: message }).int(message).min(1, message).max(MAX_ID, message);
}
