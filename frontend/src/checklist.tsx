import { progressText } from './checklist-progress';
import { Badge } from './components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Label } from './components/ui/label';

export type ChecklistItem = { id: string; name: string; checked: boolean };

// One titled checklist with its progress. The weekly, four-week and twelve-week cards reuse it.
export function Checklist({
  title,
  items,
  onToggle,
}: {
  title: string;
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem) => void;
}) {
  return (
    <Card role="region" aria-label={`${title} 체크리스트`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
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
