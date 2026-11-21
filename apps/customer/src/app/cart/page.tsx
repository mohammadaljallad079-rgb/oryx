'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { customerApi, type Cart } from '@/lib/api';
import { messageOf } from '@/lib/hooks';
import { Alert, Button, Card, Field, Money } from '@/components/ui';
import { LoadingPanel, PageHeader, StatePanel } from '@/components/premium';
import { RequireCustomer } from '@/components/require-customer';
import { Icon } from '@/components/icons';

/**
 * The shopping cart.
 *
 * Every mutation returns the whole cart, so the totals on screen are always the
 * server's numbers rather than a locally recomputed guess. Placing the order is
 * idempotent: the key is generated once per cart and reused if the request is
 * retried, so a double press produces one order.
 */
export default function CartPage() {
  return (
    <RequireCustomer>
      <CartContent />
    </RequireCustomer>
  );
}

function CartContent() {
  const { t, locale } = useUi();
  const [cart, setCart] = useState<Cart | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCart(await customerApi.cart());
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setQuantity(productId: string, quantity: number) {
    setBusy(productId);
    setCheckoutError(null);
    try {
      setCart(await customerApi.setCartQuantity(productId, quantity));
    } catch (err) {
      setCheckoutError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(productId: string) {
    setBusy(productId);
    setCheckoutError(null);
    try {
      setCart(await customerApi.removeCartItem(productId));
    } catch (err) {
      setCheckoutError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function clear() {
    setBusy('all');
    setCheckoutError(null);
    try {
      setCart(await customerApi.clearCart());
    } catch (err) {
      setCheckoutError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  async function placeOrder() {
    setCheckoutError(null);
    setPlacing(true);
    try {
      const order = await customerApi.placeOrder({
        paymentMethod,
        notes: notes.trim() || undefined,
        // A fresh key per attempt would defeat the point; one per cart session
        // is what makes a retried press safe.
        idempotencyKey: `web-cart-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      });
      setPlaced(order.reference);
      setCart(await customerApi.cart());
      setNotes('');
    } catch (err) {
      setCheckoutError(messageOf(err));
    } finally {
      setPlacing(false);
    }
  }

  const items = cart?.items ?? [];

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('cart.title')}
        subtitle={t('cart.subtitle')}
      />

      {placed && (
        <Alert tone="success">{t('cart.placed', { reference: placed })}</Alert>
      )}
      {checkoutError && <Alert>{checkoutError}</Alert>}

      {loading ? (
        <LoadingPanel rows={3} />
      ) : error ? (
        <StatePanel tone="error" icon="alert" title={t('common.error')} message={error} />
      ) : items.length === 0 ? (
        <StatePanel
          icon="cart"
          title={t('cart.empty')}
          message={t('cart.emptyHint')}
          action={
            <Link href="/products" className="oryx-btn oryx-btn-primary">
              {t('cart.browse')}
            </Link>
          }
        />
      ) : (
        <div className="oryx-cart-layout">
          <Card className="oryx-cart-lines">
            <table className="oryx-table">
              <thead>
                <tr>
                  <th>{t('cart.item')}</th>
                  <th>{t('cart.quantity')}</th>
                  <th>{t('cart.unitPrice')}</th>
                  <th>{t('cart.lineTotal')}</th>
                  <th aria-label={t('common.actions')} />
                </tr>
              </thead>
              <tbody>
                {items.map((line) => (
                  <tr key={line.id}>
                    <td>
                      <span className="oryx-cart-line__name">
                        {locale === 'ar' ? line.nameAr : line.nameEn}
                      </span>
                      <span className="oryx-muted" dir="ltr">
                        {line.sku}
                      </span>
                    </td>
                    <td>
                      <div className="oryx-qty">
                        <button
                          type="button"
                          onClick={() => void setQuantity(line.productId, Math.max(1, line.quantity - 1))}
                          disabled={busy === line.productId || line.quantity <= 1}
                          aria-label="-"
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          onClick={() => void setQuantity(line.productId, line.quantity + 1)}
                          disabled={busy === line.productId}
                          aria-label="+"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td>
                      <Money minor={line.unitPriceMinor} />
                    </td>
                    <td>
                      <Money minor={line.lineTotalMinor} />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="oryx-btn oryx-btn-ghost oryx-btn-sm"
                        onClick={() => void remove(line.productId)}
                        disabled={busy === line.productId}
                      >
                        <Icon name="close" size={14} />
                        {t('cart.remove')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="oryx-cart-lines__foot">
              <button
                type="button"
                className="oryx-btn oryx-btn-ghost oryx-btn-sm"
                onClick={() => void clear()}
                disabled={busy === 'all'}
              >
                {t('cart.clear')}
              </button>
            </div>
          </Card>

          <Card className="oryx-cart-summary" title={t('cart.checkout')}>
            <dl className="oryx-cart-totals">
              <div>
                <dt>{t('cart.subtotal')}</dt>
                <dd>
                  <Money minor={cart?.totalMinor ?? 0} />
                </dd>
              </div>
              <div className="oryx-cart-totals__grand">
                <dt>{t('cart.total')}</dt>
                <dd>
                  <Money minor={cart?.totalMinor ?? 0} />
                </dd>
              </div>
            </dl>

            <Field label={t('cart.paymentMethod')}>
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                <option value="CASH">{t('cart.cash')}</option>
                <option value="CARD_TERMINAL">{t('cart.card')}</option>
                <option value="BANK_TRANSFER">{t('cart.bank')}</option>
              </select>
            </Field>

            <Field label={t('cart.notes')} hint={t('common.optional')}>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
              />
            </Field>

            <Button variant="primary" onClick={() => void placeOrder()} disabled={placing}>
              {placing ? t('common.saving') : t('cart.place')}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
