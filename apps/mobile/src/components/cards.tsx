/**
 * Marketplace cards.
 *
 * The repeated shapes — a product tile, a store row, a provider card, an order
 * summary — live here so a screen reads like a layout rather than a pile of
 * styling. Every card takes the theme from context.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useApp } from '../lib/app-context';
import { photoSmall } from '../lib/assets';
import { brand, radius, space, typography } from '../lib/theme';
import { discountPercent, formatAmount, formatDate, formatMoney, localizeDigits } from '../lib/format';
import type { BookingSummary as LiveBookingSummary } from '../lib/api';
import type {
  DemoBooking,
  DemoOffer,
  DemoOrder,
  DemoProduct,
  DemoProvider,
  DemoRecoveryJob,
  DemoSensageReport,
  DemoStore,
  DemoVehicle,
} from '../lib/repository';
import { Badge, Body, Card, Photo, RatingPill } from './ui';

/** A product tile for grids and rails. */
export function ProductCard({
  product,
  width = 172,
  onPress,
}: {
  product: DemoProduct;
  width?: number;
  onPress?: () => void;
}) {
  const { theme, locale, l, t, direction } = useApp();
  const router = useRouter();
  const off = discountPercent(product.priceMinor, product.compareAtMinor);
  const open = onPress ?? (() => router.push(`/parts/${product.id}`));
  // `insetInlineStart` does not flip while direction is held in React state
  // rather than `I18nManager`, so the ribbon is positioned explicitly.
  const ribbonEdge = direction === 'rtl' ? { right: space.sm } : { left: space.sm };

  return (
    <Pressable
      testID={`product-card-${product.id}`}
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [{ width }, pressed && { opacity: 0.9 }]}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }} elevated={1}>
        <View>
          <Photo source={photoSmall(product.photo)} uri={product.imageUrl ?? null} height={112} width="100%" radiusValue={0} />
          {off ? (
            <View style={[styles.ribbon, ribbonEdge, { backgroundColor: theme.gold }]}>
              <Text style={{ color: theme.onGold, fontSize: typography.caption, fontWeight: '700' }}>
                {localizeDigits(off, locale)}% {t('off')}
              </Text>
            </View>
          ) : null}
          {product.stock <= 0 ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.scrim, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.label }}>
                {t('outOfStock')}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ padding: space.md, gap: space.xs }}>
          <Text
            numberOfLines={2}
            style={{ color: theme.text, fontSize: typography.label, fontWeight: '600', minHeight: 34 }}
          >
            {l({ en: product.nameEn, ar: product.nameAr })}
          </Text>
          <Text style={{ color: theme.textFaint, fontSize: typography.caption }}>
            {product.brand}
          </Text>
          <View style={styles.priceRow}>
            <Text style={{ color: theme.gold, fontSize: typography.body, fontWeight: '700' }}>
              {formatMoney(product.priceMinor)}
            </Text>
            {product.compareAtMinor ? (
              <Text
                style={{
                  color: theme.textFaint,
                  fontSize: typography.caption,
                  textDecorationLine: 'line-through',
                }}
              >
                {formatAmount(product.compareAtMinor)}
              </Text>
            ) : null}
          </View>
          {/* A live catalogue product carries no rating, so the pill is drawn
              only when there is one. An invented "0.0" would be a false claim. */}
          {product.reviewCount > 0 ? (
            <RatingPill rating={product.rating} count={product.reviewCount} />
          ) : null}
        </View>
      </Card>
    </Pressable>
  );
}

/** A store row for the directory and the featured rail. */
export function StoreCard({ store, onPress }: { store: DemoStore; onPress?: () => void }) {
  const { theme, l, t } = useApp();
  const router = useRouter();
  const open = onPress ?? (() => router.push(`/parts?store=${store.id}`));

  return (
    <Card onPress={open} testID={`store-card-${store.id}`}>
      <View style={styles.row}>
        <Photo source={photoSmall(store.photo)} height={64} width={64} radiusValue={radius.md} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={{ color: theme.text, fontSize: typography.subheading, fontWeight: '700', flexShrink: 1 }}>
              {l({ en: store.nameEn, ar: store.nameAr })}
            </Text>
            {store.verified ? <Badge text={t('verified')} tone="gold" /> : null}
          </View>
          {store.reviewCount > 0 ? <RatingPill rating={store.rating} count={store.reviewCount} /> : null}
          <Body size="caption" muted>
            {/* A live store's fee and founding year are not in the public
                catalogue, so neither is asserted when the record is empty. */}
            {store.since > 0 ? (
              <>
                {store.deliveryMinor === 0 ? t('freeDelivery') : formatMoney(store.deliveryMinor)} ·{' '}
                {t('from')} {localizeDigits(store.since, 'en')}
              </>
            ) : (
              `${localizeDigits(store.productCount ?? 0, 'en')} ${t('parts')}`
            )}
          </Body>
        </View>
      </View>
    </Card>
  );
}

/** A provider card for the services directory. */
export function ProviderCard({ provider, onPress }: { provider: DemoProvider; onPress?: () => void }) {
  const { theme, l, t, locale } = useApp();
  const router = useRouter();
  const open = onPress ?? (() => router.push(`/services/${provider.id}`));
  const cheapest = provider.services.reduce(
    (min, s) => (s.priceMinor < min ? s.priceMinor : min),
    provider.services[0]?.priceMinor ?? 0,
  );

  return (
    <Card onPress={open} testID={`provider-card-${provider.id}`} style={{ padding: 0, overflow: 'hidden' }}>
      <Photo source={photoSmall(provider.photo)} height={120} width="100%" radiusValue={0} />
      <View style={{ padding: space.md, gap: space.xs }}>
        <View style={styles.titleRow}>
          <Text style={{ color: theme.text, fontSize: typography.subheading, fontWeight: '700', flexShrink: 1 }}>
            {l({ en: provider.nameEn, ar: provider.nameAr })}
          </Text>
          {provider.verified ? <Badge text={t('verified')} tone="gold" /> : null}
        </View>
        <View style={styles.metaRow}>
          <RatingPill rating={provider.rating} count={provider.reviewCount} />
          <Body size="caption" muted>
            {localizeDigits(provider.distanceKm, locale)} {t('km')} {t('away')}
          </Body>
        </View>
        <View style={styles.priceRow}>
          <Text style={{ color: theme.gold, fontSize: typography.body, fontWeight: '700' }}>
            {t('from')} {formatMoney(cheapest)}
          </Text>
          <Body size="caption" muted>
            {localizeDigits(provider.services.length, locale)} {t('servicesAndPrices')}
          </Body>
        </View>
      </View>
    </Card>
  );
}

/** An order summary row. */
export function OrderCard({ order, store }: { order: DemoOrder; store?: DemoStore }) {
  const { theme, l, t, locale } = useApp();
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/orders/${order.id}`)} testID={`order-card-${order.id}`}>
      <View style={styles.titleRow}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
          {order.reference}
        </Text>
        <Badge text={order.status} status={order.status} />
      </View>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {store ? l({ en: store.nameEn, ar: store.nameAr }) : ''}
      </Body>
      <View style={[styles.priceRow, { marginTop: space.sm }]}>
        <Text style={{ color: theme.text, fontSize: typography.label }}>
          {localizeDigits(order.items.length, locale)} {t('items')} · {formatDate(order.placedAt)}
        </Text>
        <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
          {formatMoney(order.totalMinor)}
        </Text>
      </View>
    </Card>
  );
}

/** A booking row. */
export function BookingCard({ booking, provider }: { booking: DemoBooking; provider?: DemoProvider }) {
  const { theme, l, locale } = useApp();
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/bookings/${booking.id}`)} testID={`booking-card-${booking.id}`}>
      <View style={styles.titleRow}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body, flexShrink: 1 }}>
          {l({ en: booking.serviceNameEn, ar: booking.serviceNameAr })}
        </Text>
        <Badge text={booking.status} status={booking.status} />
      </View>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {provider ? l({ en: provider.nameEn, ar: provider.nameAr }) : ''}
      </Body>
      <View style={[styles.priceRow, { marginTop: space.sm }]}>
        <Text style={{ color: theme.text, fontSize: typography.label }}>
          {localizeDigits(booking.date, locale)} · {localizeDigits(booking.time, locale)}
        </Text>
        <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
          {formatMoney(booking.totalMinor)}
        </Text>
      </View>
    </Card>
  );
}

/**
 * A booking row for the live, server-backed list.
 *
 * The shape differs from the demo row — a live booking has an ISO start, a
 * status from the API and no demo provider — so it gets its own card rather
 * than being forced into the demo type and losing information.
 */
export function LiveBookingCard({
  booking,
  onPress,
}: {
  booking: LiveBookingSummary;
  onPress?: () => void;
}) {
  const { theme, locale, t } = useApp();
  const when = new Date(booking.startsAt);
  const dateLabel = Number.isNaN(when.getTime()) ? booking.startsAt : when.toISOString().slice(0, 10);
  const timeLabel = Number.isNaN(when.getTime())
    ? ''
    : `${String(when.getUTCHours()).padStart(2, '0')}:${String(when.getUTCMinutes()).padStart(2, '0')}`;
  return (
    <Card onPress={onPress} testID={`live-booking-card-${booking.id}`}>
      <View style={styles.titleRow}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body, flexShrink: 1 }}>
          {booking.reference ?? booking.bookingType}
        </Text>
        <Badge text={booking.status} status={booking.status} />
      </View>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {booking.serviceRef ?? booking.bookingType}
      </Body>
      <View style={[styles.priceRow, { marginTop: space.sm }]}>
        <Text style={{ color: theme.text, fontSize: typography.label }}>
          {localizeDigits(dateLabel, locale)}
          {timeLabel ? ` · ${localizeDigits(timeLabel, locale)}` : ''}
        </Text>
        <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.label }}>
          {t('liveMode')}
        </Text>
      </View>
    </Card>
  );
}

/** A recovery request row. */
export function RecoveryCard({ job }: { job: DemoRecoveryJob }) {
  const { theme, t, locale } = useApp();
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/recovery/${job.id}`)} testID={`recovery-card-${job.id}`}>
      <View style={styles.titleRow}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
          {job.reference}
        </Text>
        <Badge text={job.status} status={job.status} />
      </View>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {locale === 'ar' ? job.pickupAr : job.pickupEn}
      </Body>
      <View style={[styles.priceRow, { marginTop: space.sm }]}>
        <Text style={{ color: theme.text, fontSize: typography.label }}>
          {t('eta')}: {localizeDigits(job.etaMinutes, locale)} {t('minutes')}
        </Text>
        <Text style={{ color: theme.gold, fontWeight: '700', fontSize: typography.body }}>
          {formatMoney(job.quotedPriceMinor)}
        </Text>
      </View>
    </Card>
  );
}

/** A SENSAGE report row. */
export function ReportCard({
  report,
  vehicle,
  onPress,
}: {
  report: DemoSensageReport;
  vehicle?: DemoVehicle;
  onPress?: () => void;
}) {
  const { theme, t, locale } = useApp();
  const router = useRouter();
  const tone = report.score >= 80 ? theme.success : report.score >= 65 ? theme.warning : theme.danger;
  const open = onPress ?? (() => router.push(`/sensage/${report.id}`));
  return (
    <Card onPress={open} testID={`report-card-${report.id}`}>
      <View style={styles.titleRow}>
        <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
          {report.reference}
        </Text>
        <View style={[styles.scoreDot, { borderColor: tone }]}>
          <Text style={{ color: tone, fontWeight: '700', fontSize: typography.caption }}>
            {localizeDigits(report.score, locale)}
          </Text>
        </View>
      </View>
      <Body size="caption" muted style={{ marginTop: space.xs }}>
        {vehicle ? `${vehicle.make} ${vehicle.model}` : ''} · {formatDate(report.createdAt)}
      </Body>
      <Body size="label" style={{ marginTop: space.sm }}>
        {localizeDigits(report.findings.length, locale)} {t('findings')}
      </Body>
    </Card>
  );
}

/** A promotional offer tile. */
export function OfferCard({ offer, onPress }: { offer: DemoOffer; onPress?: () => void }) {
  const { l, t, locale } = useApp();
  const router = useRouter();
  const open = onPress ?? (() => router.push(offer.storeId ? `/parts?store=${offer.storeId}` : '/parts'));
  return (
    <Pressable
      onPress={open}
      testID={`offer-card-${offer.id}`}
      style={({ pressed }) => [{ width: 250 }, pressed && { opacity: 0.9 }]}
    >
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <Photo source={photoSmall(offer.photo)} height={104} width="100%" radiusValue={0} overlay />
        <View style={[StyleSheet.absoluteFill, { padding: space.md, justifyContent: 'flex-end' }]}>
          <Text style={{ color: brand.onNavy, fontWeight: '700', fontSize: typography.subheading }}>
            {l({ en: offer.titleEn, ar: offer.titleAr })}
          </Text>
        </View>
        <View style={{ padding: space.md, gap: space.xs }}>
          <Body size="caption" muted numberOfLines={2}>
            {l({ en: offer.subtitleEn, ar: offer.subtitleAr })}
          </Body>
          <View style={styles.priceRow}>
            {offer.percentOff > 0 ? (
              <Badge text={`${t('off')} ${localizeDigits(offer.percentOff, locale)}%`} tone="gold" />
            ) : offer.code ? (
              <Badge text={offer.code} tone="gold" />
            ) : null}
            <Body size="caption" muted>
              {formatDate(offer.expiresAt)}
            </Body>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

/** A vehicle row, used by the garage and by the booking vehicle picker. */
export function VehicleCard({
  vehicle,
  selected = false,
  onPress,
}: {
  vehicle: DemoVehicle;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { theme, l, locale } = useApp();
  return (
    <Card
      onPress={onPress}
      testID={`vehicle-card-${vehicle.id}`}
      style={selected ? { borderColor: theme.gold, borderWidth: 2 } : undefined}
    >
      <View style={styles.row}>
        <Photo source={photoSmall(vehicle.photo)} height={56} width={72} radiusValue={radius.sm} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: theme.text, fontWeight: '700', fontSize: typography.body }}>
            {vehicle.make} {vehicle.model}
          </Text>
          <Body size="caption" muted>
            {localizeDigits(vehicle.year, locale)} · {vehicle.plate}
          </Body>
          <Body size="caption" muted>
            {localizeDigits(vehicle.mileageKm.toLocaleString('en-US'), locale)} {l({ en: 'km', ar: 'كم' })}
          </Body>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
  },
  ribbon: {
    position: 'absolute',
    top: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  scoreDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
