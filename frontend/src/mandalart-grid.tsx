import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { blockName, cellLabel, centre } from './mandalart-cells';

// The main goal is the strongest, the sub-goals (in block 4 and as the centre of each other block) are marked.
const cellStyle = (block: number, position: number) =>
  block === centre && position === centre
    ? 'bg-foreground text-background font-semibold'
    : block === centre || position === centre
      ? 'bg-muted text-foreground font-semibold'
      : 'bg-background text-foreground';

function Block({
  cells,
  block,
  large = false,
}: {
  cells: string[][];
  block: number;
  large?: boolean;
}) {
  return (
    <ol
      aria-label={blockName(cells, block)}
      className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border"
    >
      {cells[block].map((text, position) => (
        <li
          key={position}
          aria-label={cellLabel(cells, block, position)}
          className={`flex aspect-square items-center justify-center overflow-hidden p-0.5 text-center wrap-anywhere ${
            large ? 'p-2 text-body' : 'text-caption leading-tight'
          } ${cellStyle(block, position)}`}
        >
          <span aria-hidden className={large ? '' : 'line-clamp-4'}>
            {text}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** The read-only 9x9 grid as 3x3 blocks. Each block has a button that opens it enlarged, for a phone-sized screen. */
export function MandalartGrid({ cells }: { cells: string[][] }) {
  const [zoomed, setZoomed] = useState<number | null>(null);
  return (
    <>
      <div className="mx-auto grid w-full max-w-3xl grid-cols-3 gap-2" data-testid="mandalart-grid">
        {cells.map((_, block) => (
          <div key={block} className="flex flex-col gap-1">
            <Block cells={cells} block={block} />
            <button
              type="button"
              aria-label={`Zoom in on ${blockName(cells, block)}`}
              onClick={() => setZoomed(block)}
              className="min-h-8 rounded-md px-1 text-caption text-muted-foreground underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none pointer-coarse:min-h-11"
            >
              Zoom in
            </button>
          </div>
        ))}
      </div>
      <Dialog open={zoomed !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <DialogContent>
          {zoomed !== null && (
            <>
              <DialogHeader>
                <DialogTitle>{blockName(cells, zoomed)}</DialogTitle>
                <DialogDescription>
                  Block {zoomed + 1} of 9, enlarged. Close it to see the whole grid.
                </DialogDescription>
              </DialogHeader>
              <Block cells={cells} block={zoomed} large />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
