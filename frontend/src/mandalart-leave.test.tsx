import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { afterEach, expect, test } from 'vitest';

import { ConfirmDialog } from './components/ui/confirm-dialog';
import { useLeaveGuard } from './mandalart-leave';

// A page with unsaved input that asks the way the Mandalart editor does. It runs on the real browser history
// (BrowserRouter on jsdom), because the guard works by stepping through that history.
function Page() {
  const [dirty, setDirty] = useState(false);
  const guard = useLeaveGuard(dirty);
  return (
    <div>
      <button type="button" onClick={() => setDirty(true)}>
        Type
      </button>
      <button type="button" onClick={() => setDirty(false)}>
        Save
      </button>
      <Link to="/elsewhere">Elsewhere</Link>
      <ConfirmDialog
        open={guard.pending}
        onOpenChange={(open) => !open && guard.stay()}
        title="Leave without saving?"
        confirmLabel="Leave"
        onConfirm={guard.leave}
      />
    </div>
  );
}

function app() {
  // The history is [/prev, /cur]; the page under test is /cur.
  window.history.replaceState(null, '', '/prev');
  window.history.pushState(null, '', '/cur');
  render(
    <BrowserRouter>
      <Routes>
        <Route path="/prev" element={<p>Previous page</p>} />
        <Route path="/cur" element={<Page />} />
        <Route path="/elsewhere" element={<p>Elsewhere page</p>} />
      </Routes>
    </BrowserRouter>,
  );
}

const path = () => window.location.pathname;
const back = () => window.history.back();
const dialog = () => screen.findByRole('dialog', { name: 'Leave without saving?' });
// History steps finish on a later tick.
const settled = (expected: string) => waitFor(() => expect(path()).toBe(expected));

afterEach(() => window.history.replaceState(null, '', '/'));

test('back asks while input is unsaved; staying keeps the page and the input, and back asks again', async () => {
  app();
  fireEvent.click(screen.getByRole('button', { name: 'Type' }));
  back();
  const first = await dialog();
  await settled('/cur');
  fireEvent.click(within(first).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(path()).toBe('/cur');
  back();
  expect(await dialog()).toBeInTheDocument();
  await settled('/cur');
});

test('leaving on back goes to the previous page, not to a copy of this one', async () => {
  app();
  fireEvent.click(screen.getByRole('button', { name: 'Type' }));
  back();
  const ask = await dialog();
  await settled('/cur');
  fireEvent.click(within(ask).getByRole('button', { name: 'Leave' }));
  await settled('/prev');
  expect(await screen.findByText('Previous page')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('forward after leaving does not ask again', async () => {
  app();
  fireEvent.click(screen.getByRole('button', { name: 'Type' }));
  back();
  fireEvent.click(within(await dialog()).getByRole('button', { name: 'Leave' }));
  await settled('/prev');
  window.history.forward();
  await settled('/cur');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('after the input is saved, back goes straight to the previous page with no extra step and no question', async () => {
  app();
  fireEvent.click(screen.getByRole('button', { name: 'Type' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  // Taking the guard entry away is a history step of its own.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await settled('/cur');
  back();
  await settled('/prev');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('with nothing typed, back is not touched', async () => {
  app();
  back();
  await settled('/prev');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('a link asks first and replaces the guard entry, so back from there skips this page once', async () => {
  app();
  fireEvent.click(screen.getByRole('button', { name: 'Type' }));
  fireEvent.click(screen.getByRole('link', { name: 'Elsewhere' }));
  fireEvent.click(within(await dialog()).getByRole('button', { name: 'Leave' }));
  expect(await screen.findByText('Elsewhere page')).toBeInTheDocument();
  expect(path()).toBe('/elsewhere');
  back();
  await settled('/cur');
  back();
  await settled('/prev');
});
