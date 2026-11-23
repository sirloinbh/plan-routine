import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';

import { Button } from './components/ui/button';
import { Card, CardContent } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { NativeSelect } from './components/ui/native-select';
import { Notice } from './components/ui/notice';
import { formatDate } from './format-date';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';

// The server enforces the same limits (backend/src/search-routes.ts).
const maxQueryLength = 100;
const pageSize = 20;
const needInput = 'Enter a word to search for or choose a routine';

type Filters = {
  q: string;
  from: string;
  to: string;
  routineId: string;
  result: 'missed' | 'done';
};
type SearchData = {
  limit: number;
  offset: number;
  total: number;
  results: {
    kind: 'diary' | 'skip' | 'missed';
    date: string;
    field: string;
    snippet: string;
    routineId?: number;
    routineName?: string;
  }[];
};
type DayData = {
  diary: {
    body: string;
    goodNote: string | null;
    regretNote: string | null;
    tomorrowNote: string | null;
  } | null;
};

const empty: Filters = { q: '', from: '', to: '', routineId: '', result: 'missed' };
const fieldLabel: Record<string, string> = {
  body: 'Diary',
  goodNote: 'What went well',
  regretNote: 'What could be better',
  tomorrowNote: 'To do tomorrow',
};

function searchPath({ q, from, to, routineId, result }: Filters, offset: number) {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  if (routineId) {
    params.set('routineId', routineId);
    params.set('result', result);
  }
  params.set('limit', String(pageSize));
  params.set('offset', String(offset));
  return `/api/search?${params}`;
}

// The whole day, loaded when its details are opened (the read-only record of that day).
function WholeDay({ date }: { date: string }) {
  const [opened, setOpened] = useState(false);
  const day = useApiQuery<DayData>(apiKey('/api/records', date), `/api/records/${date}`, {
    enabled: opened,
  });
  const diary = day.data?.diary;
  const notes = diary
    ? [
        { label: 'What went well', text: diary.goodNote },
        { label: 'What could be better', text: diary.regretNote },
        { label: 'To do tomorrow', text: diary.tomorrowNote },
      ].filter((note) => note.text)
    : [];
  return (
    <details
      className="text-body-sm"
      onToggle={(event) => event.currentTarget.open && setOpened(true)}
    >
      <summary className="cursor-pointer text-muted-foreground pointer-coarse:py-3">
        Show the whole entry of {formatDate(date)}
      </summary>
      <div className="mt-2 flex flex-col gap-2">
        {day.isError && <Notice notice={{ kind: 'error', text: errorText(day.error) }} />}
        {opened && !day.data && !day.isError && <p className="text-muted-foreground">Loading…</p>}
        {diary && (
          <>
            <p className="wrap-anywhere whitespace-pre-wrap">{diary.body}</p>
            {notes.map((note) => (
              <p key={note.label} className="wrap-anywhere whitespace-pre-wrap">
                <span className="font-medium">{note.label}: </span>
                {note.text}
              </p>
            ))}
          </>
        )}
      </div>
    </details>
  );
}

export function Search() {
  const [draft, setDraft] = useState<Filters>(empty);
  const [submitted, setSubmitted] = useState<Filters | null>(null);
  const [offset, setOffset] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);
  const routines = useApiQuery<{ routines: { id: number; name: string }[] }>(
    apiKey('/api/routines', 'daily'),
    '/api/routines?cadence=daily',
  );
  const search = useApiQuery<SearchData>(
    apiKey('/api/search', JSON.stringify(submitted), offset),
    submitted ? searchPath(submitted, offset) : '',
    { enabled: submitted !== null, staleTime: 0 },
  );

  const change = (patch: Partial<Filters>) => setDraft((current) => ({ ...current, ...patch }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.q.trim() && !draft.routineId) return setFormError(needInput);
    if (draft.q.trim().length > maxQueryLength)
      return setFormError(`Search text must be ${maxQueryLength} characters or fewer`);
    if (draft.from && draft.to && draft.from > draft.to)
      return setFormError('The start date must not be after the end date');
    setFormError(null);
    // The same search again has the same key, so ask for fresh results instead of showing the cached ones.
    if (submitted && offset === 0 && JSON.stringify(submitted) === JSON.stringify(draft))
      void search.refetch();
    setOffset(0);
    setSubmitted(draft);
  };

  const data = search.data;
  const last = data ? Math.min(data.offset + data.results.length, data.total) : 0;
  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={submit}
        aria-label="Search the diary"
        noValidate
      >
        <div className="flex flex-col gap-2 md:col-span-2">
          <Label htmlFor="search-text">Search text</Label>
          <Input
            id="search-text"
            type="search"
            value={draft.q}
            onChange={(event) => change({ q: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-from">From</Label>
          <Input
            id="search-from"
            type="date"
            value={draft.from}
            onChange={(event) => change({ from: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-to">To</Label>
          <Input
            id="search-to"
            type="date"
            value={draft.to}
            onChange={(event) => change({ to: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-routine">Daily routine</Label>
          <NativeSelect
            id="search-routine"
            value={draft.routineId}
            onChange={(event) => change({ routineId: event.target.value })}
          >
            <option value="">Any routine</option>
            {routines.data?.routines.map((routine) => (
              <option key={routine.id} value={routine.id}>
                {routine.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="search-result">On days the routine was</Label>
          <NativeSelect
            id="search-result"
            value={draft.result}
            disabled={!draft.routineId}
            onChange={(event) => change({ result: event.target.value as Filters['result'] })}
          >
            <option value="missed">Not done</option>
            <option value="done">Done</option>
          </NativeSelect>
        </div>
        <Notice
          notice={formError ? { kind: 'error', text: formError } : undefined}
          className="md:col-span-2"
        />
        <Button type="submit" className="self-start">
          Search
        </Button>
      </form>

      {submitted && !data && search.isError && (
        <div className="flex flex-col items-start gap-3">
          <Notice notice={{ kind: 'error', text: errorText(search.error) }} />
          <RetryButton onClick={() => void search.refetch()}>Try again</RetryButton>
        </div>
      )}
      {submitted && !data && !search.isError && <LoadingRegion label="Searching" shape="cards" />}
      {data &&
        (data.total === 0 ? (
          <EmptyState
            title="No matching entries"
            description="Try another word or a wider date range."
            headingLevel="h2"
          />
        ) : (
          <section className="flex flex-col gap-4" aria-labelledby="search-results">
            <h2 id="search-results" className="text-body font-semibold">
              {data.total} {data.total === 1 ? 'result' : 'results'}, newest first
            </h2>
            <ul className="flex flex-col gap-3">
              {data.results.map((result) => (
                <li key={`${result.kind}/${result.date}/${result.routineId ?? ''}`}>
                  <Card>
                    <CardContent className="flex flex-col gap-2">
                      <h3 className="text-body-sm font-semibold">
                        <Link
                          to={`/records?date=${result.date}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {formatDate(result.date)}
                        </Link>
                      </h3>
                      {result.kind === 'missed' ? (
                        <p className="text-body-sm wrap-anywhere text-muted-foreground">
                          Missed {result.routineName ?? 'a routine'}
                        </p>
                      ) : (
                        <p className="text-body-sm wrap-anywhere">
                          <span className="text-muted-foreground">
                            {result.kind === 'skip'
                              ? `Skipped ${result.routineName ?? 'a routine'}`
                              : (fieldLabel[result.field] ?? result.field)}
                            :{' '}
                          </span>
                          {result.snippet}
                        </p>
                      )}
                      {result.kind === 'diary' && <WholeDay date={result.date} />}
                    </CardContent>
                  </Card>
                </li>
              ))}
            </ul>
            <nav aria-label="Result pages" className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.offset === 0}
                onClick={() => setOffset(Math.max(0, data.offset - data.limit))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={last >= data.total}
                onClick={() => setOffset(data.offset + data.limit)}
              >
                Next
              </Button>
              <span className="text-caption text-muted-foreground">
                Showing {data.offset + 1}–{last} of {data.total}
              </span>
            </nav>
          </section>
        ))}
    </div>
  );
}
