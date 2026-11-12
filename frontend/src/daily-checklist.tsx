import { Checklist, type ChecklistItem, ChecklistPending } from './checklist';
import { progressText } from './checklist-progress';
import { Button } from './components/ui/button';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { useDateHeading } from './focus-moves';
import { dateHeading } from './format-date';
import { groupByCategory } from './routine-groups';
import type { Routine } from './routines';
import { useChecklist } from './use-checklist';

type DailyItem = Routine & ChecklistItem;

export function DailyChecklist() {
  const { data, loadFailed, notice, toggle, moveTo, retry } = useChecklist<DailyItem>('daily');
  const { heading, expectMove } = useDateHeading(data?.date);

  const go = (target: string | null) => {
    expectMove();
    moveTo(target);
  };

  if (!data)
    return <ChecklistPending failed={loadFailed} notice={notice} onRetry={retry} shape="cards" />;

  const groups = groupByCategory(data.items).filter((group) => group.routines.length > 0);
  const isToday = data.date === data.today;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="scroll-mt-[calc(env(safe-area-inset-top)+5rem)] text-body font-semibold"
          >
            {dateHeading(data.date, data.today)}
          </h2>
          <p className="text-body-sm text-muted-foreground">
            {progressText(data.items)} done overall
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.previousDate}
            onClick={() => data.previousDate && go(data.previousDate)}
          >
            Previous day
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!data.nextDate}
            onClick={() => data.nextDate && go(data.nextDate === data.today ? null : data.nextDate)}
          >
            Next day
          </Button>
          {!isToday && (
            <Button type="button" variant="ghost" size="sm" onClick={() => go(null)}>
              Go to today
            </Button>
          )}
        </div>
      </div>
      <Notice notice={notice} />
      {groups.length === 0 ? (
        <EmptyState
          title="No routines to check"
          description="Add your daily tasks in the Daily routines menu first."
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
