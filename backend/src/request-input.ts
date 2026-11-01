// Shared rules for what a request sends, so every refusal stays in Korean.

const badRequestMessage = '요청 형식이 올바르지 않습니다';

/** For z.object: a body that is an array rather than an object. */
export const badRequest = { error: badRequestMessage };

// PostgreSQL text cannot hold a NUL character; without this check it would answer a 500.
export const noNul = (value: string) => !value.includes('\0');
export const nulMessage = '쓸 수 없는 문자가 들어 있습니다';

// Express leaves req.body undefined without a JSON body; parse {} so field messages stay Korean.
export const requestBody = (value: unknown) => value ?? {};

/** What to answer for an error Express or its JSON parser raised, such as broken JSON. */
export function requestFailure(err: unknown) {
  const status = typeof err === 'object' && err !== null ? (err as { status?: unknown }).status : 0;
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;
  if (status === 413) return { status, error: '요청 내용이 너무 큽니다' };
  if (status === 415) return { status, error: '지원하지 않는 요청 형식입니다' };
  return { status: 400, error: badRequestMessage };
}
