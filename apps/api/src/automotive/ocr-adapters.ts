import { ERROR_CODES, badRequest } from '../common/errors';

/**
 * Registration-card OCR adapters.
 *
 * Extracted from the service so the integrations centre can exercise a real
 * verification call without importing the service (which would be a circular
 * import between the automotive and integrations modules). Nothing here talks
 * to Nest or Prisma: an adapter takes an input and a config and returns a
 * result.
 *
 * ## Honesty
 *
 * With no API key the service throws `AI_PROVIDER_NOT_CONFIGURED` and produces
 * no suggestion; it never returns a canned extraction dressed up as a model
 * answer. The deterministic adapter exists for the automated suite and is
 * selected by an explicit `test://` base URL, never as a fallback. A model
 * response that does not validate is rejected as `AI_INVALID_OUTPUT`.
 */

/** Hard ceiling on a single extraction call, in milliseconds. */
export const OCR_REQUEST_TIMEOUT_MS = 20_000;

/** How many times a retryable failure is retried before giving up. */
export const OCR_MAX_ATTEMPTS = 3;

/**
 * A 1×1 PNG used as the connection-test probe.
 *
 * A real vendor call needs *some* image; the probe is deliberately tiny so a
 * verification costs nothing meaningful, while still exercising the whole
 * request/parse pipeline rather than short-circuiting to a fake success.
 */
export const OCR_PROBE_IMAGE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/** The three fields a registration card always carries and the UI prefills. */
export const OCR_FIELDS = ['number', 'expiresAt', 'plateNumber'] as const;
export type OcrFieldKey = (typeof OCR_FIELDS)[number];

export interface OcrInput {
  /** The stored image to read, as a servable URL the adapter can fetch. */
  imageUrl: string;
  mimeType: string;
  /** The document category, so the adapter knows what kind of paper it reads. */
  category: string;
}

export interface OcrFieldSuggestion {
  key: OcrFieldKey;
  /** The extracted value, already trimmed. Empty means "not found". */
  value: string;
  /** 0–1 model confidence for this field. */
  confidence: number | null;
}

export interface OcrResult {
  fields: OcrFieldSuggestion[];
  /** Any text the adapter read that does not map to a known field. */
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  costMinor: number;
  latencyMs: number;
}

export interface OcrProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** What a provider implementation must produce. */
export interface OcrProviderAdapter {
  readonly key: string;
  extract(input: OcrInput, config: OcrProviderConfig): Promise<OcrResult>;
}

/** A failure that a second attempt may resolve. */
class RetryableOcrError extends Error {}

function isRetryable(error: unknown): boolean {
  return error instanceof RetryableOcrError;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse and validate the model's JSON.
 *
 * A model that returns prose, a partial object or an unknown field key is
 * rejected outright. An unknown field key would let a model smuggle a property
 * onto the suggestion the UI prefills, so only the known keys survive.
 */
export function parseAndValidateOcr(content: string): {
  fields: OcrFieldSuggestion[];
  rawText: string;
} {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The OCR provider returned malformed JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The OCR provider returned an unexpected shape.');
  }
  const candidate = raw as Record<string, unknown>;
  const known = new Set<string>(OCR_FIELDS);
  const fields: OcrFieldSuggestion[] = [];

  if (Array.isArray(candidate.fields)) {
    for (const entry of candidate.fields) {
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Record<string, unknown>;
      const key = String(record.key ?? '');
      if (!known.has(key)) continue;
      const value = String(record.value ?? '').trim();
      if (value === '') continue;
      let confidence: number | null = null;
      if (typeof record.confidence === 'number' && Number.isFinite(record.confidence)) {
        confidence = Math.min(1, Math.max(0, Number(record.confidence.toFixed(3))));
      }
      fields.push({ key: key as OcrFieldKey, value: value.slice(0, 80), confidence });
    }
  }

  const rawText = typeof candidate.rawText === 'string' ? candidate.rawText.slice(0, 2000) : '';
  if (fields.length === 0 && rawText === '') {
    throw badRequest(
      ERROR_CODES.AI_INVALID_OUTPUT,
      'The OCR provider returned no readable fields.',
    );
  }

  // An expiry that is not an ISO date would corrupt the document row, so a
  // non-date expiry is dropped rather than stored.
  return {
    fields: fields.filter((f) => (f.key === 'expiresAt' ? ISO_DATE.test(f.value) : true)),
    rawText,
  };
}

/**
 * The deterministic provider used by the automated suite.
 *
 * Selected *explicitly* by setting the base URL to `test://deterministic`, so
 * a production deployment that loses its key gets `AI_PROVIDER_NOT_CONFIGURED`
 * rather than a plausible-looking fake extraction.
 */
export class DeterministicOcrAdapter implements OcrProviderAdapter {
  readonly key = 'deterministic';

  async extract(input: OcrInput): Promise<OcrResult> {
    const startedAt = Date.now();
    return {
      fields: [
        { key: 'number', value: 'REG-DET-0001', confidence: 0.9 },
        { key: 'expiresAt', value: '2027-12-31', confidence: 0.8 },
        { key: 'plateNumber', value: 'DET-1234', confidence: 0.7 },
      ],
      rawText: `Deterministic OCR read for a ${input.category} document.`,
      inputTokens: 10,
      outputTokens: 20,
      costMinor: 1,
      latencyMs: Date.now() - startedAt,
    };
  }
}

/**
 * An OpenAI-compatible vision adapter.
 *
 * Retries only a retryable failure — a timeout, a transport error or a 5xx —
 * with a short backoff. A 4xx is a configuration problem and retrying it would
 * just multiply the wait.
 */
export class OpenAiCompatibleOcrAdapter implements OcrProviderAdapter {
  readonly key = 'openai-compatible';

  async extract(input: OcrInput, config: OcrProviderConfig): Promise<OcrResult> {
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= OCR_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.attempt(input, config);
      } catch (error) {
        lastError = error as Error;
        if (!isRetryable(error)) throw error;
        if (attempt < OCR_MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
    }
    throw badRequest(
      ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
      `The OCR provider is unreachable (${lastError?.message ?? 'no response'}).`,
    );
  }

  private async attempt(input: OcrInput, config: OcrProviderConfig): Promise<OcrResult> {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OCR_REQUEST_TIMEOUT_MS);
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
                'You read a vehicle registration card or insurance paper from a photograph. ' +
                'Return only the fields you can actually read. Return strict JSON: ' +
                '{"fields": [{"key": "number"|"expiresAt"|"plateNumber", "value": string, "confidence": number}], "rawText": string}. ' +
                'expiresAt must be an ISO date (YYYY-MM-DD). Never guess a value you cannot see.',
            },
            {
              role: 'user',
              content: `Read this ${input.category} document image: ${input.imageUrl}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw badRequest(ERROR_CODES.AI_TIMEOUT, 'The OCR provider did not answer in time.');
      }
      throw new RetryableOcrError((error as Error).message);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status >= 500) {
        throw new RetryableOcrError(`Provider returned ${response.status}: ${body.slice(0, 120)}`);
      }
      throw badRequest(
        ERROR_CODES.AI_PROVIDER_NOT_CONFIGURED,
        `The OCR provider rejected the call (${response.status}).`,
      );
    }

    const latencyMs = Date.now() - startedAt;
    const body = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    } | null;

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw badRequest(ERROR_CODES.AI_INVALID_OUTPUT, 'The OCR provider returned no content.');
    }

    const parsed = parseAndValidateOcr(content);
    const inputTokens = body?.usage?.prompt_tokens ?? 0;
    const outputTokens = body?.usage?.completion_tokens ?? 0;
    const costMinor = Math.ceil((inputTokens + outputTokens) / 1000);

    return {
      fields: parsed.fields,
      rawText: parsed.rawText,
      inputTokens,
      outputTokens,
      costMinor,
      latencyMs,
    };
  }
}

/**
 * Run one extraction through the adapter a base URL selects.
 *
 * The `test://` scheme is an explicit operator choice, so an accidental
 * production misconfiguration cannot silently select the deterministic
 * provider. Shared by the extraction path and the connection test so both agree
 * on which adapter is live.
 */
export function runOcrExtraction(input: OcrInput, config: OcrProviderConfig): Promise<OcrResult> {
  const adapter: OcrProviderAdapter = config.baseUrl.startsWith('test://')
    ? new DeterministicOcrAdapter()
    : new OpenAiCompatibleOcrAdapter();
  return adapter.extract(input, config);
}
