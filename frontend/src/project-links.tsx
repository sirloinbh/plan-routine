import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { LoadingRegion, RetryButton } from './components/load-state/load-state';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { useFocusRequest } from './focus-moves';
import { apiKey, type ApiRequest, useApiMutation, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';

export type ProjectLink = { id: number; name: string; url: string };

// The key the routine lists share (use-routine-list.ts), so a change here refreshes their copy too.
const projectsKey = apiKey('/api/project-links');

const keys = {
  name: 'add-project-name',
  url: 'project-url',
  remove: (id: number) => `project-remove-${id}`,
};

// The other personal web apps a routine can link to, managed on the settings page.
export function ProjectLinks() {
  const projectsQuery = useApiQuery<{ projects: ProjectLink[] }>(
    projectsKey,
    '/api/project-links',
    {
      staleTime: 0,
    },
  );
  const projects = projectsQuery.data?.projects ?? null;
  const loadFailed = projectsQuery.isError;
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  // Which button started the change: busy disables them all, only this one shows it is working.
  const [pending, setPending] = useState<string | null>(null);
  const { notice: changeNotice, status, error, clear } = useNotice();
  // A failed load is said before a change message, which it may have replaced.
  const notice = projectsQuery.error
    ? { kind: 'error' as const, text: errorText(projectsQuery.error) }
    : changeNotice;
  const { beginChange, requestFocus } = useFocusRequest(() => !busy);
  const queryClient = useQueryClient();
  // A change that succeeds loads the list again before it ends; one that fails loads it again here,
  // since a refused change usually means the list moved on.
  const write = useApiMutation<unknown, ApiRequest>((request) => request, {
    invalidate: [projectsKey],
  });
  const reload = () => void queryClient.invalidateQueries({ queryKey: projectsKey });

  const run = async (action: () => Promise<unknown>, done: string, started: string) => {
    setBusy(true);
    setPending(started);
    beginChange();
    clear();
    try {
      await action();
      status(done);
      return true;
    } catch (cause) {
      error(cause);
      reload();
      return false;
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const add = async () => {
    if (!name.trim() || !url.trim()) {
      requestFocus([name.trim() ? keys.url : keys.name]);
      return;
    }
    const ok = await run(
      () => write.mutateAsync({ path: '/api/project-links', method: 'POST', body: { name, url } }),
      `Added the project '${name.trim()}'`,
      'add',
    );
    if (ok) {
      setName('');
      setUrl('');
    }
    // A refused address is what needs fixing.
    requestFocus(ok ? [keys.name] : [keys.url]);
  };

  const cancelRemove = (project: ProjectLink) => {
    setConfirming(null);
    requestFocus([keys.remove(project.id)]);
  };

  const remove = async (project: ProjectLink) => {
    const list = projects ?? [];
    const index = list.indexOf(project);
    const ok = await run(
      () => write.mutateAsync({ path: `/api/project-links/${project.id}`, method: 'DELETE' }),
      `Deleted the project '${project.name}'. Routines that were linked to it keep working without the link`,
      `remove:${project.id}`,
    );
    setConfirming(null);
    requestFocus([
      ...(ok ? [] : [keys.remove(project.id)]),
      ...[list[index + 1], list[index - 1]].filter(Boolean).map((next) => keys.remove(next.id)),
      keys.name,
    ]);
  };

  return (
    <Card role="region" aria-label="Projects to link">
      <CardHeader>
        <CardTitle asHeading="h2">Projects to link</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-body-sm text-muted-foreground">
          Register other web apps, such as a budget or reading log, then link them to routines to
          open them right from Today.
        </p>
        <Notice notice={notice} className="wrap-anywhere" />
        {loadFailed && (
          <RetryButton
            className="self-start"
            onRetry={() => {
              clear();
              void projectsQuery.refetch();
            }}
          >
            Reload projects
          </RetryButton>
        )}
        {projects === null ? (
          !loadFailed && <LoadingRegion label="Loading projects" rows={2} />
        ) : projects.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">No projects registered yet</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {projects.map((project) => (
              <li key={project.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block text-body wrap-anywhere">{project.name}</span>
                  <span className="block text-body-sm wrap-anywhere text-muted-foreground">
                    {project.url}
                  </span>
                </span>
                {confirming === project.id ? (
                  <>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      aria-label={`Confirm deleting ${project.name}`}
                      disabled={busy}
                      onClick={() => void remove(project)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelRemove(project);
                      }}
                    >
                      {pending === `remove:${project.id}` && <Spinner size="sm" label="Working" />}
                      Confirm delete
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`Cancel deleting ${project.name}`}
                      disabled={busy}
                      onClick={() => cancelRemove(project)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') cancelRemove(project);
                      }}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${project.name}`}
                    data-focus-key={keys.remove(project.id)}
                    disabled={busy}
                    onClick={() => setConfirming(project.id)}
                  >
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          aria-label="Add a project"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            className="min-w-0 sm:basis-1/3"
            aria-label="Project name"
            data-focus-key={keys.name}
            placeholder="Budget"
            value={name}
            required
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            className="min-w-0 sm:flex-1"
            aria-label="Project URL"
            data-focus-key={keys.url}
            placeholder="https://example.com"
            inputMode="url"
            value={url}
            required
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {pending === 'add' && <Spinner size="sm" label="Saving" />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
