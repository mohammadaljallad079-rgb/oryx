import { MODULES, type ModuleDefinition } from '@oryx/shared';

export interface NavItem {
  key: string;
  labelKey: string;
  href: string;
  icon: string;
  /** Permission that must be held to see this entry. */
  permission?: string;
  /** Any one of these permissions grants visibility (used when a platform and a tenant code are both acceptable). */
  anyPermission?: string[];
  /** Module that must be licensed to see this entry. */
  moduleKey?: string;
  /** Platform-only entries are hidden from company principals. */
  platformOnly?: boolean;
  /** True when the underlying workflow is not implemented yet. */
  planned?: boolean;
}

export interface NavGroup {
  key: string;
  labelKey: string;
  items: NavItem[];
  platformOnly?: boolean;
}

/** ERP navigation mirrors the module catalog so the two cannot diverge. */
function erpItem(m: ModuleDefinition): NavItem {
  // The catalog uses kebab-case icon names; the inline icon set is camelCase.
  // Every catalog icon must be mapped here or it silently falls back to the
  // gauge glyph.
  const iconMap: Record<string, string> = {
    'shopping-cart': 'cart',
    'bar-chart': 'barChart',
    'heart-handshake': 'heart',
    'clipboard-check': 'clipboardCheck',
    'map-pin': 'mapPin',
    'credit-card': 'creditCard',
    calendar: 'calendar',
    store: 'store',
  };
  return {
    key: m.key,
    labelKey: `nav.${navKeyFor(m.key)}`,
    href: m.route,
    icon: iconMap[m.icon] ?? m.icon,
    permission: m.readPermission,
    moduleKey: m.key,
    planned: m.status === 'PLANNED',
  };
}

function navKeyFor(moduleKey: string): string {
  switch (moduleKey) {
    case 'dashboard':
      return 'dashboard';
    case 'company_management':
      return 'companies';
    case 'branch_management':
      return 'branches';
    case 'users_permissions':
      return 'users';
    case 'subscription_management':
      return 'subscription';
    case 'settings':
      return 'settings';
    case 'human_resources':
      return 'human_resources';
    case 'crm':
      return 'crm';
    case 'operations':
      return 'operations';
    case 'automotive_inspections':
      return 'automotive_inspections';
    case 'automotive_maintenance':
      return 'automotive_maintenance';
    case 'spare_parts':
      return 'spare_parts';
    case 'customer_portal':
      return 'customer_portal';
    case 'booking_engine':
      return 'booking_engine';
    case 'provider_portal':
      return 'provider_portal';
    case 'payments':
      return 'payments';
    default:
      return moduleKey;
  }
}

const CORE = MODULES.filter((m) => m.group === 'core');
const FINANCE = MODULES.filter((m) => m.group === 'finance');
const COMMERCE = MODULES.filter((m) => m.group === 'commerce');
const OPERATIONS = MODULES.filter((m) => m.group === 'operations');
const CUSTOMER = MODULES.filter((m) => m.group === 'customer');
const AUTOMOTIVE = MODULES.filter((m) => m.group === 'automotive');
const ANALYTICS = MODULES.filter((m) => m.group === 'analytics');
const ADMIN = MODULES.filter((m) => m.group === 'administration');

/** Platform governance group — visible only to Super Admin principals. */
export const PLATFORM_NAV: NavGroup = {
  key: 'platform',
  labelKey: 'nav.group.platform',
  platformOnly: true,
  items: [
    { key: 'companies', labelKey: 'nav.companies', href: '/companies', icon: 'building', permission: 'platform.company.read', platformOnly: true },
    { key: 'modules', labelKey: 'nav.modules', href: '/modules', icon: 'package', permission: 'platform.module.manage', platformOnly: true },
    { key: 'plans', labelKey: 'nav.plans', href: '/plans', icon: 'creditCard', permission: 'platform.plan.manage', platformOnly: true },
    { key: 'subscriptions', labelKey: 'nav.subscriptions', href: '/subscriptions', icon: 'scroll', permission: 'platform.subscription.manage', platformOnly: true },
    { key: 'roles', labelKey: 'nav.roles', href: '/roles', icon: 'shield', permission: 'platform.company.read', platformOnly: true },
    { key: 'audit', labelKey: 'nav.audit', href: '/audit', icon: 'scroll', permission: 'platform.audit.read', platformOnly: true },
    { key: 'security', labelKey: 'mfa.title', href: '/security', icon: 'shield', platformOnly: false },
    { key: 'support', labelKey: 'nav.support', href: '/support', icon: 'lifeBuoy', permission: 'platform.support.access', platformOnly: true },
  ],
};

/** Website & Application Management — Super Admin group for the ecosystem. */
export const WEBSITE_APP_NAV: NavGroup = {
  key: 'website',
  labelKey: 'nav.group.website',
  platformOnly: true,
  items: [
    { key: 'cms', labelKey: 'nav.cms', href: '/website', icon: 'globe', permission: 'platform.cms.manage', platformOnly: true },
    { key: 'appCms', labelKey: 'nav.appCms', href: '/application', icon: 'smartphone', permission: 'platform.cms.manage', platformOnly: true },
    { key: 'featureFlags', labelKey: 'nav.featureFlags', href: '/application/flags', icon: 'flag', permission: 'platform.api.manage', platformOnly: true },
    { key: 'appVersions', labelKey: 'nav.appVersions', href: '/application/versions', icon: 'package', permission: 'platform.api.manage', platformOnly: true },
    { key: 'apiClients', labelKey: 'nav.apiClients', href: '/api-management', icon: 'plug', permission: 'platform.api.manage', platformOnly: true },
    { key: 'integrations', labelKey: 'nav.integrations', href: '/integrations', icon: 'plug', permission: 'platform.integration.read', platformOnly: true },
  ],
};

export const ERP_NAV: NavGroup[] = [
  {
    key: 'core',
    labelKey: 'nav.group.core',
    // The home entry is explicit so the statistics overview can live at
    // /dashboard/overview without the two diverging. The remaining core entries
    // still derive from the module catalog.
    items: [
      {
        key: 'home',
        labelKey: 'nav.home',
        href: '/dashboard',
        icon: 'gauge',
        anyPermission: ['erp.dashboard.read', 'platform.company.read'],
      },
      {
        key: 'overview',
        labelKey: 'nav.dashboard',
        href: '/dashboard/overview',
        icon: 'barChart',
        anyPermission: ['erp.dashboard.read', 'platform.company.read'],
      },
      ...CORE.filter((m) => m.key !== 'dashboard').map(erpItem),
    ],
  },
  { key: 'finance', labelKey: 'nav.group.finance', items: FINANCE.map(erpItem) },
  { key: 'commerce', labelKey: 'nav.group.commerce', items: COMMERCE.map(erpItem) },
  { key: 'operations', labelKey: 'nav.group.operations', items: OPERATIONS.map(erpItem) },
  { key: 'customer', labelKey: 'nav.group.customer', items: CUSTOMER.map(erpItem) },
  { key: 'automotive', labelKey: 'nav.group.automotive', items: AUTOMOTIVE.map(erpItem) },
  { key: 'analytics', labelKey: 'nav.group.analytics', items: ANALYTICS.map(erpItem) },
  { key: 'administration', labelKey: 'nav.group.administration', items: ADMIN.map(erpItem) },
];

export const ALL_NAV_GROUPS: NavGroup[] = [PLATFORM_NAV, WEBSITE_APP_NAV, ...ERP_NAV];

/** Resolve the module that owns a route, used by the planned-module page. */
export function moduleForRoute(route: string): ModuleDefinition | undefined {
  return MODULES.find((m) => m.route === route);
}
