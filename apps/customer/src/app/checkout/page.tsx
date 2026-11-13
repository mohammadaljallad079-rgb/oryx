'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { useCart } from '@/lib/cart-context';
import { useCustomerAuth } from '@/lib/auth-context';
import { customerApi, publicApi, type PricedCart, type StorefrontBranch, type WebOrder } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, EmptyState, Field, Loading, Money, PageHead } from '@/components/ui';

type Fulfilment = 'COLLECTION' | 'DELIVERY';
type PaymentMethod = 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER';

/**
 * Checkout.
 *
 * The order is placed through the authenticated storefront endpoint, which
 * re-prices the basket server-side and records it against the signed-in
 * customer. No payment is taken here: the API never marks an intent paid
 * without a verified provider confirmation, so this screen only records the
 * chosen method.
 */
export default function CheckoutPage() {
  const { t, locale } = useUi();
  const { entries, clear, ready } = useCart();
  const { isAuthenticated, loading: authLoading, profile } = useCustomerAuth();

  const [quote, setQuote] = useState<PricedCart | null>(null);
  const [branches, setBranches] = useState<StorefrontBranch[]>([]);
  const [fulfilment, setFulfilment] = useState<Fulfilment>('COLLECTION');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [branchId, setBranchId] = useState('');
  const [form, setForm] = useState({
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    notes: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    area: '',
    postalCode: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<WebOrder | null>(null);

  useEffect(() => {
    if (profile) {
      setForm((prev) => ({
        ...prev,
        contactName: prev.contactName || profile.fullName || '',
        contactEmail: prev.contactEmail || profile.email || '',
        contactPhone: prev.contactPhone || profile.phone || '',
      }));
    }
  }, [profile]);

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontBranches()
      .then((branchRows) => {
        if (!active) return;
        const published = branchRows.filter((b) => b.isPublished);
        setBranches(published);
        if (published[0]) setBranchId(published[0].id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!ready || !isAuthenticated || entries.length === 0) return;
    let active = true;
    customerApi
      .quoteCart(entries.map((e) => ({ productId: e.productId, quantity: e.quantity })))
      .then((result) => {
        if (active) setQuote(result);
      })
      .catch((err) => {
        if (active) setError(messageOf(err));
      });
    return () => {
      active = false;
    };
  }, [entries, ready, isAuthenticated]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await customerApi.placeOrder({
        lines: entries.map((e) => ({ productId: e.productId, quantity: e.quantity })),
        fulfilment,
        branchId: branchId || undefined,
        address:
          fulfilment === 'DELIVERY'
            ? {
                addressLine1: form.addressLine1.trim(),
                addressLine2: form.addressLine2.trim() || undefined,
                city: form.city.trim(),
                area: form.area.trim() || undefined,
                postalCode: form.postalCode.trim() || undefined,
              }
            : undefined,
        contactName: form.contactName.trim(),
        contactPhone: form.contactPhone.trim(),
        contactEmail: form.contactEmail.trim() || undefined,
        notes: form.notes.trim() || undefined,
        paymentMethod,
      });
      setOrder(result);
      clear();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <div className="oryx-container oryx-section">
        <Loading />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <>
        <PageHead title={t('checkout.title')} />
        <section className="oryx-section">
          <div className="oryx-container" style={{ maxWidth: 560 }}>
            <EmptyState
              message={t('cart.requiresLogin')}
              action={
                <Link href="/login?next=/checkout" className="oryx-btn oryx-btn-primary">
                  {t('nav.login')}
                </Link>
              }
            />
          </div>
        </section>
      </>
    );
  }

  if (order) {
    return (
      <>
        <PageHead title={t('checkout.title')} />
        <section className="oryx-section">
          <div className="oryx-container" style={{ maxWidth: 720 }}>
            <div className="oryx-card" data-testid="order-success">
              <span className="oryx-badge oryx-badge-success">{t('checkout.successTitle')}</span>
              <p style={{ marginTop: 16 }}>{t('checkout.successBody')}</p>
              <div className="oryx-spec-list" style={{ margin: '20px 0' }}>
                <div className="oryx-spec-row">
                  <dt>{t('checkout.orderNumber')}</dt>
                  <dd data-testid="order-number">{order.orderNumber}</dd>
                </div>
                <div className="oryx-spec-row">
                  <dt>{t('cart.total')}</dt>
                  <dd>
                    <Money minor={order.totalMinor} currency={order.currency} scale={order.currencyScale} />
                  </dd>
                </div>
                <div className="oryx-spec-row">
                  <dt>{t('checkout.fulfilment')}</dt>
                  <dd>{order.fulfilment === 'COLLECTION' ? t('checkout.collection') : t('checkout.delivery')}</dd>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <Link href="/account/orders" className="oryx-btn oryx-btn-primary">
                  {t('checkout.viewOrders')}
                </Link>
                <Link href="/store" className="oryx-btn">
                  {t('cart.continue')}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </>
    );
  }

  if (entries.length === 0) {
    return (
      <>
        <PageHead title={t('checkout.title')} />
        <section className="oryx-section">
          <div className="oryx-container">
            <EmptyState
              message={t('cart.empty')}
              action={
                <Link href="/store" className="oryx-btn oryx-btn-primary">
                  {t('cart.continue')}
                </Link>
              }
            />
          </div>
        </section>
      </>
    );
  }

  const canSubmit =
    form.contactName.trim().length >= 3 &&
    form.contactPhone.trim().length >= 6 &&
    (fulfilment === 'COLLECTION' ||
      (form.addressLine1.trim().length >= 3 && form.city.trim().length >= 2));

  return (
    <>
      <PageHead
        title={t('checkout.title')}
        image="/media/hero-parts.jpg"
        breadcrumb={[
          { label: t('common.home'), href: '/' },
          { label: t('cart.title'), href: '/cart' },
          { label: t('checkout.title') },
        ]}
      />

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-cart-layout">
            <div>
              {error && (
                <div style={{ marginBottom: 16 }}>
                  <Alert>{error}</Alert>
                </div>
              )}

              <div className="oryx-card" style={{ marginBottom: 20 }}>
                <h2 className="oryx-card-title">{t('checkout.fulfilment')}</h2>
                <div className="oryx-choice-grid" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="oryx-choice"
                    aria-pressed={fulfilment === 'COLLECTION'}
                    onClick={() => setFulfilment('COLLECTION')}
                    data-testid="fulfilment-collection"
                  >
                    <strong>{t('checkout.collection')}</strong>
                  </button>
                  <button
                    type="button"
                    className="oryx-choice"
                    aria-pressed={fulfilment === 'DELIVERY'}
                    onClick={() => setFulfilment('DELIVERY')}
                    data-testid="fulfilment-delivery"
                  >
                    <strong>{t('checkout.delivery')}</strong>
                  </button>
                </div>
              </div>

              <div className="oryx-card" style={{ marginBottom: 20 }}>
                <h2 className="oryx-card-title">{t('checkout.branch')}</h2>
                <select
                  className="oryx-select"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  style={{ marginTop: 12 }}
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {locale === 'ar' ? branch.nameAr : branch.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              {fulfilment === 'DELIVERY' && (
                <fieldset className="oryx-fieldset">
                  <legend>{t('checkout.address')}</legend>
                  <Field label={t('checkout.addressLine')} required>
                    <input
                      className="oryx-input"
                      value={form.addressLine1}
                      onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
                    />
                  </Field>
                  <Field label={t('checkout.addressLine2')}>
                    <input
                      className="oryx-input"
                      value={form.addressLine2}
                      onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                    />
                  </Field>
                  <div className="oryx-form-grid">
                    <Field label={t('checkout.city')} required>
                      <input
                        className="oryx-input"
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    </Field>
                    <Field label={t('checkout.area')}>
                      <input
                        className="oryx-input"
                        value={form.area}
                        onChange={(e) => setForm({ ...form, area: e.target.value })}
                      />
                    </Field>
                    <Field label={t('checkout.postal')}>
                      <input
                        className="oryx-input"
                        value={form.postalCode}
                        onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
                        dir="ltr"
                      />
                    </Field>
                  </div>
                </fieldset>
              )}

              <fieldset className="oryx-fieldset">
                <legend>{t('checkout.contact')}</legend>
                <div className="oryx-form-grid">
                  <Field label={t('checkout.name')} required>
                    <input
                      className="oryx-input"
                      value={form.contactName}
                      onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                      data-testid="checkout-name"
                    />
                  </Field>
                  <Field label={t('checkout.phone')} required>
                    <input
                      className="oryx-input"
                      value={form.contactPhone}
                      onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                      dir="ltr"
                      data-testid="checkout-phone"
                    />
                  </Field>
                  <Field label={t('checkout.email')}>
                    <input
                      className="oryx-input"
                      type="email"
                      value={form.contactEmail}
                      onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                      dir="ltr"
                    />
                  </Field>
                </div>
                <Field label={t('checkout.notes')}>
                  <textarea
                    className="oryx-textarea"
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </Field>
              </fieldset>

              <fieldset className="oryx-fieldset">
                <legend>{t('checkout.payment')}</legend>
                <div className="oryx-choice-grid">
                  {(
                    [
                      ['CASH', t('checkout.payCash')],
                      ['CARD_TERMINAL', t('checkout.payCard')],
                      ['BANK_TRANSFER', t('checkout.payTransfer')],
                    ] as Array<[PaymentMethod, string]>
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className="oryx-choice"
                      aria-pressed={paymentMethod === value}
                      onClick={() => setPaymentMethod(value)}
                    >
                      <strong>{label}</strong>
                    </button>
                  ))}
                </div>
                <p className="oryx-faint" style={{ marginTop: 12 }}>
                  {t('checkout.noPaymentNote')}
                </p>
              </fieldset>
            </div>

            <aside className="oryx-sticky">
              <div className="oryx-summary">
                <h2 className="oryx-card-title">{t('checkout.summary')}</h2>
                {quote ? (
                  <>
                    {quote.items.map((item) => (
                      <div className="oryx-summary-row" key={item.productId}>
                        <span className="oryx-muted">
                          {locale === 'ar' ? item.nameAr : item.nameEn} × {item.quantity}
                        </span>
                        <span>
                          <Money
                            minor={item.lineTotalMinor}
                            currency={quote.currency}
                            scale={quote.currencyScale}
                          />
                        </span>
                      </div>
                    ))}
                    <div className="oryx-total-row" style={{ marginTop: 10 }}>
                      <span>{t('cart.subtotal')}</span>
                      <span>
                        <Money minor={quote.subtotalMinor} currency={quote.currency} scale={quote.currencyScale} />
                      </span>
                    </div>
                    <div className="oryx-total-row">
                      <span>{t('cart.tax')}</span>
                      <span>
                        <Money minor={quote.taxMinor} currency={quote.currency} scale={quote.currencyScale} />
                      </span>
                    </div>
                    <div className="oryx-total-row oryx-total-row-final">
                      <span>{t('cart.total')}</span>
                      <span>
                        <Money minor={quote.totalMinor} currency={quote.currency} scale={quote.currencyScale} />
                      </span>
                    </div>
                    <Button
                      variant="primary"
                      className="oryx-btn-lg"
                      disabled={!canSubmit || busy}
                      onClick={() => void submit()}
                      testId="place-order"
                    >
                      {busy ? t('common.loading') : t('checkout.placeOrder')}
                    </Button>
                  </>
                ) : (
                  <Loading />
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </>
  );
}
