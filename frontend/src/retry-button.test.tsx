import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { RetryButton } from './retry-button';

function Screen({ failed }: { failed: boolean }) {
  return (
    <section aria-labelledby="title">
      <h1 id="title">기록</h1>
      <input aria-label="다른 칸" />
      {failed && <RetryButton>다시 시도</RetryButton>}
    </section>
  );
}

test('a retry button leaving with focus hands it to the named area around it', () => {
  const { rerender } = render(<Screen failed />);
  screen.getByRole('button', { name: '다시 시도' }).focus();
  rerender(<Screen failed={false} />);
  expect(screen.getByRole('region', { name: '기록' })).toHaveFocus();
});

test('it prefers its own card to the page', () => {
  const page = (failed: boolean) => (
    <section aria-labelledby="title">
      <h1 id="title">기록</h1>
      <div role="region" aria-label="이번 달">
        {failed && <RetryButton>다시 시도</RetryButton>}
      </div>
    </section>
  );
  const { rerender } = render(page(true));
  screen.getByRole('button', { name: '다시 시도' }).focus();
  rerender(page(false));
  expect(screen.getByRole('region', { name: '이번 달' })).toHaveFocus();
});

test('it leaves focus alone when the user is elsewhere', () => {
  const { rerender } = render(<Screen failed />);
  const other = screen.getByRole('textbox', { name: '다른 칸' });
  other.focus();
  rerender(<Screen failed={false} />);
  expect(other).toHaveFocus();
});

test('it keeps the look of a retry button unless told otherwise', () => {
  render(<RetryButton className="self-start">다시 시도</RetryButton>);
  const button = screen.getByRole('button', { name: '다시 시도' });
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toHaveClass('self-start');
});
