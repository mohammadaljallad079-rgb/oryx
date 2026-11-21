import { StorefrontService } from '../src/storefront/storefront.service';

describe('Public ORYX storefront tenant isolation', () => {
  const makeService = (options: {
    company?: { id: string } | null;
    configured?: string | null;
    chosen?: { id: string } | null;
  }) => {
    const prisma = {
      company: {
        // A lookup by id is the Super Admin's choice; a lookup by code is the
        // canonical ORYX-AUTO fallback.
        findFirst: jest.fn((args: { where: { id?: string } }) =>
          Promise.resolve(args.where.id ? (options.chosen ?? null) : (options.company ?? null)),
        ),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'oryx-company', nameEn: 'ORYX Auto Services', nameAr: 'أوريكس لخدمات السيارات',
          currency: 'BHD', countryCode: 'BH',
        }),
      },
    };
    const platform = { getSetting: jest.fn().mockResolvedValue(options.configured ?? null) };
    const service = new StorefrontService(prisma as never, {} as never, platform as never);
    return { prisma, platform, service };
  };

  it('loads only the active ORYX-AUTO company', async () => {
    const { prisma, service } = makeService({ company: { id: 'oryx-company' } });
    const result = await service.context();
    expect(result.companyId).toBe('oryx-company');
    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: { code: 'ORYX-AUTO', status: 'ACTIVE' },
      select: { id: true },
    });
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
  });

  it('fails closed rather than exposing another tenant when ORYX-AUTO is absent', async () => {
    const { prisma, service } = makeService({ company: null });
    await expect(service.context()).rejects.toThrow('ORYX Auto Services storefront company is not configured.');
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.company.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('serves the company a Super Admin selected', async () => {
    const { prisma, platform, service } = makeService({
      configured: 'chosen-company',
      chosen: { id: 'chosen-company' },
      company: { id: 'oryx-company' },
    });
    const result = await service.context();
    expect(platform.getSetting).toHaveBeenCalled();
    expect(result.companyId).toBe('chosen-company');
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
    expect(prisma.company.findFirst).toHaveBeenCalledWith({
      where: { id: 'chosen-company', status: 'ACTIVE' },
      select: { id: true },
    });
  });

  it('fails closed instead of falling back when the selected company is suspended', async () => {
    const { prisma, service } = makeService({
      configured: 'chosen-company',
      chosen: null,
      company: { id: 'oryx-company' },
    });
    await expect(service.context()).rejects.toThrow('The selected storefront company is not active.');
    expect(prisma.company.findFirst).toHaveBeenCalledTimes(1);
  });
});
