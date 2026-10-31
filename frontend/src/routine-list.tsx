import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import type { Routine } from './routines';
import type { RoutineList, RoutineNotice } from './use-routine-list';

export function RoutineNotices({ notice }: { notice: RoutineNotice }) {
  return (
    <>
      {/* Live regions stay mounted so screen readers announce the first message too. */}
      <div role="status" aria-live="polite">
        {notice?.kind === 'status' && (
          <p className="text-body-sm text-muted-foreground">{notice.text}</p>
        )}
      </div>
      <div role="alert">
        {notice?.kind === 'alert' && <p className="text-body-sm text-destructive">{notice.text}</p>}
      </div>
    </>
  );
}

export function RoutineItems({ list, routines }: { list: RoutineList; routines: Routine[] }) {
  const { editing, confirmArchive, busy } = list;
  return (
    <ol className="flex flex-col divide-y">
      {routines.map((routine, index) => (
        <li key={routine.id} className="flex flex-wrap items-center gap-2 py-2">
          {editing?.id === routine.id ? (
            <form
              className="flex w-full flex-wrap gap-2"
              aria-label={`${routine.name} 이름 수정`}
              onSubmit={(event) => {
                event.preventDefault();
                void list.rename();
              }}
            >
              <Input
                className="min-w-0 flex-1"
                aria-label={`${routine.name} 새 이름`}
                // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the rename field opens on a click, so focus follows that action.
                autoFocus
                value={editing.name}
                maxLength={100}
                onChange={(event) => list.setEditing({ id: routine.id, name: event.target.value })}
              />
              <Button type="submit" disabled={busy}>
                저장
              </Button>
              <Button type="button" variant="ghost" onClick={() => list.setEditing(null)}>
                취소
              </Button>
            </form>
          ) : (
            <>
              <span className="min-w-0 flex-1 basis-48 text-body break-words">{routine.name}</span>
              <span className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${routine.name} 위로 이동`}
                  disabled={busy || index === 0}
                  onClick={() => void list.move(routine, 'up')}
                >
                  위로
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${routine.name} 아래로 이동`}
                  disabled={busy || index === routines.length - 1}
                  onClick={() => void list.move(routine, 'down')}
                >
                  아래로
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`${routine.name} 이름 수정`}
                  disabled={busy}
                  onClick={() => {
                    list.setConfirmArchive(null);
                    list.setEditing({ id: routine.id, name: routine.name });
                  }}
                >
                  수정
                </Button>
                {confirmArchive === routine.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    aria-label={`${routine.name} 보관 확인`}
                    disabled={busy}
                    onClick={() => void list.archive(routine)}
                  >
                    보관 확인
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${routine.name} 보관`}
                    disabled={busy}
                    onClick={() => list.setConfirmArchive(routine.id)}
                  >
                    보관
                  </Button>
                )}
              </span>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

export function RoutineAddForm({
  list,
  draftKey,
  label,
  category,
  placeholder = '새 루틴 이름',
}: {
  list: RoutineList;
  draftKey: string;
  label: string;
  category?: string;
  placeholder?: string;
}) {
  return (
    <form
      className="flex gap-2"
      aria-label={`${label} 루틴 추가`}
      onSubmit={(event) => {
        event.preventDefault();
        void list.add(draftKey, label, category);
      }}
    >
      <Input
        className="min-w-0 flex-1"
        aria-label={`${label} 새 루틴 이름`}
        placeholder={placeholder}
        value={list.drafts[draftKey] ?? ''}
        maxLength={100}
        onChange={(event) => list.setDraft(draftKey, event.target.value)}
      />
      <Button type="submit" disabled={list.busy}>
        추가
      </Button>
    </form>
  );
}
