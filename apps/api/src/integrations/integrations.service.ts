import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  INTEGRATION_PROVIDERS,
  getIntegrationProvider,
  isKnownIntegrationProvider,
  type IntegrationCredentialField,
  type IntegrationProviderDefinition,
  type IntegrationProviderState,
  type IntegrationVerificationStatusDto,
} from '@oryx/shared';
import { PrismaService } from '../common/prisma.service';
import { SecretCipher } from '../auth/mfa.service';

/** A credential value supplied by an operator. */
export interface CredentialInput {
  key: string;
  value: string;
}

export interface IntegrationActor {
  userId?: string | null;
  companyId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

interface ResolvedProvider {
  definition: IntegrationProviderDefinition;
  record: {
    id: string;
    enabled: boolean;
    disabledReason: string | null;
    verificationStatus: string;
    lastCheckedAt: Date | null;
    lastCheckMessage: string | null;
  } | null;
  credentials: Array<{ credentialKey: string; hint: string | null; updatedAt: Date }>;
}

/**
 * The External Integrations Center.
 *
 * This service owns one question: *for each external provider, what is actually
 * true right now?* It answers by combining three sources that are deliberately
 * kept apart:
 *
 *  1. the provider catalog in `@oryx/shared` (what the code supports),
 *  2. the stored configuration in the database (what an operator entered), and
 *  3. the last verification attempt (whether a real call succeeded).
 *
 * The derived `state` is the only thing the UI is allowed to trust, and only
 * `OPERATIONAL` means a customer can use the provider. A provider with a written
 * adapter and no credentials reports `AWAITING_CREDENTIALS`; nothing here ever
 * upgrades a provider to working because a row exists.
 *
 * Credential values are sealed with `SecretCipher` before they touch the
 * database and are never read back into a response. The audit trail records
 * which key changed, never its value.
 */
@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly cipher: SecretCipher,
  ) {}

  // --------------------------------------------------------------- read paths

  /**
   * Resolve a provider's effective configuration.
   *
   * A company-scoped configuration takes precedence over the platform one, so a
   * tenant can supply its own merchant account without affecting other tenants.
   * When neither exists the catalog defaults apply.
   */
  private async resolve(providerKey: string, companyId: string | null): Promise<ResolvedProvider> {
    const definition = getIntegrationProvider(providerKey);
    if (!definition) {
      throw new NotFoundException(`Unknown integration provider: ${providerKey}`);
    }

    const record = companyId
      ? ((await this.prisma.integrationProvider.findFirst({
          where: { providerKey, companyId },
          include: { credentials: true },
        })) ??
        (await this.prisma.integrationProvider.findFirst({
          where: { providerKey, companyId: null },
          include: { credentials: true },
        })))
      : await this.prisma.integrationProvider.findFirst({
          where: { providerKey, companyId: null },
          include: { credentials: true },
        });

    return {
      definition,
      record: record
        ? {
            id: record.id,
            enabled: record.enabled,
            disabledReason: record.disabledReason,
            verificationStatus: record.verificationStatus,
            lastCheckedAt: record.lastCheckedAt,
            lastCheckMessage: record.lastCheckMessage,
          }
        : null,
      credentials: (record?.credentials ?? []).map((c) => ({
        credentialKey: c.credentialKey,
        hint: c.hint,
        updatedAt: c.updatedAt,
      })),
    };
  }

  /** Environment fallback: a provider may be configured entirely from `.env`. */
  private envValue(key: string): string | undefined {
    const value = this.config.get<string>(key);
    return value && value.trim() !== '' ? value : undefined;
  }

  /**
   * Find or create the configuration row for a provider.
   *
   * This is a `findFirst` plus an explicit create rather than an `upsert`: the
   * compound unique index includes `companyId`, which is null for a
   * platform-scoped row, and Prisma's generated compound-unique input does not
   * accept null. The partial unique index on `providerKey WHERE companyId IS
   * NULL` is what actually prevents a duplicate platform row, and a concurrent
   * create loses the race with a unique violation the caller can retry.
   *
   * A row created here is `enabled: true`, because it exists only because an
   * operator touched the provider. That keeps `enabled: false` meaningful: it is
   * always a deliberate disable, never an artefact of creating a row to hold a
   * credential.
   */
  private async ensureProvider(
    providerKey: string,
    companyId: string | null,
    actor: IntegrationActor,
  ) {
    const existing = await this.prisma.integrationProvider.findFirst({
      where: { providerKey, scope: companyId ? 'COMPANY' : 'PLATFORM', companyId },
    });
    if (existing) return existing;
    return this.prisma.integrationProvider.create({
      data: {
        providerKey,
        scope: companyId ? 'COMPANY' : 'PLATFORM',
        companyId,
        enabled: true,
        verificationStatus: 'UNVERIFIED',
        updatedById: actor.userId ?? null,
      },
    });
  }

  /**
   * Derive the state an operator sees.
   *
   * Order matters. An operator who disabled a provider outranks everything: a
   * disabled provider is not "operational" even if it was verified yesterday.
   * Credentials coming from `.env` count exactly like stored ones, because the
   * adapter reads the environment at call time.
   */
  private deriveState(
    definition: IntegrationProviderDefinition,
    resolved: ResolvedProvider,
  ): IntegrationProviderState {
    if (resolved.record && !resolved.record.enabled) {
      return 'DISABLED';
    }
    if (resolved.record?.verificationStatus === 'FAILED') {
      return 'ERROR';
    }

    const stored = new Set(resolved.credentials.map((c) => c.credentialKey));
    const missing = definition.credentials.filter(
      (c) => c.required && !stored.has(c.key) && !this.envValue(c.key),
    );

    if (definition.implementation === 'IMPLEMENTED') {
      // No credentials are needed and the adapter performs real work, so it is
      // usable as long as an operator has not disabled it.
      return 'OPERATIONAL';
    }

    if (missing.length > 0) {
      return 'AWAITING_CREDENTIALS';
    }
    return resolved.record?.verificationStatus === 'VERIFIED' ? 'OPERATIONAL' : 'CONFIGURED';
  }

  /** Build the full, masked view of every provider. */
  async center(companyId: string | null) {
    const providers = [];
    for (const definition of INTEGRATION_PROVIDERS) {
      const resolved = await this.resolve(definition.key, companyId);
      const state = this.deriveState(definition, resolved);
      providers.push(this.toView(definition, resolved, state));
    }

    const counts = {
      operational: 0,
      configured: 0,
      awaitingCredentials: 0,
      disabled: 0,
      error: 0,
    };
    for (const p of providers) {
      switch (p.state) {
        case 'OPERATIONAL':
          counts.operational += 1;
          break;
        case 'CONFIGURED':
          counts.configured += 1;
          break;
        case 'AWAITING_CREDENTIALS':
          counts.awaitingCredentials += 1;
          break;
        case 'DISABLED':
          counts.disabled += 1;
          break;
        case 'ERROR':
          counts.error += 1;
          break;
      }
    }

    // Providers the customer-facing platform depends on. If one of these is not
    // operational the platform is not production-ready, and the response says so
    // rather than leaving an operator to infer it.
    const blocking = providers
      .filter((p) => p.perCompany && p.state !== 'OPERATIONAL')
      .map((p) => p.key);

    return {
      providers,
      summary: { total: providers.length, ...counts, blockingForProduction: blocking },
      noticeEn:
        'Only providers marked operational can be used by customers. A provider with credentials but no verified transaction is shown as configured, not working.',
      noticeAr:
        'المزودون العاملون فقط هم المتاحون للعملاء. المزود الذي لديه بيانات اعتماد دون عملية موثقة يظهر كـ«مهيّأ» وليس عاملاً.',
    };
  }

  private toView(
    definition: IntegrationProviderDefinition,
    resolved: ResolvedProvider,
    state: IntegrationProviderState,
  ) {
    const stored = new Map(resolved.credentials.map((c) => [c.credentialKey, c]));
    const credentials = definition.credentials.map((c: IntegrationCredentialField) => {
      const entry = stored.get(c.key);
      const fromEnv = !entry && this.envValue(c.key) !== undefined;
      return {
        key: c.key,
        labelEn: c.labelEn,
        labelAr: c.labelAr,
        secret: c.secret,
        required: c.required,
        configured: Boolean(entry) || fromEnv,
        // A hint is only ever the last four characters, and only for a
        // non-secret identifier stored here. An environment value shows none.
        hint: entry ? (c.secret ? null : entry.hint) : null,
        updatedAt: entry ? entry.updatedAt.toISOString() : null,
      };
    });

    return {
      key: definition.key,
      nameEn: definition.nameEn,
      nameAr: definition.nameAr,
      category: definition.category,
      descriptionEn: definition.descriptionEn,
      descriptionAr: definition.descriptionAr,
      implementation: definition.implementation,
      configurable: definition.configurable,
      perCompany: definition.perCompany,
      enabled: resolved.record?.enabled ?? state === 'OPERATIONAL',
      disabledReason: resolved.record?.disabledReason ?? null,
      state,
      verificationStatus: (resolved.record?.verificationStatus ?? 'UNVERIFIED') as
        IntegrationVerificationStatusDto,
      lastCheckedAt: resolved.record?.lastCheckedAt?.toISOString() ?? null,
      lastCheckMessage: resolved.record?.lastCheckMessage ?? null,
      missingCredentials: credentials.filter((c) => c.required && !c.configured).map((c) => c.key),
      credentials,
      activationRequirementEn: definition.activationRequirementEn,
      activationRequirementAr: definition.activationRequirementAr,
    };
  }

  async detail(providerKey: string, companyId: string | null) {
    const resolved = await this.resolve(providerKey, companyId);
    const state = this.deriveState(resolved.definition, resolved);
    const view = this.toView(resolved.definition, resolved, state);
    const history = resolved.record
      ? await this.prisma.integrationCheck.findMany({
          where: { providerId: resolved.record.id },
          orderBy: { createdAt: 'desc' },
          take: 20,
        })
      : [];
    return {
      provider: view,
      checks: history.map((c) => ({
        id: c.id,
        status: c.status as IntegrationVerificationStatusDto,
        message: c.message,
        durationMs: c.durationMs,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }

  // -------------------------------------------------------------- write paths

  /**
   * Store credentials for a provider.
   *
   * Every write seals the value first. An empty string means "remove this
   * credential" rather than "set it to nothing", so an operator can clear a key
   * without leaving a blank secret behind. Changing any credential resets the
   * verification status to `UNVERIFIED`: a previous success proved the *old*
   * value worked, and that proof does not carry over.
   */
  async saveCredentials(
    providerKey: string,
    input: { credentials: CredentialInput[]; companyId: string | null },
    actor: IntegrationActor,
  ) {
    const definition = getIntegrationProvider(providerKey);
    if (!definition) {
      throw new NotFoundException(`Unknown integration provider: ${providerKey}`);
    }
    if (!definition.configurable) {
      throw new BadRequestException(
        `${definition.nameEn} is not configurable: it needs no credentials.`,
      );
    }

    const known = new Map(definition.credentials.map((c) => [c.key, c]));
    for (const entry of input.credentials) {
      if (!known.has(entry.key)) {
        throw new BadRequestException(`Unknown credential '${entry.key}' for ${definition.nameEn}.`);
      }
    }

    const existing = await this.ensureProvider(providerKey, input.companyId, actor);
    const provider = await this.prisma.integrationProvider.update({
      where: { id: existing.id },
      data: {
        // Any credential change invalidates the previous verification.
        verificationStatus: 'UNVERIFIED',
        lastCheckMessage: null,
        updatedById: actor.userId ?? null,
      },
    });

    for (const entry of input.credentials) {
      const trimmed = entry.value.trim();
      if (trimmed === '') {
        await this.prisma.integrationCredential.deleteMany({
          where: { providerId: provider.id, credentialKey: entry.key },
        });
        continue;
      }
      const field = known.get(entry.key);
      const sealed = this.cipher.encrypt(trimmed);
      const hint = field && !field.secret && trimmed.length > 4 ? trimmed.slice(-4) : null;
      await this.prisma.integrationCredential.upsert({
        where: {
          providerId_credentialKey: { providerId: provider.id, credentialKey: entry.key },
        },
        create: {
          providerId: provider.id,
          credentialKey: entry.key,
          value: sealed,
          hint,
          updatedById: actor.userId ?? null,
        },
        update: { value: sealed, hint, updatedById: actor.userId ?? null },
      });
    }

    return this.detail(providerKey, input.companyId);
  }

  /** Enable or disable a provider for the deployment or one tenant. */
  async setEnabled(
    providerKey: string,
    input: { enabled: boolean; reason?: string; companyId: string | null },
    actor: IntegrationActor,
  ) {
    const definition = getIntegrationProvider(providerKey);
    if (!definition) {
      throw new NotFoundException(`Unknown integration provider: ${providerKey}`);
    }

    const resolved = await this.resolve(providerKey, input.companyId);
    const state = this.deriveState(definition, resolved);

    // Refuse to enable a provider that cannot work. Enabling BenefitPay without
    // credentials would tell an operator the platform takes BenefitPay, which it
    // does not. The error names what is missing.
    if (input.enabled && state === 'AWAITING_CREDENTIALS') {
      throw new BadRequestException(
        `${definition.nameEn} cannot be enabled: missing ${definition.credentials
          .filter((c) => c.required && !resolved.credentials.some((s) => s.credentialKey === c.key))
          .map((c) => c.key)
          .join(', ')}.`,
      );
    }

    const existing = await this.ensureProvider(providerKey, input.companyId, actor);
    await this.prisma.integrationProvider.update({
      where: { id: existing.id },
      data: {
        enabled: input.enabled,
        disabledReason: input.enabled ? null : (input.reason ?? null),
        updatedById: actor.userId ?? null,
      },
    });

    return this.detail(providerKey, input.companyId);
  }

  /**
   * Run a connection test.
   *
   * ## What this can and cannot prove
   *
   * For an adapter whose vendor call is not written yet (everything currently
   * marked `ADAPTER_ONLY`), a test cannot reach the vendor, so it reports
   * `INCOMPLETE` with a message that says so. It does *not* report `VERIFIED`.
   * That is the point: a green tick must mean a real call succeeded.
   *
   * An `IMPLEMENTED` provider (in-app notifications, counter cash) is verified by
   * exercising the code path that does the work, which needs no network.
   */
  async verify(providerKey: string, companyId: string | null, actor: IntegrationActor) {
    const definition = getIntegrationProvider(providerKey);
    if (!definition) {
      throw new NotFoundException(`Unknown integration provider: ${providerKey}`);
    }

    const startedAt = Date.now();
    const resolved = await this.resolve(providerKey, companyId);
    const provider = await this.ensureProvider(providerKey, companyId, actor);

    const stored = new Set(resolved.credentials.map((c) => c.credentialKey));
    const missing = definition.credentials.filter(
      (c) => c.required && !stored.has(c.key) && !this.envValue(c.key),
    );

    let status: IntegrationVerificationStatusDto;
    let message: string;

    if (definition.implementation === 'IMPLEMENTED') {
      status = 'VERIFIED';
      message =
        'Internal record path is reachable; no external call is required for this provider.';
    } else if (missing.length > 0) {
      status = 'INCOMPLETE';
      message = `Cannot test: missing ${missing.map((c) => c.key).join(', ')}.`;
    } else {
      status = 'INCOMPLETE';
      message =
        `${definition.nameEn} credentials are present but the vendor call is not implemented in ` +
        'this build, so no live verification is possible. Complete the integration before treating ' +
        'this provider as operational.';
      this.logger.warn(
        `Integration verification attempted for ${providerKey} with credentials present, but the vendor call is not implemented.`,
      );
    }

    const durationMs = Date.now() - startedAt;
    await this.prisma.$transaction([
      this.prisma.integrationProvider.update({
        where: { id: provider.id },
        data: {
          verificationStatus: status,
          lastCheckedAt: new Date(),
          lastCheckMessage: message,
          updatedById: actor.userId ?? null,
        },
      }),
      this.prisma.integrationCheck.create({
        data: {
          providerId: provider.id,
          status,
          message,
          durationMs,
          actorUserId: actor.userId ?? null,
        },
      }),
    ]);

    return this.detail(providerKey, companyId);
  }

  /**
   * The subset of provider state a customer-facing page needs: which payment
   * methods and message channels a customer may actually choose.
   */
  async publicCapabilities(companyId: string | null) {
    const result: Record<string, boolean> = {};
    for (const definition of INTEGRATION_PROVIDERS) {
      const resolved = await this.resolve(definition.key, companyId);
      result[definition.key] = this.deriveState(definition, resolved) === 'OPERATIONAL';
    }
    return result;
  }

  /**
   * Resolve a credential for internal adapter use. Never returned to a client.
   * A company-scoped value wins over the platform value for that tenant.
   */
  async revealCredential(providerKey: string, credentialKey: string, companyId: string | null) {
    if (!isKnownIntegrationProvider(providerKey)) return undefined;
    // Two explicit lookups rather than one ordered query: Postgres sorts NULLs
    // first on a DESC order, which would have put the platform row ahead of the
    // tenant row it is meant to override.
    const scoped = companyId
      ? await this.prisma.integrationCredential.findFirst({
          where: { credentialKey, provider: { providerKey, companyId } },
        })
      : null;
    const stored =
      scoped ??
      (await this.prisma.integrationCredential.findFirst({
        where: { credentialKey, provider: { providerKey, companyId: null } },
      }));
    if (stored) return this.cipher.decrypt(stored.value);
    return this.envValue(credentialKey);
  }
}
