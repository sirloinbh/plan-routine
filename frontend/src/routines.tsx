import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { LoadingRegion } from './loading-region';
import { groupByCategory } from './routine-groups';
import { RoutineAddForm, RoutineItems, RoutineNotices } from './routine-list';
import { useRoutineList } from './use-routine-list';

export type Routine = {
  id: string;
  name: string;
  cadence: string;
  category: string | null;
  sortOrder: number;
  projectLinkId?: string | null;
};

export function DailyRoutines() {
  const list = useRoutineList('daily');

  if (list.routines === null) return <LoadingRegion label="루틴 불러오는 중" shape="cards" />;

  return (
    <div className="flex flex-col gap-4">
      <RoutineNotices notice={list.notice} />
      <div className="grid gap-4 md:grid-cols-2">
        {groupByCategory(list.routines).map((group) => (
          <Card key={group.key} role="region" aria-label={`${group.label} 루틴`}>
            <CardHeader>
              <CardTitle asHeading="h2" className="flex items-center gap-2">
                {group.label}
                <Badge variant="secondary">{group.routines.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {group.routines.length === 0 ? (
                <p className="text-body-sm text-muted-foreground">아직 루틴이 없습니다</p>
              ) : (
                <RoutineItems list={list} routines={group.routines} draftKey={group.key} />
              )}
              <RoutineAddForm
                list={list}
                draftKey={group.key}
                label={group.label}
                category={group.key}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
