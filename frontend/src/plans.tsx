import { useCallback, useEffect, useState } from 'react';

import { LoadingRegion, RetryButton } from './components/load-state/load-state';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { ConfirmDialog } from './components/ui/confirm-dialog';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { SegmentedControl } from './components/ui/segmented-control';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { PlanForm, type PlanFormTarget } from './plan-form';
import {
  formatRange,
  horizons,
  type Plan,
  type PlanHorizon,
  type PlansData,
  plansPath,
  statusLabels,
  statusVariants,
} from './plans-data';

function PlanRow({
  plan,
  onEdit,
  onDelete,
}: {
  plan: Plan;
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => Promise<unknown>;
}) {
  // The failure shows inside the confirm dialog, which hides the rest of the page from screen readers while open.
  const deleteNotice = useNotice();
  const confirmDelete = async () => {
    deleteNotice.clear();
    try {
      await onDelete(plan);
    } catch (cause) {
      deleteNotice.error(cause, 'Could not delete the plan');
      throw cause;
    }
  };
  return (
    <li className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium">{plan.title}</span>
        <Badge variant={statusVariants[plan.status]}>{statusLabels[plan.status]}</Badge>
        <span className="ml-auto flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${plan.title}`}
            onClick={() => onEdit(plan)}
          >
            Edit
          </Button>
          <ConfirmDialog
            title="Delete this plan?"
            description={
              <>
                {`"${plan.title}" will be removed. This cannot be undone.`}
                <Notice notice={deleteNotice.notice} />
              </>
            }
            onConfirm={confirmDelete}
            trigger={
              <Button type="button" variant="outline" size="sm" aria-label={`Delete ${plan.title}`}>
                Delete
              </Button>
            }
          />
        </span>
      </div>
      {plan.description && (
        <p className="text-body-sm whitespace-pre-line text-muted-foreground">{plan.description}</p>
      )}
      <p className="text-caption text-muted-foreground">
        {formatRange(plan.periodStart, plan.periodEnd)}
      </p>
    </li>
  );
}

function HorizonPlans({
  horizon,
  onEdit,
  onDelete,
  onLoaded,
}: {
  horizon: (typeof horizons)[number];
  onEdit: (plan: Plan) => void;
  onDelete: (plan: Plan) => Promise<unknown>;
  onLoaded: (periodStart: string | undefined) => void;
}) {
  const path = `${plansPath}?horizon=${horizon.value}`;
  // Asked for again when the tab opens: a new period starts with no plans.
  const query = useApiQuery<PlansData>(apiKey(plansPath, horizon.value), path, { staleTime: 0 });
  const data = query.data;
  const periodStart = data?.period.start;
  useEffect(() => onLoaded(periodStart), [onLoaded, periodStart]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{horizon.title}</h2>
        </CardTitle>
        {data && (
          <p className="text-body-sm text-muted-foreground">
            {formatRange(data.period.start, data.period.end)}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Notice
          notice={query.error ? { kind: 'error', text: errorText(query.error) } : undefined}
        />
        {query.isError && (
          <RetryButton className="self-start" onRetry={() => void query.refetch()}>
            Reload plans
          </RetryButton>
        )}
        {!data && !query.isError && <LoadingRegion label="Loading plans" />}
        {data && data.plans.length === 0 && <EmptyState title={horizon.empty} headingLevel="h3" />}
        {data && data.plans.length > 0 && (
          <ul aria-label={`Plans: ${horizon.title}`}>
            {data.plans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} onEdit={onEdit} onDelete={onDelete} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function Plans() {
  const [selected, setSelected] = useState<PlanHorizon>('week');
  const [form, setForm] = useState<PlanFormTarget | null>(null);
  // The start of the period the open tab shows, so a new plan lands in what the owner is looking at.
  const [periodStart, setPeriodStart] = useState<string | undefined>(undefined);
  const { notice, status, clear } = useNotice();
  const remove = useApiMutation<{ id: number }, Plan>(
    (plan) => ({ path: `${plansPath}/${plan.id}`, method: 'DELETE' }),
    { invalidate: [apiKey(plansPath)] },
  );
  const horizon = horizons.find((item) => item.value === selected) ?? horizons[0];
  const onLoaded = useCallback((start: string | undefined) => setPeriodStart(start), []);

  const deletePlan = async (plan: Plan) => {
    clear();
    // A rejection keeps the confirm dialog open, and the row shows the error there.
    await remove.mutateAsync(plan);
    status(`Deleted "${plan.title}"`);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Plan horizon"
          options={horizons.map(({ value, label }) => ({ value, label }))}
          value={selected}
          onValueChange={(value) => {
            clear();
            setPeriodStart(undefined);
            setSelected(value);
          }}
        />
        <Button
          type="button"
          onClick={() => {
            clear();
            setForm({ horizon: selected, periodStart: periodStart ?? '' });
          }}
        >
          Add plan
        </Button>
      </div>
      <Notice notice={notice} />
      <HorizonPlans
        key={horizon.value}
        horizon={horizon}
        onEdit={(plan) => {
          clear();
          setForm({ plan });
        }}
        onDelete={deletePlan}
        onLoaded={onLoaded}
      />
      {form && (
        <PlanForm
          // A new form for each plan or period, so its fields start from that plan.
          key={'plan' in form ? form.plan.id : 'new'}
          target={form}
          onClose={() => setForm(null)}
          onSaved={(plan, added) => {
            setForm(null);
            // The plan shows on its own tab; the lists reload through the invalidation.
            setSelected(plan.horizon);
            status(added ? `Added "${plan.title}"` : `Saved "${plan.title}"`);
          }}
        />
      )}
    </div>
  );
}
