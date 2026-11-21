'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUi } from '@/lib/ui-context';
import { publicApi, resolveImage, type CatalogProduct } from '@/lib/api';
import { Icon } from '@/components/icons';
import { Money } from '@/components/ui';
import { PageHeader } from '@/components/premium';

/** Public, live ERP-backed catalogue. Never uses seed/preview data in production. */
export default function ProductsPage() {
  const { locale } = useUi();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageSize = 24;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    publicApi.products({ locale, query: search || undefined, page, pageSize })
      .then((response) => {
        if (!active) return;
        setItems(response.items);
        setTotal(response.total);
      })
      .catch(() => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [locale, search, page]);

  return (
    <div className="oryx-container">
      <PageHeader
        title={locale === 'ar' ? 'المنتجات وقطع الغيار' : 'Products & Spare Parts'}
        subtitle={locale === 'ar' ? 'تصفح المنتجات المتاحة والمنشورة من لوحة التحكم' : 'Browse products published from the control panel'}
      />
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setSearch(query.trim());
        }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}
      >
        <input
          className="oryx-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={locale === 'ar' ? 'ابحث عن منتج أو قطعة غيار' : 'Search products and spare parts'}
          aria-label={locale === 'ar' ? 'بحث المنتجات' : 'Search products'}
          style={{ flex: '1 1 220px' }}
        />
        <button type="submit" className="oryx-btn oryx-btn-primary">
          <Icon name="search" size={16} />
          {locale === 'ar' ? 'بحث' : 'Search'}
        </button>
      </form>
      {loading ? (
        <p className="oryx-muted" role="status">{locale === 'ar' ? 'جارٍ تحميل المنتجات…' : 'Loading products…'}</p>
      ) : error ? (
        <p className="oryx-muted" role="alert">{locale === 'ar' ? 'تعذّر تحميل المنتجات. يرجى إعادة المحاولة.' : 'Unable to load products. Please try again.'}</p>
      ) : items.length === 0 ? (
        <p className="oryx-muted">{locale === 'ar' ? 'لا توجد منتجات منشورة مطابقة.' : 'No matching published products.'}</p>
      ) : (
        <>
          <div className="oryx-grid oryx-grid--cards">
            {items.map((product) => (
              <Link key={product.id} href={`/products/${encodeURIComponent(product.id)}`} className="oryx-cat-card">
                {product.imageUrl ? (
                  <span className="oryx-cat-card__art" role="img"
                    aria-label={(locale === 'ar' ? product.nameAr : product.nameEn) || product.name}
                    style={{ backgroundImage: `url("${resolveImage(product.imageUrl) ?? ''}")` }} />
                ) : null}
                <span className="oryx-cat-card__body">
                  <strong>{(locale === 'ar' ? product.nameAr : product.nameEn) || product.name}</strong>
                  <span className="oryx-muted">{product.sku}</span>
                  <span><Money minor={product.priceMinor} /></span>
                  <span className="oryx-cat-card__link">
                    {locale === 'ar' ? 'تفاصيل المنتج' : 'Product details'} <Icon name="arrow" size={14} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
          {total > pageSize ? (
            <nav aria-label={locale === 'ar' ? 'صفحات المنتجات' : 'Product pages'}
              style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 24 }}>
              <button className="oryx-btn" type="button" disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>
                {locale === 'ar' ? 'السابق' : 'Previous'}
              </button>
              <span>{page} / {Math.ceil(total / pageSize)}</span>
              <button className="oryx-btn" type="button" disabled={page * pageSize >= total} onClick={() => setPage((v) => v + 1)}>
                {locale === 'ar' ? 'التالي' : 'Next'}
              </button>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
