import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';

export type DiaryRoutine = { id: number; name: string; category: string | null; checked: boolean };

// The day's daily routines, read-only: checking happens on the checklist page. A mark and a word,
// never color alone.
export function DiaryChecks({ routines }: { routines: DiaryRoutine[] }) {
  if (routines.length === 0) return null;
  return (
    <Card role="region" aria-label="Checks for this day">
      <CardHeader>
        <CardTitle>Checks for this day</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1 text-body-sm">
          {routines.map((routine) => (
            <li key={routine.id} className="flex items-baseline gap-2">
              <span aria-hidden className="w-4 shrink-0 text-center">
                {routine.checked ? '✓' : '✕'}
              </span>
              <span className="min-w-0 wrap-anywhere">{routine.name}</span>
              <span className="ml-auto shrink-0 text-caption text-muted-foreground">
                {routine.checked ? 'Done' : 'Not done'}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
