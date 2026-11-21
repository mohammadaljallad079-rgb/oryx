import { StorefrontService } from '../src/storefront/storefront.service';

describe('Public ORYX storefront tenant isolation', () => {
  const makeService = (company: { id: string } | null) => {
    const prisma = {
      company: { findFirst: jest.fn().mockResolvedValue(company), findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'oryx-company', nameEn: 'ORYX Auto Services', nameAr: 'أوريكس لخدمات السيارات',
        currency: 'BHD', countryCode: 'BH',
      }) },
    };
    const service = new StorefrontService(prisma as never, {} as never);
    return { prisma, service };
  };

  it('loads only the active ORYX-AUTO company', async () => {
    const { prisma, service } = makeService({ id: 'oryx-company' });
    const result = await service.context();
    expect(result.companyId).toBe('oryx-company');
    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: { code: 'ORYX-AUTO', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fails closed rather than exposing another tenant when ORYX-AUTO is absent', async () => {
    const { prisma, service } = makeService(null);
    await expect(service.context()).rejects.toThrow('ORYX Auto Services storefront company is not configured.');
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});
