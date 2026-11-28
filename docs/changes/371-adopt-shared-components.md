# #371 Adopt the shared design-system components

Part of sirloinbh/project-standards#1177.

## Change

| Local copy (removed or reduced)                    | Shared component now used                                                                     |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `loading-region.tsx`, `retry-button.tsx` (+ tests) | `LoadingRegion`, `RetryButton` from `components/load-state` (`onClick` became `onRetry`)      |
| `service-date.ts`                                  | `serviceToday` from `lib/format`                                                              |
| `format-date.ts`                                   | `formatDate` from `lib/format`; only the weekday and month styles and `dateHeading` stay here |
| download code in `export-section.tsx`              | `downloadBlob`                                                                                |

## Visible differences

- Dates read "Oct 22, 2026" (the kit's medium style) instead of "October 22, 2026".
- Loading placeholders are a `status` region; retry buttons use the kit's size.

## Verification

See the PR.
