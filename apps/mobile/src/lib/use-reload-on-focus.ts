import { useCallback } from 'react';
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
 * `enabled` guards the demo path, where the list is local and already current.
 */
export function useReloadOnFocus(reload: () => void, enabled: boolean): void {
  useFocusEffect(
    useCallback(() => {
      if (enabled) reload();
    }, [enabled, reload]),
  );
}
