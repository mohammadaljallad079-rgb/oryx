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
  COMPANY_SETTING_DEFAULTS,
  ORYX_DEFAULT_BRANDING,
  brandingCssVariables,
  type CompanyBrandingDto,
  type TypographySettings,
} from '@oryx/shared';
import { api } from './api';
import { useAuth } from './auth-context';
import { useUi } from './ui-context';

/**
 * Apply a company's typography to the document root.
 *
 * Every size in the interface is derived from these custom properties, so a
 * tenant that prefers larger text changes one row and the whole admin follows.
 * The CSS `data-font-scale` preference still multiplies on top, which is why
 * these are written as plain custom properties rather than overriding `zoom`.
 */
function applyTypography(doc: HTMLElement, settings: TypographySettings): void {
  const base = clamp(settings.baseSize, 12, 20);
  const heading = clamp(settings.headingScale, 1.1, 2);
  const moduleScale = clamp(settings.moduleScale, 0.9, 1.6);
  const description = clamp(settings.descriptionScale, 0.8, 1.2);
  const weight = clamp(Math.round(settings.headingWeight), 400, 800);
  const tracking = clamp(settings.labelTracking, 0, 0.2);

  doc.style.setProperty('--font-size-base', `${base}px`);
  doc.style.setProperty('--font-size-heading', String(heading));
  doc.style.setProperty('--font-size-module', String(moduleScale));
  doc.style.setProperty('--font-size-desc', String(description));
  doc.style.setProperty('--oryx-heading-weight', String(weight));
  doc.style.setProperty('--oryx-label-tracking', `${tracking}em`);
  doc.style.setProperty(
    '--oryx-font-sans',
    settings.fontFamily === 'system'
      ? "system-ui, -apple-system, 'Segoe UI', Arial, sans-serif"
      : "'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif",
  );
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

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
  /** Re-read the company's typography after the settings screen writes it. */
  refreshTypography: () => Promise<void>;
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

  // Typography is per company too, so it is read from the same company context
  // and re-applied whenever the company selector changes. The platform default
  // is applied when no tenant is selected, so a platform principal never sees a
  // previous tenant's type scale linger.
  const loadTypography = useCallback(async () => {
    const doc = typeof document !== 'undefined' ? document.documentElement : null;
    if (!doc) return;
    if (!companyId) {
      applyTypography(doc, COMPANY_SETTING_DEFAULTS.typography);
      return;
    }
    try {
      const section = (await api.companySettingSection('typography', companyId)) as Partial<TypographySettings>;
      applyTypography(doc, { ...COMPANY_SETTING_DEFAULTS.typography, ...section });
    } catch {
      applyTypography(doc, COMPANY_SETTING_DEFAULTS.typography);
    }
  }, [companyId]);

  useEffect(() => {
    if (!isAuthenticated) {
      const doc = typeof document !== 'undefined' ? document.documentElement : null;
      if (doc) applyTypography(doc, COMPANY_SETTING_DEFAULTS.typography);
      return;
    }
    void loadTypography();
  }, [isAuthenticated, loadTypography]);

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
      refreshTypography: loadTypography,
    }),
    [branding, loading, displayName, logoAssetId, cssVariables, isBranded, load, loadTypography],
  );

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext);
  if (!ctx) throw new Error('useBranding must be used inside BrandingProvider');
  return ctx;
}
