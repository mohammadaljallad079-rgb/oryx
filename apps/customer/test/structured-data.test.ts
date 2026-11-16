import { describe, expect, it } from 'vitest';

import {
  absoluteAsset,
  localBusinessJsonLd,
  money,
  productJsonLd,
  productListJsonLd,
  serviceJsonLd,
  websiteJsonLd,
  type CatalogProductLike,
} from '../src/lib/structured-data';

/**
 * Guards the SEO layer that the release branch lacked entirely.
 *
 * The important invariants are that prices are published in BHD with three
 * decimals (never a float), that an unavailable product is advertised as
 * OutOfStock rather than silently omitted, and that LocalBusiness emits only
 * fields the operator has actually published — a search engine must never be
 * told a phone number or address ORYX has not confirmed.
 */

const product: CatalogProductLike = {
  id: 'prod-1',
  sku: 'BRK-1042',
  name: 'Front brake pads',
  nameEn: 'Front brake pads',
  nameAr: 'فحمات فرامل أمامية',
  priceMinor: 41800,
  available: true,
  imageUrl: '/api/v1/cms/media/abc/file',
  store: { id: 'store-1', code: 'ORYX-AUTO', name: 'ORYX Auto' },
};

/** Narrow views of the emitted nodes, so the assertions stay typed. */
interface OfferLd {
  priceCurrency: string;
  price: string;
  url: string;
  availability: string;
  seller: { name: string };
}
interface ProductLd {
  '@type': string;
  sku: string;
  alternateName?: string;
  image?: string[];
  offers: OfferLd;
}
interface ListLd {
  numberOfItems: number;
  itemListElement: Array<{ position: number; url: string }>;
}
interface ServiceLd {
  '@type': string;
  url: string;
  provider: { name: string };
}
interface WebsiteLd {
  '@type': string;
  inLanguage: string[];
  potentialAction: { target: { urlTemplate: string } };
}

describe('money', () => {
  it('renders minor units as a three-decimal BHD string', () => {
    expect(money(41800)).toBe('41.800');
    expect(money(1000)).toBe('1.000');
    expect(money(0)).toBe('0.000');
    expect(money(1)).toBe('0.001');
  });
});

describe('absoluteAsset', () => {
  it('makes a site-relative path absolute and leaves an absolute URL alone', () => {
    expect(absoluteAsset('/art/x.svg')).toBe('http://localhost:3002/art/x.svg');
    expect(absoluteAsset('https://cdn.example.com/x.jpg')).toBe('https://cdn.example.com/x.jpg');
    expect(absoluteAsset(null)).toBeUndefined();
  });
});

describe('productJsonLd', () => {
  it('publishes a BHD Offer with the SKU and canonical product URL', () => {
    const ld = productJsonLd(product) as unknown as ProductLd;
    expect(ld['@type']).toBe('Product');
    expect(ld.sku).toBe('BRK-1042');
    expect(ld.alternateName).toBe('فحمات فرامل أمامية');
    expect(ld.offers.priceCurrency).toBe('BHD');
    expect(ld.offers.price).toBe('41.800');
    expect(ld.offers.url).toBe('http://localhost:3002/products/prod-1');
    expect(ld.offers.availability).toBe('https://schema.org/InStock');
  });

  it('marks an unavailable product OutOfStock rather than hiding it', () => {
    const ld = productJsonLd({ ...product, available: false }) as unknown as ProductLd;
    expect(ld.offers.availability).toBe('https://schema.org/OutOfStock');
  });

  it('omits the image when the product has none', () => {
    const ld = productJsonLd({ ...product, imageUrl: null }) as unknown as ProductLd;
    expect(ld.image).toBeUndefined();
  });
});

describe('productListJsonLd', () => {
  it('numbers the items from one', () => {
    const ld = productListJsonLd(
      [product, { ...product, id: 'prod-2' }],
      'http://localhost:3002/products',
    ) as unknown as ListLd;
    expect(ld.numberOfItems).toBe(2);
    expect(ld.itemListElement[0]).toMatchObject({
      position: 1,
      url: 'http://localhost:3002/products/prod-1',
    });
    expect(ld.itemListElement[1].position).toBe(2);
  });
});

describe('serviceJsonLd', () => {
  it('links to the service page with an encoded category', () => {
    const ld = serviceJsonLd({
      key: 'vehicle_inspection',
      nameEn: 'Vehicle inspection',
      nameAr: 'فحص المركبات',
      descriptionEn: 'Periodic inspection.',
    }) as unknown as ServiceLd;
    expect(ld['@type']).toBe('Service');
    expect(ld.url).toBe('http://localhost:3002/services?category=vehicle_inspection');
    expect(ld.provider.name).toBe('ORYX Auto Services');
  });
});

describe('localBusinessJsonLd', () => {
  it('never invents an address, telephone or opening hours', () => {
    const ld = localBusinessJsonLd();
    expect(ld['@type']).toBe('AutoRepair');
    expect(ld.address).toBeUndefined();
    expect(ld.telephone).toBeUndefined();
    expect(ld.openingHours).toBeUndefined();
    expect(ld.geo).toBeUndefined();
  });
});

describe('websiteJsonLd', () => {
  it('advertises a search action against the catalogue', () => {
    const ld = websiteJsonLd() as unknown as WebsiteLd;
    expect(ld['@type']).toBe('WebSite');
    expect(ld.inLanguage).toEqual(['ar', 'en']);
    expect(ld.potentialAction.target.urlTemplate).toContain('/products?query=');
  });
});
