'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { publicApi, type ProductPage, type StorefrontFacets } from '@/lib/api';
import { EmptyState, Loading, PageHead } from '@/components/ui';
import { FeaturedProducts, ProductGrid } from '@/components/storefront';
import { SortSelect, StoreFilters, StoreSearch, filtersToQuery, useStoreFilters } from '@/components/store-filters';

export default function StorePage() {
  return (
    <Suspense
      fallback={
        <div className="oryx-container oryx-section">
          <Loading />
        </div>
      }
    >
      <StoreCatalogue />
    </Suspense>
  );
}

function StoreCatalogue() {
  const { t } = useUi();
  const { filters, activeCount } = useStoreFilters();
  const params = useSearchParams();
  const [page, setPage] = useState<ProductPage | null>(null);
  const [facets, setFacets] = useState<StorefrontFacets | null>(null);
  const [loading, setLoading] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const query = filtersToQuery(filters);

  useEffect(() => {
    let active = true;
    setLoading(true);
    publicApi
      .storefrontProducts(filters)
      .then((result) => {
        if (active) setPage(result);
      })
      .catch(() => {
        if (active) setPage(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let active = true;
    publicApi
      .storefrontFacets()
      .then((result) => {
        if (active) setFacets(result);
      })
      .catch(() => {
        if (active) setFacets(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const currentPage = filters.page ?? 1;
  const pageCount = page?.pageCount ?? 1;
  const pages = useMemo(() => {
    const list: number[] = [];
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(pageCount, currentPage + 2); i += 1) {
      list.push(i);
    }
    return list;
  }, [currentPage, pageCount]);

  const pageHref = (target: number) => {
    const next = { ...filters, page: target };
    const text = filtersToQuery(next);
    return text ? `/store?${text}` : '/store';
  };

  return (
    <>
      <PageHead
        eyebrow={t('nav.store')}
        title={t('store.title')}
        subtitle={t('store.subtitle')}
        image="/media/hero-parts.jpg"
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('nav.store') }]}
      />

      {/* The homepage shop window, shown while no filter narrows the catalogue. */}
      {activeCount === 0 ? (
        <FeaturedProducts
          title={t('store.featured')}
          subtitle={t('store.featuredSubtitle')}
          limit={4}
        />
      ) : null}

      <section className="oryx-section">
        <div className="oryx-container">
          <div className="oryx-store-toolbar">
            <StoreSearch initial={params.get('search') ?? undefined} />
            <SortSelect />
            <button
              type="button"
              className="oryx-btn oryx-mobile-toggle"
              onClick={() => setFiltersOpen((v) => !v)}
              style={{ display: 'inline-flex' }}
              data-testid="filters-toggle"
            >
              {filtersOpen ? t('store.hideFilters') : t('store.showFilters')}
            </button>
          </div>

          <div className="oryx-store-layout">
            <div>
              <StoreFilters facets={facets} open={filtersOpen} onClose={() => setFiltersOpen(false)} />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                <span className="oryx-muted" data-testid="result-count">
                  {page ? t('store.results', { count: page.total }) : ''}
                </span>
              </div>

              {loading ? (
                <Loading />
              ) : !page || page.items.length === 0 ? (
                <EmptyState
                  message={t('store.noResults')}
                  action={
                    <Link href="/store" className="oryx-btn">
                      {t('store.clearAll')}
                    </Link>
                  }
                />
              ) : (
                <>
                  <ProductGrid products={page.items} />
                  {pageCount > 1 && (
                    <nav className="oryx-pagination" aria-label={t('store.page')} data-testid="pagination">
                      <Link href={pageHref(Math.max(1, currentPage - 1))} className="oryx-page-btn" aria-disabled={currentPage === 1}>
                        ‹
                      </Link>
                      {pages.map((p) => (
                        <Link
                          key={p}
                          href={pageHref(p)}
                          className="oryx-page-btn"
                          aria-current={p === currentPage ? 'page' : undefined}
                        >
                          {p}
                        </Link>
                      ))}
                      <Link
                        href={pageHref(Math.min(pageCount, currentPage + 1))}
                        className="oryx-page-btn"
                        aria-disabled={currentPage === pageCount}
                      >
                        ›
                      </Link>
                    </nav>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
