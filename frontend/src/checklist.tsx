import { progressText } from './checklist-progress';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Label } from './components/ui/label';
import { Notice } from './components/ui/notice';
import type { NoticeValue } from './lib/use-notice';

export type ChecklistItem = { id: string; name: string; checked: boolean };

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
    <p role="status" className="text-body-sm text-muted-foreground">
      체크리스트를 불러오는 중…
    </p>
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
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
