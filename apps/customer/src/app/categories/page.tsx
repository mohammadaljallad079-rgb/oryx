'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { categoryImage, publicApi, resolveImage, type CatalogCategory } from '@/lib/api';
import { Card } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Service and product categories.
 *
 * The list is read from the same `ServiceCategory` catalogue the control panel
 * edits, so a category can never appear here that an operator cannot manage.
 * Each card links into the product catalogue and the ORYX service list filtered
 * by that category — both of which the API filters server-side.
 */
export default function CategoriesPage() {
  const { t, locale } = useUi();
  const [categories, setCategories] = useState<CatalogCategory[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    publicApi
      .categories(locale)
      .then((res) => {
        if (active) setCategories(res.items);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [locale]);

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('categories.title')}
        subtitle={t('categories.subtitle')}
      />

      {error ? (
        <StatePanel tone="error" icon="alert" title={t('common.error')} message={t('common.retry')} />
      ) : categories === null ? (
        <LoadingPanel rows={4} />
      ) : categories.length === 0 ? (
        <StatePanel icon="grid" title={t('categories.title')} message={t('categories.none')} />
      ) : (
        <div className="oryx-grid oryx-grid--cards">
          {categories.map((category) => (
            <Card key={category.key} className="oryx-category-card">
              <span
                className="oryx-category-card__art"
                style={{
                  backgroundImage: `url(${resolveImage(category.imageUrl) ?? categoryImage(null, category.key, 'card')})`,
                }}
                aria-hidden
              />
              <h2 className="oryx-card-title">{category.name}</h2>
              <div className="oryx-category-card__actions">
                <Link
                  href={`/products?category=${encodeURIComponent(category.key)}`}
                  className="oryx-btn oryx-btn-sm oryx-btn-primary"
                >
                  <Icon name="cart" size={15} />
                  {t('nav.products')}
                </Link>
                <Link
                  href={`/services?category=${encodeURIComponent(category.key)}`}
                  className="oryx-btn oryx-btn-sm"
                >
                  <Icon name="calendar" size={15} />
                  {t('nav.services')}
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
