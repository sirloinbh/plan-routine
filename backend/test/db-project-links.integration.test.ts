import assert from 'node:assert/strict';
import { test } from 'node:test';

import { anchorSettingKey } from '../src/routines.js';
import { url, withClient } from './db-helpers.js';
import { withApi } from './helpers.js';

test(
  'a project link reaches the checklist, and removing the project only clears it',
  { skip: !url, timeout: 30_000 },
  () =>
    withClient(async (client, pool) => {
      const original = await client.query<{ value: string }>(
        'SELECT value FROM app_settings WHERE key = $1',
        [anchorSettingKey],
      );
      let routineId = 0;
      let projectId = 0;
      try {
        await withApi(
          pool,
          async (call) => {
            const routine = await call('/api/routines', {
              method: 'POST',
              body: { name: 'Link routine', cadence: 'weekly' },
            });
            routineId = (routine.data.routine as { id: number }).id;
            const project = await call('/api/project-links', {
              method: 'POST',
              body: { name: 'Link test', url: 'https://books.example' },
            });
            assert.equal(project.status, 201);
            projectId = (project.data.project as { id: number; url: string }).id;
            assert.equal((project.data.project as { url: string }).url, 'https://books.example/');

            const same = await call('/api/project-links', {
              method: 'POST',
              body: { name: 'Link test', url: 'https://other.example' },
            });
            assert.equal(same.status, 409);
            assert.equal(
              same.data.error,
              'A project with this name already exists (names ignore case)',
            );

            const item = async () => {
              const { data } = await call('/api/checklist?cadence=weekly&date=2026-10-22');
              return (data.items as { id: number; linkName: unknown; linkUrl: unknown }[]).find(
                (entry) => entry.id === routineId,
              )!;
            };
            assert.equal((await item()).linkUrl, null);

            const path = `/api/routines/${routineId}/project-link`;
            const linked = await call(path, { method: 'PUT', body: { projectLinkId: projectId } });
            assert.equal(linked.status, 200);
            assert.equal(
              (linked.data.routine as { projectLinkId: number }).projectLinkId,
              projectId,
            );
            const shown = await item();
            assert.equal(shown.linkName, 'Link test');
            assert.equal(shown.linkUrl, 'https://books.example/');

            const missing = await call(path, {
              method: 'PUT',
              body: { projectLinkId: 999999999 },
            });
            assert.equal(missing.status, 404);

            const cleared = await call(path, { method: 'PUT', body: { projectLinkId: null } });
            assert.equal(cleared.status, 200);
            assert.equal((await item()).linkUrl, null);

            await call(path, { method: 'PUT', body: { projectLinkId: projectId } });
            await call(`/api/project-links/${projectId}`, { method: 'DELETE' });
            assert.equal((await item()).linkUrl, null);
            const list = await call('/api/routines?cadence=weekly');
            const kept = (list.data.routines as { id: number; projectLinkId: unknown }[]).find(
              (entry) => entry.id === routineId,
            );
            assert.equal(kept?.projectLinkId, null);
          },
          { today: () => '2026-10-22' },
        );
      } finally {
        if (projectId) await client.query('DELETE FROM project_links WHERE id = $1', [projectId]);
        if (routineId) await client.query('DELETE FROM routines WHERE id = $1', [routineId]);
        await client.query('DELETE FROM app_settings WHERE key = $1', [anchorSettingKey]);
        if (original.rows[0])
          await client.query('INSERT INTO app_settings (key, value) VALUES ($1, $2)', [
            anchorSettingKey,
            original.rows[0].value,
          ]);
      }
    }),
);
