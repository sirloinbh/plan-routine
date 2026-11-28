import { LoadingRegion, RetryButton } from './components/load-state/load-state';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Notice } from './components/ui/notice';
import { formatDate } from './lib/format';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { useReloadWhenCurrent } from './use-date-change';

type MoodWeek = {
  start: string;
  end: string;
  checked: number;
  total: number;
  mood: number | null;
  energy: number | null;
  moodDays: number;
  energyDays: number;
};

// Same rounding rule as the stats page: never claim all or nothing while neither is true.
const percent = (checked: number, total: number) => {
  const value = Math.round((checked / total) * 100);
  if (checked > 0 && value === 0) return 1;
  if (checked < total && value === 100) return 99;
  return value;
};

const score = (value: number | null) => (value === null ? '–' : value.toFixed(1));

// Weekly averages of the diary scores beside the weeks' completion rates, so mood can be compared
// with practice by eye. No correlation number (decided on issue #247).
export function MoodStats() {
  const query = useApiQuery<{ weeks: MoodWeek[] }>(apiKey('/api/mood-stats'), '/api/mood-stats', {
    staleTime: 0,
  });
  // Like the rates above it: a page left open loads again after midnight or when it is shown again.
  useReloadWhenCurrent(query, '/api/mood-stats');
  const weeks = query.data?.weeks;

  if (!weeks)
    return query.isError ? (
      <div className="flex flex-col items-start gap-3">
        <Notice notice={{ kind: 'error', text: errorText(query.error) }} />
        <RetryButton onRetry={() => void query.refetch()}>Try again</RetryButton>
      </div>
    ) : (
      <LoadingRegion label="Loading mood and energy" shape="card" />
    );

  const scored = weeks.some((week) => week.mood !== null || week.energy !== null);
  // Newest first, like the other lists of this page.
  const rows = [...weeks].reverse();

  return (
    <section className="flex flex-col gap-4" aria-labelledby="mood-stats">
      <h2 id="mood-stats" className="text-body font-semibold">
        Mood and energy by week
      </h2>
      <p className="text-body-sm text-muted-foreground">
        Average of the 1 to 5 scores written in the diary, next to the daily routines done in the
        same week.
      </p>
      {!scored ? (
        <p className="text-body-sm text-muted-foreground">
          No scores yet. Add a mood or energy score on the diary page and the weeks appear here.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Last {weeks.length} weeks</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="text-left text-caption text-muted-foreground">
                    <th scope="col" className="py-1 pr-3 font-normal">
                      Week
                    </th>
                    <th scope="col" className="px-3 py-1 text-right font-normal">
                      Daily routines done
                    </th>
                    <th scope="col" className="px-3 py-1 text-right font-normal">
                      Mood
                    </th>
                    <th scope="col" className="py-1 pl-3 text-right font-normal">
                      Energy
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((week) => (
                    <tr key={week.start}>
                      <th scope="row" className="py-2 pr-3 text-left font-normal">
                        {formatDate(week.start, 'short')} – {formatDate(week.end, 'short')}
                      </th>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {week.total === 0 ? '–' : `${percent(week.checked, week.total)}%`}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{score(week.mood)}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{score(week.energy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
