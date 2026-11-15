'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  resolveSiteContent,
  type Locale,
  type SectionHeadingContent,
  type SiteContent,
} from '@oryx/shared';
import { publicApi } from '@/lib/api';
import { useUi } from '@/lib/ui-context';

interface SiteContentContextValue {
  /** The editable content document for the active locale, defaults merged in. */
  content: SiteContent;
  /**
   * Resolve a `*En`/`*Ar` field pair for the active locale.
   *
   * The admin edits every block bilingually, so pages read the pair through
   * this helper and always show the locale the visitor is reading.
   */
  pick: (en: string, ar: string) => string;
  /** Resolve a section heading (eyebrow/title/subtitle) for the active locale. */
  section: (heading: SectionHeadingContent) => { eyebrow: string; title: string; subtitle: string };
  loading: boolean;
  reload: () => Promise<void>;
}

const SiteContentContext = createContext<SiteContentContextValue | null>(null);

/**
 * Website content provider.
 *
 * The site renders the approved defaults on the server so the first paint is
 * never empty; after hydration this fetches the administrator's stored
 * document and swaps it in. A fetch failure keeps the defaults rather than
 * blanking a section. The brand palette is applied to the document root so the
 * admin can retune the gold/navy/ivory accents without a rebuild.
 */
export function SiteContentProvider({ children }: { children: ReactNode }) {
  const { locale } = useUi();
  const [documents, setDocuments] = useState<Partial<Record<Locale, SiteContent>>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [ar, en] = await Promise.all([
        publicApi.siteContent('ar'),
        publicApi.siteContent('en'),
      ]);
      setDocuments({ ar: ar.site, en: en.site });
    } catch {
      // Keep the approved defaults; an unreachable CMS must not blank the site.
      setDocuments({});
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const content = useMemo<SiteContent>(
    () => documents[locale] ?? resolveSiteContent(locale, null),
    [documents, locale],
  );

  // Apply the administrator's palette to the document root as CSS variables.
  useEffect(() => {
    const root = document.documentElement;
    const p = content.palette;
    if (!p) return;
    root.style.setProperty('--navy', p.navy);
    root.style.setProperty('--gold', p.gold);
    root.style.setProperty('--ivory', p.ivory);
    root.style.setProperty('--gold-soft', p.goldSoft);
    root.style.setProperty('--gold-deep', p.goldDeep);
  }, [content.palette]);

  const pick = useCallback((en: string, ar: string) => (locale === 'ar' ? ar : en), [locale]);

  const section = useCallback(
    (heading: SectionHeadingContent) => ({
      eyebrow: locale === 'ar' ? heading.eyebrowAr : heading.eyebrowEn,
      title: locale === 'ar' ? heading.titleAr : heading.titleEn,
      subtitle: locale === 'ar' ? heading.subtitleAr : heading.subtitleEn,
    }),
    [locale],
  );

  const value = useMemo<SiteContentContextValue>(
    () => ({ content, pick, section, loading, reload: load }),
    [content, pick, section, loading, load],
  );

  return <SiteContentContext.Provider value={value}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent(): SiteContentContextValue {
  const ctx = useContext(SiteContentContext);
  if (!ctx) throw new Error('useSiteContent must be used inside SiteContentProvider.');
  return ctx;
}
