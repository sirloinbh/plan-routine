import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { formatDate } from './format-date';
import { LabeledTextarea } from './labeled-textarea';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';
import { useReloadWhenCurrent } from './use-date-change';

// The server enforces the same limit (backend/src/weekly-review-routes.ts).
const noteLimit = 1000;
const path = '/api/weekly-review';

type Notes = { wentWell: string | null; toChange: string | null };
type ReviewData = {
  today: string;
  week: { start: string; end: string };
  previousWeek: string | null;
  nextWeek: string | null;
  rate: { checked: number; total: number };
  mostMissed: { id: number; name: string; cadence: string; missed: number; total: number }[];
  notes: Notes;
};

// Rounding must not claim all or nothing while neither is true (same rule as the stats page).
const percent = ({ checked, total }: { checked: number; total: number }) => {
  const value = Math.round((checked / total) * 100);
  if (checked > 0 && value === 0) return 1;
  if (checked < total && value === 100) return 99;
  return value;
};

function NotesForm({ data }: { data: ReviewData }) {
  const [wentWell, setWentWell] = useState(data.notes.wentWell ?? '');
  const [toChange, setToChange] = useState(data.notes.toChange ?? '');
  const { notice, status, error, clear } = useNotice();
  const save = useApiMutation<{ notes: Notes }, Notes>(
    (body) => ({ path: `${path}/${data.week.start}`, method: 'PUT', body }),
    { invalidate: [apiKey(path)] },
  );
  const tooLong = wentWell.trim().length > noteLimit || toChange.trim().length > noteLimit;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tooLong) return;
    clear();
    save.mutate(
      { wentWell, toChange },
      {
        onSuccess: () => status('Saved the notes'),
        onError: (cause) => error(cause),
      },
    );
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} aria-label="Weekly review notes">
      <LabeledTextarea
        id="review-went-well"
        label="What went well"
        value={wentWell}
        rows={4}
        limit={noteLimit}
        readOnly={save.isPending}
        invalid={wentWell.trim().length > noteLimit}
        onChange={setWentWell}
      />
      <LabeledTextarea
        id="review-to-change"
        label="What to change next week"
        value={toChange}
        rows={4}
        limit={noteLimit}
        readOnly={save.isPending}
        invalid={toChange.trim().length > noteLimit}
        onChange={setToChange}
      />
      <Notice notice={notice} className="wrap-anywhere" />
      <Button type="submit" className="self-start" disabled={save.isPending || tooLong}>
        {save.isPending ? 'Saving…' : 'Save notes'}
      </Button>
    </form>
  );
}

export function WeeklyReview() {
  // null is this week; moving back and forth asks the server for the neighbour it named.
  const [week, setWeek] = useState<string | null>(null);
  const query = useApiQuery<ReviewData>(
    apiKey(path, week ?? 'current'),
    week ? `${path}?week=${week}` : path,
    { staleTime: 0 },
  );
  useReloadWhenCurrent(query, path);
  const data = query.data ?? null;

  if (!data)
    return query.isError ? (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={{ kind: 'error', text: errorText(query.error) }} />
        <RetryButton className="self-start" onClick={() => void query.refetch()}>
          Try again
        </RetryButton>
      </div>
    ) : (
      <LoadingRegion label="Loading the weekly review" shape="cards" />
    );

  const range = `${formatDate(data.week.start)} – ${formatDate(data.week.end)}`;
  return (
    <div className="flex flex-col gap-6">
      {query.isError && <Notice notice={{ kind: 'error', text: errorText(query.error) }} />}
      <nav aria-label="Choose a week" className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!data.previousWeek}
          onClick={() => setWeek(data.previousWeek)}
        >
          <ChevronLeft aria-hidden /> Previous week
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!data.nextWeek}
          onClick={() => setWeek(data.nextWeek)}
        >
          Next week <ChevronRight aria-hidden />
        </Button>
        <h2 className="min-w-0 text-body font-semibold wrap-anywhere" aria-live="polite">
          {range}
        </h2>
      </nav>
      <div className="grid gap-4 md:grid-cols-2">
        <Card role="region" aria-label="Completion rate of the week">
          <CardHeader>
            <CardTitle>Completion rate</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {data.rate.total === 0 ? (
              <p className="text-body-sm text-muted-foreground">No records this week</p>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums">{percent(data.rate)}%</p>
                <p className="text-body-sm text-muted-foreground">
                  {data.rate.checked} of {data.rate.total} daily and weekly routine checks
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card role="region" aria-label="Most missed routines">
          <CardHeader>
            <CardTitle>Most missed</CardTitle>
          </CardHeader>
          <CardContent>
            {data.mostMissed.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">Nothing was missed</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {data.mostMissed.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2 text-body-sm">
                    <span className="min-w-0 wrap-anywhere">{item.name}</span>
                    <span className="whitespace-nowrap text-muted-foreground tabular-nums">
                      missed {item.missed} of {item.total}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Keyed by week, so a different week starts with its own notes rather than the old drafts. */}
      <NotesForm key={data.week.start} data={data} />
    </div>
  );
}
