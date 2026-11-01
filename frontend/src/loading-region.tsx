import { SkeletonList } from './components/ui/skeleton';

// What a list shows until its first load ends. The placeholders are hidden from screen readers, so
// the region carries the name (central docs/ui-components.md).
export function LoadingRegion({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <section aria-busy="true" aria-label={label}>
      <SkeletonList rows={rows} />
    </section>
  );
}
