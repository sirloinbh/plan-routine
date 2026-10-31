import { useEffect, useRef, useState } from 'react';

import { Checklist, type ChecklistItem } from './checklist';
import { progressText } from './checklist-progress';
import { Button } from './components/ui/button';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { groupByCategory } from './routine-groups';
import type { Routine } from './routines';

type DailyItem = Routine & ChecklistItem;

type DailyChecklistData = {
  date: string;
  today: string;
  previousDate: string | null;
  nextDate: string | null;
  items: DailyItem[];
};

export function DailyChecklist() {
  // null follows the server's today: the next load after midnight shows the new day.
  const [date, setDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<DailyChecklistData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { notice, error, clear } = useNotice();
  // Ignoring repeat clicks (instead of disabling the box) keeps keyboard focus on the box.
  const saving = useRef(new Set<string>());
  const savesStarted = useRef(0);
  const reloadAfterSaves = useRef(false);

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    const savesAtStart = savesStarted.current;
    requestJson<DailyChecklistData>(`/api/checklist?cadence=daily${date ? `&date=${date}` : ''}`)
      .then((loaded) => {
        if (ignore) return;
        // This response may predate a save, so showing it could undo a checked box on screen.
        if (saving.current.size > 0) {
          reloadAfterSaves.current = true;
          return;
        }
        if (savesStarted.current !== savesAtStart) {
          setVersion((value) => value + 1);
          return;
        }
        setData(loaded);
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
  }, [date, version, error]);

  // A page left open (an installed app, a phone tab) must not keep saving to yesterday.
  useEffect(() => {
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible') setVersion((value) => value + 1);
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    return () => document.removeEventListener('visibilitychange', reloadWhenShown);
  }, []);

  const setChecked = (itemDate: string, id: string, checked: boolean) =>
    // The user may have moved to another day while this request was running.
    setData((current) =>
      current?.date === itemDate
        ? {
            ...current,
            items: current.items.map((item) => (item.id === id ? { ...item, checked } : item)),
          }
        : current,
    );

  const toggle = async (itemDate: string, item: ChecklistItem) => {
    const saveKey = `${itemDate}/${item.id}`;
    if (saving.current.has(saveKey)) return;
    saving.current.add(saveKey);
    savesStarted.current += 1;
    clear();
    const checked = !item.checked;
    setChecked(itemDate, item.id, checked);
    try {
      await requestJson(`/api/routines/${item.id}/checks/${itemDate}`, {
        method: checked ? 'PUT' : 'DELETE',
      });
    } catch (cause) {
      setChecked(itemDate, item.id, item.checked);
      error(cause);
      // A 404 usually means the list is stale (the routine was archived elsewhere).
      setVersion((value) => value + 1);
    } finally {
      saving.current.delete(saveKey);
      if (saving.current.size === 0 && reloadAfterSaves.current) {
        reloadAfterSaves.current = false;
        setVersion((value) => value + 1);
      }
    }
  };

  // Also bumps the version so pressing the same button again retries a failed load.
  const moveTo = (target: string | null) => {
    clear();
    setDate(target);
    setVersion((value) => value + 1);
  };

  if (!data)
    return loadFailed ? (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={notice} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLoadFailed(false);
            moveTo(date);
          }}
        >
          다시 시도
        </Button>
      </div>
    ) : (
      <p role="status" className="text-body-sm text-muted-foreground">
        체크리스트를 불러오는 중…
      </p>
    );

  const groups = groupByCategory(data.items).filter((group) => group.routines.length > 0);
  const isToday = data.date === data.today;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-body font-semibold">{isToday ? `오늘 (${data.date})` : data.date}</h2>
          <p className="text-body-sm text-muted-foreground">전체 {progressText(data.items)} 완료</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.previousDate}
            onClick={() => data.previousDate && moveTo(data.previousDate)}
          >
            이전 날
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.nextDate}
            onClick={() =>
              data.nextDate && moveTo(data.nextDate === data.today ? null : data.nextDate)
            }
          >
            다음 날
          </Button>
          {!isToday && (
            <Button type="button" variant="ghost" size="sm" onClick={() => moveTo(null)}>
              오늘로
            </Button>
          )}
        </div>
      </div>
      <Notice notice={notice} />
      {groups.length === 0 ? (
        <EmptyState
          title="체크할 루틴이 없습니다"
          description="하루 루틴 메뉴에서 매일 할 일을 먼저 추가해 주세요."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.map((group) => (
            <Checklist
              key={group.key}
              title={group.label}
              items={group.routines}
              onToggle={(item) => void toggle(data.date, item)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
