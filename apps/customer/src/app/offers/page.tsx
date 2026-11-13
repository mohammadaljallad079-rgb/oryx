'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { publicApi, type StorefrontProduct } from '@/lib/api';
import { EmptyState, Loading, PageHead } from '@/components/ui';
import { ProductGrid } from '@/components/storefront';

/**
 * Offers.
 *
 * Every item here carries a real `compareAtPriceMinor` in the catalogue, so the
 * discount shown is the discount the database records — nothing is invented.
 */
export default function OffersPage() {
  const { t } = useUi();
  const [offers, setOffers] = useState<StorefrontProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontOffers(24)
      .then((rows) => {
        if (active) setOffers(rows);
      })
      .catch(() => {
        if (active) setOffers([]);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <>
      <PageHead
        eyebrow={t('nav.offers')}
        title={t('offers.title')}
        subtitle={t('offers.subtitle')}
        image="/media/cat-oil.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.offers') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container">
          {loading ? (
            <Loading />
          ) : offers.length === 0 ? (
            <EmptyState
              message={t('offers.none')}
              action={
                <Link href="/store" className="oryx-btn">
                  {t('nav.store')}
                </Link>
              }
            />
          ) : (
            <ProductGrid products={offers} />
          )}
        </div>
      </section>
    </>
  );
}
