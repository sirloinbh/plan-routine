// The migration CLI is managed in standard/migrate.ts. This entry keeps 'node dist/migrate.js' (deploy) and
// 'npm run db:migrate' working. The managed CLI itself prints a connection failure as one line without a stack trace
// (exit 1) and rejects unknown options (exit 2), so no wrapper is needed (project-standards#1002).
import './standard/migrate.js';
