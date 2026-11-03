'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { customerApi, publicApi, type CatalogProduct } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Card, Money } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

type ProductDetail = CatalogProduct & {
  images: Array<{ url: string | null }>;
  related: CatalogProduct[];
};

/**
 * One catalogue product.
 *
 * The product is public, so a guest can read it; adding it to the cart requires
 * a session and is refused by the API otherwise. Images resolve to whatever the
 * supplier uploaded — the API serves bytes by asset id, so no storage path is
 * exposed.
 */
export default function ProductDetailPage() {
  const { t, locale } = useUi();
  const { isAuthenticated } = useCustomerAuth();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);
  const [favourite, setFavourite] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setNotFound(false);
    setError(null);
    publicApi
      .product(id, locale)
      .then((res) => {
        if (active) setProduct(res);
      })
      .catch((err) => {
        if (!active) return;
        if (messageOf(err).toLowerCase().includes('not found')) setNotFound(true);
        else setError(messageOf(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, locale]);

  const addToCart = useCallback(async () => {
    if (!product) return;
    setNotice(null);
    setCartError(null);
    if (!isAuthenticated) {
      setCartError(t('products.loginToBuy'));
      return;
    }
    setAdding(true);
    try {
      await customerApi.addCartItem(product.id, 1);
      setNotice(t('products.addedToCart'));
    } catch (err) {
      setCartError(messageOf(err));
    } finally {
      setAdding(false);
    }
  }, [product, isAuthenticated, t]);

  const toggleFavourite = useCallback(async () => {
    if (!product) return;
    setCartError(null);
    if (!isAuthenticated) {
      setCartError(t('products.loginToBuy'));
      return;
    }
    try {
      if (favourite) await customerApi.removeFavorite(product.id);
      else await customerApi.addFavorite(product.id);
      setFavourite((v) => !v);
    } catch (err) {
      setCartError(messageOf(err));
    }
  }, [product, favourite, isAuthenticated, t]);

  if (loading) {
    return (
      <div className="oryx-container">
        <LoadingPanel rows={4} />
      </div>
    );
  }

  if (notFound || !product) {
    return (
      <div className="oryx-container">
        <PageHeader
          title={t('products.title')}
          backHref="/products"
          backLabel={t('products.back')}
        />
        <StatePanel
          tone={error ? 'error' : 'empty'}
          icon={error ? 'alert' : 'cart'}
          title={error ? t('common.error') : t('products.notFound')}
          message={error ?? t('products.noneHint')}
        />
      </div>
    );
  }

  const gallery =
    product.images.length > 0
      ? product.images.map((i) => i.url).filter((u): u is string => Boolean(u))
      : product.imageUrl
        ? [product.imageUrl]
        : [];

  return (
    <div className="oryx-container">
      <PageHeader title={product.name} backHref="/products" backLabel={t('products.back')} />

      <div className="oryx-product-detail">
        <div className="oryx-product-detail__gallery">
          {gallery.length > 0 ? (
            gallery
              .slice(0, 4)
              .map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={product.name} loading="lazy" decoding="async" />
              ))
          ) : (
            <span className="oryx-product-card__placeholder" aria-hidden>
              <Icon name="cart" size={40} />
            </span>
          )}
        </div>

        <Card className="oryx-product-detail__info">
          <p className="oryx-muted">{product.store.name}</p>
          <h2 className="oryx-card-title oryx-product-detail__name">{product.name}</h2>
          <p className="oryx-muted" dir="ltr">
            {product.sku}
          </p>
          <p className="oryx-product-detail__price">
            <Money minor={product.priceMinor} />
          </p>
          <p className="oryx-muted oryx-product-detail__tax">{t('products.taxNote')}</p>
          <p>
            <span
              className={
                product.available ? 'oryx-stock oryx-stock--in' : 'oryx-stock oryx-stock--out'
              }
            >
              {product.available ? t('products.available') : t('products.unavailable')}
            </span>
          </p>

          {notice && <Alert tone="success">{notice}</Alert>}
          {cartError && <Alert>{cartError}</Alert>}

          <div className="oryx-product-detail__actions">
            <button
              type="button"
              className="oryx-btn oryx-btn-primary"
              onClick={() => void addToCart()}
              disabled={adding || !product.available}
            >
              <Icon name="cart" size={16} />
              {t('products.addToCart')}
            </button>
            <button
              type="button"
              className="oryx-btn"
              onClick={() => void toggleFavourite()}
              aria-pressed={favourite}
            >
              <Icon name="heart" size={16} />
              {favourite ? t('favorites.remove') : t('favorites.add')}
            </button>
          </div>
        </Card>
      </div>

      {product.related.length > 0 && (
        <section className="oryx-section">
          <h2 className="oryx-section-title">{t('products.related')}</h2>
          <div className="oryx-grid oryx-grid--cards">
            {product.related.map((item) => (
              <Card key={item.id} className="oryx-product-card">
                <Link href={`/products/${item.id}`} className="oryx-product-card__media">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} loading="lazy" decoding="async" />
                  ) : (
                    <span className="oryx-product-card__placeholder" aria-hidden>
                      <Icon name="cart" size={26} />
                    </span>
                  )}
                </Link>
                <div className="oryx-product-card__body">
                  <h3 className="oryx-card-title">
                    <Link href={`/products/${item.id}`}>{item.name}</Link>
                  </h3>
                  <Money minor={item.priceMinor} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
