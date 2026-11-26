# #333 Chart label text at 12px

- Issue: [#333](https://github.com/sirloinbh/plan-routine/issues/333)
- Related: sirloinbh/project-standards#1135

The stats trend axis labels were `text-[8px]`; they are `text-xs` (12px). The left padding of the chart grows from 30 to 40 so a label such as `100%` still fits.

## Verification

- `npm run check`: see the PR.
