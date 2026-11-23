import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { LoadingRegion } from './loading-region';
import { groupByCategory } from './routine-groups';
import { RoutineAddForm, RoutineItems, RoutineNotices } from './routine-list';
import { useRoutineList } from './use-routine-list';

export type Routine = {
  id: number;
  name: string;
  cadence: string;
  category: string | null;
  sortOrder: number;
  projectLinkId?: number | null;
  /** Daily routines on chosen days only (0 = Sunday ... 6 = Saturday). */
  weekdays?: number[] | null;
  /** Weekly routines done on this many days of the week. */
  timesPerWeek?: number | null;
  /** The unit of an amount recorded on its checks, and the target shown beside it. */
  unit?: string | null;
  targetAmount?: number | null;
};

export function DailyRoutines() {
  const list = useRoutineList('daily');

  if (list.routines === null) return <LoadingRegion label="Loading routines" shape="cards" />;

  return (
    <div className="flex flex-col gap-4">
      <RoutineNotices notice={list.notice} />
      <div className="grid gap-4 md:grid-cols-2">
        {groupByCategory(list.routines).map((group) => (
          <Card key={group.key} role="region" aria-label={`${group.label} routines`}>
            <CardHeader>
              <CardTitle asHeading="h2" className="flex items-center gap-2">
                {group.label}
                <Badge variant="secondary">{group.routines.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {group.routines.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">No routines yet</p>
              ) : (
                <RoutineItems list={list} routines={group.routines} draftKey={group.key} />
              )}
              {group.known && (
                <RoutineAddForm
                  list={list}
                  draftKey={group.key}
                  addLabel={group.addLabel}
                  addedTo={group.label}
                  category={group.key}
                />
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
