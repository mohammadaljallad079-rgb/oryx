'use client';

import Link from 'next/link';
import { STOREFRONT_SECTIONS, type StorefrontSectionKey } from '@oryx/shared';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { Icon } from '@/components/icons';

export type SectionCounts = Partial<Record<StorefrontSectionKey, number>>;

/**
 * The four public sections, in their approved order.
 *
 * The order and the links come from `STOREFRONT_SECTIONS`, which the navigation
 * and the banners read too, so the homepage, the menu and a banner button can
 * never disagree about what the site offers or where it goes.
 *
 * A count is only rendered when the caller has a real one from the API; an
 * unknown count renders nothing rather than a placeholder number.
 */
export function SectionGrid({ counts }: { counts?: SectionCounts }) {
  const { t, locale } = useUi();
  const { content } = useSiteContent();
  return (
    <div className="oryx-grid oryx-grid--cards" data-testid="section-grid">
      {STOREFRONT_SECTIONS.filter((section) => content.sectionVisibility[section.key] !== false).map((section) => {
        const count = counts?.[section.key];
        const title = locale === 'ar' ? section.titleAr : section.titleEn;
        return (
          <Link
            key={section.key}
            href={section.href}
            className="oryx-cat-card"
            data-testid={`section-card-${section.key}`}
          >
            <span
              className="oryx-cat-card__art"
              role="img"
              aria-label={title}
              style={{ backgroundImage: `url(${section.art})` }}
            />
            <span className="oryx-cat-card__body">
              <strong>{title}</strong>
              <span className="oryx-muted oryx-cat-card__desc">
                {locale === 'ar' ? section.descriptionAr : section.descriptionEn}
              </span>
              {typeof count === 'number' ? (
                <span className="oryx-section-card__count" data-testid={`section-count-${section.key}`}>
                  {count} {t('sections.count')}
                </span>
              ) : null}
              <span className="oryx-cat-card__link">
                {t('sections.open')}
                <Icon name="arrow" size={14} />
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
