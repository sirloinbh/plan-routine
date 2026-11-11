import { useCallback, useEffect, useRef, useState } from 'react';

import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { formatDate } from './format-date';
import { requestJson } from './lib/api';
import { useNotice } from './lib/use-notice';
import { cn } from './lib/utils';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';
import { groupByCategory } from './routine-groups';
import { serviceDate } from './service-date';
import { isPassingFailure, useReloadOnDateChange } from './use-date-change';

type Tally = { checked: number; total: number };
type PeriodTally = Tally & { start: string; end: string };
type Status = 'done' | 'missed' | 'open' | 'none';
type Item = Tally & {
  id: string;
  name: string;
  cadence: string;
  category: string | null;
  sortOrder: number;
  archived: boolean;
  periods: { start: string; end: string; status: Status }[];
};
type StatsData = {
  today: string;
  daily: { weeks: PeriodTally[]; months: (PeriodTally & { month: string })[] };
  weekly: PeriodTally[];
  fourWeek: PeriodTally[];
  twelveWeek: PeriodTally[];
  items: Item[];
};

// Identity is never color alone: every state also has a mark and a word.
const statusLook: Record<Status, { mark: string; word: string; className: string }> = {
  done: { mark: '✓', word: 'Done', className: 'bg-primary text-primary-foreground' },
  missed: { mark: '✕', word: 'Not done', className: 'bg-muted text-foreground' },
  open: { mark: '…', word: 'In progress', className: 'border border-input text-muted-foreground' },
  none: { mark: '', word: 'Not applicable', className: 'border border-dashed border-input' },
};

// Rounding must not claim all or nothing while neither is true: 216/217 is not 100%.
const percent = ({ checked, total }: Tally) => {
  const value = Math.round((checked / total) * 100);
  if (checked > 0 && value === 0) return 1;
  if (checked < total && value === 100) return 99;
  return value;
};
const short = (date: string) => formatDate(date, 'short');
const periodName = ({ start, end }: { start: string; end: string }) =>
  start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;

function RateRow({ label, tally }: { label: string; tally: Tally }) {
  return (
    <li className="grid grid-cols-[6.5rem_minmax(0,1fr)_7rem] items-center gap-2 text-body-sm">
      <span className="text-muted-foreground">{label}</span>
      {tally.total === 0 ? (
        <>
          <span aria-hidden className="h-2 rounded-sm bg-muted/50" />
          <span className="text-right text-muted-foreground">No records</span>
        </>
      ) : (
        <>
          <span aria-hidden className="h-2 overflow-hidden rounded-sm bg-muted">
            <span
              className="block h-full rounded-sm bg-primary"
              style={{ width: `${percent(tally)}%` }}
            />
          </span>
          <span className="text-right whitespace-nowrap tabular-nums">
            {percent(tally)}%{' '}
            <span className="text-caption text-muted-foreground">
              {tally.checked}/{tally.total}
            </span>
          </span>
        </>
      )}
    </li>
  );
}

function RateCard({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; tally: Tally }[];
}) {
  return (
    <Card role="region" aria-label={`${title} completion rates`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <RateRow key={row.key} label={row.label} tally={row.tally} />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const periodRows = (periods: PeriodTally[]) =>
  periods.map((period) => ({
    key: period.start,
    label: `${short(period.start)} – ${short(period.end)}`,
    tally: period,
  }));

function ItemRow({ item }: { item: Item }) {
  const oldestFirst = [...item.periods].reverse();
  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-40 text-body-sm font-medium wrap-anywhere">
          {item.name}
        </span>
        {item.archived && <Badge variant="secondary">Archived</Badge>}
        <span className="text-body-sm tabular-nums">
          {item.total === 0 ? (
            <span className="text-muted-foreground">No records</span>
          ) : (
            <>
              {percent(item)}%{' '}
              <span className="text-caption text-muted-foreground">
                {item.checked}/{item.total}
              </span>
            </>
          )}
        </span>
      </div>
      {/* Oldest on the left, so the row reads forward in time. A quick look for the eye; the
          list below says the same in words for touch screens, keyboards and screen readers. */}
      <ol className="flex flex-wrap gap-1" aria-hidden>
        {oldestFirst.map((period) => {
          const look = statusLook[period.status];
          return (
            <li
              key={period.start}
              title={`${periodName(period)} ${look.word}`}
              className={cn(
                'flex size-5 items-center justify-center rounded-sm text-caption',
                look.className,
              )}
            >
              {look.mark}
            </li>
          );
        })}
      </ol>
      <details className="text-caption text-muted-foreground">
        <summary className="cursor-pointer wrap-anywhere pointer-coarse:py-3">
          {item.name} by period
        </summary>
        <ul className="mt-1 flex flex-col gap-0.5" aria-label={`${item.name} recent history`}>
          {oldestFirst.map((period) => (
            <li key={period.start} className="flex justify-between gap-2">
              <span>{periodName(period)}</span>
              <span>{statusLook[period.status].word}</span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

export function Stats() {
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<StatsData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const { notice, error, clear } = useNotice();
  const requestedOn = useRef('');

  useEffect(() => {
    // A newer load supersedes this one, so a slow older response cannot overwrite it.
    let ignore = false;
    const startedOn = serviceDate();
    requestedOn.current = startedOn;
    requestJson<StatsData>('/api/stats')
      .then((loaded) => {
        if (ignore) return;
        setData(loaded);
        setLoadFailed(false);
        clear();
        // The server is not on this device's date yet (a fast clock), so ask again at the next check.
        if (loaded.today !== startedOn) requestedOn.current = '';
      })
      .catch((cause: unknown) => {
        if (ignore) return;
        setLoadFailed(true);
        error(cause);
        if (isPassingFailure(cause)) requestedOn.current = '';
      });
    return () => {
      ignore = true;
    };
  }, [version, error, clear]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  useReloadOnDateChange(requestedOn, reload);

  // Checks made on other pages or devices show up when the page is shown again.
  useEffect(() => {
    const reloadWhenShown = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', reloadWhenShown);
    return () => document.removeEventListener('visibilitychange', reloadWhenShown);
  }, [reload]);

  const failure = (
    <>
      <Notice notice={notice} />
      {loadFailed && (
        <RetryButton className="self-start" onClick={reload}>
          Try again
        </RetryButton>
      )}
    </>
  );

  if (!data)
    return loadFailed ? (
      <div className="flex flex-col items-start gap-3">{failure}</div>
    ) : (
      <LoadingRegion label="Loading completion rates" shape="cards" />
    );

  const itemsOf = (cadence: string) => data.items.filter((item) => item.cadence === cadence);
  const dailyGroups = groupByCategory(itemsOf('daily')).filter(
    (group) => group.routines.length > 0,
  );
  const itemCards = [
    { key: 'weekly', title: 'Weekly routines', items: itemsOf('weekly') },
    { key: 'four_week', title: '4-week routines', items: itemsOf('four_week') },
    { key: 'twelve_week', title: '12-week routines', items: itemsOf('twelve_week') },
  ].filter((card) => card.items.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {failure}
      <section className="flex flex-col gap-4" aria-labelledby="stats-rates">
        <h2 id="stats-rates" className="text-body font-semibold">
          Completion rates by cycle
        </h2>
        <p className="text-body-sm text-muted-foreground">
          Only items that were active are counted. For periods that have not ended, only completed
          items are counted.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <RateCard title="Daily routines by week" rows={periodRows(data.daily.weeks)} />
          <RateCard
            title="Daily routines by month"
            rows={data.daily.months.map((month) => ({
              key: month.month,
              label: month.month,
              tally: month,
            }))}
          />
          <RateCard title="Weekly routines" rows={periodRows(data.weekly)} />
          <RateCard title="4-week routines" rows={periodRows(data.fourWeek)} />
          <RateCard title="12-week routines" rows={periodRows(data.twelveWeek)} />
        </div>
      </section>
      <section className="flex flex-col gap-4" aria-labelledby="stats-items">
        <h2 id="stats-items" className="text-body font-semibold">
          History by item
        </h2>
        <ul className="flex flex-wrap gap-3 text-caption text-muted-foreground" aria-hidden>
          {(['done', 'missed', 'open', 'none'] as const).map((status) => (
            <li key={status} className="flex items-center gap-1">
              <span
                className={cn(
                  'flex size-4 items-center justify-center rounded-sm',
                  statusLook[status].className,
                )}
              >
                {statusLook[status].mark}
              </span>
              {statusLook[status].word}
            </li>
          ))}
        </ul>
        {data.items.length === 0 ? (
          <EmptyState
            title="No history yet"
            description="Add and check routines, and the history builds up here."
            headingLevel="h3"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {dailyGroups.map((group) => (
              <Card key={group.key} role="region" aria-label={`${group.label} history`}>
                <CardHeader>
                  <CardTitle>{group.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y">
                    {group.routines.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
            {itemCards.map((card) => (
              <Card key={card.key} role="region" aria-label={`${card.title} history`}>
                <CardHeader>
                  <CardTitle>{card.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="flex flex-col divide-y">
                    {card.items.map((item) => (
                      <ItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
