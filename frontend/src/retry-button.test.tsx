import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';

import { RetryButton } from './retry-button';

function Screen({ failed }: { failed: boolean }) {
  return (
    <section aria-labelledby="title">
      <h1 id="title">Records</h1>
      <input aria-label="Other field" />
      {failed && <RetryButton>Try again</RetryButton>}
    </section>
  );
}

test('a retry button leaving with focus hands it to the named area around it', () => {
  const { rerender } = render(<Screen failed />);
  screen.getByRole('button', { name: 'Try again' }).focus();
  rerender(<Screen failed={false} />);
  expect(screen.getByRole('region', { name: 'Records' })).toHaveFocus();
});

test('it prefers its own card to the page', () => {
  const page = (failed: boolean) => (
    <section aria-labelledby="title">
      <h1 id="title">Records</h1>
      <div role="region" aria-label="This month">
        {failed && <RetryButton>Try again</RetryButton>}
      </div>
    </section>
  );
  const { rerender } = render(page(true));
  screen.getByRole('button', { name: 'Try again' }).focus();
  rerender(page(false));
  expect(screen.getByRole('region', { name: 'This month' })).toHaveFocus();
});

test('it leaves focus alone when the user is elsewhere', () => {
  const { rerender } = render(<Screen failed />);
  const other = screen.getByRole('textbox', { name: 'Other field' });
  other.focus();
  rerender(<Screen failed={false} />);
  expect(other).toHaveFocus();
});

test('it keeps the look of a retry button unless told otherwise', () => {
  render(<RetryButton className="self-start">Try again</RetryButton>);
  const button = screen.getByRole('button', { name: 'Try again' });
  expect(button).toHaveAttribute('type', 'button');
  expect(button).toHaveClass('self-start');
});
