import { useCallback, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { dateHeading, formatDate } from './format-date';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { cn } from './lib/utils';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';
import { groupByCategory } from './routine-groups';
import type { Routine } from './routines';
import { useReloadWhenCurrent } from './use-date-change';

type DaySummary = { date: string; checked: number; total: number; hasDiary: boolean };
type MonthData = {
  today: string;
  month: string;
  previousMonth: string | null;
  nextMonth: string | null;
  days: DaySummary[];
};
type DayRoutine = Routine & {
  checked: boolean;
  archived: boolean;
  skipped?: boolean;
  skipReason?: string | null;
};
type DayData = {
  date: string;
  today: string;
  progress: { checked: number; total: number };
  routines: DayRoutine[];
  diary: {
    body: string;
    goodNote: string | null;
    regretNote: string | null;
    tomorrowNote: string | null;
  } | null;
};

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const monthLabel = (month: string) => {
  const [year, number] = month.split('-');
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(Number(year), Number(number) - 1, 1)));
};

// Calendar dates, so the weekday does not depend on the device's time zone.
const weekdayIndex = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

const dayLabel = ({ date, checked, total, hasDiary }: DaySummary) =>
  `${formatDate(date, 'weekday')}: daily routines ${checked}/${total} done, diary ${hasDiary ? 'written' : 'not written'}`;

function Calendar({
  data,
  selected,
  onSelect,
}: {
  data: MonthData;
  selected: string | null;
  onSelect: (date: string) => void;
}) {
  const firstWeekday = weekdayIndex(`${data.month}-01`);
  return (
    <div className="flex flex-col gap-1">
      <div
        className="grid grid-cols-7 gap-1 text-center text-caption text-muted-foreground"
        aria-hidden
      >
        {weekdays.map((weekday) => (
          <span key={weekday}>{weekday}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {data.days.map((day, index) => (
          <li
            key={day.date}
            style={index === 0 ? { gridColumnStart: firstWeekday + 1 } : undefined}
          >
            <button
              type="button"
              aria-label={dayLabel(day)}
              aria-pressed={day.date === selected}
              aria-current={day.date === data.today ? 'date' : undefined}
              className={cn(
                'flex min-h-12 w-full flex-col items-center justify-center gap-0.5 rounded-md border border-transparent px-0.5 py-1 text-body-sm transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                day.date === selected && 'border-primary',
                day.date === data.today && 'font-semibold',
              )}
              onClick={() => onSelect(day.date)}
            >
              <span>{Number(day.date.slice(8))}</span>
              <span className="text-caption text-muted-foreground">
                {/* A no-break space keeps the row's height, so the dates stay level. */}
                {day.total > 0 ? `${day.checked}/${day.total}` : '\u00a0'}
              </span>
              <span
                aria-hidden
                className={cn(
                  'size-1.5 rounded-full',
                  day.hasDiary ? 'bg-primary' : 'bg-transparent',
                )}
              />
            </button>
          </li>
        ))}
      </ol>
      <p className="text-caption text-muted-foreground">A dot marks a day with a diary entry</p>
    </div>
  );
}

function DayDetail({ day }: { day: DayData }) {
  const groups = groupByCategory(day.routines).filter((group) => group.routines.length > 0);
  const notes = day.diary
    ? [
        { label: 'What went well', text: day.diary.goodNote },
        { label: 'What could be better', text: day.diary.regretNote },
        { label: 'To do tomorrow', text: day.diary.tomorrowNote },
      ].filter((note) => note.text)
    : [];

  return (
    <div
      className="flex flex-col gap-4"
      role="region"
      aria-label={`Records for ${formatDate(day.date)}`}
    >
      <div>
        <h2 className="text-body font-semibold">{dateHeading(day.date, day.today)}</h2>
        {day.progress.total > 0 && (
          <p className="text-body-sm text-muted-foreground">
            Daily routines {day.progress.checked}/{day.progress.total} done
          </p>
        )}
      </div>
      {groups.length === 0 && !day.diary ? (
        <EmptyState
          title="No records for this day"
          description="There are no routines or diary entries."
          headingLevel="h3"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {groups.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Daily routines</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {groups.map((group) => (
                  <div key={group.key} className="flex flex-col gap-1">
                    <h4 className="text-body-sm font-semibold">{group.label}</h4>
                    <ul className="flex flex-col gap-1">
                      {group.routines.map((routine) => (
                        <li
                          key={routine.id}
                          className="flex flex-wrap items-center gap-2 text-body-sm"
                        >
                          <span aria-hidden className="shrink-0">
                            {routine.checked ? '✓' : routine.skipped ? '–' : '·'}
                          </span>
                          <span className="min-w-0 flex-1 basis-40 wrap-anywhere">
                            {routine.name}
                          </span>
                          <span className="text-caption text-muted-foreground">
                            {routine.checked ? 'Done' : routine.skipped ? 'Skipped' : 'Not done'}
                          </span>
                          {routine.archived && <Badge variant="secondary">Archived</Badge>}
                          {routine.skipped && routine.skipReason && (
                            <span className="basis-full pl-5 text-caption wrap-anywhere text-muted-foreground">
                              Reason: {routine.skipReason}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader>
              <CardTitle>Diary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {day.diary ? (
                <>
                  <p className="text-body-sm wrap-anywhere whitespace-pre-wrap">{day.diary.body}</p>
                  {notes.map((note) => (
                    <div key={note.label} className="flex flex-col gap-1">
                      <h4 className="text-body-sm font-semibold">{note.label}</h4>
                      <p className="text-body-sm wrap-anywhere whitespace-pre-wrap">{note.text}</p>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-body-sm text-muted-foreground">No diary entry for this day</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// Read-only on purpose: checks and the diary change on their own pages, under their own rules.
export function Records() {
  // null follows the server's current month.
  const [month, setMonth] = useState<string | null>(null);
  // null follows the server's today, until a day is picked.
  const [chosen, setChosen] = useState<string | null>(null);

  // Each month and each day is its own query, so loading one never refetches the other.
  const monthQuery = useApiQuery<MonthData>(
    apiKey('/api/records', month),
    `/api/records${month ? `?month=${month}` : ''}`,
    { staleTime: 0 },
  );
  // The calendar stays on screen while the next month loads or fails to load.
  const lastMonth = useRef<MonthData | null>(null);
  if (monthQuery.data) lastMonth.current = monthQuery.data;
  const data = monthQuery.data ?? lastMonth.current;
  const monthFailed = monthQuery.isError;
  const monthNotice = monthQuery.error
    ? { kind: 'error' as const, text: errorText(monthQuery.error) }
    : undefined;

  // Today stands in only while its month is on screen; a day from another month is never shown.
  const shownMonth = month ?? data?.month;
  const selected =
    chosen ?? (data && shownMonth && data.today.startsWith(`${shownMonth}-`) ? data.today : null);

  const dayQuery = useApiQuery<DayData>(
    apiKey('/api/records', 'day', selected),
    `/api/records/${selected}`,
    { enabled: selected !== null, staleTime: 0 },
  );
  const day = dayQuery.data ?? null;
  const dayFailed = selected !== null && dayQuery.isError;
  const dayNotice = dayFailed
    ? { kind: 'error' as const, text: errorText(dayQuery.error) }
    : undefined;

  const { refetch: refetchMonth } = monthQuery;
  const { refetch: refetchDay } = dayQuery;
  const reloadMonth = useCallback(() => void refetchMonth(), [refetchMonth]);
  const reloadDay = useCallback(() => void refetchDay(), [refetchDay]);
  // The month and the chosen day both load again when the date changes or the page is shown again.
  const refetchBoth = useCallback(async () => {
    await Promise.all([refetchMonth(), selected === null ? null : refetchDay()]);
  }, [refetchMonth, refetchDay, selected]);
  useReloadWhenCurrent({ refetch: refetchBoth }, '/api/records');

  const selectDay = (date: string) => {
    setChosen(date);
    // The same day changes nothing the load depends on, so ask for it again.
    if (date === selected) reloadDay();
  };

  // No day is chosen in the new month yet; the month's own load follows from the change.
  const moveMonth = (target: string) => {
    setMonth(target);
    setChosen(null);
  };

  if (!data)
    return monthFailed ? (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={monthNotice} />
        <RetryButton onClick={reloadMonth}>Try again</RetryButton>
      </div>
    ) : (
      <LoadingRegion label="Loading records" shape="card" />
    );

  return (
    <div className="flex flex-col gap-6">
      <Card role="region" aria-label={`${monthLabel(data.month)} calendar`}>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle asHeading="h2">{monthLabel(data.month)}</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!data.previousMonth}
              onClick={() => data.previousMonth && moveMonth(data.previousMonth)}
            >
              Previous month
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!data.nextMonth}
              onClick={() => data.nextMonth && moveMonth(data.nextMonth)}
            >
              Next month
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Notice notice={monthNotice} />
          {monthFailed && (
            <RetryButton className="self-start" onClick={reloadMonth}>
              Try again
            </RetryButton>
          )}
          <Calendar data={data} selected={selected} onSelect={selectDay} />
        </CardContent>
      </Card>
      <Notice notice={dayNotice} />
      {dayFailed && (
        <RetryButton className="self-start" onClick={reloadDay}>
          Reload this day's records
        </RetryButton>
      )}
      {!selected ? (
        <p className="text-body-sm text-muted-foreground">Choose a day to see its records</p>
      ) : day?.date === selected ? (
        <DayDetail day={day} />
      ) : (
        !dayFailed && <LoadingRegion label="Loading this day's records" shape="cards" />
      )}
    </div>
  );
}
