import { type ComponentProps, useLayoutEffect, useRef } from 'react';

import { Button } from './components/ui/button';

// A retry button disappears once the load succeeds, and focus would fall to the page body with it.
// If it still has focus then, focus goes to the nearest named area around it: its card, or else the
// page, which a screen reader announces by its title.
export function RetryButton(props: ComponentProps<typeof Button>) {
  const button = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    const element = button.current;
    return () => {
      // Runs before the button leaves the page, while it can still hold focus.
      if (!element || document.activeElement !== element) return;
      const area = element.closest<HTMLElement>('[role="region"], section[aria-labelledby]');
      if (!area) return;
      area.tabIndex = -1;
      // A whole area needs no ring, as with the main landmark, and the screen should not jump.
      area.style.outline = 'none';
      area.focus({ preventScroll: true });
    };
  }, []);

  return <Button ref={button} type="button" variant="outline" size="sm" {...props} />;
}
