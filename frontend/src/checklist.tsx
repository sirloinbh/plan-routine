import { ExternalLink } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { progressText } from './checklist-progress';
import { LoadingRegion, RetryButton } from './components/load-state/load-state';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import type { NoticeValue } from './lib/use-notice';

export type ChecklistItem = {
  id: number;
  name: string;
  checked: boolean;
  skipped?: boolean;
  skipReason?: string | null;
  /** An N-per-week routine: the target, and the days checked so far this week. */
  timesPerWeek?: number | null;
  weekChecks?: number | null;
  /** A routine that records an amount: its unit, the target (only shown) and today's amount. */
  unit?: string | null;
  targetAmount?: number | null;
  amount?: number | null;
  linkName?: string | null;
  linkUrl?: string | null;
};

// The server refuses other addresses; this keeps a bad stored one from ever becoming a link.
const safeLink = (url: string | null | undefined) =>
  url && /^https?:\/\//i.test(url) ? url : null;

// What a checklist page shows until its first load succeeds.
export function ChecklistPending({
  failed,
  notice,
  onRetry,
  shape = 'card',
}: {
  failed: boolean;
  notice: NoticeValue | undefined;
  onRetry: () => void;
  shape?: 'card' | 'cards';
}) {
  return failed ? (
    <div className="flex flex-col items-start gap-3">
      <Notice notice={notice} />
      <RetryButton onRetry={onRetry}>Try again</RetryButton>
    </div>
  ) : (
    <LoadingRegion label="Loading checklist" shape={shape} />
  );
}

// One titled checklist with its progress. The weekly, four-week and twelve-week cards reuse it.
export function Checklist({
  title,
  headingLevel = 'h3',
  items,
  onToggle,
  onSkip,
  onUnskip,
  onAmount,
}: {
  title: string;
  headingLevel?: 'h2' | 'h3';
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
  /** Without both skip handlers the list has no skip controls. */
  onSkip?: (item: ChecklistItem, reason: string) => void | Promise<void>;
  onUnskip?: (item: ChecklistItem) => void | Promise<void>;
  /** Saves the amount of a checked routine that has a unit; null clears it. */
  onAmount?: (item: ChecklistItem, amount: number | null) => void;
}) {
  return (
    <Card role="region" aria-label={`${title} checklist`}>
      <CardHeader>
        <CardTitle asHeading={headingLevel} className="flex items-center gap-2">
          {title}
          <Badge variant="secondary">{progressText(items)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`check-${item.id}`}
                  checked={item.checked}
                  disabled={item.skipped}
                  onCheckedChange={() => onToggle(item)}
                />
                <Label
                  htmlFor={`check-${item.id}`}
                  className="min-w-0 flex-1 text-body leading-normal font-normal break-words"
                >
                  {item.name}
                  {item.unit && item.targetAmount ? (
                    <span className="block text-body-sm text-muted-foreground">
                      Target {item.targetAmount} {item.unit}
                    </span>
                  ) : null}
                  {item.timesPerWeek ? (
                    <span className="block text-body-sm text-muted-foreground">
                      {item.weekChecks ?? 0}/{item.timesPerWeek} this week
                    </span>
                  ) : null}
                </Label>
                {safeLink(item.linkUrl) && (
                  <Button asChild variant="ghost" size="icon">
                    <a
                      href={safeLink(item.linkUrl) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${item.name}: Open ${item.linkName ?? 'project'}`}
                    >
                      <ExternalLink aria-hidden="true" />
                    </a>
                  </Button>
                )}
              </div>
              {onAmount && item.unit && item.checked && !item.skipped && (
                <AmountControl item={item} onAmount={onAmount} />
              )}
              {onSkip && onUnskip && (
                <SkipControl item={item} onSkip={onSkip} onUnskip={onUnskip} />
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export const skipReasonLimit = 200;

// "Skip" opens a one-line reason (optional); a skipped item shows its reason and can be restored.
// Each step swaps the control that had focus for another, so focus is moved by hand (#288).
function SkipControl({
  item,
  onSkip,
  onUnskip,
}: {
  item: ChecklistItem;
  onSkip: (item: ChecklistItem, reason: string) => void | Promise<void>;
  onUnskip: (item: ChecklistItem) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  // Where focus goes once the next control is drawn.
  const [focusNext, setFocusNext] = useState<'input' | 'skip' | 'remove' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!focusNext) return;
    // A save that failed leaves the item as it was, so focus goes back to the control that is still there.
    const target =
      focusNext === 'input'
        ? input.current
        : item.skipped
          ? removeButton.current
          : skipButton.current;
    // Asked for once: with no such control now (the item was checked elsewhere), nothing is focused later.
    target?.focus();
    setFocusNext(null);
  }, [focusNext, item.skipped, editing]);

  const removeSkip = async () => {
    setBusy(true);
    await onUnskip(item);
    setBusy(false);
    setFocusNext('skip');
  };
  const saveSkip = async () => {
    if (busy) return;
    setBusy(true);
    await onSkip(item, reason.trim());
    setBusy(false);
    setEditing(false);
    setReason('');
    setFocusNext('remove');
  };

  if (item.skipped)
    return (
      <div className="flex flex-wrap items-center gap-2 pl-7 text-body-sm text-muted-foreground">
        <span className="min-w-0 wrap-anywhere">
          Skipped{item.skipReason ? `: ${item.skipReason}` : ''}
        </span>
        <Button
          ref={removeButton}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove skip: ${item.name}`}
          disabled={busy}
          onClick={() => void removeSkip()}
        >
          Remove skip
        </Button>
      </div>
    );
  if (item.checked) return null;
  if (!editing)
    return (
      <div className="pl-7">
        <Button
          ref={skipButton}
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Skip: ${item.name}`}
          onClick={() => {
            setEditing(true);
            setFocusNext('input');
          }}
        >
          Skip
        </Button>
      </div>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2 pl-7"
      onSubmit={(event) => {
        event.preventDefault();
        void saveSkip();
      }}
    >
      <Input
        ref={input}
        className="min-w-0 flex-1 basis-48"
        aria-label={`Reason for skipping ${item.name} (optional)`}
        placeholder="Reason (optional)"
        maxLength={skipReasonLimit}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button type="submit" size="sm" disabled={busy}>
        Skip
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          setEditing(false);
          setFocusNext('skip');
        }}
      >
        Cancel
      </Button>
    </form>
  );
}

// The amount of a checked routine that has a unit. Any check counts as done; the amount is only recorded (#246).
function AmountControl({
  item,
  onAmount,
}: {
  item: ChecklistItem;
  onAmount: (item: ChecklistItem, amount: number | null) => void;
}) {
  // Keyed by the saved value, so a reload shows what the server holds.
  const saved = item.amount === null || item.amount === undefined ? '' : String(item.amount);
  const [draft, setDraft] = useState<{ from: string; text: string }>({ from: saved, text: saved });
  const text = draft.from === saved ? draft.text : saved;
  return (
    <form
      className="flex flex-wrap items-center gap-2 pl-7"
      onSubmit={(event) => {
        event.preventDefault();
        const value = text.trim();
        onAmount(item, value === '' ? null : Number(value));
      }}
    >
      <Input
        className="w-28"
        type="number"
        inputMode="decimal"
        min={0}
        step="any"
        aria-label={`Amount of ${item.name} in ${item.unit}`}
        placeholder={item.unit ?? ''}
        value={text}
        onChange={(event) => setDraft({ from: saved, text: event.target.value })}
      />
      <span className="text-body-sm text-muted-foreground">{item.unit}</span>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-label={`Save amount: ${item.name}`}
        disabled={text.trim() !== '' && !(Number(text) >= 0)}
      >
        Save amount
      </Button>
    </form>
  );
}
