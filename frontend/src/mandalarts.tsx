import { Grid3x3 } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { apiKey, useApiQuery } from './lib/query';
import { errorText } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import {
  blockName,
  cellCount,
  cellLabel,
  centre,
  type Mandalart,
  mandalartPath,
  mandalartsKey,
  type MandalartSummary,
} from './mandalart-cells';
import { RetryButton } from './retry-button';

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

export function Mandalarts() {
  const query = useApiQuery<{ mandalarts: MandalartSummary[] }>(mandalartsKey, '/api/mandalarts', {
    staleTime: 0,
  });
  if (query.isError)
    return (
      <div className="flex flex-col gap-3">
        <Notice notice={{ kind: 'error', text: errorText(query.error) }} />
        <RetryButton className="self-start" onClick={() => void query.refetch()}>
          Try again
        </RetryButton>
      </div>
    );
  if (!query.data) return <LoadingRegion label="Loading Mandalarts" />;
  const { mandalarts } = query.data;
  if (mandalarts.length === 0)
    return (
      <EmptyState
        icon={<Grid3x3 />}
        title="No Mandalarts yet"
        description="A Mandalart is a 9x9 chart: one main goal, 8 sub-goals and 8 actions for each sub-goal."
      />
    );
  return (
    <ul aria-label="Mandalarts" className="grid gap-3 md:grid-cols-2">
      {mandalarts.map((item) => (
        <li key={item.id}>
          <Card className="gap-2 py-4">
            <CardHeader className="px-4">
              <CardTitle className="wrap-anywhere">
                <Link
                  to={mandalartPath(item.id)}
                  className="underline-offset-2 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {item.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 text-body-sm text-muted-foreground">
              {item.filledCount} of {cellCount} cells filled
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function MandalartView() {
  const { id = '' } = useParams();
  const valid = /^[0-9]{1,15}$/.test(id);
  const query = useApiQuery<{ mandalart: Mandalart }>(
    apiKey('/api/mandalarts', id),
    `/api/mandalarts/${id}`,
    { enabled: valid, staleTime: 0 },
  );
  const back = (
    <Link to="/mandalarts" className="self-start text-body-sm underline underline-offset-2">
      Back to the Mandalart list
    </Link>
  );
  if (!valid)
    return (
      <div className="flex flex-col gap-3">
        <Notice notice={{ kind: 'error', text: 'Invalid Mandalart ID' }} />
        {back}
      </div>
    );
  if (query.isError)
    return (
      <div className="flex flex-col gap-3">
        <Notice notice={{ kind: 'error', text: errorText(query.error) }} />
        <div className="flex items-center gap-4">
          <RetryButton onClick={() => void query.refetch()}>Try again</RetryButton>
          {back}
        </div>
      </div>
    );
  if (!query.data) return <LoadingRegion label="Loading the Mandalart" shape="card" />;
  const { mandalart } = query.data;
  return (
    <section aria-label={mandalart.title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-body font-semibold wrap-anywhere">{mandalart.title}</h2>
        {back}
      </div>
      <MandalartGrid cells={mandalart.cells} />
    </section>
  );
}
