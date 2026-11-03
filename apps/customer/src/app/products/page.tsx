'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { customerApi, publicApi, resolveImage, type CatalogCategory, type CatalogProduct, type CatalogStore } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Card, Money, Alert } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { Icon } from '@/components/icons';

/**
 * The product catalogue.
 *
 * Everything on this page is real: the categories and stores come from the same
 * rows the control panel manages, and the products come from
 * `GET /customer/catalog/products`, which filters to active, priced items and
 * never exposes a cost price or a stock quantity.
 *
 * The filters are read from the query string so a link from the categories page
 * or the header search arrives with its filter already applied.
 */
export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container">
          <LoadingPanel rows={4} />
        </div>
      }
    >
      <ProductsCatalog />
    </Suspense>
  );
}

function ProductsCatalog() {
  const { t, locale } = useUi();
  const { isAuthenticated } = useCustomerAuth();
  const params = useSearchParams();

  const category = params.get('category') ?? '';
  const store = params.get('store') ?? '';
  const initialQuery = params.get('query') ?? '';

  const [query, setQuery] = useState(initialQuery);
  const [sort, setSort] = useState<'relevance' | 'price_asc' | 'price_desc' | 'name'>('relevance');
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [stores, setStores] = useState<CatalogStore[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cartError, setCartError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await publicApi.products({
        locale,
        companyId: store || undefined,
        query: query.trim() || undefined,
        sort,
        pageSize: 48,
      });
      setProducts(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [locale, store, query, sort]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    publicApi.categories(locale).then((res) => active && setCategories(res.items)).catch(() => undefined);
    publicApi.stores(locale).then((res) => active && setStores(res.items)).catch(() => undefined);
    return () => {
      active = false;
    };
  }, [locale]);

  async function addToCart(product: CatalogProduct) {
    setNotice(null);
    setCartError(null);
    if (!isAuthenticated) {
      setCartError(t('products.loginToBuy'));
      return;
    }
    setAdding(product.id);
    try {
      await customerApi.addCartItem(product.id, 1);
      setNotice(t('products.addedToCart'));
    } catch (err) {
      setCartError(messageOf(err));
    } finally {
      setAdding(null);
    }
  }

  const categoryName = categories.find((c) => c.key === category)?.name;

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={categoryName ?? t('products.title')}
        subtitle={t('products.subtitle')}
      />

      <div className="oryx-catalog-layout">
        <aside className="oryx-catalog-filters" aria-label={t('products.title')}>
          <form
            className="oryx-catalog-search"
            onSubmit={(e) => {
              e.preventDefault();
              void load();
            }}
          >
            <Icon name="search" size={16} />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              aria-label={t('products.search')}
              data-testid="catalog-search"
            />
          </form>

          <div className="oryx-catalog-group">
            <p className="oryx-catalog-group__title">{t('nav.categories')}</p>
            <Link
              href="/products"
              className="oryx-catalog-filter"
              aria-current={!category ? 'page' : undefined}
            >
              {t('common.all')}
            </Link>
            {categories.map((item) => (
              <Link
                key={item.key}
                href={`/products?category=${encodeURIComponent(item.key)}`}
                className="oryx-catalog-filter"
                aria-current={category === item.key ? 'page' : undefined}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {stores.length > 0 && (
            <div className="oryx-catalog-group">
              <p className="oryx-catalog-group__title">{t('products.store')}</p>
              <Link
                href={category ? `/products?category=${encodeURIComponent(category)}` : '/products'}
                className="oryx-catalog-filter"
                aria-current={!store ? 'page' : undefined}
              >
                {t('products.allStores')}
              </Link>
              {stores.map((item) => {
                const href = `/products?${new URLSearchParams({
                  ...(category ? { category } : {}),
                  store: item.id,
                }).toString()}`;
                return (
                  <Link
                    key={item.id}
                    href={href}
                    className="oryx-catalog-filter"
                    aria-current={store === item.id ? 'page' : undefined}
                  >
                    {locale === 'ar' ? item.nameAr : item.nameEn}
                  </Link>
                );
              })}
            </div>
          )}

          <label className="oryx-catalog-sort">
            <span className="oryx-catalog-group__title">{t('products.sort')}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              data-testid="catalog-sort"
            >
              <option value="relevance">{t('products.sortRelevance')}</option>
              <option value="price_asc">{t('products.sortPriceAsc')}</option>
              <option value="price_desc">{t('products.sortPriceDesc')}</option>
              <option value="name">{t('products.sortName')}</option>
            </select>
          </label>
        </aside>

        <div className="oryx-catalog-results">
          {notice && <Alert tone="success">{notice}</Alert>}
          {cartError && <Alert>{cartError}</Alert>}

          {loading ? (
            <LoadingPanel rows={4} />
          ) : error ? (
            <StatePanel tone="error" icon="alert" title={t('common.error')} message={error} />
          ) : products.length === 0 ? (
            <StatePanel
              icon="cart"
              title={t('products.none')}
              message={t('products.noneHint')}
            />
          ) : (
            <>
              <p className="oryx-muted oryx-catalog-count">
                {t('products.results', { count: total })}
              </p>
              <div className="oryx-grid oryx-grid--cards">
                {products.map((product) => (
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
                      <span
                        className={product.available ? 'oryx-stock oryx-stock--in' : 'oryx-stock oryx-stock--out'}
                      >
                        {product.available ? t('products.available') : t('products.unavailable')}
                      </span>
                    </Link>
                    <div className="oryx-product-card__body">
                      <p className="oryx-muted oryx-product-card__store">
                        {product.store.name}
                      </p>
                      <h2 className="oryx-card-title">
                        <Link href={`/products/${product.id}`}>{product.name}</Link>
                      </h2>
                      <p className="oryx-muted oryx-product-card__sku" dir="ltr">
                        {product.sku}
                      </p>
                      <div className="oryx-product-card__foot">
                        <Money minor={product.priceMinor} />
                        <button
                          type="button"
                          className="oryx-btn oryx-btn-sm oryx-btn-primary"
                          onClick={() => void addToCart(product)}
                          disabled={adding === product.id || !product.available}
                        >
                          <Icon name="plus" size={15} />
                          {t('products.addToCart')}
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
