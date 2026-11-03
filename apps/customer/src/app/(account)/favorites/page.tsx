'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi, resolveImage } from '@/lib/api';
import { messageOf, useAsync } from '@/lib/hooks';
import { Alert, Card, Money } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * Saved products.
 *
 * Favourites are per account and resolved from the bearer token, so the list is
 * never another customer's.
 */
export default function FavoritesPage() {
  const { t } = useUi();
  const favourites = useAsync(() => customerApi.favorites(), []);
  const [error, setError] = useState<string | null>(null);

  async function remove(productId: string) {
    setError(null);
    try {
      await customerApi.removeFavorite(productId);
      await favourites.reload();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  const items = favourites.data?.items ?? [];

  return (
    <div className="oryx-account-page">
      <PageHeader
        eyebrow={t('account.nav.sectionActivity')}
        title={t('favorites.title')}
        subtitle={t('favorites.subtitle')}
      />

      {error && <Alert>{error}</Alert>}

      {favourites.loading ? (
        <LoadingPanel rows={3} />
      ) : favourites.error ? (
        <StatePanel tone="error" icon="alert" title={t('common.error')} message={favourites.error} />
      ) : items.length === 0 ? (
        <StatePanel
          icon="heart"
          title={t('favorites.none')}
          message={t('favorites.noneHint')}
          action={
            <Link href="/products" className="oryx-btn oryx-btn-primary">
              {t('cart.browse')}
            </Link>
          }
        />
      ) : (
        <div className="oryx-grid oryx-grid--cards">
          {items.map((product) => (
            <Card key={product.id} className="oryx-product-card">
              <Link href={`/products/${product.id}`} className="oryx-product-card__media">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={resolveImage(product.imageUrl) ?? ''} alt={product.name} loading="lazy" decoding="async" />
                ) : (
                  <span className="oryx-product-card__placeholder" aria-hidden>
                    <Icon name="cart" size={26} />
                  </span>
                )}
              </Link>
              <div className="oryx-product-card__body">
                <h2 className="oryx-card-title">
                  <Link href={`/products/${product.id}`}>{product.name}</Link>
                </h2>
                <Money minor={product.priceMinor} />
                <button
                  type="button"
                  className="oryx-btn oryx-btn-ghost oryx-btn-sm"
                  onClick={() => void remove(product.id)}
                >
                  <Icon name="close" size={14} />
                  {t('favorites.remove')}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
