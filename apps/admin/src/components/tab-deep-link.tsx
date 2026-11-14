'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Deep-link a module tab from `?tab=`.
 *
 * A module dashboard shortcut jumps to a specific tab (e.g.
 * `/accounting?tab=journals`). This renders nothing and only selects the tab
 * when the query value names a tab the page actually has, so an unknown or
 * stale value falls back to the page's own default instead of blanking it.
 * It reads `useSearchParams`, so the caller must mount it inside a Suspense
 * boundary.
 */
export function TabDeepLink<T extends string>({
  valid,
  onSelect,
}: {
  valid: readonly T[];
  onSelect: (tab: T) => void;
}) {
  const params = useSearchParams();
  const wanted = params.get('tab');

  useEffect(() => {
    if (wanted && (valid as readonly string[]).includes(wanted)) {
      onSelect(wanted as T);
    }
    // `onSelect` is a stable state setter; re-running on `wanted` alone is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  return null;
}
