import { ExternalLink } from 'lucide-react';

import { progressText } from './checklist-progress';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import type { NoticeValue } from './lib/use-notice';
import { LoadingRegion } from './loading-region';

export type ChecklistItem = {
  id: string;
  name: string;
  checked: boolean;
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
}: {
  failed: boolean;
  notice: NoticeValue | undefined;
  onRetry: () => void;
}) {
  return failed ? (
    <div className="flex flex-col items-start gap-3">
      <Notice notice={notice} />
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        다시 시도
      </Button>
    </div>
  ) : (
    <LoadingRegion label="체크리스트 불러오는 중" shape="card" />
  );
}

// One titled checklist with its progress. The weekly, four-week and twelve-week cards reuse it.
export function Checklist({
  title,
  headingLevel = 'h3',
  items,
  onToggle,
}: {
  title: string;
  headingLevel?: 'h2' | 'h3';
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
}) {
  return (
    <Card role="region" aria-label={`${title} 체크리스트`}>
      <CardHeader>
        <CardTitle asHeading={headingLevel} className="flex items-center gap-2">
          {title}
          <Badge variant="secondary">{progressText(items)}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 py-3">
              <Checkbox
                id={`check-${item.id}`}
                checked={item.checked}
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
                    aria-label={`${item.name}: ${item.linkName ?? '프로젝트'} 열기`}
                  >
                    <ExternalLink aria-hidden="true" />
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
