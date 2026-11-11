import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ERROR_CODES, badRequest, tooManyRequests } from '../common/errors';
import {
  MAX_FOCUS_LENGTH,
  runSensageAnalysis,
  type AnalyzeInput,
  type AnalyzeResult,
} from './ai-adapters';

/** The provider key this service reads its credentials from. */
const PROVIDER_KEY = 'SENSAGE_AI';

/** Per-company daily ceilings. Exceeding one is a 429, not a silent success. */
const DAILY_REQUEST_LIMIT = 200;
const DAILY_COST_LIMIT_MINOR = 5_000;

/** The base URL a call falls back to when the operator sets only a key. */
export const DEFAULT_SENSAGE_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_SENSAGE_MODEL = 'gpt-4o-mini';

/**
 * The SENSAGE vision service (P7).
 *
 * ## Honesty
 *
 * With no API key this service throws `AI_PROVIDER_NOT_CONFIGURED` and produces
 * no suggestion. It never returns a canned or demo result dressed up as a model
 * answer. The deterministic adapter exists for the automated suite and is
 * selected by an explicit `test://` base URL, never as a fallback. A model
 * response that does not validate is rejected as `AI_INVALID_OUTPUT`.
 *
 * ## Bounds
 *
 * Every call is bounded: a per-request timeout, bounded retries for retryable
 * failures, a per-company daily request count and a per-company daily cost
 * ceiling. The counter is incremented before the provider is called, so a crash
 * mid-call still counts against the day.
 *
 * ## What is stored
 *
 * Only the validated payload and the usage figures, on an `AiSuggestion` row
 * that starts `PENDING`. A human reviewer is what moves it out of `PENDING`.
 */
@Injectable()
export class SensageAiService {
  private readonly logger = new Logger(SensageAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
  ) {}

  /** True when the provider holds the credentials a call needs. */
  async isConfigured(companyId: string | null): Promise<boolean> {
    const apiKey = await this.integrations.revealCredential(PROVIDER_KEY, 'SENSAGE_AI_API_KEY', companyId);
    return typeof apiKey === 'string' && apiKey.trim() !== '';
  }

  /** The configuration a call uses, resolved from the integrations centre. */
  async resolveConfig(companyId: string | null): Promise<{ apiKey: string | null; baseUrl: string; model: string }> {
    const [apiKey, baseUrl, model] = await Promise.all([
      this.integrations.revealCredential(PROVIDER_KEY, 'SENSAGE_AI_API_KEY', companyId),
      this.integrations.revealCredential(PROVIDER_KEY, 'SENSAGE_AI_BASE_URL', companyId),
      this.integrations.revealCredential(PROVIDER_KEY, 'SENSAGE_AI_MODEL', companyId),
    ]);
    return {
      apiKey: apiKey ?? null,
      baseUrl: baseUrl ?? DEFAULT_SENSAGE_BASE_URL,
      model: model ?? DEFAULT_SENSAGE_MODEL,
    };
  }

  /**
   * Analyse a photograph and return a validated, normalised result.
   *
   * Throws `AI_PROVIDER_NOT_CONFIGURED` when no key is present, so the caller
   * never receives a fabricated answer.
   */
  async analyze(input: AnalyzeInput, companyId: string | null): Promise<AnalyzeResult> {
    if (!input.storageAssetId) {
      throw badRequest(ERROR_CODES.AI_INPUT_INVALID, 'This photograph has no stored image to analyse.');
    }
    if (input.focus && input.focus.length > MAX_FOCUS_LENGTH) {
      throw badRequest(ERROR_CODES.AI_INPUT_INVALID, 'The focus hint is too long.');
    }

    const config = await this.resolveConfig(companyId);
    if (!config.apiKey) {
      throw badRequest(
        ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
        'SENSAGE AI is not configured. Add an API key in the Integrations Centre.',
      );
    }

    await this.consumeQuota(companyId, 'request');

    const result = await runSensageAnalysis(input, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
    });
    await this.consumeQuota(companyId, 'tokens', result.inputTokens, result.outputTokens, result.costMinor);
    return result;
  }

  /**
   * Enforce and record the per-company daily ceiling.
   *
   * The check runs before the increment so a company already at its limit is
   * refused without a wasted provider call, and the increment happens before the
   * provider is contacted so a crash mid-call still counts against the day.
   */
  private async consumeQuota(
    companyId: string | null,
    kind: 'request' | 'tokens',
    inputTokens = 0,
    outputTokens = 0,
    costMinor = 0,
  ): Promise<void> {
    if (!companyId) return;
    const day = new Date().toISOString().slice(0, 10);

    const existing = await this.prisma.aiUsageCounter.findUnique({
      where: { companyId_day: { companyId, day } },
    });
    if (existing) {
      if (existing.requestCount >= DAILY_REQUEST_LIMIT) {
        throw tooManyRequests(
          ERROR_CODES.AI_QUOTA_EXCEEDED,
          `The daily analysis limit (${DAILY_REQUEST_LIMIT}) has been reached.`,
        );
      }
      if (existing.costMinor >= DAILY_COST_LIMIT_MINOR) {
        throw tooManyRequests(ERROR_CODES.AI_QUOTA_EXCEEDED, 'The daily analysis budget has been reached.');
      }
    }

    await this.prisma.aiUsageCounter.upsert({
      where: { companyId_day: { companyId, day } },
      create: {
        companyId,
        day,
        requestCount: kind === 'request' ? 1 : 0,
        inputTokens,
        outputTokens,
        costMinor,
      },
      update:
        kind === 'request'
          ? { requestCount: { increment: 1 } }
          : {
              inputTokens: { increment: inputTokens },
              outputTokens: { increment: outputTokens },
              costMinor: { increment: costMinor },
            },
    });
  }
}
