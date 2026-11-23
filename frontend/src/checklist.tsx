import { ExternalLink } from 'lucide-react';
import { useState } from 'react';

import { progressText } from './checklist-progress';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Input } from './components/ui/input';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import type { NoticeValue } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import { RetryButton } from './retry-button';

export type ChecklistItem = {
  id: number;
  name: string;
  checked: boolean;
  skipped?: boolean;
  skipReason?: string | null;
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
      <RetryButton onClick={onRetry}>Try again</RetryButton>
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
}: {
  title: string;
  headingLevel?: 'h2' | 'h3';
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
  /** Without both skip handlers the list has no skip controls. */
  onSkip?: (item: ChecklistItem, reason: string) => void;
  onUnskip?: (item: ChecklistItem) => void;
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
function SkipControl({
  item,
  onSkip,
  onUnskip,
}: {
  item: ChecklistItem;
  onSkip: (item: ChecklistItem, reason: string) => void;
  onUnskip: (item: ChecklistItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState('');

  if (item.skipped)
    return (
      <div className="flex flex-wrap items-center gap-2 pl-7 text-body-sm text-muted-foreground">
        <span className="min-w-0 wrap-anywhere">
          Skipped{item.skipReason ? `: ${item.skipReason}` : ''}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Remove skip: ${item.name}`}
          onClick={() => onUnskip(item)}
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
          type="button"
          variant="ghost"
          size="sm"
          aria-label={`Skip: ${item.name}`}
          onClick={() => setEditing(true)}
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
        onSkip(item, reason.trim());
        setEditing(false);
        setReason('');
      }}
    >
      <Input
        className="min-w-0 flex-1 basis-48"
        aria-label={`Reason for skipping ${item.name} (optional)`}
        placeholder="Reason (optional)"
        maxLength={skipReasonLimit}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      <Button type="submit" size="sm">
        Skip
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </form>
  );
}
