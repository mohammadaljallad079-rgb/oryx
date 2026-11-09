import type { PrismaService } from './prisma.service';

/**
 * Resolve the one platform Super Admin role, with its granted permission codes.
 *
 * The lookup is deliberately deterministic. A platform role has `companyId =
 * NULL`, and Postgres treats NULL as distinct in a unique index, so a seeding
 * path that keyed on a sentinel company id once created a second
 * `platform_super_admin` row. A bare `findFirst` could then resolve the emptier
 * of the two and leave the Super Admin without company permissions, while every
 * guard silently agreed because they all shared the same non-deterministic
 * query.
 *
 * The partial unique index `Role_platform_code_key` now forbids a duplicate, but
 * the ordering stays as defence in depth: were one to reappear, every caller
 * would still converge on the role holding the most permissions rather than on
 * whichever row the planner returned first.
 */
export async function findPlatformSuperAdminRole(
  prisma: PrismaService,
): Promise<{ id: string; permissions: { permissionCode: string }[] } | null> {
  return prisma.role.findFirst({
    where: { isPlatform: true, code: 'platform_super_admin' },
    orderBy: { permissions: { _count: 'desc' } },
    include: { permissions: { select: { permissionCode: true } } },
  });
}
