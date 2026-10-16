import { describe, expect, it } from 'vitest';
import {
  INTEGRATION_CATEGORIES,
  INTEGRATION_PROVIDERS,
  INTEGRATION_PROVIDER_BY_KEY,
  getIntegrationProvider,
  isKnownIntegrationProvider,
  isOperational,
} from '../src/integrations';

/**
 * Invariants the External Integrations Center depends on.
 *
 * The API derives a provider's state from this catalog, so a malformed entry
 * would surface as a wrong status in the UI rather than a crash. These tests
 * make the catalog's shape a build-time guarantee instead.
 */
describe('integration provider catalog', () => {
  it('has a unique key for every provider', () => {
    const keys = INTEGRATION_PROVIDERS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(INTEGRATION_PROVIDER_BY_KEY.size).toBe(keys.length);
  });

  it('exposes every provider through both lookup helpers', () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(getIntegrationProvider(provider.key)).toBe(provider);
      expect(isKnownIntegrationProvider(provider.key)).toBe(true);
    }
    expect(getIntegrationProvider('NOT_A_PROVIDER')).toBeUndefined();
    expect(isKnownIntegrationProvider('NOT_A_PROVIDER')).toBe(false);
  });

  it('uses a known category for every provider', () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(INTEGRATION_CATEGORIES).toContain(provider.category);
    }
  });

  it('has unique credential keys within each provider', () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      const keys = provider.credentials.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('provides both Arabic and English text for every user-visible field', () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      expect(provider.nameEn.length).toBeGreaterThan(0);
      expect(provider.nameAr.length).toBeGreaterThan(0);
      expect(provider.descriptionEn.length).toBeGreaterThan(0);
      expect(provider.descriptionAr.length).toBeGreaterThan(0);
      expect(provider.activationRequirementEn.length).toBeGreaterThan(0);
      expect(provider.activationRequirementAr.length).toBeGreaterThan(0);
      for (const credential of provider.credentials) {
        expect(credential.labelEn.length).toBeGreaterThan(0);
        expect(credential.labelAr.length).toBeGreaterThan(0);
      }
    }
  });

  it('marks a provider configurable exactly when it declares credentials', () => {
    for (const provider of INTEGRATION_PROVIDERS) {
      // A provider with no credentials must not claim to be configurable, or the
      // UI would offer a form that can never be filled in.
      expect(provider.configurable).toBe(provider.credentials.length > 0);
    }
  });

  it('treats only an OPERATIONAL state as usable', () => {
    // This is the honesty rule in one assertion: nothing else counts as working.
    expect(isOperational('OPERATIONAL')).toBe(true);
    for (const state of ['CONFIGURED', 'AWAITING_CREDENTIALS', 'DISABLED', 'ERROR'] as const) {
      expect(isOperational(state)).toBe(false);
    }
  });

  it('lists the payment and messaging providers the platform depends on', () => {
    const keys = INTEGRATION_PROVIDERS.map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['BENEFITPAY', 'CARD_ONLINE', 'EMAIL', 'SMS']));
  });
});
