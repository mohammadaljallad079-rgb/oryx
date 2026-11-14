import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The font faces embedded into every generated PDF.
 *
 * The report is Arabic-first, so the fonts are not a styling choice — without a
 * real Arabic face Chromium falls back to a Latin font and every Arabic glyph
 * becomes a tofu box.
 *
 * Two rules, both learned by testing the output rather than assuming it:
 *
 * 1. **Embed as a data URI, never by family name.** A host font lookup depends
 *    on what the container happens to have installed. A CI runner and a
 *    developer machine then produce different PDFs, and a missing font degrades
 *    silently to boxes rather than failing.
 * 2. **Only static instances.** A *variable* font makes Chromium emit a Type3
 *    font whose text layer is unusable — copy, search and screen readers all
 *    see garbage. Static instances embed as Type0/CID with a correct ToUnicode
 *    map. The files in `assets/fonts` are static instances, generated with
 *    `fonttools varLib.instancer` from the upstream variable fonts; do not
 *    replace them with the variable originals.
 */

interface FontFace {
  family: string;
  weight: number;
  file: string;
}

const FACES: readonly FontFace[] = [
  { family: 'ORYX Latin', weight: 400, file: 'Verdana-Regular.ttf' },
  { family: 'ORYX Latin', weight: 700, file: 'Verdana-Bold.ttf' },
  { family: 'ORYX Arabic', weight: 400, file: 'Arial-Regular.ttf' },
  { family: 'ORYX Arabic', weight: 700, file: 'Arial-Bold.ttf' },
  { family: 'ORYX Naskh', weight: 400, file: 'NotoNaskhArabic-Regular.ttf' },
  { family: 'ORYX Naskh', weight: 700, file: 'NotoNaskhArabic-Bold.ttf' },
  { family: 'ORYX Sans', weight: 400, file: 'NotoSans-Regular.ttf' },
  { family: 'ORYX Sans', weight: 700, file: 'NotoSans-Bold.ttf' },
  { family: 'ORYX Display', weight: 700, file: 'CodecPro-Bold.ttf' },
];

/**
 * The official ORYX type stack, exactly as the approved print forms carry it:
 * **Verdana** for Latin text and numerals, **Arial** for Arabic.
 *
 * The stack lists the Latin face first. Arial also contains Latin glyphs, so the
 * order is what makes a mixed string resolve the way the reference does — Latin
 * runs take Verdana, and only the Arabic runs fall through to Arial. The Noto
 * faces stay at the tail as a last resort for any glyph the approved pair lacks,
 * so a document can never render a missing glyph as a box.
 */
export const DOCUMENT_FONT_STACK =
  "'ORYX Latin', 'ORYX Arabic', 'ORYX Naskh', 'ORYX Sans', sans-serif";
export const DOCUMENT_LATIN_STACK =
  "'ORYX Latin', 'ORYX Arabic', 'ORYX Sans', sans-serif";

@Injectable()
export class DocumentFontService {
  private readonly logger = new Logger(DocumentFontService.name);
  private cached: string | null = null;

  private get fontDir(): string {
    return process.env.DOCUMENT_FONT_DIR ?? join(__dirname, '..', '..', '..', 'assets', 'fonts');
  }

  /**
   * The `@font-face` rules for every face, base64-encoded.
   *
   * Read once and reused: the faces total ~1.7 MB of base64, and re-reading them
   * per render would dominate the render time.
   */
  async fontFaceCss(): Promise<string> {
    if (this.cached) return this.cached;

    const rules: string[] = [];
    for (const face of FACES) {
      const path = join(this.fontDir, face.file);
      let bytes: Buffer;
      try {
        bytes = await readFile(path);
      } catch {
        // A missing font must fail loudly: the alternative is a document that
        // renders as empty boxes and is only noticed when a customer receives it.
        throw new Error(
          `Document font ${face.file} is missing from ${this.fontDir}. ` +
            'Generated PDFs would render Arabic as unreadable glyphs.',
        );
      }
      if (bytes.length < 1000 || bytes.toString('latin1', 0, 4) !== '\u0000\u0001\u0000\u0000') {
        throw new Error(`Document font ${face.file} is not a valid TrueType font.`);
      }
      rules.push(
        `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};` +
          `src:url(data:font/ttf;base64,${bytes.toString('base64')}) format('truetype');font-display:block}`,
      );
    }

    this.cached = rules.join('\n');
    this.logger.log(`Embedded ${FACES.length} document font faces`);
    return this.cached;
  }
}
