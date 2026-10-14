/** Shared API contracts between the ORYX API and the admin app. */

export type CompanyType = 'INTERNAL' | 'SAAS_TENANT';
export type CompanyStatus = 'ACTIVE' | 'SUSPENDED' | 'PROVISIONING' | 'ARCHIVED';
export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAST_DUE'
  | 'SUSPENDED'
  | 'EXPIRED'
  | 'CANCELLED';
export type BillingPeriod = 'MONTHLY' | 'ANNUAL';
export type UserStatus = 'INVITED' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  /** Machine-readable code for i18n on the client. */
  code?: string;
  correlationId?: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SessionUser {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  status: UserStatus;
  kind: 'PLATFORM' | 'COMPANY';
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  isSuperAdmin: boolean;
}

export interface MembershipSummary {
  companyId: string;
  companyNameEn: string;
  companyNameAr: string;
  companyType: CompanyType;
  companyStatus: CompanyStatus;
  roleId: string;
  roleNameEn: string;
  roleNameAr: string;
  branchIds: string[];
}

export interface LoginResponse {
  accessToken: string;
  /**
   * Only present in development when COOKIE_AUTH is disabled. With cookie
   * transport enabled the refresh token is set as an HttpOnly cookie and this
   * field is omitted, so it is never exposed to JavaScript.
   */
  refreshToken?: string;
  /** CSRF token the client must echo in the `x-oryx-csrf` header. */
  csrfToken?: string;
  expiresIn: number;
  user: SessionUser;
  memberships: MembershipSummary[];
  permissions: string[];
}

/** Returned when a password is correct but MFA must be completed first. */
export interface MfaChallengeResponse {
  mfaRequired: true;
  /** Short-lived token that authorises only the MFA verification step. */
  challengeToken: string;
  expiresIn: number;
}

export type LoginResult = LoginResponse | MfaChallengeResponse;

export function isMfaChallenge(result: LoginResult): result is MfaChallengeResponse {
  return (result as MfaChallengeResponse).mfaRequired === true;
}

export interface CompanyContextOption {
  id: string;
  nameEn: string;
  nameAr: string;
  type: CompanyType;
  status: CompanyStatus;
}

export interface BranchContextOption {
  id: string;
  companyId: string;
  nameEn: string;
  nameAr: string;
  code: string;
}

export interface ContextResponse {
  companies: CompanyContextOption[];
  branches: BranchContextOption[];
  /** Licensed module keys for the currently selected company (platform = all). */
  licensedModules: string[];
  /** Effective permission codes for the current selection. */
  permissions: string[];
}

export interface DashboardKpis {
  companies: number;
  activeCompanies: number;
  branches: number;
  users: number;
  activeSubscriptions: number;
  monthlyRecurringRevenue: number;
  currency: string;
  openSupportSessions: number;
  modulesLicensed: number;
  planUtilisationPct: number;
}

export interface DashboardSeriesPoint {
  label: string;
  value: number;
  secondary?: number;
}

export interface DashboardTile {
  moduleKey: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  route: string;
  tileImage: string;
  status: string;
  available: boolean;
}

export interface DashboardResponse {
  scope: {
    companyId: string | null;
    companyNameEn: string;
    companyNameAr: string;
    branchId: string | null;
    isPlatformScope: boolean;
  };
  kpis: DashboardKpis;
  /** True when the numbers are synthetic seed data, false when real records exist. */
  isDemoData: boolean;
  branchPerformance: DashboardSeriesPoint[];
  moduleAdoption: DashboardSeriesPoint[];
  recentActivity: Array<{
    id: string;
    action: string;
    actorEmail: string | null;
    targetType: string;
    targetId: string | null;
    createdAt: string;
  }>;
  tiles: DashboardTile[];
}

export interface ModuleDto {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  group: string;
  icon: string;
  route: string;
  status: string;
  deliveryPhase: string;
  readPermission: string;
  writePermission: string | null;
}

export interface PlanModuleDto {
  moduleKey: string;
  nameEn: string;
  nameAr: string;
  group: string;
}

export interface PlanDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string;
  descriptionAr: string;
  monthlyPrice: number;
  annualPrice: number;
  currency: string;
  isPublic: boolean;
  isActive: boolean;
  trialDays: number;
  maxCompanies: number;
  maxBranches: number;
  maxUsers: number;
  storageMb: number;
  apiRequestsPerMonth: number;
  modules: PlanModuleDto[];
  subscriberCount?: number;
}

export interface SubscriptionDto {
  id: string;
  companyId: string;
  companyNameEn: string;
  companyNameAr: string;
  planId: string;
  planNameEn: string;
  planNameAr: string;
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  price: number;
  currency: string;
  startedAt: string;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  licensedModules: string[];
}

export interface CompanyDto {
  id: string;
  code: string;
  nameEn: string;
  nameAr: string;
  legalNameEn: string | null;
  type: CompanyType;
  status: CompanyStatus;
  industry: string | null;
  countryCode: string | null;
  currency: string;
  parentCompanyId: string | null;
  parentCompanyNameEn: string | null;
  createdAt: string;
  branchCount?: number;
  userCount?: number;
  subscription?: SubscriptionDto | null;
}

export interface BranchDto {
  id: string;
  companyId: string;
  companyNameEn: string;
  code: string;
  nameEn: string;
  nameAr: string;
  city: string | null;
  countryCode: string | null;
  timezone: string;
  isActive: boolean;
  createdAt: string;
  userCount?: number;
}

export interface RoleDto {
  id: string;
  companyId: string | null;
  code: string;
  nameEn: string;
  nameAr: string;
  descriptionEn: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount?: number;
}

export interface UserDto {
  id: string;
  email: string;
  fullNameEn: string;
  fullNameAr: string;
  status: UserStatus;
  isSuperAdmin: boolean;
  preferredLocale: 'ar' | 'en';
  preferredTheme: 'dark' | 'light';
  lastLoginAt: string | null;
  createdAt: string;
  memberships: MembershipSummary[];
}

export interface InvitationDto {
  id: string;
  email: string;
  companyId: string;
  companyNameEn: string;
  roleId: string;
  roleNameEn: string;
  branchIds: string[];
  status: string;
  expiresAt: string;
  invitedByEmail: string | null;
  createdAt: string;
  /** Present only on creation, never persisted in plaintext. */
  inviteToken?: string;
}

export interface AuditLogDto {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  companyId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  ipAddress: string | null;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface CmsPageDto {
  id: string;
  slug: string;
  locale: 'ar' | 'en';
  title: string;
  excerpt: string | null;
  body: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt: string | null;
  updatedAt: string;
}

export interface CmsBannerDto {
  id: string;
  placement: string;
  locale: 'ar' | 'en';
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  actionUrl: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface FeatureFlagDto {
  id: string;
  key: string;
  nameEn: string;
  nameAr: string;
  description: string | null;
  enabled: boolean;
  audience: string;
  rolloutPercentage: number;
}

export interface AppVersionDto {
  id: string;
  platform: 'IOS' | 'ANDROID';
  version: string;
  buildNumber: string;
  releaseNotes: string | null;
  minSupportedVersion: string;
  isActive: boolean;
  releasedAt: string | null;
}

export interface ApiClientDto {
  id: string;
  name: string;
  clientId: string;
  scopes: string[];
  isActive: boolean;
  rateLimitPerMinute: number;
  lastUsedAt: string | null;
  /** Only returned once at creation. */
  secret?: string;
}
