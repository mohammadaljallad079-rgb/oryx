'use client';

import Link from 'next/link';
import { useUi } from '@/lib/ui-context';
import { customerApi } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { RequireCustomer } from '@/components/require-customer';
import { EmptyState, Loading, PageHead } from '@/components/ui';
import { ProductCard } from '@/components/storefront';

/** Saved products for the signed-in customer. */
export default function AccountWishlistPage() {
  return (
    <RequireCustomer>
      <WishlistView />
    </RequireCustomer>
  );
}

function WishlistView() {
  const { t } = useUi();
  const wishlist = useAsync(() => customerApi.wishlist(), []);

  return (
    <>
      <PageHead
        title={t('account.wishlist')}
        breadcrumb={[{ label: t('common.home'), href: '/' }, { label: t('account.wishlist') }]}
      />
      <section className="oryx-section">
        <div className="oryx-container">
          {wishlist.loading ? (
            <Loading />
          ) : !wishlist.data || wishlist.data.length === 0 ? (
            <EmptyState
              message={t('account.wishlistEmpty')}
              action={
                <Link href="/store" className="oryx-btn oryx-btn-primary">
                  {t('nav.store')}
                </Link>
              }
            />
          ) : (
            <div className="oryx-grid oryx-grid-4">
              {wishlist.data.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
