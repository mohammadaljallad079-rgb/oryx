import { describe, expect, it, vi } from 'vitest';

import { categoryPhoto, fallbackPhoto, productPhoto } from '../src/lib/api-adapters';

// The adapter chain reaches `api.ts`, which imports `react-native` for Platform
// and `expo-secure-store` for token storage. Neither is needed to test the pure
// photo mapping, and react-native's Flow entry point cannot be parsed by Vite.
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  setItemAsync: vi.fn(async () => undefined),
  getItemAsync: vi.fn(async () => null),
  deleteItemAsync: vi.fn(async () => undefined),
}));

/**
 * The card photography fallback chain.
 *
 * A card shows a real uploaded photograph when the API supplies one. When it
 * does not, the placeholder must still be *about* the record: a brake pad must
 * not be illustrated with a car-wash bay, and a parts store must not be
 * illustrated with an unrelated business. These tests pin the mapping that
 * replaced the earlier id-hash shuffle.
 */
describe('categoryPhoto', () => {
  it('maps each known category to its own art', () => {
    expect(categoryPhoto('vehicle_inspection', 'x')).toBe('inspectionBay');
    expect(categoryPhoto('maintenance', 'x')).toBe('mechanicEngine');
    expect(categoryPhoto('spare_parts', 'x')).toBe('partsStore');
    expect(categoryPhoto('recovery', 'x')).toBe('recoveryTow');
    expect(categoryPhoto('car_wash', 'x')).toBe('carwashPremium');
  });

  it('is stable for a record, not shuffled per render', () => {
    expect(categoryPhoto('maintenance', 'same-id')).toBe(categoryPhoto('maintenance', 'same-id'));
  });

  it('falls back deterministically when the category is unknown', () => {
    const first = categoryPhoto(null, 'no-category');
    expect(first).toBe(fallbackPhoto('no-category'));
    expect(categoryPhoto(undefined, 'no-category')).toBe(first);
    expect(categoryPhoto('not_a_category', 'no-category')).toBe(first);
  });
});

describe('productPhoto', () => {
  it('matches a part on its name so the art fits the part', () => {
    expect(productPhoto('Engine oil filter', 'p1')).toBe('mechanicEngine');
    expect(productPhoto('Front brake pad set', 'p2')).toBe('autoService');
    expect(productPhoto('Car battery 70Ah', 'p3')).toBe('evCharging');
    expect(productPhoto('Oxygen sensor', 'p4')).toBe('inspectionBay');
  });

  it('uses the storefront art for a part that matches no rule', () => {
    expect(productPhoto('Cabin air freshener', 'p5')).toBe('partsStore');
  });

  it('is stable for the same part name', () => {
    expect(productPhoto('Front brake pad set', 'p6')).toBe(productPhoto('Front brake pad set', 'p7'));
  });
});
