'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { publicApi, resolveImage, type StorefrontProduct } from '@/lib/api';
import { useUi } from '@/lib/ui-context';
import { Money } from '@/components/ui';
import { PageHeader } from '@/components/premium';
import { Icon } from '@/components/icons';

/** ORYX inventory-backed public catalogue: published and active products only. */
export default function SparePartsPage() {
  const { t, locale } = useUi();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StorefrontProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageSize = 24;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicApi.storefrontProducts({ page, pageSize, search })
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setTotal(data.total);
      })
      .catch(() => {
        if (active) { setItems([]); setTotal(0); setError(true); }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [search, page]);

  return (
    <div className="oryx-container">
      <PageHeader
        eyebrow={t('brand.tagline')}
        title={t('spareParts.title')}
        subtitle={t('spareParts.subtitle')}
        art="/media/hero-parts.jpg"
      />
      <form role="search" onSubmit={(event) => {
        event.preventDefault();
        setPage(1);
        setSearch(query.trim());
      }} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <input className="oryx-input" aria-label={locale === 'ar' ? 'بحث قطع الغيار' : 'Search parts'}
          value={query} onChange={(event) => setQuery(event.target.value)}
          placeholder={locale === 'ar' ? 'اسم القطعة، الماركة أو رقمها' : 'Part name, brand, or SKU'}
          style={{ flex: '1 1 220px' }} />
        <button className="oryx-btn oryx-btn-primary" type="submit">
          <Icon name="search" size={16} /> {locale === 'ar' ? 'بحث' : 'Search'}
        </button>
      </form>
      {loading ? (
        <p role="status" className="oryx-muted">{locale === 'ar' ? 'جارٍ تحميل المخزون…' : 'Loading inventory…'}</p>
      ) : error ? (
        <p role="alert" className="oryx-muted">{locale === 'ar' ? 'تعذّر تحميل قطع الغيار.' : 'Unable to load spare parts.'}</p>
      ) : items.length === 0 ? (
        <p className="oryx-muted">{t('spareParts.empty')}</p>
      ) : (
        <>
          <div className="oryx-grid oryx-grid--cards">
            {items.map((item) => (
              <Link href={`/spare-parts/${encodeURIComponent(item.id)}`} key={item.id} className="oryx-cat-card">
                {item.image ? (
                  <span className="oryx-cat-card__art" role="img"
                    aria-label={(locale === 'ar' ? item.nameAr : item.nameEn) || item.sku}
                    style={{ backgroundImage: `url("${resolveImage(item.image) ?? ''}")` }} />
                ) : null}
                <span className="oryx-cat-card__body">
                  <strong>{(locale === 'ar' ? item.nameAr : item.nameEn) || item.sku}</strong>
                  <span className="oryx-muted">{item.brand || item.sku}</span>
                  <span><Money minor={item.priceMinor} currency={item.currency} scale={item.currencyScale} /></span>
                  <span className="oryx-muted">{item.inStock ? (locale === 'ar' ? 'متوفر' : 'In stock') : (locale === 'ar' ? 'غير متوفر' : 'Out of stock')}</span>
                  <span className="oryx-cat-card__link">{locale === 'ar' ? 'تفاصيل القطعة' : 'Part details'} <Icon name="arrow" size={14} /></span>
                </span>
              </Link>
            ))}
          </div>
          {total > pageSize ? (
            <nav aria-label={locale === 'ar' ? 'صفحات القطع' : 'Parts pages'}
              style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center', marginTop: 24 }}>
              <button className="oryx-btn" type="button" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
                {locale === 'ar' ? 'السابق' : 'Previous'}
              </button>
              <span>{page} / {Math.ceil(total / pageSize)}</span>
              <button className="oryx-btn" type="button" disabled={page * pageSize >= total} onClick={() => setPage((n) => n + 1)}>
                {locale === 'ar' ? 'التالي' : 'Next'}
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
