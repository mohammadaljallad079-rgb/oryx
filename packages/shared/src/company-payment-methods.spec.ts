import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COMPANY_PAYMENT_METHODS,
  COMPANY_SETTING_DEFAULTS,
  withDefaults,
} from './company-settings';

describe('company payment methods', () => {
  it('has stable and unique default codes for invoice and POS settlement', () => {
    const codes = DEFAULT_COMPANY_PAYMENT_METHODS.map(method => method.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('CREDIT');
    expect(DEFAULT_COMPANY_PAYMENT_METHODS.find(method => method.code === 'CREDIT')).toMatchObject({
      accountingMethod: 'CREDIT',
      useInInvoices: true,
      useInPos: false,
    });
    expect(DEFAULT_COMPANY_PAYMENT_METHODS.some(method => method.useInPos && method.isActive)).toBe(true);
    expect(COMPANY_SETTING_DEFAULTS.sales.paymentMethods).toHaveLength(codes.length);
  });

  it('preserves company overrides and older settings without catalogue fields', () => {
    const old = withDefaults('sales', { allowDiscounts: false });
    expect(old.allowDiscounts).toBe(false);
    expect(old.paymentMethods.map(method => method.code)).toContain('CASH');
    const custom = withDefaults('sales', {
      paymentMethods: [{
        code: 'BENEFIT', nameEn: 'Benefit', nameAr: 'بنفت',
        accountingMethod: 'CARD', isActive: true, useInInvoices: true, useInPos: true,
      }],
    });
    expect(custom.paymentMethods[0].code).toBe('BENEFIT');
    expect(custom.paymentMethods[0].accountingMethod).toBe('CARD');
  });
});
