import { existsSync } from 'node:fs';
import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import type { Browser, BrowserType } from 'playwright';
import { DocumentFontService, DOCUMENT_FONT_STACK, DOCUMENT_LATIN_STACK } from './document-fonts.service';

/**
 * Renders HTML to a print-ready PDF with a real layout engine.
 *
 * Chromium is used rather than a PDF-drawing library because the documents are
 * laid out with the same CSS a browser uses — Arabic shaping, bidi runs, table
 * pagination, `@page` margins and repeated table headers all come for free and
 * correctly. A hand-drawn PDF builder would have to reimplement Arabic joining
 * and RTL bidi itself, and would get it subtly wrong.
 *
 * One browser instance is reused across renders; launching Chromium takes longer
 * than rendering a document, so a per-request launch would dominate the response
 * time and leak a process if a request was cancelled.
 */
@Injectable()
export class PdfRendererService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfRendererService.name);
  private browserPromise: Promise<Browser> | null = null;

  constructor(private readonly fonts: DocumentFontService) {}

  private async browser(): Promise<Browser> {
    if (this.browserPromise) {
      // A browser that has crashed or been closed still resolves the cached
      // promise, so every later render would fail with "browser has been
      // closed". Re-check liveness and relaunch rather than reuse a corpse.
      const existing = await this.browserPromise.catch(() => null);
      if (existing && existing.isConnected()) return existing;
      this.browserPromise = null;
    }
    this.browserPromise = (async () => {
      // Imported lazily so the API can boot (and unit tests can run) without
      // the browser binary present; only a PDF request needs it.
      const { chromium } = await import('playwright');
      const browser = await launchChromium(chromium);
      // A launch that later dies must not leave a stale promise behind.
      browser.on('disconnected', () => {
        this.browserPromise = null;
      });
      this.logger.log('PDF renderer browser started');
      return browser;
    })().catch((error) => {
      // Reset so a later request retries instead of reusing a rejected promise.
      this.browserPromise = null;
      throw error;
    });
    return this.browserPromise;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.browserPromise) return;
    try {
      const browser = await this.browserPromise;
      await browser.close();
    } catch {
      // A browser that never started has nothing to close.
    }
    this.browserPromise = null;
  }

  /**
   * Renders a full HTML document to PDF bytes.
   *
   * `background: true` is required — the report uses filled header bars and
   * shaded tables, and Chromium drops background colours when printing by
   * default.
   */
  async render(
    html: string,
    options: { footerHtml?: string; margins?: PdfMargins } = {},
  ): Promise<{ pdf: Buffer; pageCount: number }> {
    const browser = await this.browser();
    const context = await browser.newContext({ viewport: { width: 1240, height: 1754 } });
    const page = await context.newPage();
    try {
      await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });

      // `font-display:block` keeps text invisible until the face is ready; wait
      // for it explicitly so the first page is not rendered in a fallback font.
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMedia({ media: 'print' });

      // The footer is a Chromium *footer template*, not in-flow markup. A footer
      // in the flow sits after the content and pushes a short document onto a
      // second page; the template is painted in the page margin instead, so it
      // never consumes content height and the real page counter is available.
      // Chromium only substitutes `.pageNumber`/`.totalPages` when the template
      // sets a font size, and margins must be non-zero for the band to show.
      //
      // The margins are a parameter because the official financial layout was
      // measured against a printed reference with tighter edges than the report;
      // a single fixed margin would make one of the two documents drift.
      const footerHtml = options.footerHtml;
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: Boolean(footerHtml),
        headerTemplate: '<span></span>',
        footerTemplate: footerHtml ?? '<span></span>',
        margin: options.margins ?? DEFAULT_PDF_MARGINS,
      });

      const buffer = Buffer.from(pdf);
      return { pdf: buffer, pageCount: countPdfPages(buffer) };
    } finally {
      await context.close();
    }
  }

  /** The `@font-face` rules plus the base print stylesheet every document shares. */
  async baseStyles(): Promise<string> {
    return `${await this.fonts.fontFaceCss()}\n${BASE_PRINT_CSS}`;
  }
}

/**
 * Launches Chromium for document rendering.
 *
 * Playwright's bundled build is preferred, but the binary is not installed by
 * `pnpm install` — it needs `playwright install chromium`. A deployment that
 * skipped that step (or a sandbox that wiped the browser cache) would otherwise
 * fail *every* issue, preview and print request with an opaque
 * "Executable doesn't exist" 500. Falling back to a system Chromium keeps the
 * documents working, and the explicit message below tells an operator how to
 * restore the bundled build.
 *
 * `PLAYWRIGHT_CHROMIUM` names a build explicitly, matching the audit scripts.
 */
export async function launchChromium(chromium: BrowserType): Promise<Browser> {
  const args = ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'];
  const explicit = process.env.PLAYWRIGHT_CHROMIUM;
  if (explicit) return chromium.launch({ args, executablePath: explicit });
  try {
    return await chromium.launch({ args });
  } catch (error) {
    const system = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].find(
      (path) => existsSync(path),
    );
    if (!system) {
      throw new Error(
        `Document rendering needs Chromium. Run "pnpm --filter @oryx/admin exec playwright install chromium", ` +
          `or set PLAYWRIGHT_CHROMIUM. Cause: ${(error as Error).message}`,
      );
    }
    return chromium.launch({ args, executablePath: system });
  }
}

/**
 * Page margins for a generated PDF, in Chromium's CSS length units.
 */
export interface PdfMargins {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

/**
 * The default margins: a comfortable frame for a multi-page report.
 *
 * The footer is painted inside the bottom margin, so it is deeper than the other
 * three sides.
 */
export const DEFAULT_PDF_MARGINS: PdfMargins = {
  top: '12mm',
  right: '12mm',
  bottom: '20mm',
  left: '12mm',
};

/**
 * Margins for the official financial layout.
 *
 * Measured from the approved printed invoice: the content starts close to the
 * top edge (the identity band sits ~4mm down) and the footer sits in the bottom
 * margin. Wider than the default so the printed table lines up with the
 * reference document.
 */
export const OFFICIAL_PDF_MARGINS: PdfMargins = {
  top: '5.7mm',
  right: '8.6mm',
  bottom: '10.5mm',
  left: '9.3mm',
};

/**
 * Measured from the approved inspection report.
 *
 * Only the top edge differs from the default: the reference prints the brand
 * lockup about 5.6mm from the paper edge, which is higher than the default
 * 12mm. The side margins stay at the default 12mm because the cover photograph
 * is drawn as a full-bleed band that reaches the paper edge by cancelling
 * exactly that inset; narrowing the sides would push the band past the page and
 * make Chromium shrink the whole sheet to fit.
 */
export const REPORT_PDF_MARGINS: PdfMargins = {
  top: '5.6mm',
  right: '12mm',
  bottom: '11mm',
  left: '12mm',
};

/**
 * Counts pages by reading the PDF page tree.
 *
 * Chromium does not report a page count, and a caller needs one for the stored
 * document row. The count is read from the raw bytes rather than by pulling in a
 * PDF parser: `/Type /Page` appears once per page and the `/Count` entry of the
 * page tree gives the total, which is enough for a document we just generated
 * ourselves.
 */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const counts = [...text.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1]));
  if (counts.length > 0) return Math.max(...counts);
  const pages = text.match(/\/Type\s*\/Page[^s]/g);
  return pages ? pages.length : 1;
}

/**
 * Shared print CSS.
 *
 * The palette is the approved ORYX identity: navy #0F2B48 and gold. `@page`
 * carries the A4 size and the running margin box; each template supplies its own
 * header and footer because the footer differs per document.
 */
export const BASE_PRINT_CSS = `
  :root{
    --navy:#0F2B48;
    --navy-soft:#1c3f66;
    --gold:#c98a2c;
    --gold-soft:#e6cf7a;
    --ink:#111827;
    --muted:#5b6472;
    --line:#d7dce3;
    --line-strong:#9aa4b2;
    --ok:#1f9d55;
    --warn:#e08a1e;
    --bad:#d92d20;
  }
  /* The page *margins* are set by the renderer, not here: the footer is a
     Chromium footer template that is painted inside the bottom margin, and a
     margin declared in CSS would silently win over the renderer's value and
     clip it. Only the paper size is declared. */
  @page{ size:A4; }
  *{ box-sizing:border-box; }
  html,body{ margin:0; padding:0; }
  body{
    font-family:${DOCUMENT_FONT_STACK};
    color:var(--ink);
    font-size:10.5pt;
    line-height:1.45;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .ltr{ direction:ltr; unicode-bidi:isolate; font-family:${DOCUMENT_LATIN_STACK}; }
  .num{ font-family:${DOCUMENT_LATIN_STACK}; font-variant-numeric:tabular-nums; direction:ltr; unicode-bidi:isolate; }
  .doc-page{ page-break-after:always; position:relative; }
  .doc-page:last-child{ page-break-after:auto; }
  h1,h2,h3,h4{ margin:0; font-weight:700; }
  table{ width:100%; border-collapse:collapse; }
  thead{ display:table-header-group; }
  tr{ page-break-inside:avoid; }
  .avoid-break{ page-break-inside:avoid; }
`;
