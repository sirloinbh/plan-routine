import { useQueryClient } from '@tanstack/react-query';
import { Grid3x3, Pencil, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';

import { ConfirmDelete } from './components/confirm-delete/confirm-delete';
import { Button } from './components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './components/ui/card';
import { EmptyState } from './components/ui/empty-state';
import { Notice } from './components/ui/notice';
import { apiKey, useApiMutation, useApiQuery } from './lib/query';
import { errorText, useNotice } from './lib/use-notice';
import { LoadingRegion } from './loading-region';
import {
  cellCount,
  type Mandalart,
  mandalartPath,
  mandalartsKey,
  type MandalartSummary,
} from './mandalart-cells';
import { MandalartEditor, NewMandalartDialog } from './mandalart-editor';
import { MandalartGrid } from './mandalart-grid';
import { RetryButton } from './retry-button';

export function Mandalarts() {
  const [creating, setCreating] = useState(false);
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
  const newButton = (
    <Button type="button" onClick={() => setCreating(true)}>
      <Plus aria-hidden />
      New Mandalart
    </Button>
  );
  const dialog = creating && <NewMandalartDialog onClose={() => setCreating(false)} />;
  if (mandalarts.length === 0)
    return (
      <>
        <EmptyState
          icon={<Grid3x3 />}
          title="No Mandalarts yet"
          description="A Mandalart is a 9x9 chart: one main goal, 8 sub-goals and 8 actions for each sub-goal."
          action={newButton}
        />
        {dialog}
      </>
    );
  return (
    <div className="flex flex-col gap-4">
      <div>{newButton}</div>
      {dialog}
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
    </div>
  );
}

export function MandalartView() {
  const { id = '' } = useParams();
  const valid = /^[0-9]{1,15}$/.test(id);
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  // A new Mandalart opens in edit mode (state set by the New Mandalart dialog).
  const [editing, setEditing] = useState(
    () => (location.state as { edit?: boolean } | null)?.edit === true,
  );
  const [deleting, setDeleting] = useState<Mandalart | null>(null);
  const { notice, status, clear } = useNotice();
  const deleteButton = useRef<HTMLButtonElement>(null);
  const query = useApiQuery<{ mandalart: Mandalart }>(
    apiKey('/api/mandalarts', id),
    `/api/mandalarts/${id}`,
    { enabled: valid, staleTime: 0 },
  );
  // No invalidate here: refetching the deleted Mandalart would answer 404. Only the list is refreshed.
  const remove = useApiMutation<unknown, number>((target) => ({
    path: `/api/mandalarts/${target}`,
    method: 'DELETE',
  }));
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
  if (editing)
    return (
      <section aria-label={`Editing ${mandalart.title}`} className="flex flex-col gap-4">
        <h2 className="text-body font-semibold wrap-anywhere">Editing {mandalart.title}</h2>
        <MandalartEditor
          mandalart={mandalart}
          onDone={(message) => {
            setEditing(false);
            if (message) status(message);
            else clear();
          }}
        />
      </section>
    );
  return (
    <section aria-label={mandalart.title} className="flex flex-col gap-4">
      <Notice notice={notice} />
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-body font-semibold wrap-anywhere">{mandalart.title}</h2>
        {back}
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          onClick={() => {
            clear();
            setEditing(true);
          }}
        >
          <Pencil aria-hidden />
          Edit
        </Button>
        <Button
          ref={deleteButton}
          type="button"
          variant="outline"
          onClick={() => setDeleting(mandalart)}
        >
          <Trash2 aria-hidden />
          Delete
        </Button>
      </div>
      <MandalartGrid cells={mandalart.cells} />
      <ConfirmDelete
        item={deleting}
        label={(item) => `"${item.title}"`}
        description="Its goals and actions are deleted with it. This cannot be undone."
        returnFocusRef={deleteButton}
        onClose={() => setDeleting(null)}
        onConfirm={async (item) => {
          await remove.mutateAsync(item.id);
          await queryClient.invalidateQueries({ queryKey: mandalartsKey, exact: true });
          void navigate('/mandalarts');
        }}
      />
    </section>
  );
}
