import { Injectable, Logger } from '@nestjs/common';
import { IntegrationsService } from '../integrations/integrations.service';
import { ERROR_CODES, badRequest } from '../common/errors';
import {
  runOcrExtraction,
  type OcrFieldSuggestion,
  type OcrResult,
} from './ocr-adapters';

/** The provider key this service reads its credentials from. */
const PROVIDER_KEY = 'REGISTRATION_OCR';

/** The base URL and model a call falls back to when the operator sets only a key. */
export const DEFAULT_OCR_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_OCR_MODEL = 'gpt-4o-mini';

/** Hard ceiling on an uploaded scan the extractor will read, in bytes. */
export const MAX_OCR_UPLOAD_BYTES = 12 * 1024 * 1024;

export interface OcrExtractionResult {
  /** Whether the provider is configured; when false `fields` is empty. */
  configured: boolean;
  /** The suggested fields an operator reviews before saving. Never persisted. */
  fields: OcrFieldSuggestion[];
  rawText: string;
  latencyMs: number;
}

/**
 * Registration-card OCR (brief §5, vehicles).
 *
 * ## Honesty
 *
 * With no API key this service returns `configured: false` and no fields; it
 * never returns a canned extraction dressed up as a model answer. The
 * deterministic adapter exists for the automated suite and is selected by an
 * explicit `test://` base URL, never as a fallback.
 *
 * ## Nothing is saved here
 *
 * The extractor reads a scan and *suggests* fields. It writes no
 * `VehicleDocument` row: the operator reviews the suggestion in the form and
 * saves it through the ordinary document endpoint, which is the only path that
 * persists a document. An extraction that is discarded therefore leaves no
 * trace and no orphan asset.
 */
@Injectable()
export class VehicleOcrService {
  private readonly logger = new Logger(VehicleOcrService.name);

  constructor(private readonly integrations: IntegrationsService) {}

  /** The configuration a call uses, resolved from the integrations centre. */
  async resolveConfig(companyId: string | null): Promise<{ apiKey: string | null; baseUrl: string; model: string }> {
    const [apiKey, baseUrl, model] = await Promise.all([
      this.integrations.revealCredential(PROVIDER_KEY, 'OCR_API_KEY', companyId),
      this.integrations.revealCredential(PROVIDER_KEY, 'OCR_BASE_URL', companyId),
      this.integrations.revealCredential(PROVIDER_KEY, 'OCR_MODEL', companyId),
    ]);
    return {
      apiKey: apiKey ?? null,
      baseUrl: baseUrl ?? DEFAULT_OCR_BASE_URL,
      model: model && model.trim() !== '' ? model : DEFAULT_OCR_MODEL,
    };
  }

  /** True when the provider holds the credentials an extraction needs. */
  async isConfigured(companyId: string | null): Promise<boolean> {
    const { apiKey } = await this.resolveConfig(companyId);
    return typeof apiKey === 'string' && apiKey.trim() !== '';
  }

  /**
   * Read a registration card and return the suggested fields.
   *
   * Never throws when unconfigured: it returns `configured: false` so the
   * capture path can fall back to manual entry rather than failing the upload.
   * A genuine provider failure (bad key, timeout, malformed output) is reported
   * as `configured: true` with an empty `fields` list and a logged warning, so
   * a transient outage never blocks the operator from typing the details.
   */
  async extract(
    input: { buffer: Buffer; mimeType: string; category: string },
    companyId: string | null,
  ): Promise<OcrExtractionResult> {
    if (input.buffer.length === 0) {
      throw badRequest(ERROR_CODES.AI_INPUT_INVALID, 'The scan is empty.');
    }
    if (input.buffer.length > MAX_OCR_UPLOAD_BYTES) {
      throw badRequest(ERROR_CODES.AI_INPUT_INVALID, 'The scan is larger than the 12 MB limit.');
    }

    const config = await this.resolveConfig(companyId);
    if (!config.apiKey) {
      return { configured: false, fields: [], rawText: '', latencyMs: 0 };
    }

    try {
      const result: OcrResult = await runOcrExtraction(
        {
          imageUrl: `data:${input.mimeType};base64,${input.buffer.toString('base64')}`,
          mimeType: input.mimeType,
          category: input.category,
        },
        { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model },
      );
      return { configured: true, fields: result.fields, rawText: result.rawText, latencyMs: result.latencyMs };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown failure.';
      this.logger.warn(`Registration OCR extraction failed: ${message}`);
      return { configured: true, fields: [], rawText: '', latencyMs: 0 };
    }
  }
}
