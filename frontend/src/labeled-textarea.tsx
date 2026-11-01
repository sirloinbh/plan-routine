import { Label } from './components/ui/label';

// The shared UI has no textarea yet, so this one follows the Input component's look. No maxLength
// attribute: the browser would silently cut pasted text, so the count warns and the server rejects.
export function LabeledTextarea({
  id,
  label,
  value,
  rows,
  limit,
  readOnly,
  invalid = false,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  rows: number;
  limit: number;
  readOnly: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="min-w-0 leading-normal wrap-anywhere">
          {label}
        </Label>
        <span
          className={
            value.length > limit
              ? 'text-caption text-destructive'
              : 'text-caption text-muted-foreground'
          }
        >
          {value.length}/{limit}
        </span>
      </div>
      <textarea
        id={id}
        className="w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-body-sm dark:bg-input/30"
        rows={rows}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
