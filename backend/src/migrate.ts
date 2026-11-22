// The migration CLI is managed in standard/migrate.ts. This entry keeps 'node dist/migrate.js' (deploy) and
// 'npm run db:migrate' working, and adds what the managed file does not do (#159): an unknown option exits 1 with a
// usage line before anything is imported, and a failure while connecting prints one line instead of a stack trace.
const usage = 'Usage: db:migrate [--status]';
const unknown = process.argv.slice(2).filter((flag) => flag !== '--status');
if (unknown.length) {
  console.error(`Unknown option: ${unknown.join(' ')}. ${usage}`);
  process.exit(1);
}

/** One line: the message, then the cause or error code (pg wraps a refused connection in an AggregateError). */
export function describeError(error: unknown): string {
  const parts: string[] = [];
  const add = (value: unknown) => {
    if (!(value instanceof Error)) return void (value === undefined || parts.push(String(value)));
    const code = (value as { code?: unknown }).code;
    const text = value.message || (typeof code === 'string' ? code : value.name);
    if (!parts.includes(text)) parts.push(text);
    if (value instanceof AggregateError && value.errors.length) add(value.errors[0]);
    else if (value.cause !== undefined) add(value.cause);
  };
  add(error);
  return parts.join(': ');
}

try {
  await import('./standard/migrate.js');
} catch (error) {
  console.error(`Migration failed: ${describeError(error)}`);
  process.exit(1);
}
