import { type FormEvent, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from './components/ui/button';
import { ConfirmDialog } from './components/ui/confirm-dialog';
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
import { Notice } from './components/ui/notice';
import { Spinner } from './components/ui/spinner';
import { type ApiRequest, useApiMutation } from './lib/query';
import { errorText } from './lib/use-notice';
import {
  blockName,
  centre,
  type Mandalart,
  mandalartPath,
  mandalartsKey,
  mirrorGrid,
  sameCells,
  subGoalNumber,
} from './mandalart-cells';
import { MandalartGrid } from './mandalart-grid';
import { useLeaveGuard } from './mandalart-leave';

const maxLength = 100;
const positions = Array.from({ length: 9 }, (_, index) => index);
const outerBlocks = positions.filter((block) => block !== centre);

/** Asks for a title, creates the Mandalart (with its 81 empty cells) and opens it in edit mode. */
export function NewMandalartDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState<string | undefined>(undefined);
  const create = useApiMutation<{ mandalart: Mandalart }, string>(
    (value) => ({ path: '/api/mandalarts', method: 'POST', body: { title: value } }),
    { invalidate: [mandalartsKey] },
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (create.isPending) return;
    if (!title.trim()) {
      setMessage('Enter a title');
      return;
    }
    try {
      const { mandalart } = await create.mutateAsync(title);
      void navigate(mandalartPath(mandalart.id), { state: { edit: true } });
    } catch (cause) {
      setMessage(errorText(cause));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Mandalart</DialogTitle>
          <DialogDescription>Give it a title. You fill in the goals next.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="mandalart-new-title">Title</Label>
            <Input
              id="mandalart-new-title"
              value={title}
              maxLength={maxLength}
              onChange={(event) => {
                setTitle(event.target.value);
                setMessage(undefined);
              }}
              {...invalidProps('mandalart-new-title', message)}
            />
            <FieldError name="mandalart-new-title">{message}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" aria-disabled={create.isPending || undefined}>
              {create.isPending ? <Spinner size="sm" label="Creating" /> : null}
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edit a Mandalart cell by cell: the main goal first, then the 8 sub-goals, then the actions of each. The sub-goals
 * repeat in the centre of their blocks as you type (see the preview). One save sends the title and all cells.
 */
export function MandalartEditor({
  mandalart,
  onDone,
}: {
  mandalart: Mandalart;
  onDone: (message?: string) => void;
}) {
  const [title, setTitle] = useState(mandalart.title);
  const [cells, setCells] = useState(() => mirrorGrid(mandalart.cells));
  const [titleMessage, setTitleMessage] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<string | undefined>(undefined);
  const [discarding, setDiscarding] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);

  const rename = useApiMutation<unknown, string>(
    (value) => ({
      path: `/api/mandalarts/${mandalart.id}`,
      method: 'PATCH',
      body: { title: value },
    }),
    { invalidate: [mandalartsKey] },
  );
  const saveCells = useApiMutation<unknown, string[][]>(
    (value): ApiRequest => ({
      path: `/api/mandalarts/${mandalart.id}/cells`,
      method: 'PUT',
      body: { cells: value },
    }),
    { invalidate: [mandalartsKey] },
  );
  const saving = rename.isPending || saveCells.isPending;

  const shown = mirrorGrid(cells);
  const dirty = title.trim() !== mandalart.title || !sameCells(shown, mandalart.cells);
  const guard = useLeaveGuard(dirty);

  const setCell = (block: number, position: number, value: string) => {
    setFailure(undefined);
    setCells((current) =>
      current.map((cellsOfBlock, b) =>
        b === block ? cellsOfBlock.map((text, p) => (p === position ? value : text)) : cellsOfBlock,
      ),
    );
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setFailure(undefined);
    if (!title.trim()) {
      setTitleMessage('Enter a title');
      titleInput.current?.focus();
      return;
    }
    try {
      await saveCells.mutateAsync(shown);
      if (title.trim() !== mandalart.title) await rename.mutateAsync(title);
      onDone('Saved the Mandalart');
    } catch (cause) {
      setFailure(errorText(cause));
    }
  };

  const field = (block: number, position: number, label: string) => (
    <div key={`${block}-${position}`} className="flex flex-col gap-1">
      <Label htmlFor={`mandalart-cell-${block}-${position}`} className="text-caption">
        {label}
      </Label>
      <Input
        id={`mandalart-cell-${block}-${position}`}
        value={cells[block][position]}
        maxLength={maxLength}
        onChange={(event) => setCell(block, position, event.target.value)}
      />
    </div>
  );

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-6">
      <Notice notice={failure ? { kind: 'error', text: failure } : undefined} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="mandalart-title">Title</Label>
        <Input
          id="mandalart-title"
          ref={titleInput}
          value={title}
          maxLength={maxLength}
          onChange={(event) => {
            setTitle(event.target.value);
            setTitleMessage(undefined);
          }}
          {...invalidProps('mandalart-title', titleMessage)}
        />
        <FieldError name="mandalart-title">{titleMessage}</FieldError>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-semibold">1. Main goal</legend>
        {field(centre, centre, 'Main goal')}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-semibold">2. Sub-goals</legend>
        <p className="text-body-sm text-muted-foreground">
          Each sub-goal also appears in the centre of its own block.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {outerBlocks.map((block) => field(centre, block, `Sub-goal ${subGoalNumber(block)}`))}
        </div>
      </fieldset>
      <section className="flex flex-col gap-4" aria-labelledby="mandalart-actions">
        <h3 id="mandalart-actions" className="text-body font-semibold">
          3. Actions
        </h3>
        {outerBlocks.map((block) => (
          <fieldset key={block} className="flex flex-col gap-2 rounded-md border p-3">
            <legend className="px-1 text-body-sm font-semibold wrap-anywhere">
              {blockName(shown, block)}
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {outerBlocks.map((position) =>
                field(
                  block,
                  position,
                  `Action ${subGoalNumber(position)} of sub-goal ${subGoalNumber(block)}`,
                ),
              )}
            </div>
          </fieldset>
        ))}
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="mandalart-preview">
        <h3 id="mandalart-preview" className="text-body font-semibold">
          Preview
        </h3>
        <MandalartGrid cells={shown} />
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" aria-disabled={saving || undefined}>
          {saving ? <Spinner size="sm" label="Saving" /> : null}
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => (dirty ? setDiscarding(true) : onDone())}
        >
          Cancel
        </Button>
        {dirty && (
          <span className="text-body-sm text-muted-foreground">You have unsaved changes</span>
        )}
      </div>
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard your changes?"
        description="What you typed will be lost."
        confirmLabel="Discard"
        onConfirm={() => onDone()}
      />
      <ConfirmDialog
        open={guard.pending}
        onOpenChange={(open) => !open && guard.stay()}
        title="Leave without saving?"
        description="What you typed will be lost."
        confirmLabel="Leave"
        onConfirm={guard.leave}
      />
    </form>
  );
}
