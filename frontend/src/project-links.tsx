import { useCallback, useEffect, useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { Notice } from './components/ui/notice';
import { useFocusRequest } from './focus-moves';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';

export type ProjectLink = { id: string; name: string; url: string };

const keys = {
  name: 'add-project-name',
  url: 'project-url',
  remove: (id: string) => `project-remove-${id}`,
};

// The other personal web apps a routine can link to, managed on the settings page.
export function ProjectLinks() {
  const [projects, setProjects] = useState<ProjectLink[] | null>(null);
  const [version, setVersion] = useState(0);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const { notice, status, error, clear } = useNotice();
  const { beginChange, requestFocus } = useFocusRequest(() => !busy);

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    requestJson<{ projects: ProjectLink[] }>('/api/project-links')
      .then((data) => {
        if (ignore) return;
        setProjects(data.projects);
        setLoadFailed(false);
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        setLoadFailed(true);
        error(cause);
      });
    return () => {
      ignore = true;
    };
  }, [version, error]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    beginChange();
    clear();
    try {
      await action();
      status(done);
      return true;
    } catch (cause) {
      error(cause);
      return false;
    } finally {
      setBusy(false);
      reload();
    }
  };

  const add = async () => {
    const ok = await run(
      () => requestJson('/api/project-links', { method: 'POST', body: { name, url } }),
      `'${name.trim()}' 프로젝트를 추가했습니다`,
    );
    if (ok) {
      setName('');
      setUrl('');
    }
    // A refused address is what needs fixing.
    requestFocus(ok ? [keys.name] : [keys.url]);
  };

  const remove = async (project: ProjectLink) => {
    const list = projects ?? [];
    const index = list.indexOf(project);
    const ok = await run(
      () => requestJson(`/api/project-links/${project.id}`, { method: 'DELETE' }),
      `'${project.name}' 프로젝트를 지웠습니다. 연결했던 루틴은 그대로입니다`,
    );
    setConfirming(null);
    requestFocus([
      ...(ok ? [] : [keys.remove(project.id)]),
      ...[list[index + 1], list[index - 1]].filter(Boolean).map((next) => keys.remove(next.id)),
      keys.name,
    ]);
  };

  return (
    <Card role="region" aria-label="연결할 프로젝트">
      <CardHeader>
        <CardTitle asHeading="h2">연결할 프로젝트</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-body-sm text-muted-foreground">
          가계부나 독서 기록처럼 다른 웹앱을 등록하면, 루틴에 연결해 오늘 체크에서 바로 열 수
          있습니다.
        </p>
        <Notice notice={notice} className="wrap-anywhere" />
        {loadFailed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              clear();
              setLoadFailed(false);
              reload();
            }}
          >
            프로젝트 다시 불러오기
          </Button>
        )}
        {projects === null ? (
          !loadFailed && (
            <p role="status" className="text-body-sm text-muted-foreground">
              프로젝트를 불러오는 중…
            </p>
          )
        ) : projects.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">아직 등록한 프로젝트가 없습니다</p>
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
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`${project.name} 삭제 확인`}
                    disabled={busy}
                    onClick={() => void remove(project)}
                  >
                    삭제 확인
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${project.name} 삭제`}
                    data-focus-key={keys.remove(project.id)}
                    disabled={busy}
                    onClick={() => setConfirming(project.id)}
                  >
                    삭제
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          aria-label="프로젝트 추가"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <Input
            className="min-w-0 sm:basis-1/3"
            aria-label="프로젝트 이름"
            data-focus-key={keys.name}
            placeholder="가계부"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            className="min-w-0 sm:flex-1"
            aria-label="프로젝트 주소"
            data-focus-key={keys.url}
            placeholder="https://example.com"
            inputMode="url"
            value={url}
            maxLength={2048}
            onChange={(event) => setUrl(event.target.value)}
          />
          <Button type="submit" disabled={busy}>
            추가
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
