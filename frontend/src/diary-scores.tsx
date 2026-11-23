import { Button } from './components/ui/button';

const scoreValues = [1, 2, 3, 4, 5] as const;

// One optional 1 to 5 score. Radio buttons, so a screen reader hears "3 of 5" and the keyboard
// moves with the arrow keys; "Clear" is there because a radio group cannot be unselected.
export function ScoreField({
  id,
  label,
  low,
  high,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  low: string;
  high: string;
  value: number | null;
  disabled: boolean;
  onChange: (value: number | null) => void;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" disabled={disabled}>
      <legend className="text-body-sm font-medium">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        {scoreValues.map((score) => (
          <label
            key={score}
            className="flex size-9 cursor-pointer items-center justify-center rounded-md border border-input text-body-sm has-[:checked]:border-primary has-[:checked]:bg-primary has-[:checked]:text-primary-foreground has-[:disabled]:cursor-default has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50 pointer-coarse:size-11"
          >
            <input
              id={`${id}-${score}`}
              type="radio"
              name={id}
              value={score}
              checked={value === score}
              onChange={() => onChange(score)}
              className="sr-only"
            />
            {score}
          </label>
        ))}
        {value !== null && !disabled && (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            Clear<span className="sr-only"> {label.toLowerCase()}</span>
          </Button>
        )}
      </div>
      <p className="text-caption text-muted-foreground">
        1 = {low}, 5 = {high}
      </p>
    </fieldset>
  );
}
