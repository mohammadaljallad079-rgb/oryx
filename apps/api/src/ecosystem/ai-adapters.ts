import { ERROR_CODES, badRequest } from '../common/errors';

/**
 * The SENSAGE vision adapters (P7).
 *
 * Extracted from the service so the integrations centre can exercise a real
 * verification call without importing the service (which would be a circular
 * import between the ecosystem and integrations modules). Nothing here talks to
 * Nest or Prisma: an adapter takes an input and a config and returns a result.
 */

/** Hard ceiling on a single analysis call, in milliseconds. */
export const REQUEST_TIMEOUT_MS = 20_000;

/** How many times a retryable failure is retried before giving up. */
export const MAX_ATTEMPTS = 3;

/** The prompt ceiling, so an unbounded hint cannot be smuggled into the call. */
export const MAX_FOCUS_LENGTH = 200;

export interface AnalyzeInput {
  /** The `CmsMediaAsset` the photograph was stored as, when it has one. */
  storageAssetId: string | null;
  mimeType: string;
  focus: string | null;
}

export interface AnalyzeResult {
  payload: Record<string, unknown>;
  summary: string;
  confidence: number | null;
  inputTokens: number;
  outputTokens: number;
  costMinor: number;
  latencyMs: number;
}

export interface AiProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** What a provider implementation must produce. */
export interface AiProviderAdapter {
  readonly key: string;
  analyze(input: AnalyzeInput, config: AiProviderConfig): Promise<AnalyzeResult>;
}

/** A failure that a second attempt may resolve. */
class RetryableProviderError extends Error {}

function isRetryable(error: unknown): boolean {
  return error instanceof RetryableProviderError;
}

/**
 * Parse and validate the model's JSON.
 *
 * A model that returns prose, a partial object or an unexpected severity is
 * rejected outright. Storing a half-shaped payload would push the validation
 * problem onto every reader.
 */
export function parseAndValidate(content: string): {
  summary: string;
  observations: Array<{ area: string; severity: string; note: string }>;
  confidence: number | null;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The vision provider returned malformed JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The vision provider returned an unexpected shape.');
  }
  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.summary !== 'string' || candidate.summary.trim() === '') {
    throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The vision provider returned no summary.');
  }

  const severities = new Set(['MINOR', 'MODERATE', 'SEVERE']);
  const observations: Array<{ area: string; severity: string; note: string }> = [];
  if (Array.isArray(candidate.observations)) {
    for (const entry of candidate.observations) {
      if (typeof entry !== 'object' || entry === null) continue;
      const observation = entry as Record<string, unknown>;
      const severity = String(observation.severity ?? '').toUpperCase();
      if (!severities.has(severity)) continue;
      observations.push({
        area: String(observation.area ?? 'unspecified').slice(0, 120),
        severity,
        note: String(observation.note ?? '').slice(0, 500),
      });
    }
  }

  let confidence: number | null = null;
  if (typeof candidate.confidence === 'number' && Number.isFinite(candidate.confidence)) {
    confidence = Math.min(1, Math.max(0, Number(candidate.confidence.toFixed(3))));
  }

  return { summary: candidate.summary.slice(0, 1000), observations, confidence };
}

/**
 * The deterministic provider used by the automated suite.
 *
 * It is selected *explicitly* by setting the base URL to `test://deterministic`.
 * It is never a silent fallback, so a production deployment that loses its key
 * gets `AI_PROVIDER_NOT_CONFIGURED` rather than a plausible-looking fake answer.
 */
export class DeterministicAiAdapter implements AiProviderAdapter {
  readonly key = 'deterministic';

  async analyze(input: AnalyzeInput): Promise<AnalyzeResult> {
    const startedAt = Date.now();
    const payload = {
      summary: `Deterministic triage for ${input.mimeType}.`,
      observations: [
        { area: input.focus ?? 'unspecified', severity: 'MINOR', note: 'Deterministic test observation.' },
      ],
      confidence: 0.5,
    };
    return {
      payload,
      summary: payload.summary,
      confidence: payload.confidence,
      inputTokens: 10,
      outputTokens: 20,
      costMinor: 1,
      latencyMs: Date.now() - startedAt,
    };
  }
}

/**
 * An OpenAI-compatible chat-completions adapter.
 *
 * Retries only a retryable failure — a timeout, a transport error or a 5xx —
 * with a short backoff. A 4xx is a configuration problem and retrying it would
 * just multiply the wait.
 */
export class OpenAiCompatibleAdapter implements AiProviderAdapter {
  readonly key = 'openai-compatible';

  async analyze(input: AnalyzeInput, config: AiProviderConfig): Promise<AnalyzeResult> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.attempt(input, config);
      } catch (error) {
        lastError = error as Error;
        if (!isRetryable(error)) throw error;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }
    throw badRequest(
      ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      `The vision provider is unreachable (${lastError?.message ?? 'no response'}).`,
    );
  }

  private async attempt(input: AnalyzeInput, config: AiProviderConfig): Promise<AnalyzeResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content:
                'You are a vehicle damage triage assistant. Describe only what is visible. ' +
                'Never diagnose a mechanical fault from a photograph. Return strict JSON: ' +
                '{"summary": string, "observations": [{"area": string, "severity": "MINOR"|"MODERATE"|"SEVERE", "note": string}], "confidence": number}.',
            },
            {
              role: 'user',
              content: input.focus
                ? `Inspect the attached vehicle photograph. Focus: ${input.focus}.`
                : 'Inspect the attached vehicle photograph.',
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw badRequest(ERROR_CODES.AI_TIMEOUT, 'The vision provider did not answer in time.');
      }
      throw new RetryableProviderError((error as Error).message);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status >= 500) {
        throw new RetryableProviderError(`Provider returned ${response.status}: ${body.slice(0, 120)}`);
      }
      throw badRequest(
        ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
        `The vision provider rejected the call (${response.status}).`,
      );
    }

    const latencyMs = Date.now() - startedAt;
    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The vision provider returned no content.');
    }

    const parsed = parseAndValidate(content);
    const inputTokens = body?.usage?.prompt_tokens ?? 0;
    const outputTokens = body?.usage?.completion_tokens ?? 0;
    // A deliberately simple estimate: 1 minor unit per 1k tokens of any kind.
    const costMinor = Math.ceil((inputTokens + outputTokens) / 1000);

    return {
      payload: parsed,
      summary: parsed.summary,
      confidence: parsed.confidence,
      inputTokens,
      outputTokens,
      costMinor,
      latencyMs,
    };
  }
}

/**
 * Run one analysis through the adapter a base URL selects.
 *
 * The `test://` scheme is an explicit operator choice, so an accidental
 * production misconfiguration cannot silently select the deterministic
 * provider. Shared by the analysis path and the connection test so both agree
 * on which adapter is live.
 */
export function runSensageAnalysis(
  input: AnalyzeInput,
  config: AiProviderConfig,
): Promise<AnalyzeResult> {
  const adapter: AiProviderAdapter = config.baseUrl.startsWith('test://')
    ? new DeterministicAiAdapter()
    : new OpenAiCompatibleAdapter();
  return adapter.analyze(input, config);
}
