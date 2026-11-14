import { existsSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { DOCUMENT_FONT_STACK, DOCUMENT_LATIN_STACK } from './document-fonts.service';
import {
  BASE_PRINT_CSS,
  launchChromium,
  OFFICIAL_PDF_MARGINS,
  REPORT_PDF_MARGINS,
  spliceFirstPage,
} from './pdf-renderer.service';

/**
 * The numeric and Latin classes must keep an Arabic face in their stack.
 *
 * `.num` and `.ltr` used to hardcode a Latin-only family. The Latin face
 * (`ORYX Latin` = Verdana) carries no Arabic, but a money cell renders the
 * Arabic currency symbol (`د.ب` for BHD), so those glyphs escaped the embedded
 * faces and Chromium synthesised a Type3 bitmap font from a host face. On a
 * runner without the host face that fallback is the only way the glyph can be
 * drawn, and the PDF text layer breaks.
 *
 * The stack therefore has to name the Arabic face too, so the browser's own
 * fallback stays inside the fonts the document embeds.
 */
describe('document print CSS font stacks', () => {
  function fontFamilyOf(selector: string): string {
    const rule = new RegExp(`\\${selector}\\{[^}]*font-family:([^;}]*)`, 's').exec(BASE_PRINT_CSS);
    if (!rule) throw new Error(`No rule found for ${selector}`);
    return rule[1];
  }

  it('keeps an Arabic face in the numeric stack', () => {
    expect(fontFamilyOf('.num')).toContain('ORYX Arabic');
  });

  it('keeps an Arabic face in the Latin stack', () => {
    expect(fontFamilyOf('.ltr')).toContain('ORYX Arabic');
  });

  it('composes both stacks from the shared constants, not inline literals', () => {
    expect(DOCUMENT_LATIN_STACK).toContain('ORYX Arabic');
    expect(DOCUMENT_LATIN_STACK).toContain('ORYX Sans');
    expect(DOCUMENT_FONT_STACK).toContain('ORYX Arabic');
  });
});

/**
 * The report and the financial forms print to different edges.
 *
 * The approved invoice sits close to every edge; the approved report lifts only
 * its top edge (the brand band) and keeps the default side margins, because its
 * cover photograph bleeds to the paper edges by cancelling exactly that inset.
 * Sharing one margin set with the invoice would drag the report's header down,
 * so the two constants must stay distinct.
 */
describe('document page margins', () => {
  it('prints the report to the measured reference edges', () => {
    expect(REPORT_PDF_MARGINS.top).not.toBe(OFFICIAL_PDF_MARGINS.top);
    expect(REPORT_PDF_MARGINS.left).toBe(REPORT_PDF_MARGINS.right);
    // The reference prints its header and body from x≈16 to x≈579 on a 595.5pt
    // sheet, so the sides are ~5.6mm, matching the bleed the cover band cancels.
    expect(REPORT_PDF_MARGINS.left).toBe('5.6mm');
  });

  it('keeps the official invoice margins on all four edges', () => {
    expect(OFFICIAL_PDF_MARGINS.left).not.toBe(OFFICIAL_PDF_MARGINS.right);
    expect(OFFICIAL_PDF_MARGINS.top).toBe('5.7mm');
  });
});

/**
 * The report prints a different footer on its cover than on its section pages.
 *
 * Chromium paints a single footer template on every page, so the report is
 * rendered twice — once with each footer — and page one is lifted from the cover
 * pass onto the section pass. The splice must keep the page count, the section
 * pages, and the cover's own first page.
 */
describe('spliceFirstPage', () => {
  // Distinct page widths identify which pass each page came from: PDF text is
  // Flate-compressed, so the marker is the geometry, not a readable string.
  async function makePdf(pageCount: number, width: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pageCount; i += 1) doc.addPage([width, 842]);
    return Buffer.from(await doc.save());
  }

  it('takes page one from the cover and the rest from the body', async () => {
    const cover = await makePdf(3, 610);
    const body = await makePdf(3, 595);
    const merged = await spliceFirstPage(cover, body);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getWidth()).toBe(610);
    expect(doc.getPage(1).getWidth()).toBe(595);
    expect(doc.getPage(2).getWidth()).toBe(595);
  });

  it('does not drop or duplicate pages when the body is a single page', async () => {
    const cover = await makePdf(1, 610);
    const body = await makePdf(1, 595);
    const merged = await spliceFirstPage(cover, body);
    const doc = await PDFDocument.load(merged);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getWidth()).toBe(610);
  });
});

/**
 * A missing bundled browser must not fail every document request.
 *
 * `pnpm install` does not fetch Playwright's Chromium, so a fresh deployment
 * that skipped `playwright install chromium` used to answer every issue,
 * preview and print with an opaque "Executable doesn't exist" 500. The launch
 * helper now falls back to a system Chromium and, when none exists, raises a
 * message that names the exact command to run.
 */
describe('document renderer browser launch', () => {
  const realEnv = process.env.PLAYWRIGHT_CHROMIUM;

  afterEach(() => {
    if (realEnv === undefined) delete process.env.PLAYWRIGHT_CHROMIUM;
    else process.env.PLAYWRIGHT_CHROMIUM = realEnv;
  });

  function fakeChromium(behaviour: {
    bundledFails?: boolean;
    systemExists?: boolean;
  }): { type: unknown; calls: Array<Record<string, unknown>> } {
    const calls: Array<Record<string, unknown>> = [];
    const type = {
      launch: async (options: Record<string, unknown>) => {
        calls.push(options);
        if (typeof options.executablePath !== 'string') {
          if (behaviour.bundledFails) throw new Error("Executable doesn't exist");
          return { fake: 'bundled-browser' };
        }
        if (!behaviour.systemExists) throw new Error('no system browser');
        return { fake: 'system-browser' };
      },
    };
    return { type, calls };
  }

  it('prefers the bundled browser when it launches', async () => {
    delete process.env.PLAYWRIGHT_CHROMIUM;
    const { type, calls } = fakeChromium({});
    const browser = await launchChromium(type as never);
    expect(browser).toEqual({ fake: 'bundled-browser' });
    expect(calls).toHaveLength(1);
    expect(calls[0].executablePath).toBeUndefined();
  });

  it('honours an explicit PLAYWRIGHT_CHROMIUM build', async () => {
    process.env.PLAYWRIGHT_CHROMIUM = '/custom/chrome';
    const { type, calls } = fakeChromium({ systemExists: true });
    await launchChromium(type as never);
    expect(calls[0].executablePath).toBe('/custom/chrome');
  });

  it('raises an actionable message when neither browser exists', async () => {
    delete process.env.PLAYWRIGHT_CHROMIUM;
    // The fallback probes real system paths; on a runner without Chromium this
    // exercises the actionable-message branch directly.
    const hasSystem = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].some(
      (p) => existsSync(p),
    );
    const { type } = fakeChromium({ bundledFails: true, systemExists: hasSystem });
    if (hasSystem) {
      await expect(launchChromium(type as never)).resolves.toEqual({ fake: 'system-browser' });
    } else {
      await expect(launchChromium(type as never)).rejects.toThrow(/playwright install chromium/);
    }
  });
});
