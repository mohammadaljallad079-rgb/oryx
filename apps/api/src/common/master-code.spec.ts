import { nextMasterCode } from './master-code';
import type { PrismaService } from './prisma.service';

describe('master code allocation', () => {
  it('allocates a unique master-data code from the shared database sequence', async () => {
    const query = jest.fn().mockResolvedValueOnce([{ number: 100000000n }]).mockResolvedValueOnce([{ number: 100000001n }]);
    const prisma = { $queryRaw: query } as unknown as PrismaService;
    expect(await nextMasterCode(prisma, 'SKU')).toBe('SKU100000000');
    expect(await nextMasterCode(prisma, 'SKU')).toBe('SKU100000001');
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('rejects unsafe prefixes before querying the database', async () => {
    const query = jest.fn();
    const prisma = { $queryRaw: query } as unknown as PrismaService;
    await expect(nextMasterCode(prisma, 'SKU; DROP TABLE')).rejects.toThrow('Invalid master code prefix');
    expect(query).not.toHaveBeenCalled();
  });
});
