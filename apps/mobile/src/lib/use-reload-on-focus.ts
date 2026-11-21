import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';

/**
 * Re-run a loader every time a screen regains focus.
 *
 * A tab that reads a list stays mounted while the user pushes a detail screen on
 * top of it. A create or delete performed on that detail screen — registering a
 * vehicle, removing an address — changes server state the tab cannot see, and
 * the tab's own dependencies have not changed, so it would keep showing the list
 * from before the edit. Reloading on focus is what makes the write visible when
 * the user comes back.
 *
 * The loader is held in a ref and invoked through a stable callback. Callers
 * naturally pass an inline arrow, whose identity changes on every render;
 * `useFocusEffect` re-runs its effect whenever the callback identity changes, so
 * a per-render identity would re-fire the loader on every render and spin the
 * network in a loop. The ref keeps the effect subscribed once per focus.
 *
 * `enabled` guards the demo path, where the list is local and already current.
 */
export function useReloadOnFocus(reload: () => void, enabled: boolean): void {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useFocusEffect(
    useCallback(() => {
      if (enabled) reloadRef.current();
    }, [enabled]),
  );
}
