import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { LoadingRegion } from './loading-region';

test('a loading region is named and busy, and its placeholders are hidden from screen readers', () => {
  const { container } = render(<LoadingRegion label="루틴 불러오는 중" rows={2} />);
  expect(screen.getByRole('region', { name: '루틴 불러오는 중' })).toHaveAttribute(
    'aria-busy',
    'true',
  );
  expect(container.querySelectorAll('[data-slot="skeleton-list"] > div')).toHaveLength(2);
  expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
});

test('it takes the shape of what is coming', () => {
  const shapes = { rows: 'skeleton-list', card: 'skeleton-card', cards: 'skeleton-card' } as const;
  for (const [shape, slot] of Object.entries(shapes)) {
    const { container, unmount } = render(
      <LoadingRegion label="불러오는 중" shape={shape as keyof typeof shapes} />,
    );
    expect(container.querySelectorAll(`[data-slot="${slot}"]`)).toHaveLength(
      shape === 'cards' ? 2 : 1,
    );
    unmount();
  }
});
