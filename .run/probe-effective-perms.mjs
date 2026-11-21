/**
 * Verify the repaired platform role resolves to the permissions the guards
 * actually check, with and without a tenant context. Reads the real role row
 * from the database and runs it through the shipped resolver.
 */
import { PrismaClient } from '@prisma/client';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const authz = require('/workspace/project/oryx/packages/shared/dist/authorization.js');
const { resolveEffectivePermissions } = authz;

const prisma = new PrismaClient();

const role = await prisma.role.findFirst({
  where: { companyId: null, code: 'platform_super_admin' },
  include: { permissions: { select: { permissionCode: true } } },
});
if (!role) {
  console.error('platform_super_admin role not found');
  process.exit(1);
}
const granted = role.permissions.map((p) => p.permissionCode);

const base = { kind: 'PLATFORM', grantedPermissions: granted };

const noTenant = resolveEffectivePermissions({ ...base, company: null });
console.log('WITHOUT tenant context:');
console.log('  permissions:', noTenant.permissions.length);
console.log('  platform.company.read:', noTenant.permissions.includes('platform.company.read'));
console.log('  erp.dashboard.read (COMPANY-scope, expected false):', noTenant.permissions.includes('erp.dashboard.read'));

// With a tenant selected, the company-scope codes are unlocked, gated by the
// tenant's licensed modules. Use the first company that has a subscription.
const company = await prisma.company.findFirst({ orderBy: { createdAt: 'asc' } });
const subscription = company
  ? await prisma.subscription.findFirst({ where: { companyId: company.id } })
  : null;
if (!company) {
  console.log('\n(no company to test tenant context)');
} else {
  const licensed = subscription?.licensedModules ?? [];
  const withTenant = resolveEffectivePermissions({
    ...base,
    company: { id: company.id, membershipActive: true, licensedModuleKeys: licensed },
  });
  console.log(`\nWITH tenant context (${company.nameEn}, ${licensed.length} licensed modules):`);
  console.log('  permissions:', withTenant.permissions.length);
  console.log('  erp.dashboard.read:', withTenant.permissions.includes('erp.dashboard.read'));
  console.log('  suppressed by entitlement:', withTenant.suppressedByEntitlement.length);
}

await prisma.$disconnect();
