'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { useUi } from '@/lib/ui-context';

/* --------------------------------------------------------------- primitives */

export function Card({
  children,
  className,
  title,
  subtitle,
  actions,
}: {
  children?: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={clsx('oryx-card', className)}>
      {(title || actions) && (
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            {title && <h2 className="oryx-card-title">{title}</h2>}
            {subtitle && (
              <p className="oryx-muted" style={{ margin: 0 }}>
                {subtitle}
              </p>
            )}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'default',
  disabled,
  className,
  title,
  ariaLabel,
  testId,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'primary' | 'outline' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
  title?: string;
  ariaLabel?: string;
  testId?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      data-testid={testId}
      className={clsx(
        'oryx-btn',
        variant === 'primary' && 'oryx-btn-primary',
        variant === 'outline' && 'oryx-btn-outline',
        variant === 'ghost' && 'oryx-btn-ghost',
        variant === 'danger' && 'oryx-btn-danger',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="oryx-field">
      <span className="oryx-label">
        {label}
        {required && <span className="oryx-gold"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="oryx-muted" style={{ display: 'block', marginTop: 4 }}>
          {hint}
        </span>
      )}
    </label>
  );
}

const STATUS_TONE: Record<string, string> = {
  CONFIRMED: 'oryx-badge-success',
  COMPLETED: 'oryx-badge-success',
  SUCCEEDED: 'oryx-badge-success',
  ACTIVE: 'oryx-badge-success',
  PAID: 'oryx-badge-success',
  PUBLISHED: 'oryx-badge-success',
  PENDING: 'oryx-badge-warning',
  HELD: 'oryx-badge-warning',
  NEW: 'oryx-badge-info',
  ASSIGNED: 'oryx-badge-info',
  IN_PROGRESS: 'oryx-badge-info',
  DRAFT: 'oryx-badge-info',
  CANCELLED: 'oryx-badge-danger',
  FAILED: 'oryx-badge-danger',
  REJECTED: 'oryx-badge-danger',
  REFUNDED: 'oryx-badge-danger',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={clsx('oryx-badge', STATUS_TONE[status])}>
      {status.replace(/_/g, ' ').toLowerCase()}
    </span>
  );
}

export function Alert({
  children,
  tone = 'error',
}: {
  children: ReactNode;
  tone?: 'error' | 'success';
}) {
  return (
    <div
      className={clsx('oryx-alert', tone === 'success' && 'oryx-alert-success')}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {children}
    </div>
  );
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="oryx-empty">
      <p style={{ margin: '0 0 12px' }}>{message}</p>
      {action}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useUi();
  return <div className="oryx-empty">{label ?? t('common.loading')}</div>;
}

export function SectionHead({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="oryx-section-head">
      <div>
        {eyebrow && <span className="oryx-eyebrow">{eyebrow}</span>}
        <h2 className="oryx-h2">{title}</h2>
        {subtitle && <p className="oryx-lead">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- money */

/** Render a monetary minor-unit amount in the currency's own scale. */
export function Money({
  minor,
  currency = 'BHD',
  scale = 3,
}: {
  minor: number;
  currency?: string;
  scale?: number;
}) {
  const value = minor / 10 ** scale;
  const formatted = value.toLocaleString('en-BH', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  return (
    <span dir="ltr" style={{ whiteSpace: 'nowrap' }}>
      {formatted} {currency}
    </span>
  );
}

export function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="oryx-stars" aria-label={`${rating} / 5`}>
      {'★'.repeat(rounded)}
      {'☆'.repeat(Math.max(0, 5 - rounded))}
    </span>
  );
}

export function formatDate(value: string, locale: 'ar' | 'en'): string {
  return new Date(value).toLocaleString(locale === 'ar' ? 'ar-BH' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatDay(value: string, locale: 'ar' | 'en'): string {
  return new Date(value).toLocaleDateString(locale === 'ar' ? 'ar-BH' : 'en-GB', {
    dateStyle: 'medium',
  });
}

/* ------------------------------------------------------------ hero slider */

export interface HeroSlide {
  image: string;
  alt: string;
  headline: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
  secondaryLabel: string;
  secondaryHref: string;
}

/**
 * The homepage hero: a real, functional image slider.
 *
 * Every slide carries its own photograph, headline, description and calls to
 * action. It advances on a timer, pauses on hover and on focus, supports
 * previous/next controls, pagination, keyboard arrows and touch swipes, and
 * renders the first slide on the server so the hero is never empty.
 */
export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);

  const go = useCallback(
    (next: number) => {
      setIndex(((next % slides.length) + slides.length) % slides.length);
    },
    [slides.length],
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  return (
    <section
      className="oryx-hero"
      data-hero-slider
      aria-roledescription="carousel"
      aria-label="ORYX Auto Services"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={(e) => {
        touchStart.current = e.touches[0].clientX;
      }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(delta) > 45) go(delta < 0 ? index + 1 : index - 1);
        touchStart.current = null;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index - 1);
        if (e.key === 'ArrowLeft') go(index + 1);
      }}
      tabIndex={0}
      data-testid="hero-slider"
    >
      {slides.map((slide, i) => (
        <div
          key={slide.image}
          className="oryx-hero-slide"
          data-active={i === index}
          aria-hidden={i !== index}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={slide.image}
            alt={slide.alt}
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : 'auto'}
          />
        </div>
      ))}

      <div className="oryx-container" style={{ position: 'relative', zIndex: 2, width: '100%' }}>
        {slides.map((slide, i) =>
          i === index ? (
            <div className="oryx-hero-body oryx-hero-slide-fade" key={slide.headline}>
              <h1 className="oryx-h1">{slide.headline}</h1>
              <p>{slide.description}</p>
              <div className="oryx-hero-actions">
                <Link href={slide.ctaHref} className="oryx-btn oryx-btn-primary oryx-btn-lg">
                  {slide.ctaLabel}
                </Link>
                <Link href={slide.secondaryHref} className="oryx-btn oryx-btn-lg oryx-btn-outline">
                  {slide.secondaryLabel}
                </Link>
              </div>
            </div>
          ) : null,
        )}
      </div>

      <div className="oryx-container oryx-hero-controls">
        <div className="oryx-hero-dots" role="tablist" aria-label="Slides">
          {slides.map((slide, i) => (
            <button
              key={slide.image}
              type="button"
              className="oryx-hero-dot"
              aria-current={i === index}
              aria-label={slide.headline}
              role="tab"
              onClick={() => go(i)}
            />
          ))}
        </div>
        <div className="oryx-hero-arrows">
          <button
            type="button"
            className="oryx-hero-arrow"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            type="button"
            className="oryx-hero-arrow"
            onClick={() => go(index + 1)}
            aria-label="Next slide"
          >
            ›
          </button>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ pieces */

export function TrustStrip({
  items,
}: {
  items: Array<{ icon: string; title: string; subtitle: string }>;
}) {
  return (
    <section className="oryx-trust">
      <div className="oryx-container">
        <div className="oryx-trust-grid">
          {items.map((item) => (
            <div className="oryx-trust-item" key={item.title}>
              <span className="oryx-trust-icon" aria-hidden>
                {item.icon}
              </span>
              <span>
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav className="oryx-breadcrumb" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} style={{ display: 'inline-flex', gap: 8 }}>
          {i > 0 && <span aria-hidden>/</span>}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export function PageHead({
  eyebrow,
  title,
  subtitle,
  breadcrumb,
  image,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  breadcrumb?: Array<{ label: string; href?: string }>;
  /** Banner photograph. Falls back to the navy/gold gradient when omitted. */
  image?: string;
  children?: ReactNode;
}) {
  return (
    <section className={`oryx-page-head${image ? ' oryx-page-head--banner' : ''}`}>
      {image ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="oryx-page-head-img" src={image} alt="" aria-hidden fetchPriority="high" />
          <span className="oryx-page-head-veil" aria-hidden />
        </>
      ) : null}
      <div className="oryx-container oryx-page-head-inner">
        {breadcrumb && <Breadcrumb items={breadcrumb} />}
        {eyebrow && <span className="oryx-eyebrow">{eyebrow}</span>}
        <h1 className="oryx-h1" style={{ marginBottom: subtitle ? 8 : 0 }}>
          {title}
        </h1>
        {subtitle && (
          <p className="oryx-lead" style={{ maxWidth: '70ch' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
