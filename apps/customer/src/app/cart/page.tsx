'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCart } from '@/lib/cart-context';
import { publicApi, type PricedCart, type StorefrontProduct } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, EmptyState, Loading, Money, PageHead } from '@/components/ui';

/**
 * The cart.
 *
 * Totals are never computed in the browser: the cart posts its ids and
 * quantities to the server-side quote endpoint and renders what comes back, so
 * the price shown is the price the API would charge.
 */
export default function CartPage() {
  const { t, locale } = useUi();
  const { entries, setQuantity, remove, clear, ready } = useCart();
  const [quote, setQuote] = useState<PricedCart | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<Record<string, StorefrontProduct>>({});

  useEffect(() => {
    if (!ready) return;
    if (entries.length === 0) {
      setQuote(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    publicApi
      .storefrontQuote(entries.map((e) => ({ productId: e.productId, quantity: e.quantity })))
      .then((result) => {
        if (active) setQuote(result);
      })
      .catch((err) => {
        if (active) setError(messageOf(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entries, ready]);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontProducts({ pageSize: 60 })
      .then((result) => {
        if (!active) return;
        setCatalogue(Object.fromEntries(result.items.map((p) => [p.id, p])));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const stockIssue = quote
    ? quote.items.some((item) => {
        const product = catalogue[item.productId];
        return product ? item.quantity > product.onHand : false;
      })
    : false;

  return (
    <>
      <PageHead
        title={t('cart.title')}
        image="/media/hero-parts.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('cart.title') }]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          {entries.length === 0 ? (
            <EmptyState
              message={t('cart.empty')}
              action={
                <Link href="/store" className="oryx-btn oryx-btn-primary">
                  {t('cart.continue')}
                </Link>
              }
            />
          ) : (
            <div className="oryx-cart-layout">
              <div className="oryx-card">
                {quote?.items.map((item) => (
                  <div className="oryx-cart-line" key={item.productId} data-testid="cart-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image} alt={locale === 'ar' ? item.nameAr : item.nameEn} />
                    <div>
                      <Link href={`/store/${item.sku}`} className="oryx-card-title">
                        {locale === 'ar' ? item.nameAr : item.nameEn}
                      </Link>
                      <div className="oryx-product-sku">{item.sku}</div>
                      <div style={{ marginTop: 8, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div className="oryx-qty">
                          <button type="button" onClick={() => setQuantity(item.productId, item.quantity - 1)} aria-label="−">
                            −
                          </button>
                          <input
                            value={item.quantity}
                            onChange={(e) => setQuantity(item.productId, Number(e.target.value) || 1)}
                            aria-label={t('cart.quantity')}
                          />
                          <button type="button" onClick={() => setQuantity(item.productId, item.quantity + 1)} aria-label="+">
                            +
                          </button>
                        </div>
                        <button type="button" className="oryx-btn oryx-btn-danger oryx-btn-sm" onClick={() => remove(item.productId)}>
                          {t('cart.remove')}
                        </button>
                      </div>
                    </div>
                    <div style={{ textAlign: 'end' }}>
                      <div className="oryx-price">
                        <Money minor={item.lineTotalMinor} currency={quote.currency} scale={quote.currencyScale} />
                      </div>
                      <span className="oryx-faint">
                        <Money minor={item.unitPriceMinor} currency={quote.currency} scale={quote.currencyScale} /> ×{' '}
                        {item.quantity}
                      </span>
                    </div>
                  </div>
                ))}

                {loading && <Loading label={t('cart.updating')} />}
                {error && <Alert>{error}</Alert>}
                {stockIssue && <Alert>{t('cart.stockWarning')}</Alert>}

                <div style={{ display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' }}>
                  <Link href="/store" className="oryx-btn">
                    {t('cart.continue')}
                  </Link>
                  <button type="button" className="oryx-btn oryx-btn-ghost" onClick={clear}>
                    {t('store.clearAll')}
                  </button>
                </div>
              </div>

              <aside className="oryx-sticky">
                <div className="oryx-summary" data-testid="cart-summary">
                  <h2 className="oryx-card-title">{t('checkout.summary')}</h2>
                  {quote && (
                    <>
                      <div className="oryx-total-row">
                        <span>{t('cart.subtotal')}</span>
                        <span>
                          <Money minor={quote.subtotalMinor} currency={quote.currency} scale={quote.currencyScale} />
                        </span>
                      </div>
                      {quote.discountMinor > 0 && (
                        <div className="oryx-total-row">
                          <span>{t('cart.discount')}</span>
                          <span>
                            −<Money minor={quote.discountMinor} currency={quote.currency} scale={quote.currencyScale} />
                          </span>
                        </div>
                      )}
                      <div className="oryx-total-row">
                        <span>{t('cart.tax')}</span>
                        <span>
                          <Money minor={quote.taxMinor} currency={quote.currency} scale={quote.currencyScale} />
                        </span>
                      </div>
                      <div className="oryx-total-row oryx-total-row-final">
                        <span>{t('cart.total')}</span>
                        <span data-testid="cart-total">
                          <Money minor={quote.totalMinor} currency={quote.currency} scale={quote.currencyScale} />
                        </span>
                      </div>
                      <Link href="/checkout" className="oryx-btn oryx-btn-primary oryx-btn-lg" style={{ width: '100%', marginTop: 18 }}>
                        {t('cart.checkout')}
                      </Link>
                    </>
                  )}
                </div>
              </aside>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
