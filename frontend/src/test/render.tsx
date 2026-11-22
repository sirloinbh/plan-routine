import { QueryClientProvider } from '@tanstack/react-query';
import { render as renderUi } from '@testing-library/react';
import type { ReactElement } from 'react';

import { createQueryClient } from '../lib/query';

/**
 * `render` with a fresh query client, so no test sees another test's cached data. Failed loads are not retried and
 * nothing is kept after a screen leaves, so each test counts exactly the requests its screen makes.
 */
export function render(ui: ReactElement) {
  const client = createQueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0, gcTime: 0 } },
  });
  return renderUi(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
