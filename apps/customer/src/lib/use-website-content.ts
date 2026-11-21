'use client';

import { useEffect, useState } from 'react';
import { EMPTY_WEBSITE, IS_STATIC_PREVIEW, publicApi, type WebsiteContent } from './api';
import { previewWebsiteContent } from './preview-data';

/**
 * Loads the published website content managed in the admin CMS.
 *
 * The fetch is client-side so a runtime edit in the CMS reaches the page
 * without a rebuild. On failure the page falls back to the bundled copy rather
 * than rendering an empty hero, which is why the caller receives
 * `EMPTY_WEBSITE` instead of an error.
 *
 * In the static export the bundled copy is the source, and it is used as the
 * *initial* state rather than after an effect. That matters twice over: there
 * is no API to fetch from, and starting from `EMPTY_WEBSITE` would render the
 * placeholder art into the exported HTML and then swap it for the photograph
 * on hydration — a visible flash and a hydration mismatch.
 */
export function useWebsiteContent(locale: string) {
  const [content, setContent] = useState<WebsiteContent>(() =>
    IS_STATIC_PREVIEW ? previewWebsiteContent(locale) : EMPTY_WEBSITE,
  );
  const [loaded, setLoaded] = useState(IS_STATIC_PREVIEW);

  useEffect(() => {
    if (IS_STATIC_PREVIEW) {
      setContent(previewWebsiteContent(locale));
      setLoaded(true);
      return;
    }
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
