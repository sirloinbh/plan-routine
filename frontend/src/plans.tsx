import { useState } from 'react';

import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { SegmentedControl } from './components/ui/segmented-control';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
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
import { RetryButton } from './retry-button';

function PlanRow({ plan }: { plan: Plan }) {
  return (
    <li className="flex flex-col gap-1 border-b py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-medium">{plan.title}</span>
        <Badge variant={statusVariants[plan.status]}>{statusLabels[plan.status]}</Badge>
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

function HorizonPlans({ horizon }: { horizon: (typeof horizons)[number] }) {
  const path = `${plansPath}?horizon=${horizon.value}`;
  // Asked for again when the tab opens: a new period starts with no plans.
  const query = useApiQuery<PlansData>(apiKey(plansPath, horizon.value), path, { staleTime: 0 });
  const data = query.data;
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
          <RetryButton className="self-start" onClick={() => void query.refetch()}>
            Reload plans
          </RetryButton>
        )}
        {!data && !query.isError && <LoadingRegion label="Loading plans" />}
        {data && data.plans.length === 0 && <EmptyState title={horizon.empty} headingLevel="h3" />}
        {data && data.plans.length > 0 && (
          <ul aria-label={`Plans: ${horizon.title}`}>
            {data.plans.map((plan) => (
              <PlanRow key={plan.id} plan={plan} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function Plans() {
  const [selected, setSelected] = useState<PlanHorizon>('week');
  const horizon = horizons.find((item) => item.value === selected) ?? horizons[0];
  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        label="Plan horizon"
        options={horizons.map(({ value, label }) => ({ value, label }))}
        value={selected}
        onValueChange={setSelected}
      />
      <HorizonPlans key={horizon.value} horizon={horizon} />
    </div>
  );
}
