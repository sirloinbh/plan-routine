import { Checklist, type ChecklistItem, ChecklistPending } from './checklist';
import { progressText } from './checklist-progress';
import { Button } from './components/ui/button';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { groupByCategory } from './routine-groups';
import type { Routine } from './routines';
import { useChecklist } from './use-checklist';

type DailyItem = Routine & ChecklistItem;

export function DailyChecklist() {
  const { data, loadFailed, notice, toggle, moveTo, retry } = useChecklist<DailyItem>('daily');

  if (!data) return <ChecklistPending failed={loadFailed} notice={notice} onRetry={retry} />;

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
