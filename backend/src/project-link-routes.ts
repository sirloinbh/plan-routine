import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod/v4';

import { badRequest, noNul, nulMessage, requestBody } from './request-input.js';

const notFound = { error: 'Project not found' };
const columns = 'id::text AS id, name, url';
const urlMessage = 'The URL must be https:// or a private access address';

function isPrivateIpv4(host: string) {
  // Number() alone would also read names like 10.0.0.1e1, which are not addresses at all.
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // Tailscale and similar private networks.
    (a === 100 && b >= 64 && b <= 127)
  );
}

const privateNames = ['.localhost', '.local', '.internal', '.home.arpa', '.ts.net'];

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  if (host === 'localhost' || privateNames.some((suffix) => host.endsWith(suffix))) return true;
  // URL keeps the brackets on an IPv6 address.
  if (host.startsWith('[')) return host === '[::1]' || /^\[f[cd][0-9a-f]{2}:/.test(host);
  return isPrivateIpv4(host);
}

/** https:// anywhere; http:// only on a private address. Anything else, such as javascript:, fails. */
export function allowedUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === 'https:') return url.href;
  return url.protocol === 'http:' && isPrivateHost(url.hostname) ? url.href : null;
}

const projectInput = z.object(
  {
    name: z
      .string({
        error: (issue) =>
          issue.input === undefined ? 'Enter a project name' : 'The project name must be text',
      })
      .trim()
      .refine((value) => value.length >= 1, 'Enter a project name')
      .refine((value) => value.length <= 100, 'The project name must be 100 characters or fewer')
      .refine(noNul, nulMessage),
    url: z
      .string({
        error: (issue) => (issue.input === undefined ? 'Enter a URL' : 'The URL must be text'),
      })
      .trim()
      .refine((value) => value.length >= 1, 'Enter a URL')
      .refine((value) => value.length === 0 || allowedUrl(value) !== null, urlMessage)
      // Measured as stored: normalising percent-encodes non-ASCII text and can make it far longer.
      .refine((value) => {
        const stored = allowedUrl(value);
        return stored === null || stored.length <= 2048;
      }, 'The URL must be 2048 characters or fewer')
      .transform((value) => allowedUrl(value) ?? value),
  },
  badRequest,
);
const idParam = z.object({
  id: z.string().regex(/^\d{1,18}$/, 'Invalid project ID'),
});

export function projectLinkRoutes(pool: Pool) {
  const router = Router();

  router.get('/', async (_req, res) => {
    const { rows } = await pool.query(`SELECT ${columns} FROM project_links ORDER BY lower(name)`);
    res.json({ projects: rows });
  });

  router.post('/', async (req, res) => {
    const { name, url } = projectInput.parse(requestBody(req.body));
    const { rows } = await pool.query(
      `INSERT INTO project_links (name, url) VALUES ($1, $2) RETURNING ${columns}`,
      [name, url],
    );
    res.status(201).json({ project: rows[0] });
  });

  // Routines linked to it lose the link and stay as they are.
  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { rows } = await pool.query('DELETE FROM project_links WHERE id = $1 RETURNING id', [id]);
    if (!rows[0]) {
      res.status(404).json(notFound);
      return;
    }
    res.json({ id });
  });

  return router;
}
