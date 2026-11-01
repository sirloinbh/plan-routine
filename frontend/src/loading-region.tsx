import { SkeletonCard, SkeletonList } from './components/ui/skeleton';

// What a screen shows until its first load ends, in the shape of what is coming: rows inside a card,
// one card, or a grid of cards. The placeholders are hidden from screen readers, so the region
// carries the name (central docs/ui-components.md).
export function LoadingRegion({
  label,
  shape = 'rows',
  rows = 3,
}: {
  label: string;
  shape?: 'rows' | 'card' | 'cards';
  rows?: number;
}) {
  return (
    <section aria-busy="true" aria-label={label}>
      {shape === 'rows' && <SkeletonList rows={rows} />}
      {shape === 'card' && <SkeletonCard />}
      {shape === 'cards' && (
        <div className="grid gap-4 md:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}
    </section>
  );
}
