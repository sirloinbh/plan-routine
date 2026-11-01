import { useCallback, useEffect, useRef, useState } from 'react';

// Changes re-render or disable the control that was pressed, which drops keyboard focus. These put
// it somewhere predictable, marked with data-focus-key, unless the user has already moved on.

/** Focus anywhere but here means the user has moved on, and their typing must not be redirected. */
export const isFocusFree = (origin: Element | null) => {
  const current = document.activeElement;
  return !current || current === document.body || current === origin;
};

/** Focuses the first of these that exists and is enabled. */
function focusFirst(keys: string[]) {
  for (const key of keys) {
    const control = document.querySelector<HTMLElement & { disabled?: boolean }>(
      `[data-focus-key="${key}"]`,
    );
    if (control && !control.disabled) {
      control.focus();
      return;
    }
  }
}

/** `ready` holds the focus back, for example until the reload after a change has finished. */
export function useFocusRequest(ready: () => boolean) {
  const request = useRef<{ keys: string[]; origin: Element | null } | null>(null);
  const origin = useRef<Element | null>(null);
  // A request can come after the last render of a change, so it asks for one of its own.
  const [, setRequests] = useState(0);

  useEffect(() => {
    const pending = request.current;
    if (!pending || !ready()) return;
    request.current = null;
    if (isFocusFree(pending.origin)) focusFirst(pending.keys);
  });

  const beginChange = useCallback(() => {
    origin.current = document.activeElement;
  }, []);

  const requestFocus = (keys: string[]) => {
    // On a touch screen, focusing an add field pops up a keyboard nobody asked for. A failed rename
    // still returns to its field: the name needs fixing, so the keyboard is wanted there.
    const touch = window.matchMedia('(pointer: coarse)').matches;
    request.current = {
      keys: touch ? keys.filter((key) => !key.startsWith('add-')) : keys,
      origin: origin.current,
    };
    setRequests((value) => value + 1);
  };

  return { beginChange, requestFocus };
}

/**
 * After the user moves to another day, focus goes to the date's heading, which a screen reader then
 * reads out. A day that changes on its own (midnight) moves nothing.
 */
export function useDateHeading(shownDate: string | undefined) {
  const heading = useRef<HTMLHeadingElement>(null);
  const move = useRef<{ from: string; origin: Element | null } | null>(null);

  useEffect(() => {
    const pending = move.current;
    if (!pending || shownDate === pending.from) return;
    move.current = null;
    if (isFocusFree(pending.origin)) heading.current?.focus();
  }, [shownDate]);

  const expectMove = () => {
    if (shownDate) move.current = { from: shownDate, origin: document.activeElement };
  };

  return { heading, expectMove };
}
