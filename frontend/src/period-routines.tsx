import { Checklist, type ChecklistItem, ChecklistPending } from './checklist';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { formatDate } from './format-date';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';
import { RoutineAddForm, RoutineItems, RoutineNotices } from './routine-list';
import { useChecklist } from './use-checklist';
import { useRoutineList } from './use-routine-list';

type PeriodPage = {
  cadence: string;
  /** Names the routines: "Manage weekly routines". */
  name: string;
  /** Names the current period: "This week". */
  periodName: string;
  examples: string;
  emptyHint: string;
  showRemaining?: boolean;
};

export function PeriodRoutines({
  cadence,
  name,
  periodName,
  examples,
  emptyHint,
  showRemaining = false,
}: PeriodPage) {
  const list = useRoutineList(cadence);
  // Changing the routines below changes this period's checklist too.
  // A failed save usually means a routine changed elsewhere, so the list below reloads too.
  const checklist = useChecklist<ChecklistItem>(cadence, list.version, list.refresh);
  const { data } = checklist;

  return (
    <div className="flex flex-col gap-6">
      {data ? (
        <div className="flex flex-col gap-4">
          <h2 className="text-body font-semibold">
            {periodName} ({formatDate(data.period.start)} – {formatDate(data.period.end)})
          </h2>
          {showRemaining && (
            <p className="text-body-sm text-muted-foreground">
              {data.remainingDays === 0
                ? 'Today is the last day'
                : `${data.remainingDays} ${data.remainingDays === 1 ? 'day' : 'days'} left`}
            </p>
          )}
          <Notice notice={checklist.notice} />
          {checklist.loadFailed && (
            <RetryButton className="self-start" onClick={checklist.retry}>
              Try again
            </RetryButton>
          )}
          {data.items.length === 0 ? (
            <EmptyState
              title={`No routines to check for ${periodName.toLowerCase()}`}
              description={emptyHint}
            />
          ) : (
            <Checklist
              title={periodName}
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
      <Card role="region" aria-label={`Manage ${name} routines`}>
        <CardHeader>
          <CardTitle asHeading="h2">Manage {name} routines</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <RoutineNotices notice={list.notice} />
          {list.loadFailed && (
            <RetryButton className="self-start" onClick={list.refresh}>
              Reload the list
            </RetryButton>
          )}
          {list.routines === null ? (
            <LoadingRegion label="Loading routines" />
          ) : list.routines.length > 0 ? (
            <RoutineItems list={list} routines={list.routines} draftKey={cadence} />
          ) : (
            !list.loadFailed && (
              <p className="text-body-sm text-muted-foreground">No routines yet</p>
            )
          )}
          <RoutineAddForm list={list} draftKey={cadence} label={name} placeholder={examples} />
        </CardContent>
      </Card>
    </div>
  );
}

export function WeeklyRoutines() {
  return (
    <PeriodRoutines
      cadence="weekly"
      name="weekly"
      periodName="This week"
      examples="e.g. Write a book report, Clean, Update the budget"
      emptyHint="Add something to do once a week below."
    />
  );
}

export function FourWeekRoutines() {
  return (
    <PeriodRoutines
      cadence="four_week"
      name="4-week"
      periodName="These 4 weeks"
      examples="e.g. Wash bedding, Replace supplies, Deep clean"
      emptyHint="Add something to do once every 4 weeks below."
      showRemaining
    />
  );
}
