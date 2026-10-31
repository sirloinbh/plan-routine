import { Checklist, type ChecklistItem, ChecklistPending } from './checklist';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { RoutineAddForm, RoutineItems, RoutineNotices } from './routine-list';
import { useChecklist } from './use-checklist';
import { useRoutineList } from './use-routine-list';

export function WeeklyRoutines() {
  const list = useRoutineList('weekly');
  // Changing the routines below changes this week's checklist too.
  // A failed save usually means a routine changed elsewhere, so the list below reloads too.
  const checklist = useChecklist<ChecklistItem>('weekly', list.version, list.refresh);
  const { data } = checklist;

  return (
    <div className="flex flex-col gap-6">
      {data ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-body font-semibold">
            이번 주 ({data.period.start} ~ {data.period.end})
          </h2>
          <Notice notice={checklist.notice} />
          {checklist.loadFailed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={checklist.retry}
            >
              다시 시도
            </Button>
          )}
          {data.items.length === 0 ? (
            <EmptyState
              title="이번 주에 체크할 루틴이 없습니다"
              description="아래에서 매주 한 번 할 일을 추가해 주세요."
            />
          ) : (
            <Checklist
              title="이번 주"
              items={data.items}
              onToggle={(item) => void checklist.toggle(data.date, item)}
            />
          )}
        </div>
      ) : (
        <ChecklistPending
          failed={checklist.loadFailed}
          notice={checklist.notice}
          onRetry={checklist.retry}
        />
      )}
      <Card role="region" aria-label="주간 루틴 관리">
        <CardHeader>
          <CardTitle asHeading="h2">주간 루틴 관리</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <RoutineNotices notice={list.notice} />
          {list.loadFailed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={list.refresh}
            >
              목록 다시 불러오기
            </Button>
          )}
          {list.routines === null ? (
            <p className="text-body-sm text-muted-foreground">루틴을 불러오는 중…</p>
          ) : list.routines.length > 0 ? (
            <RoutineItems list={list} routines={list.routines} />
          ) : (
            !list.loadFailed && (
              <p className="text-body-sm text-muted-foreground">아직 루틴이 없습니다</p>
            )
          )}
          <RoutineAddForm
            list={list}
            draftKey="weekly"
            label="주간"
            placeholder="예: 독후감 쓰기, 청소, 가계부 쓰기"
          />
        </CardContent>
      </Card>
    </div>
  );
}
