import { useState } from 'react';

import { Checklist, type ChecklistItem } from './checklist';
import { Button } from './components/ui/button';
import { Notice } from './components/ui/notice';
import { useChecklist } from './use-checklist';

// Unfinished four-week routines on the daily page, during the last 7 days of their period.
export function FourWeekDue() {
  const { data, loadFailed, notice, toggle, retry } = useChecklist<ChecklistItem>('four_week');
  // Boxes checked here stay in place so a mistaken click can be undone, until the page is left.
  // Keyed by period, so a page left open does not keep showing them in the next period.
  const [checkedHere, setCheckedHere] = useState<Set<string>>(new Set());

  const keyOf = (item: ChecklistItem) => `${data?.period.start}/${item.id}`;
  const items = data?.endsSoon
    ? data.items.filter((item) => !item.checked || checkedHere.has(keyOf(item)))
    : [];

  // Without a card, only a failure is worth showing: "check again" would have nothing to check.
  const shownNotice = items.length > 0 || notice?.kind === 'error' ? notice : undefined;

  if (!shownNotice && !loadFailed && items.length === 0) return null;

  return (
    <div className="flex flex-col items-start gap-2">
      <Notice notice={shownNotice} />
      {loadFailed && (
        <Button type="button" variant="outline" size="sm" onClick={retry}>
          4주 루틴 다시 불러오기
        </Button>
      )}
      {data && items.length > 0 && (
        <>
          <div className="w-full">
            <Checklist
              title="곧 끝나는 4주 루틴"
              headingLevel="h2"
              items={items}
              onToggle={(item) => {
                setCheckedHere((current) => new Set(current).add(keyOf(item)));
                void toggle(data.date, item);
              }}
            />
          </div>
          <p className="text-body-sm text-muted-foreground">
            {data.period.end}까지입니다.{' '}
            {data.remainingDays === 0
              ? '오늘이 마지막 날입니다'
              : `${data.remainingDays}일 남았습니다`}
          </p>
        </>
      )}
    </div>
  );
}
