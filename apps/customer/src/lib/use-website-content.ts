'use client';

import { useEffect, useState } from 'react';
import { EMPTY_WEBSITE, publicApi, type WebsiteContent } from './api';

/**
 * Loads the published website content managed in the admin CMS.
 *
 * The fetch is client-side for the same reason the provider strip is: the
 * customer site is a static export, so a runtime edit in the CMS must reach the
 * page without a rebuild. On failure the page falls back to the bundled copy
 * rather than rendering an empty hero, which is why the caller receives
 * `EMPTY_WEBSITE` instead of an error.
 */
export function useWebsiteContent(locale: string) {
  const [content, setContent] = useState<WebsiteContent>(EMPTY_WEBSITE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    publicApi
      .website(locale)
      .then((res) => {
        if (active) setContent(res);
      })
      .catch(() => {
        if (active) setContent(EMPTY_WEBSITE);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  return { content, loaded };
}
