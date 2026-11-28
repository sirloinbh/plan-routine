import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { formatDate } from './lib/format';

export type TrendPoint = { start: string; end: string; checked: number; total: number };
export type Streak = { current: number; best: number };

const width = 300;
const height = 120;
const pad = { left: 40, right: 8, top: 8, bottom: 8 };
const rate = ({ checked, total }: TrendPoint) =>
  total === 0 ? null : Math.round((checked / total) * 100);

// What a screen reader (and anyone who prefers numbers) gets instead of the picture.
function summary(title: string, points: TrendPoint[]) {
  const known = points.filter((point) => point.total > 0);
  if (known.length === 0) return `${title}: no records yet`;
  const first = known[0];
  const last = known[known.length - 1];
  return `${title}: from ${rate(first)}% (${formatDate(first.start, 'short')}) to ${rate(last)}% (${formatDate(last.start, 'short')})`;
}

function TrendChart({ title, points }: { title: string; points: TrendPoint[] }) {
  // Oldest on the left, so the line reads forward in time.
  const ordered = [...points].reverse();
  const x = (index: number) =>
    pad.left +
    (ordered.length < 2 ? 0 : (index / (ordered.length - 1)) * (width - pad.left - pad.right));
  const y = (value: number) => pad.top + (1 - value / 100) * (height - pad.top - pad.bottom);
  // A period with no records breaks the line instead of drawing a false 0%.
  const segments: string[][] = [[]];
  ordered.forEach((point, index) => {
    const value = rate(point);
    if (value === null) {
      if (segments[segments.length - 1].length > 0) segments.push([]);
    } else segments[segments.length - 1].push(`${x(index)},${y(value)}`);
  });
  return (
    <Card role="region" aria-label={`${title} trend`}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-auto w-full max-w-xl text-primary"
          role="img"
          aria-label={summary(title, ordered)}
        >
          {[0, 50, 100].map((value) => (
            <g key={value}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={y(value)}
                y2={y(value)}
                className="stroke-border"
                strokeWidth={1}
              />
              <text
                x={pad.left - 4}
                y={y(value)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-muted-foreground text-xs"
              >
                {value}%
              </text>
            </g>
          ))}
          {segments
            .filter((segment) => segment.length > 1)
            .map((segment) => (
              <polyline
                key={segment[0]}
                points={segment.join(' ')}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              />
            ))}
          {ordered.map((point, index) => {
            const value = rate(point);
            return value === null ? null : (
              <circle key={point.start} cx={x(index)} cy={y(value)} r={3} fill="currentColor" />
            );
          })}
        </svg>
        <details className="text-caption text-muted-foreground">
          <summary className="cursor-pointer pointer-coarse:py-3">{title} values</summary>
          <ul className="mt-1 flex flex-col gap-0.5" aria-label={`${title} values`}>
            {points.map((point) => (
              <li key={point.start} className="flex justify-between gap-2">
                <span>
                  {formatDate(point.start, 'short')} – {formatDate(point.end, 'short')}
                </span>
                <span className="tabular-nums">
                  {rate(point) === null
                    ? 'No records'
                    : `${rate(point)}% (${point.checked}/${point.total})`}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}

export function TrendCards({ weeks, fourWeeks }: { weeks: TrendPoint[]; fourWeeks: TrendPoint[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TrendChart title="Weekly trend (12 weeks)" points={weeks} />
      <TrendChart title="4-week trend (6 periods)" points={fourWeeks} />
    </div>
  );
}

// Streaks count periods of the routine's own cadence; the unit makes that plain.
export function StreakText({ streak, cadence }: { streak: Streak; cadence: string }) {
  const unit =
    { daily: 'day', weekly: 'week', four_week: '4-week period', twelve_week: '12-week period' }[
      cadence
    ] ?? 'period';
  const plural = (count: number) => `${count} ${unit}${count === 1 ? '' : 's'}`;
  return (
    <span className="text-caption text-muted-foreground">
      Streak {plural(streak.current)} · best {plural(streak.best)}
    </span>
  );
}
