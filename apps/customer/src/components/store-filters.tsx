'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUi } from '@/lib/ui-context';
import { publicApi, type ProductFilters, type StorefrontFacets } from '@/lib/api';

const SORTS: Array<{ key: NonNullable<ProductFilters['sort']>; en: string; ar: string }> = [
  { key: 'relevance', en: 'Relevance', ar: 'الأكثر ملاءمة' },
  { key: 'price_asc', en: 'Price: low to high', ar: 'السعر: من الأقل إلى الأعلى' },
  { key: 'price_desc', en: 'Price: high to low', ar: 'السعر: من الأعلى إلى الأقل' },
  { key: 'newest', en: 'Newest', ar: 'الأحدث' },
  { key: 'name_asc', en: 'Name', ar: 'الاسم' },
];

export type StoreFilters = ProductFilters;

function parseFilters(params: URLSearchParams): StoreFilters {
  const list = (key: string) => {
    const raw = params.get(key);
    return raw ? raw.split(',').filter(Boolean) : undefined;
  };
  const num = (key: string) => {
    const raw = params.get(key);
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  return {
    search: params.get('search') ?? undefined,
    category: list('category'),
    brand: list('brand'),
    make: list('make'),
    model: list('model'),
    year: num('year'),
    engineType: params.get('engineType') ?? undefined,
    partNumber: params.get('partNumber') ?? undefined,
    priceMinMinor: num('priceMinMinor'),
    priceMaxMinor: num('priceMaxMinor'),
    inStock: params.get('inStock') === 'true' ? true : undefined,
    condition: list('condition'),
    featured: params.get('featured') === 'true' ? true : undefined,
    onOffer: params.get('onOffer') === 'true' ? true : undefined,
    sort: (params.get('sort') as StoreFilters['sort']) ?? undefined,
    page: num('page') ?? 1,
    pageSize: num('pageSize') ?? 12,
  };
}

/** Serialise filters back into a URL query string, dropping empty values. */
export function filtersToQuery(filters: StoreFilters): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '' || key === 'pageSize') continue;
    if (key === 'page' && value === 1) continue;
    if (Array.isArray(value)) {
      if (value.length) qs.set(key, value.join(','));
    } else {
      qs.set(key, String(value));
    }
  }
  return qs.toString();
}

export function useStoreFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(params.toString())), [params]);

  const apply = useCallback(
    (patch: Partial<StoreFilters>, resetPage = true) => {
      const next: StoreFilters = { ...filters, ...patch };
      if (resetPage) next.page = 1;
      const query = filtersToQuery(next);
      router.push(query ? `/store?${query}` : '/store', { scroll: false });
    },
    [filters, router],
  );

  const toggleArray = useCallback(
    (key: 'category' | 'brand' | 'make' | 'model' | 'condition', value: string) => {
      const current = filters[key] ?? [];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      // Changing the make clears a model that no longer applies.
      const patch: Partial<StoreFilters> = { [key]: next.length ? next : undefined };
      if (key === 'make') patch.model = undefined;
      apply(patch);
    },
    [filters, apply],
  );

  const clearAll = useCallback(() => router.push('/store', { scroll: false }), [router]);

  const activeCount = useMemo(() => {
    let count = 0;
    if (filters.search) count += 1;
    if (filters.category?.length) count += filters.category.length;
    if (filters.brand?.length) count += filters.brand.length;
    if (filters.make?.length) count += filters.make.length;
    if (filters.model?.length) count += filters.model.length;
    if (filters.year) count += 1;
    if (filters.engineType) count += 1;
    if (filters.priceMinMinor !== undefined || filters.priceMaxMinor !== undefined) count += 1;
    if (filters.inStock) count += 1;
    if (filters.condition?.length) count += filters.condition.length;
    if (filters.onOffer) count += 1;
    return count;
  }, [filters]);

  return { filters, apply, toggleArray, clearAll, activeCount };
}

/* ------------------------------------------------------------- search box */

/** Search with live autocomplete drawn from the real catalogue. */
export function StoreSearch({ initial }: { initial?: string }) {
  const { t } = useUi();
  const router = useRouter();
  const [value, setValue] = useState(initial ?? '');
  const [suggestions, setSuggestions] = useState<
    Array<{ kind: string; label: string; sublabel?: string; href: string }>
  >([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    const term = value.trim();
    if (term.length < 2) {
      setSuggestions([]);
      return;
    }
    timer.current = window.setTimeout(() => {
      publicApi
        .storefrontSuggest(term, 6)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 220);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [value]);

  const submit = () => {
    setOpen(false);
    const query = value.trim();
    router.push(query ? `/store?search=${encodeURIComponent(query)}` : '/store');
  };

  return (
    <div className="oryx-search">
      <span className="oryx-search-icon" aria-hidden>
        ⌕
      </span>
      <input
        className="oryx-input"
        value={value}
        placeholder={t('store.searchPlaceholder')}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 160)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        aria-label={t('store.search')}
        data-testid="store-search"
      />
      {open && suggestions.length > 0 && (
        <div className="oryx-suggest" data-testid="search-suggestions">
          {suggestions.map((item) => (
            <button
              key={`${item.kind}-${item.label}`}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                setOpen(false);
                router.push(item.href);
              }}
            >
              <span>{item.label}</span>
              <span className="oryx-suggest-kind">{item.kind}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ filter panel */

export function StoreFilters({
  facets,
  open,
  onClose,
}: {
  facets: StorefrontFacets | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t, locale } = useUi();
  const { filters, apply, toggleArray, clearAll, activeCount } = useStoreFilters();

  const makes = facets?.vehicles ?? [];
  const selectedMakes = filters.make ?? [];
  const models = makes
    .filter((v) => selectedMakes.length === 0 || selectedMakes.includes(v.make))
    .flatMap((v) => v.models.map((m) => ({ make: v.make, ...m })));

  const priceMin = facets ? Math.floor(facets.price.minMinor / 1000) : 0;
  const priceMax = facets ? Math.ceil(facets.price.maxMinor / 1000) : 0;
  const currentMax = filters.priceMaxMinor !== undefined ? Math.round(filters.priceMaxMinor / 1000) : priceMax;

  const selectedChips: Array<{ label: string; onRemove: () => void }> = [];
  for (const key of ['category', 'brand', 'make', 'model', 'condition'] as const) {
    for (const value of filters[key] ?? []) {
      selectedChips.push({ label: value, onRemove: () => toggleArray(key, value) });
    }
  }
  if (filters.search) selectedChips.push({ label: `“${filters.search}”`, onRemove: () => apply({ search: undefined }) });
  if (filters.inStock) selectedChips.push({ label: t('store.onlyAvailable'), onRemove: () => apply({ inStock: undefined }) });
  if (filters.onOffer) selectedChips.push({ label: t('store.off'), onRemove: () => apply({ onOffer: undefined }) });
  if (filters.year) selectedChips.push({ label: `${filters.year}`, onRemove: () => apply({ year: undefined }) });

  return (
    <>
      {selectedChips.length > 0 && (
        <div className="oryx-active-filters" data-testid="active-filters">
          {selectedChips.map((chip, i) => (
            <button key={`${chip.label}-${i}`} type="button" className="oryx-filter-pill" onClick={chip.onRemove}>
              {chip.label} <span aria-hidden>✕</span>
            </button>
          ))}
          <button type="button" className="oryx-filter-pill" onClick={clearAll}>
            {t('store.clearAll')}
          </button>
        </div>
      )}

      <aside className="oryx-filters" data-open={open} data-testid="store-filters">
        <div className="oryx-filter-group">
          <h3 className="oryx-filter-title">{t('store.category')}</h3>
          {facets?.categories
            .filter((c) => c.count > 0)
            .map((category) => (
              <label className="oryx-check" key={category.key}>
                <input
                  type="checkbox"
                  checked={(filters.category ?? []).includes(category.key)}
                  onChange={() => toggleArray('category', category.key)}
                />
                <span>{locale === 'ar' ? category.nameAr : category.nameEn}</span>
                <span className="oryx-check-count">{category.count}</span>
              </label>
            ))}
        </div>

        <div className="oryx-filter-group">
          <h3 className="oryx-filter-title">{t('store.vehicle')}</h3>
          <select
            className="oryx-select"
            value={selectedMakes[0] ?? ''}
            onChange={(e) => apply({ make: e.target.value ? [e.target.value] : undefined, model: undefined })}
            aria-label={t('store.make')}
            data-testid="filter-make"
          >
            <option value="">{t('store.make')}</option>
            {makes.map((v) => (
              <option key={v.make} value={v.make}>
                {v.make}
              </option>
            ))}
          </select>
          <div style={{ height: 10 }} />
          <select
            className="oryx-select"
            value={(filters.model ?? [])[0] ?? ''}
            onChange={(e) => apply({ model: e.target.value ? [e.target.value] : undefined })}
            aria-label={t('store.model')}
            data-testid="filter-model"
            disabled={selectedMakes.length === 0}
          >
            <option value="">{t('store.model')}</option>
            {models.map((m) => (
              <option key={`${m.make}-${m.model}`} value={m.model}>
                {m.model}
              </option>
            ))}
          </select>
          <div style={{ height: 10 }} />
          <select
            className="oryx-select"
            value={filters.year ?? ''}
            onChange={(e) => apply({ year: e.target.value ? Number(e.target.value) : undefined })}
            aria-label={t('store.year')}
            data-testid="filter-year"
          >
            <option value="">{t('store.year')}</option>
            {Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="oryx-filter-group">
          <h3 className="oryx-filter-title">{t('store.brand')}</h3>
          {facets?.brands.map((brand) => (
            <label className="oryx-check" key={brand.value}>
              <input
                type="checkbox"
                checked={(filters.brand ?? []).includes(brand.value)}
                onChange={() => toggleArray('brand', brand.value)}
              />
              <span>{brand.value}</span>
              <span className="oryx-check-count">{brand.count}</span>
            </label>
          ))}
        </div>

        <div className="oryx-filter-group">
          <h3 className="oryx-filter-title">{t('store.price')}</h3>
          {facets && facets.price.maxMinor > 0 && (
            <>
              <input
                type="range"
                min={priceMin}
                max={priceMax}
                value={currentMax}
                onChange={(e) => apply({ priceMaxMinor: Number(e.target.value) * 1000 })}
                style={{ width: '100%', accentColor: 'var(--gold)' }}
                aria-label={t('store.price')}
              />
              <span className="oryx-faint">
                {t('common.from')} {priceMin} — {t('common.to')} {currentMax} {facets ? '' : ''}BHD
              </span>
            </>
          )}
        </div>

        <div className="oryx-filter-group">
          <h3 className="oryx-filter-title">{t('store.availability')}</h3>
          <label className="oryx-check">
            <input
              type="checkbox"
              checked={Boolean(filters.inStock)}
              onChange={() => apply({ inStock: filters.inStock ? undefined : true })}
            />
            <span>{t('store.onlyAvailable')}</span>
          </label>
          <label className="oryx-check">
            <input
              type="checkbox"
              checked={Boolean(filters.onOffer)}
              onChange={() => apply({ onOffer: filters.onOffer ? undefined : true })}
            />
            <span>{t('store.off')}</span>
          </label>
        </div>

        <div className="oryx-filter-group">
          <h3 className="oryx-filter-title">{t('store.condition')}</h3>
          {facets?.conditions.map((condition) => (
            <label className="oryx-check" key={condition.value}>
              <input
                type="checkbox"
                checked={(filters.condition ?? []).includes(condition.value)}
                onChange={() => toggleArray('condition', condition.value)}
              />
              <span>{condition.value === 'NEW' ? t('store.new') : t('store.refurbished')}</span>
              <span className="oryx-check-count">{condition.count}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" className="oryx-btn" onClick={clearAll} disabled={activeCount === 0}>
            {t('store.clearAll')}
          </button>
          <button type="button" className="oryx-btn oryx-btn-primary" onClick={onClose}>
            {t('common.apply')}
          </button>
        </div>
      </aside>
    </>
  );
}

export function SortSelect() {
  const { t, locale } = useUi();
  const { filters, apply } = useStoreFilters();
  return (
    <select
      className="oryx-select"
      style={{ maxWidth: 220 }}
      value={filters.sort ?? 'relevance'}
      onChange={(e) => apply({ sort: e.target.value as StoreFilters['sort'] })}
      aria-label={t('store.sort')}
      data-testid="sort-select"
    >
      {SORTS.map((sort) => (
        <option key={sort.key} value={sort.key}>
          {locale === 'ar' ? sort.ar : sort.en}
        </option>
      ))}
    </select>
  );
}
