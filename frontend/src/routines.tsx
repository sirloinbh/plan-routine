import React, { useEffect, useState } from 'react';
import { requestJson } from './api';

export type Routine = {
  id: string;
  name: string;
  cadence: string;
  category: string | null;
  sortOrder: number;
};

// Same codes and order as the backend's routineCategories.
export const dailyCategories = [
  { key: 'wake', label: '기상' },
  { key: 'exercise', label: '운동' },
  { key: 'diet', label: '식단' },
  { key: 'housework', label: '가사' },
  { key: 'care', label: '관리' },
  { key: 'study', label: '공부' },
  { key: 'reading', label: '독서' },
];

export function groupByCategory(routines: Routine[]) {
  return dailyCategories.map((category) => ({
    ...category,
    routines: routines
      .filter((routine) => routine.category === category.key)
      .sort((a, b) => a.sortOrder - b.sortOrder || Number(a.id) - Number(b.id)),
  }));
}

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
      <p role="status" className="status">
        루틴을 불러오는 중…
      </p>
    );

  return (
    <div className="routine-page">
      {/* Live regions stay mounted so screen readers announce the first message too. */}
      <div role="status" aria-live="polite">
        {notice?.kind === 'status' && <p className="notice">{notice.text}</p>}
      </div>
      <div role="alert">{notice?.kind === 'alert' && <p className="error">{notice.text}</p>}</div>
      <div className="routine-groups">
        {groupByCategory(routines).map((group) => (
          <section
            key={group.key}
            className="card routine-group"
            aria-label={`${group.label} 루틴`}
          >
            <h2>
              {group.label}
              <span className="count">{group.routines.length}</span>
            </h2>
            {group.routines.length === 0 ? (
              <p className="muted">아직 루틴이 없습니다</p>
            ) : (
              <ol className="routine-list">
                {group.routines.map((routine, index) => (
                  <li key={routine.id}>
                    {editing?.id === routine.id ? (
                      <form
                        className="routine-edit"
                        aria-label={`${routine.name} 이름 수정`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          void rename();
                        }}
                      >
                        <input
                          aria-label={`${routine.name} 새 이름`}
                          autoFocus
                          value={editing.name}
                          maxLength={100}
                          onChange={(event) =>
                            setEditing({ id: routine.id, name: event.target.value })
                          }
                        />
                        <button type="submit" className="primary" disabled={busy}>
                          저장
                        </button>
                        <button type="button" className="ghost" onClick={() => setEditing(null)}>
                          취소
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="routine-name">{routine.name}</span>
                        <span className="routine-actions">
                          <button
                            type="button"
                            className="ghost"
                            aria-label={`${routine.name} 위로 이동`}
                            disabled={busy || index === 0}
                            onClick={() => void move(routine, 'up')}
                          >
                            위로
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            aria-label={`${routine.name} 아래로 이동`}
                            disabled={busy || index === group.routines.length - 1}
                            onClick={() => void move(routine, 'down')}
                          >
                            아래로
                          </button>
                          <button
                            type="button"
                            className="ghost"
                            aria-label={`${routine.name} 이름 수정`}
                            disabled={busy}
                            onClick={() => {
                              setConfirmArchive(null);
                              setEditing({ id: routine.id, name: routine.name });
                            }}
                          >
                            수정
                          </button>
                          {confirmArchive === routine.id ? (
                            <button
                              type="button"
                              className="danger"
                              aria-label={`${routine.name} 보관 확인`}
                              disabled={busy}
                              onClick={() => void archive(routine)}
                            >
                              보관 확인
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="ghost"
                              aria-label={`${routine.name} 보관`}
                              disabled={busy}
                              onClick={() => setConfirmArchive(routine.id)}
                            >
                              보관
                            </button>
                          )}
                        </span>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
            <form
              className="routine-add"
              aria-label={`${group.label} 루틴 추가`}
              onSubmit={(event) => {
                event.preventDefault();
                void add(group.key, group.label);
              }}
            >
              <input
                aria-label={`${group.label} 새 루틴 이름`}
                placeholder="새 루틴 이름"
                value={drafts[group.key] ?? ''}
                maxLength={100}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [group.key]: event.target.value }))
                }
              />
              <button type="submit" className="primary" disabled={busy}>
                추가
              </button>
            </form>
          </section>
        ))}
      </div>
    </div>
  );
}
