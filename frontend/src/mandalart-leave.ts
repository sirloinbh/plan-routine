import { useEffect, useState } from 'react';

// While `dirty`, leaving the page would lose input. A reload or closing the tab gets the browser's own warning; a
// click on a link inside the app is held back so the screen can ask first (BrowserRouter has no route blocker).
export function useLeaveGuard(dirty: boolean) {
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
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
      setLeavingTo(`${link.pathname}${link.search}${link.hash}`);
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', clicked, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', clicked, true);
    };
  }, [dirty]);

  return { leavingTo, stay: () => setLeavingTo(null) };
}
