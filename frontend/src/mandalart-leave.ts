import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

// While `dirty`, leaving the page would lose input. BrowserRouter has no route blocker, so each way out is held back:
// - a reload or closing the tab gets the browser's own prompt;
// - a click on a link inside the app is intercepted;
// - back and forward: a copy of the current history entry (the "guard entry") is pushed on top, so Back lands on the
//   page itself; the guard then steps forward again and asks. "Leave" goes two steps back, to the page before this one.
// The screen shows its confirm dialog while `pending` is true: `stay` closes it, `leave` goes where the owner was going.
type Leaving = { kind: 'link'; to: string } | { kind: 'history' };

export function useLeaveGuard(dirty: boolean) {
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // Set once the owner chose to leave, so the cleanup below does not undo a step the leave already takes.
  const left = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    left.current = false;
    // Popstate events our own history.go(1) causes, which must not ask again.
    let ownSteps = 0;
    window.history.pushState(window.history.state, '', window.location.href);

    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const clicked = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href]');
      if (!link || link.target === '_blank' || link.origin !== window.location.origin) return;
      // The skip link and other in-page anchors stay on this page.
      if (link.pathname === window.location.pathname && link.hash) return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving({ kind: 'link', to: `${link.pathname}${link.search}${link.hash}` });
    };
    const popped = () => {
      // The leave itself steps back through history; the page is going away, so do not ask again.
      if (left.current) return;
      if (ownSteps > 0) {
        ownSteps -= 1;
        return;
      }
      // Back moved off the guard entry onto a copy of this page: step forward again and ask.
      ownSteps += 1;
      window.history.go(1);
      setLeaving({ kind: 'history' });
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', popped);
    document.addEventListener('click', clicked, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', popped);
      document.removeEventListener('click', clicked, true);
      // Saved or discarded: the guard entry is no longer needed, so step back off it (it stays as a forward entry).
      if (!left.current && ownSteps === 0) window.history.go(-1);
      setLeaving(null);
    };
  }, [dirty]);

  return {
    pending: leaving !== null,
    stay: () => setLeaving(null),
    leave: () => {
      const target = leaving;
      setLeaving(null);
      left.current = true;
      if (target?.kind === 'history') window.history.go(-2);
      // The link replaces the guard entry, so the history keeps no extra step.
      else if (target) void navigate(target.to, { replace: true });
    },
  };
}
