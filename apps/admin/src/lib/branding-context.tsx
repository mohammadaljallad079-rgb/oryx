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
  ORYX_DEFAULT_BRANDING,
  brandingCssVariables,
  type CompanyBrandingDto,
} from '@oryx/shared';
import { api } from './api';
import { useAuth } from './auth-context';
import { useUi } from './ui-context';

/**
 * The active company's visual identity, resolved once for the whole shell.
 *
 * Branding is a property of the *selected tenant*, so it is fetched whenever the
 * company context changes and cleared back to the ORYX default when a platform
 * principal is viewing "all companies". Without this a tenant would keep seeing
 * the previous company's logo after switching context.
 *
 * Everything a surface needs is derived here — the display name, the logo URL
 * for the current theme, the favicon and the CSS variables — so no component
 * repeats the resolution logic and the shell cannot drift from the settings
 * screen.
 */

interface BrandingContextValue {
  /** The resolved identity, or the platform default before the first fetch. */
  branding: CompanyBrandingDto;
  /** True when the API has not yet answered for the current company. */
  loading: boolean;
  /** The company's display name in the active locale. */
  displayName: string;
  /**
   * The logo to paint for the active theme.
   *
   * `null` means the caller should fall back to the packaged ORYX lockup: a
   * company that has uploaded only a light logo must not lose its mark in dark
   * mode, and vice versa.
   */
  logoAssetId: string | null;
  faviconAssetId: string | null;
  /** CSS custom properties for the shell, already validated. */
  cssVariables: Record<string, string>;
  /**
   * True when the tenant has supplied colours of its own.
   *
   * Compared against the platform default rather than trusting `isDefault`
   * alone: a company that stored a row containing only a logo resolves its
   * colours from the default, and the shell must keep the approved palette in
   * that case.
   */
  isBranded: boolean;
  /** Re-read the identity after the settings screen writes it. */
  refresh: () => Promise<void>;
}

const PLATFORM_DEFAULT: CompanyBrandingDto = {
  companyId: '',
  isDefault: true,
  ...ORYX_DEFAULT_BRANDING,
};

const BrandingContext = createContext<BrandingContextValue | null>(null);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const { companyId, isAuthenticated } = useAuth();
  const { locale, theme } = useUi();
  const [branding, setBranding] = useState<CompanyBrandingDto>(PLATFORM_DEFAULT);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    // A platform principal with no tenant selected is not a company context;
    // it shows the platform's own identity.
    if (!companyId) {
      setBranding(PLATFORM_DEFAULT);
      return;
    }
    setLoading(true);
    try {
      setBranding(await api.getBranding(companyId));
    } catch {
      // Branding is decoration, never a reason to break the shell. Falling back
      // to the platform default keeps every screen usable if the read fails.
      setBranding(PLATFORM_DEFAULT);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!isAuthenticated) {
      setBranding(PLATFORM_DEFAULT);
      return;
    }
    void load();
  }, [isAuthenticated, load]);

  // Theme-aware logo selection, with a packaged fallback for the colourway a
  // tenant has not uploaded.
  const logoAssetId = useMemo(() => {
    const preferred = theme === 'light' ? branding.logoAssetId : branding.logoDarkAssetId;
    return preferred ?? null;
  }, [theme, branding.logoAssetId, branding.logoDarkAssetId]);

  const cssVariables = useMemo(() => brandingCssVariables(branding), [branding]);

  const isBranded = useMemo(
    () =>
      branding.primaryColor !== ORYX_DEFAULT_BRANDING.primaryColor ||
      branding.accentColor !== ORYX_DEFAULT_BRANDING.accentColor,
    [branding.primaryColor, branding.accentColor],
  );

  // The document title and favicon are part of the tenant's identity on every
  // surface the browser shows, including the tab strip and bookmarks.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = `${branding.nameEn} — Enterprise Resource Platform`;
  }, [branding.nameEn]);

  useEffect(() => {
    if (typeof document === 'undefined' || !branding.faviconAssetId) return;
    const href = api.mediaFileUrl(branding.faviconAssetId, 'card');
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    const created = !link;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    const previous = link.href;
    link.href = href;
    return () => {
      // Restore the packaged icon when the tenant changes, so one company's
      // favicon does not linger on another's pages.
      if (created) link?.remove();
      else if (link) link.href = previous;
    };
  }, [branding.faviconAssetId]);

  const displayName = locale === 'ar' ? branding.nameAr : branding.nameEn;

  const value = useMemo<BrandingContextValue>(
    () => ({
      branding,
      loading,
      displayName,
      logoAssetId,
      faviconAssetId: branding.faviconAssetId,
      cssVariables,
      isBranded,
      refresh: load,
    }),
    [branding, loading, displayName, logoAssetId, cssVariables, isBranded, load],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}
