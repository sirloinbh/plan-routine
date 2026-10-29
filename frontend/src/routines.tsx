import { useEffect, useState } from 'react';

import { requestJson } from './api';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Input } from './components/ui/input';
import { groupByCategory } from './routine-groups';

export type Routine = {
  id: string;
  name: string;
  cadence: string;
  category: string | null;
  sortOrder: number;
};

type Notice = { kind: 'status' | 'alert'; text: string } | null;

// All state lives here (not in child components) so per-item editing survives re-renders.
export function DailyRoutines() {
  const [routines, setRoutines] = useState<Routine[] | null>(null);
  const [version, setVersion] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  useEffect(() => {
    // A newer reload supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    requestJson<{ routines: Routine[] }>('/api/routines?cadence=daily')
      .then((data) => {
        if (!ignore) setRoutines(data.routines);
      })
      .catch((error: Error) => {
        if (ignore) return;
        setRoutines((current) => current ?? []);
        setNotice({ kind: 'alert', text: error.message });
      });
    return () => {
      ignore = true;
    };
  }, [version]);

  const run = async (action: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await action();
      setNotice({ kind: 'status', text: done });
      return true;
    } catch (error) {
      setNotice({ kind: 'alert', text: (error as Error).message });
      return false;
    } finally {
      // Reload after failures too: a 404 usually means the list is stale (changed elsewhere).
      setVersion((value) => value + 1);
      setBusy(false);
    }
  };

  const add = async (category: string, label: string) => {
    const name = (drafts[category] ?? '').trim();
    if (!name) {
      setNotice({ kind: 'alert', text: '루틴 이름을 입력해 주세요' });
      return;
    }
    const ok = await run(
      () =>
        requestJson('/api/routines', {
          method: 'POST',
          body: { name, cadence: 'daily', category },
        }),
      `${label}에 '${name}' 루틴을 추가했습니다`,
    );
    if (ok) setDrafts((current) => ({ ...current, [category]: '' }));
  };

  const rename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      setNotice({ kind: 'alert', text: '루틴 이름을 입력해 주세요' });
      return;
    }
    const ok = await run(
      () => requestJson(`/api/routines/${editing.id}`, { method: 'PATCH', body: { name } }),
      `루틴 이름을 '${name}'(으)로 바꿨습니다`,
    );
    if (ok) setEditing(null);
  };

  const move = (routine: Routine, direction: 'up' | 'down') =>
    run(
      () =>
        requestJson(`/api/routines/${routine.id}/move`, { method: 'POST', body: { direction } }),
      `'${routine.name}' 루틴을 ${direction === 'up' ? '위로' : '아래로'} 옮겼습니다`,
    );

  const archive = async (routine: Routine) => {
    await run(
      () => requestJson(`/api/routines/${routine.id}/archive`, { method: 'POST' }),
      `'${routine.name}' 루틴을 보관했습니다. 지난 기록은 남아 있습니다`,
    );
    setConfirmArchive(null);
  };

  if (routines === null)
    return (
      <p role="status" className="text-body-sm text-muted-foreground">
        루틴을 불러오는 중…
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {/* Live regions stay mounted so screen readers announce the first message too. */}
      <div role="status" aria-live="polite">
        {notice?.kind === 'status' && (
          <p className="text-body-sm text-muted-foreground">{notice.text}</p>
        )}
      </div>
      <div role="alert">
        {notice?.kind === 'alert' && <p className="text-body-sm text-destructive">{notice.text}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {groupByCategory(routines).map((group) => (
          <Card key={group.key} role="region" aria-label={`${group.label} 루틴`}>
            <CardHeader>
              <CardTitle asHeading="h2" className="flex items-center gap-2">
                {group.label}
                <Badge variant="secondary">{group.routines.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {group.routines.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">아직 루틴이 없습니다</p>
              ) : (
                <ol className="flex flex-col divide-y">
                  {group.routines.map((routine, index) => (
                    <li key={routine.id} className="flex flex-wrap items-center gap-2 py-2">
                      {editing?.id === routine.id ? (
                        <form
                          className="flex w-full flex-wrap gap-2"
                          aria-label={`${routine.name} 이름 수정`}
                          onSubmit={(event) => {
                            event.preventDefault();
                            void rename();
                          }}
                        >
                          <Input
                            className="min-w-0 flex-1"
                            aria-label={`${routine.name} 새 이름`}
                            // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the rename field opens on a click, so focus follows that action.
                            autoFocus
                            value={editing.name}
                            maxLength={100}
                            onChange={(event) =>
                              setEditing({ id: routine.id, name: event.target.value })
                            }
                          />
                          <Button type="submit" disabled={busy}>
                            저장
                          </Button>
                          <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                            취소
                          </Button>
                        </form>
                      ) : (
                        <>
                          <span className="min-w-0 flex-1 text-body break-words">
                            {routine.name}
                          </span>
                          <span className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`${routine.name} 위로 이동`}
                              disabled={busy || index === 0}
                              onClick={() => void move(routine, 'up')}
                            >
                              위로
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`${routine.name} 아래로 이동`}
                              disabled={busy || index === group.routines.length - 1}
                              onClick={() => void move(routine, 'down')}
                            >
                              아래로
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              aria-label={`${routine.name} 이름 수정`}
                              disabled={busy}
                              onClick={() => {
                                setConfirmArchive(null);
                                setEditing({ id: routine.id, name: routine.name });
                              }}
                            >
                              수정
                            </Button>
                            {confirmArchive === routine.id ? (
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                aria-label={`${routine.name} 보관 확인`}
                                disabled={busy}
                                onClick={() => void archive(routine)}
                              >
                                보관 확인
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                aria-label={`${routine.name} 보관`}
                                disabled={busy}
                                onClick={() => setConfirmArchive(routine.id)}
                              >
                                보관
                              </Button>
                            )}
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <form
                className="flex gap-2"
                aria-label={`${group.label} 루틴 추가`}
                onSubmit={(event) => {
                  event.preventDefault();
                  void add(group.key, group.label);
                }}
              >
                <Input
                  className="min-w-0 flex-1"
                  aria-label={`${group.label} 새 루틴 이름`}
                  placeholder="새 루틴 이름"
                  value={drafts[group.key] ?? ''}
                  maxLength={100}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [group.key]: event.target.value }))
                  }
                />
                <Button type="submit" disabled={busy}>
                  추가
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
