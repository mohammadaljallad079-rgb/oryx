'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { customerApi, publicApi, resolveImage, type StorefrontProduct } from '@/lib/api';
import { useCustomerAuth } from '@/lib/auth-context';
import { useUi } from '@/lib/ui-context';
import { useSiteContent } from '@/lib/site-content-context';
import { Money } from '@/components/ui';
import { PageHeader } from '@/components/premium';

export default function SparePartDetailPage() {
  const params = useParams<{ id: string }>();
  const { locale } = useUi();
  const { content } = useSiteContent();
  const { isAuthenticated } = useCustomerAuth();
  const [product, setProduct] = useState<StorefrontProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [fulfilment, setFulfilment] = useState<'COLLECTION' | 'DELIVERY'>('COLLECTION');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER'>('CASH');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [orderError, setOrderError] = useState('');


  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicApi.storefrontProduct(params.id)
      .then((item) => { if (active) setProduct(item); })
      .catch(() => { if (active) { setProduct(null); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params.id]);

  const whatsapp = content.contact.whatsapp.replace(/\D/g, '');
  const name = product ? ((locale === 'ar' ? product.nameAr : product.nameEn) || product.sku) : '';
  const message = locale === 'ar'
    ? `مرحباً، أريد الاستفسار عن قطعة الغيار ${name}، رقم ${product?.sku ?? ''}.`
    : `Hello, I would like to enquire about ${name}, SKU ${product?.sku ?? ''}.`;

  async function submitOrder() {
    if (!product || !isAuthenticated || !product.inStock || busy) return;
    setOrderError('');
    setBusy(true);
    try {
      const qty = Math.min(99, Math.max(1, Math.floor(quantity)));
      const result = await customerApi.placeStorefrontOrder({
        lines: [{ productId: product.id, quantity: qty }],
        fulfilment,
        ...(fulfilment === 'DELIVERY' ? { address: { addressLine1, city } } : {}),
        contactName: contactName.trim(),
        contactPhone: contactPhone.trim(),
        paymentMethod,
        notes: `Requested payment method: ${paymentMethod}`,
      });
      setOrderNumber(result.orderNumber);
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : (locale === 'ar' ? 'تعذّر إرسال الطلب' : 'Could not place order'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oryx-container">
      <PageHeader title={name || (locale === 'ar' ? 'تفاصيل قطعة الغيار' : 'Spare part details')}
        backHref="/spare-parts" backLabel={locale === 'ar' ? 'جميع القطع' : 'All spare parts'} />
      {loading ? (
        <p role="status" className="oryx-muted">{locale === 'ar' ? 'جارٍ تحميل تفاصيل القطعة…' : 'Loading part details…'}</p>
      ) : error || !product ? (
        <p role="alert" className="oryx-muted">{locale === 'ar' ? 'هذه القطعة غير متاحة أو لم تُنشر.' : 'This part is unavailable or unpublished.'}</p>
      ) : (
        <div className="oryx-product-detail">
          <div className="oryx-product-detail__gallery">
            {product.image ? (
              <Image src={resolveImage(product.image) ?? product.image} alt={name} width={960} height={720} unoptimized />
            ) : null}
          </div>
          <div className="oryx-product-detail__info">
            <h2>{name}</h2>
            <p className="oryx-muted">{product.brand ?? ''} · {product.sku}</p>
            <p><Money minor={product.priceMinor} currency={product.currency} scale={product.currencyScale} /></p>
            <p>{product.inStock
              ? (locale === 'ar' ? 'متوفر في المخزون' : 'In stock')
              : (locale === 'ar' ? 'غير متوفر حالياً' : 'Currently out of stock')}</p>
            {product.descriptionAr || product.descriptionEn ? (
              <p>{(locale === 'ar' ? product.descriptionAr : product.descriptionEn) || product.descriptionEn || product.descriptionAr}</p>
            ) : null}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {whatsapp ? (
                <a className="oryx-btn oryx-btn-primary" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`}
                   target="_blank" rel="noopener noreferrer">
                  {locale === 'ar' ? 'استفسار عبر واتساب' : 'Enquire via WhatsApp'}
                </a>
              ) : null}
              <Link href="/spare-parts" className="oryx-btn">{locale === 'ar' ? 'متابعة التصفح' : 'Browse more parts'}</Link>
            </div>
            {product.inStock ? (
              !isAuthenticated ? (
                <p className="oryx-muted">
                  {locale === 'ar' ? 'لإتمام طلب الشراء يرجى ' : 'To order this item, please '}
                  <Link href="/login" className="oryx-link">{locale === 'ar' ? 'تسجيل الدخول' : 'sign in'}</Link>.
                </p>
              ) : orderNumber ? (
                <div role="status" className="oryx-card" style={{ padding: 20, marginTop: 18 }}>
                  <strong>{locale === 'ar' ? 'تم تسجيل طلبك بنجاح' : 'Your order has been recorded'}</strong>
                  <p dir="ltr">{orderNumber}</p>
                  <p className="oryx-muted">{locale === 'ar' ? 'الطلب بانتظار المعالجة، ولم تُخصم أي دفعة إلكترونية.' : 'The order is awaiting processing. No online payment has been charged.'}</p>
                </div>
              ) : (
                <form onSubmit={(event) => { event.preventDefault(); void submitOrder(); }}
                  className="oryx-card" style={{ display: 'grid', gap: 12, padding: 20, marginTop: 18 }}>
                  <h3>{locale === 'ar' ? 'طلب هذه القطعة' : 'Order this part'}</h3>
                  <label>{locale === 'ar' ? 'الكمية' : 'Quantity'}
                    <input className="oryx-input" type="number" min="1" max={Math.min(99, product.onHand)}
                      required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} />
                  </label>
                  <label>{locale === 'ar' ? 'اسم العميل' : 'Contact name'}
                    <input className="oryx-input" required minLength={3} maxLength={120}
                      value={contactName} onChange={(e) => setContactName(e.target.value)} />
                  </label>
                  <label>{locale === 'ar' ? 'الهاتف' : 'Phone'}
                    <input className="oryx-input" type="tel" required minLength={6} maxLength={30}
                      value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                  </label>
                  <label>{locale === 'ar' ? 'طريقة الاستلام' : 'Fulfilment'}
                    <select className="oryx-select" value={fulfilment}
                      onChange={(e) => setFulfilment(e.target.value as 'COLLECTION' | 'DELIVERY')}>
                      <option value="COLLECTION">{locale === 'ar' ? 'الاستلام من الفرع' : 'Store collection'}</option>
                      <option value="DELIVERY">{locale === 'ar' ? 'التوصيل' : 'Delivery'}</option>
                    </select>
                  </label>
                  {fulfilment === 'DELIVERY' ? (
                    <>
                      <label>{locale === 'ar' ? 'عنوان التوصيل' : 'Delivery address'}
                        <input className="oryx-input" required minLength={3} maxLength={120}
                          value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
                      </label>
                      <label>{locale === 'ar' ? 'المدينة' : 'City'}
                        <input className="oryx-input" required minLength={2} maxLength={80}
                          value={city} onChange={(e) => setCity(e.target.value)} />
                      </label>
                    </>
                  ) : null}
                  <label>{locale === 'ar' ? 'طريقة الدفع المطلوبة' : 'Requested payment method'}
                    <select className="oryx-select" value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER')}>
                      <option value="CASH">{locale === 'ar' ? 'نقداً' : 'Cash'}</option>
                      <option value="CARD_TERMINAL">{locale === 'ar' ? 'بطاقة عند الاستلام' : 'Card at collection'}</option>
                      <option value="BANK_TRANSFER">{locale === 'ar' ? 'تحويل بنكي' : 'Bank transfer'}</option>
                    </select>
                  </label>
                  {orderError ? <p role="alert" className="oryx-muted">{orderError}</p> : null}
                  <button type="submit" className="oryx-btn oryx-btn-primary" disabled={busy}>
                    {busy ? (locale === 'ar' ? 'جارٍ إرسال الطلب…' : 'Placing order…') : (locale === 'ar' ? 'تأكيد الطلب' : 'Place order')}
                  </button>
                </form>
              )
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
