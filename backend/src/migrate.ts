// Host and CI command for the shared migration runner (src/migrations.ts).
// Usage: npm run db:migrate            applies pending files
//        npm run db:migrate -- --status only reports (no database change)
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

import { migrate, migrationStatus, readMigrations } from './migrations.js';

const dir = fileURLToPath(new URL('../../database/migrations/', import.meta.url));
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required. Check your .env file.');
  process.exit(1);
}
const client = new Client({ connectionString: url });
await client.connect();
try {
  const files = await readMigrations(dir);
  if (process.argv.includes('--status')) {
    const status = await migrationStatus(client, files);
    const done = new Set(status.applied.map((row) => row.name));
    for (const file of files)
      console.log(`${done.has(file.name) ? 'applied' : 'pending'}  ${file.name}`);
    for (const error of status.errors) console.error(`error  ${error}`);
    process.exitCode = status.errors.length ? 1 : 0;
  } else {
    const applied = await migrate(client, files);
    console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No migrations to apply.');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
} finally {
  await client.end();
}
