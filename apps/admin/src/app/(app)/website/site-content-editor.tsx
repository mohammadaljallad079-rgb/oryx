'use client';

import { useEffect, useMemo, useState } from 'react';
import type {
  AboutBlockContent,
  BrandPalette,
  HeroSlideContent,
  SiteContent,
  TrustItemContent,
} from '@oryx/shared';
import { DEFAULT_SITE_CONTENT, resolveSiteContent } from '@oryx/shared';
import { api } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Button, Card, Field } from '@/components/ui';

type Locale = 'ar' | 'en';

/** A titled panel; the admin `Card` is untitled, so this adds a header row. */
function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[15px] font-bold">{title}</h3>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}

const EMPTY_SLIDE: HeroSlideContent = {
  image: '/media/hero-services.jpg',
  altEn: '',
  altAr: '',
  headlineEn: '',
  headlineAr: '',
  descriptionEn: '',
  descriptionAr: '',
  ctaLabelEn: '',
  ctaLabelAr: '',
  ctaHref: '/booking',
  secondaryLabelEn: '',
  secondaryLabelAr: '',
  secondaryHref: '/services',
};

const EMPTY_TRUST: TrustItemContent = {
  icon: '✓',
  titleEn: '',
  titleAr: '',
  subtitleEn: '',
  subtitleAr: '',
};

const EMPTY_BLOCK: AboutBlockContent = { titleEn: '', titleAr: '', bodyEn: '', bodyAr: '' };

/** Deep clone via JSON so edits never mutate the loaded document in place. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Website content editor.
 *
 * Every public-site block — the brand palette, the hero slider, the trust
 * strip, the homepage section headings, the About page, the contact details and
 * the footer — is edited here in both locales and saved as one document per
 * locale. The website merges the saved document over the approved defaults, so
 * clearing a field falls back rather than blanking the page.
 */
export function SiteContentEditor() {
  const { t } = useUi();
  const [locale, setLocale] = useState<Locale>('ar');
  const [doc, setDoc] = useState<SiteContent>(() => clone(DEFAULT_SITE_CONTENT.ar));
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaults = useMemo(() => DEFAULT_SITE_CONTENT[locale], [locale]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSaved(false);
    api
      .siteContent(locale)
      .then((dto) => {
        if (!active) return;
        setDoc(resolveSiteContent(locale, dto.data));
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : t('common.error'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [locale, t]);

  const patch = (updater: (draft: SiteContent) => void) => {
    setDoc((prev) => {
      const next = clone(prev);
      updater(next);
      return next;
    });
    setSaved(false);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const dto = await api.upsertSiteContent(locale, doc);
      setDoc(resolveSiteContent(locale, dto.data));
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-5">
        <p className="oryx-muted">{t('common.loading')}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5" data-testid="site-content-editor">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[20px] font-extrabold tracking-tight">{t('cms.siteContent')}</h2>
          <p className="oryx-muted m-0 mt-1 max-w-[72ch] text-[13px]">{t('cms.siteContentHint')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={locale === 'ar' ? 'primary' : 'ghost'}
                onClick={() => setLocale('ar')}
                data-testid="site-content-locale-ar"
              >
                {t('cms.localeAr')}
              </Button>
              <Button
                size="sm"
                variant={locale === 'en' ? 'primary' : 'ghost'}
                onClick={() => setLocale('en')}
                data-testid="site-content-locale-en"
              >
                {t('cms.localeEn')}
              </Button>
            </div>
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void save()}
              data-testid="site-content-save"
            >
              {busy ? t('common.loading') : t('common.save')}
            </Button>
          </>
        </div>
      </div>

      {error ? (
        <p
          className="rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}
          data-testid="site-content-error"
        >
          {error}
        </p>
      ) : null}
      {saved ? (
        <p
          className="rounded-lg px-3 py-2 text-[12.5px] font-semibold"
          style={{ color: 'var(--success)', background: 'color-mix(in srgb, var(--success) 12%, transparent)' }}
          data-testid="site-content-saved"
        >
          {t('cms.siteContentSaved')}
        </p>
      ) : null}

      {/* ------------------------------------------------------------- brand */}
      <Panel title={t('cms.brand')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('cms.name')} (EN)`}>
            <input
              className="oryx-input"
              value={doc.brand.nameEn}
              onChange={(e) => patch((d) => void (d.brand.nameEn = e.target.value))}
              data-testid="site-brand-name-en"
            />
          </Field>
          <Field label={`${t('cms.name')} (AR)`}>
            <input
              className="oryx-input"
              dir="rtl"
              value={doc.brand.nameAr}
              onChange={(e) => patch((d) => void (d.brand.nameAr = e.target.value))}
            />
          </Field>
          <Field label={`${t('cms.tagline')} (EN)`}>
            <input
              className="oryx-input"
              value={doc.brand.taglineEn}
              onChange={(e) => patch((d) => void (d.brand.taglineEn = e.target.value))}
            />
          </Field>
          <Field label={`${t('cms.tagline')} (AR)`}>
            <input
              className="oryx-input"
              dir="rtl"
              value={doc.brand.taglineAr}
              onChange={(e) => patch((d) => void (d.brand.taglineAr = e.target.value))}
            />
          </Field>
        </div>
      </Panel>

      {/* ----------------------------------------------------------- palette */}
      <Panel title={t('cms.palette')}>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {(
            [
              ['navy', t('cms.navy')],
              ['gold', t('cms.gold')],
              ['ivory', t('cms.ivory')],
              ['goldSoft', t('cms.goldSoft')],
              ['goldDeep', t('cms.goldDeep')],
            ] as Array<[keyof BrandPalette, string]>
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={doc.palette[key]}
                  onChange={(e) => patch((d) => void (d.palette[key] = e.target.value))}
                  style={{ width: 40, height: 34, padding: 0, border: '1px solid var(--border)' }}
                  data-testid={`site-palette-${key}`}
                />
                <input
                  className="oryx-input"
                  dir="ltr"
                  value={doc.palette[key]}
                  onChange={(e) => patch((d) => void (d.palette[key] = e.target.value))}
                />
              </div>
            </Field>
          ))}
        </div>
      </Panel>

      {/* -------------------------------------------------------------- hero */}
      <Panel
        title={t('cms.hero')}
        actions={
          <Button size="sm" onClick={() => patch((d) => void d.hero.slides.push(clone(EMPTY_SLIDE)))} data-testid="site-add-slide">
            {t('cms.addSlide')}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {doc.hero.slides.map((slide, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-4" data-testid={`site-slide-${i}`}>
              <div className="mb-3 flex items-center justify-between">
                <strong>
                  {t('cms.slide')} {i + 1}
                </strong>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={doc.hero.slides.length <= 1}
                  onClick={() => patch((d) => void d.hero.slides.splice(i, 1))}
                >
                  {t('cms.removeSlide')}
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('cms.imageUrl')}>
                  <input
                    className="oryx-input"
                    dir="ltr"
                    value={slide.image}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].image = e.target.value))}
                  />
                </Field>
                <Field label={t('cms.link')}>
                  <input
                    className="oryx-input"
                    dir="ltr"
                    value={slide.ctaHref}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].ctaHref = e.target.value))}
                  />
                </Field>
                <Field label={`${t('cms.titleField')} (EN)`}>
                  <input
                    className="oryx-input"
                    value={slide.headlineEn}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].headlineEn = e.target.value))}
                  />
                </Field>
                <Field label={`${t('cms.titleField')} (AR)`}>
                  <input
                    className="oryx-input"
                    dir="rtl"
                    value={slide.headlineAr}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].headlineAr = e.target.value))}
                  />
                </Field>
                <Field label={`Description (EN)`}>
                  <textarea
                    className="oryx-textarea"
                    rows={2}
                    value={slide.descriptionEn}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].descriptionEn = e.target.value))}
                  />
                </Field>
                <Field label={`Description (AR)`}>
                  <textarea
                    className="oryx-textarea"
                    rows={2}
                    dir="rtl"
                    value={slide.descriptionAr}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].descriptionAr = e.target.value))}
                  />
                </Field>
                <Field label={`CTA (EN)`}>
                  <input
                    className="oryx-input"
                    value={slide.ctaLabelEn}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].ctaLabelEn = e.target.value))}
                  />
                </Field>
                <Field label={`CTA (AR)`}>
                  <input
                    className="oryx-input"
                    dir="rtl"
                    value={slide.ctaLabelAr}
                    onChange={(e) => patch((d) => void (d.hero.slides[i].ctaLabelAr = e.target.value))}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ------------------------------------------------------------- trust */}
      <Panel
        title={t('cms.trust')}
        actions={
          <Button size="sm" onClick={() => patch((d) => void d.trust.items.push(clone(EMPTY_TRUST)))} data-testid="site-add-trust">
            {t('cms.addTrust')}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {doc.trust.items.map((item, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-4" data-testid={`site-trust-${i}`}>
              <div className="mb-3 flex items-center justify-between">
                <Field label={t('cms.icon')}>
                  <input
                    className="oryx-input"
                    style={{ width: 70 }}
                    value={item.icon}
                    onChange={(e) => patch((d) => void (d.trust.items[i].icon = e.target.value))}
                  />
                </Field>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => patch((d) => void d.trust.items.splice(i, 1))}
                >
                  {t('cms.removeTrust')}
                </Button>
              </div>
              <div className="grid gap-3">
                <Field label={`${t('cms.titleField')} (EN)`}>
                  <input
                    className="oryx-input"
                    value={item.titleEn}
                    onChange={(e) => patch((d) => void (d.trust.items[i].titleEn = e.target.value))}
                  />
                </Field>
                <Field label={`${t('cms.titleField')} (AR)`}>
                  <input
                    className="oryx-input"
                    dir="rtl"
                    value={item.titleAr}
                    onChange={(e) => patch((d) => void (d.trust.items[i].titleAr = e.target.value))}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ---------------------------------------------------------- sections */}
      <Panel title={t('cms.sections')}>
        <div className="flex flex-col gap-4">
          {(
            [
              ['services', t('home.services')],
              ['categories', t('home.categories')],
              ['featured', t('home.featured')],
              ['offers', t('home.offers')],
              ['branches', t('home.branches')],
              ['cta', t('booking.title')],
            ] as Array<[keyof SiteContent['sections'], string]>
          ).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-[var(--border)] p-4">
              <strong className="mb-2 block">{label}</strong>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`${t('cms.titleField')} (EN)`}>
                  <input
                    className="oryx-input"
                    value={doc.sections[key].titleEn}
                    onChange={(e) => patch((d) => void (d.sections[key].titleEn = e.target.value))}
                    data-testid={`site-section-${key}-title-en`}
                  />
                </Field>
                <Field label={`${t('cms.titleField')} (AR)`}>
                  <input
                    className="oryx-input"
                    dir="rtl"
                    value={doc.sections[key].titleAr}
                    onChange={(e) => patch((d) => void (d.sections[key].titleAr = e.target.value))}
                  />
                </Field>
                <Field label={`Subtitle (EN)`}>
                  <input
                    className="oryx-input"
                    value={doc.sections[key].subtitleEn}
                    onChange={(e) => patch((d) => void (d.sections[key].subtitleEn = e.target.value))}
                  />
                </Field>
                <Field label={`Subtitle (AR)`}>
                  <input
                    className="oryx-input"
                    dir="rtl"
                    value={doc.sections[key].subtitleAr}
                    onChange={(e) => patch((d) => void (d.sections[key].subtitleAr = e.target.value))}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ------------------------------------------------------------- about */}
      <Panel
        title={t('cms.about')}
        actions={
          <Button size="sm" onClick={() => patch((d) => void d.about.blocks.push(clone(EMPTY_BLOCK)))} data-testid="site-add-block">
            {t('cms.addBlock')}
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t('cms.titleField')} (EN)`}>
            <input
              className="oryx-input"
              value={doc.about.titleEn}
              onChange={(e) => patch((d) => void (d.about.titleEn = e.target.value))}
            />
          </Field>
          <Field label={`${t('cms.titleField')} (AR)`}>
            <input
              className="oryx-input"
              dir="rtl"
              value={doc.about.titleAr}
              onChange={(e) => patch((d) => void (d.about.titleAr = e.target.value))}
            />
          </Field>
          <Field label={t('cms.imageUrl')}>
            <input
              className="oryx-input"
              dir="ltr"
              value={doc.about.image}
              onChange={(e) => patch((d) => void (d.about.image = e.target.value))}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {doc.about.blocks.map((block, i) => (
            <div key={i} className="rounded-lg border border-[var(--border)] p-4" data-testid={`site-about-block-${i}`}>
              <div className="mb-3 flex items-center justify-between">
                <strong>
                  {t('cms.addBlock')} {i + 1}
                </strong>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => patch((d) => void d.about.blocks.splice(i, 1))}
                >
                  {t('cms.removeBlock')}
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={`${t('cms.titleField')} (EN)`}>
                  <input
                    className="oryx-input"
                    value={block.titleEn}
                    onChange={(e) => patch((d) => void (d.about.blocks[i].titleEn = e.target.value))}
                  />
                </Field>
                <Field label={`${t('cms.titleField')} (AR)`}>
                  <input
                    className="oryx-input"
                    dir="rtl"
                    value={block.titleAr}
                    onChange={(e) => patch((d) => void (d.about.blocks[i].titleAr = e.target.value))}
                  />
                </Field>
                <Field label="Body (EN)">
                  <textarea
                    className="oryx-textarea"
                    rows={2}
                    value={block.bodyEn}
                    onChange={(e) => patch((d) => void (d.about.blocks[i].bodyEn = e.target.value))}
                  />
                </Field>
                <Field label="Body (AR)">
                  <textarea
                    className="oryx-textarea"
                    rows={2}
                    dir="rtl"
                    value={block.bodyAr}
                    onChange={(e) => patch((d) => void (d.about.blocks[i].bodyAr = e.target.value))}
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ----------------------------------------------------------- contact */}
      <Panel title={t('cms.contact')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('contact.phone')}>
            <input
              className="oryx-input"
              dir="ltr"
              value={doc.contact.phone}
              onChange={(e) => patch((d) => void (d.contact.phone = e.target.value))}
              data-testid="site-contact-phone"
            />
          </Field>
          <Field label={t('contact.email')}>
            <input
              className="oryx-input"
              dir="ltr"
              value={doc.contact.email}
              onChange={(e) => patch((d) => void (d.contact.email = e.target.value))}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className="oryx-input"
              dir="ltr"
              value={doc.contact.whatsapp}
              onChange={(e) => patch((d) => void (d.contact.whatsapp = e.target.value))}
            />
          </Field>
          <Field label={`${t('contact.address')} (EN)`}>
            <input
              className="oryx-input"
              value={doc.contact.addressEn}
              onChange={(e) => patch((d) => void (d.contact.addressEn = e.target.value))}
            />
          </Field>
          <Field label={`${t('contact.address')} (AR)`}>
            <input
              className="oryx-input"
              dir="rtl"
              value={doc.contact.addressAr}
              onChange={(e) => patch((d) => void (d.contact.addressAr = e.target.value))}
            />
          </Field>
          <Field label={`${t('contact.hours')} (EN)`}>
            <input
              className="oryx-input"
              value={doc.contact.hoursEn}
              onChange={(e) => patch((d) => void (d.contact.hoursEn = e.target.value))}
            />
          </Field>
          <Field label={`${t('contact.hours')} (AR)`}>
            <input
              className="oryx-input"
              dir="rtl"
              value={doc.contact.hoursAr}
              onChange={(e) => patch((d) => void (d.contact.hoursAr = e.target.value))}
            />
          </Field>
          {(
            ['instagram', 'facebook', 'twitter', 'youtube', 'linkedin'] as const
          ).map((key) => (
            <Field key={key} label={key.charAt(0).toUpperCase() + key.slice(1)}>
              <input
                className="oryx-input"
                dir="ltr"
                value={doc.contact.social[key]}
                onChange={(e) => patch((d) => void (d.contact.social[key] = e.target.value))}
              />
            </Field>
          ))}
        </div>
      </Panel>

      {/* ------------------------------------------------------------ footer */}
      <Panel title={t('cms.footer')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`Intro (EN)`}>
            <textarea
              className="oryx-textarea"
              rows={3}
              value={doc.footer.introEn}
              onChange={(e) => patch((d) => void (d.footer.introEn = e.target.value))}
              data-testid="site-footer-intro-en"
            />
          </Field>
          <Field label={`Intro (AR)`}>
            <textarea
              className="oryx-textarea"
              rows={3}
              dir="rtl"
              value={doc.footer.introAr}
              onChange={(e) => patch((d) => void (d.footer.introAr = e.target.value))}
            />
          </Field>
        </div>
      </Panel>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => {
            setDoc(clone(defaults));
            setSaved(false);
          }}
          data-testid="site-content-restore-defaults"
        >
          {t('cms.restoreDefaults')}
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void save()} data-testid="site-content-save-bottom">
          {busy ? t('common.loading') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
