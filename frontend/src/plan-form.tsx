import { type FormEvent, useState } from 'react';

import { Button } from './components/ui/button';
import { DateField } from './components/ui/date-field';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { FieldError } from './components/ui/field';
import { invalidProps } from './components/ui/field-props';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { NativeSelect } from './components/ui/native-select';
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { LabeledTextarea } from './labeled-textarea';
import { RequestError } from './lib/api';
import { apiKey, useApiMutation } from './lib/query';
import { errorText } from './lib/use-notice';
import {
  horizons,
  type Plan,
  type PlanHorizon,
  plansPath,
  type PlanStatus,
  statusLabels,
} from './plans-data';

type Fields = {
  title: string;
  description: string;
  horizon: PlanHorizon;
  periodStart: string;
  status: PlanStatus;
};
type FieldName = keyof Fields;
const fieldNames: readonly string[] = [
  'title',
  'description',
  'horizon',
  'periodStart',
  'status',
] satisfies FieldName[];

const periodHelp: Record<PlanHorizon, string> = {
  week: 'Any day of the week; the plan goes to that week (Sunday to Saturday)',
  twelve_week: 'Any day of the 12 weeks; the plan goes to that 12-week period',
  year: 'Any day of the year; the plan goes to that 52-week period',
  decade: 'Any day of the first year; the 10 years start on January 1 of that year',
};

export type PlanFormTarget = { plan: Plan } | { horizon: PlanHorizon; periodStart: string };

// The form for adding a plan or changing one. A rejected save keeps what was typed and shows the server's
// message next to the field it names. The horizon of a saved plan cannot change.
export function PlanForm({
  target,
  onClose,
  onSaved,
}: {
  target: PlanFormTarget;
  onClose: () => void;
  onSaved: (plan: Plan, added: boolean) => void;
}) {
  const editing = 'plan' in target ? target.plan : undefined;
  const [fields, setFields] = useState<Fields>(() =>
    editing
      ? {
          title: editing.title,
          description: editing.description ?? '',
          horizon: editing.horizon,
          periodStart: editing.periodStart,
          status: editing.status,
        }
      : {
          title: '',
          description: '',
          horizon: (target as { horizon: PlanHorizon }).horizon,
          periodStart: (target as { periodStart: string }).periodStart,
          status: 'planned',
        },
  );
  const [messages, setMessages] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const save = useApiMutation<{ plan: Plan }, Fields>(
    (values) => {
      // An empty period start means the current period, which the server chooses.
      const periodStart = values.periodStart.trim() || undefined;
      return editing
        ? {
            path: `${plansPath}/${editing.id}`,
            method: 'PATCH',
            body: {
              title: values.title,
              description: values.description,
              status: values.status,
              periodStart,
            },
          }
        : { path: plansPath, method: 'POST', body: { ...values, periodStart } };
    },
    { invalidate: [apiKey(plansPath)] },
  );

  const change = <K extends FieldName>(name: K, value: Fields[K]) => {
    setFields((current) => ({ ...current, [name]: value }));
    setMessages((current) => ({ ...current, [name]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    setMessages({});
    setFormError(undefined);
    try {
      const { plan } = await save.mutateAsync(fields);
      onSaved(plan, !editing);
    } catch (cause) {
      const placed: Partial<Record<FieldName, string>> = {};
      if (cause instanceof RequestError)
        for (const { path, message } of cause.fields)
          if (fieldNames.includes(path)) placed[path as FieldName] ??= message;
      setMessages(placed);
      // Without a field to put it next to, the message goes at the top of the form.
      if (Object.keys(placed).length === 0) setFormError(errorText(cause));
    }
  };

  const error = (name: FieldName) => messages[name];
  return (
    <Dialog open onOpenChange={(open) => !open && !save.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit plan' : 'Add plan'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Change the title, description, status or period of this plan.'
              : 'Choose a horizon and describe the plan.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <Notice notice={formError ? { kind: 'error', text: formError } : undefined} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-title">Title</Label>
            <Input
              id="plan-title"
              value={fields.title}
              onChange={(event) => change('title', event.target.value)}
              {...invalidProps('title', error('title'))}
            />
            <FieldError name="title">{error('title')}</FieldError>
          </div>
          <div className="flex flex-col gap-2">
            <LabeledTextarea
              id="plan-description"
              label="Description (optional)"
              value={fields.description}
              rows={3}
              limit={2000}
              readOnly={false}
              invalid={Boolean(error('description'))}
              onChange={(value) => change('description', value)}
            />
            <FieldError name="description">{error('description')}</FieldError>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-horizon">Horizon</Label>
            <NativeSelect
              id="plan-horizon"
              value={fields.horizon}
              disabled={Boolean(editing)}
              onChange={(event) => {
                // The tab's period start belongs to the tab's horizon; blank means the current period.
                change('horizon', event.target.value as PlanHorizon);
                change('periodStart', '');
              }}
              {...invalidProps('horizon', error('horizon'))}
            >
              {horizons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.title}
                </option>
              ))}
            </NativeSelect>
            <FieldError name="horizon">{error('horizon')}</FieldError>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-period-start">Period start</Label>
            <DateField
              id="plan-period-start"
              value={fields.periodStart}
              onValueChange={(value) => change('periodStart', value)}
              {...invalidProps('periodStart', error('periodStart'))}
            />
            <p className="text-caption text-muted-foreground">
              {periodHelp[fields.horizon]}. Leave it empty for the current period.
            </p>
            <FieldError name="periodStart">{error('periodStart')}</FieldError>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-status">Status</Label>
            <NativeSelect
              id="plan-status"
              value={fields.status}
              onChange={(event) => change('status', event.target.value as PlanStatus)}
              {...invalidProps('status', error('status'))}
            >
              {(Object.keys(statusLabels) as PlanStatus[]).map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </NativeSelect>
            <FieldError name="status">{error('status')}</FieldError>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              aria-disabled={save.isPending || undefined}
            >
              Cancel
            </Button>
            <Button type="submit" aria-disabled={save.isPending || undefined}>
              {save.isPending ? <Spinner size="sm" label="Saving" /> : null}
              {editing ? 'Save changes' : 'Add plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
