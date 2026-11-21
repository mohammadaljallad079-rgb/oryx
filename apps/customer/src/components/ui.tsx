'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_CURRENCY } from '@oryx/shared';
import { useUi, type Translator } from '@/lib/ui-context';

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
            {subtitle && <p className="oryx-muted" style={{ margin: 0 }}>{subtitle}</p>}
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
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'oryx-btn',
        variant === 'primary' && 'oryx-btn-primary',
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
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="oryx-field">
      <span className="oryx-label">{label}</span>
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

/**
 * Render a raw API status as a localised badge.
 *
 * The API returns an enum (`HELD`, `IN_PROGRESS`); showing it verbatim leaked
 * English into the Arabic interface. Every label comes from the dictionary and
 * falls back to the de-underscored value only for a status the dictionary has
 * not seen yet, so a new server enum degrades to a readable word rather than
 * disappearing.
 */
export function StatusBadge({ status }: { status: string }) {
  const { t } = useUi();
  const key = `status.${status}`;
  const label = t(key);
  return (
    <span className={clsx('oryx-badge', STATUS_TONE[status])}>
      {label === key ? status.replace(/_/g, ' ').toLowerCase() : label}
    </span>
  );
}

/** Render a booking type enum (`INSPECTION`) through the dictionary. */
export function bookingTypeLabel(t: Translator, value: string): string {
  const key = `bookingType.${value}`;
  const label = t(key);
  return label === key ? value.replace(/_/g, ' ').toLowerCase() : label;
}

export function Alert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' }) {
  return <div className={clsx('oryx-alert', tone === 'success' && 'oryx-alert-success')}>{children}</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="oryx-empty">{message}</div>;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useUi();
  return <div className="oryx-empty">{label ?? t('common.loading')}</div>;
}

/** Render a monetary minor-unit amount in the currency's own scale. */
export function Money({ minor, currency = DEFAULT_CURRENCY, scale = 3 }: { minor: number; currency?: string; scale?: number }) {
  const value = minor / 10 ** scale;
  const formatted = value.toLocaleString('en-BH', {
    minimumFractionDigits: scale,
    maximumFractionDigits: scale,
  });
  return (
    <span dir="ltr">
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

  if (slides.length === 0) return null;

  return (
    <section
      className="oryx-hero oryx-hero--slider"
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

      <div className="oryx-hero__content">
        {slides.map((slide, i) =>
          i === index ? (
            <div className="oryx-hero__body oryx-hero-slide-fade" key={slide.headline}>
              <h1 className="oryx-hero__title">{slide.headline}</h1>
              <p className="oryx-hero__lede">{slide.description}</p>
              <div className="oryx-hero__actions">
                <Link href={slide.ctaHref} className="oryx-btn oryx-btn-primary oryx-btn-lg">
                  {slide.ctaLabel}
                </Link>
                {slide.secondaryLabel ? (
                  <Link href={slide.secondaryHref} className="oryx-btn oryx-btn-lg oryx-btn-secondary">
                    {slide.secondaryLabel}
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null,
        )}
      </div>

      <div className="oryx-hero__controls">
        <div className="oryx-hero__dots" role="tablist" aria-label="Slides">
          {slides.map((slide, i) => (
            <button
              key={slide.image}
              type="button"
              className="oryx-hero__dot"
              aria-current={i === index}
              aria-label={slide.headline}
              role="tab"
              onClick={() => go(i)}
            />
          ))}
        </div>
        <div className="oryx-hero__arrows">
          <button
            type="button"
            className="oryx-hero__arrow"
            onClick={() => go(index - 1)}
            aria-label="Previous slide"
          >
            ‹
          </button>
          <button
            type="button"
            className="oryx-hero__arrow"
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

/** The trust strip under the hero, driven by the editable site document. */
export function TrustStrip({
  items,
}: {
  items: Array<{ icon: string; title: string; subtitle: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <section className="oryx-trust" data-testid="trust-strip">
      <div className="oryx-trust-grid">
        {items.map((item) => (
          <div className="oryx-trust-item" key={item.title}>
            <span className="oryx-trust-icon" aria-hidden>
              {item.icon}
            </span>
            <span className="oryx-trust-text">
              <strong>{item.title}</strong>
              <span>{item.subtitle}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
