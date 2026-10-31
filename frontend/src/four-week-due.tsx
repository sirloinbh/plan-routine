import { useState } from 'react';

import { Checklist, type ChecklistItem } from './checklist';
import { Notice } from './components/ui/notice';
import { useChecklist } from './use-checklist';

// Unfinished four-week routines on the daily page, during the last 7 days of their period.
export function FourWeekDue() {
  const { data, notice, toggle } = useChecklist<ChecklistItem>('four_week');
  // Boxes checked here stay in place so a mistaken click can be undone; the next visit drops them.
  const [checkedHere, setCheckedHere] = useState<Set<string>>(new Set());

  if (!data) return <Notice notice={notice} />;
  if (!data.endsSoon) return null;
  const items = data.items.filter((item) => !item.checked || checkedHere.has(item.id));
  if (items.length === 0) return <Notice notice={notice} />;

  return (
    <div className="flex flex-col gap-2">
      <Notice notice={notice} />
      <Checklist
        title="곧 끝나는 4주 루틴"
        items={items}
        onToggle={(item) => {
          setCheckedHere((current) => new Set(current).add(item.id));
          void toggle(data.date, item);
        }}
      />
      <p className="text-body-sm text-muted-foreground">
        {data.period.end}까지입니다.{' '}
        {data.remainingDays === 0 ? '오늘이 마지막 날입니다' : `${data.remainingDays}일 남았습니다`}
      </p>
    </div>
  );
}
