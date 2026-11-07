import { DOCUMENT_FONT_STACK, DOCUMENT_LATIN_STACK } from './document-fonts.service';
import { BASE_PRINT_CSS } from './pdf-renderer.service';

/**
 * The numeric and Latin classes must keep an Arabic face in their stack.
 *
 * `.num` and `.ltr` used to hardcode `'ORYX Sans', sans-serif`. `ORYX Sans` is
 * the Latin face and carries no Arabic, but a money cell renders the Arabic
 * currency symbol (`د.ب` for BHD), so those glyphs escaped the embedded faces
 * and Chromium synthesised a Type3 bitmap font from a host face. On a runner
 * without the host face that fallback is the only way the glyph can be drawn,
 * and the PDF text layer breaks.
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
    expect(fontFamilyOf('.num')).toContain('ORYX Naskh');
  });

  it('keeps an Arabic face in the Latin stack', () => {
    expect(fontFamilyOf('.ltr')).toContain('ORYX Naskh');
  });

  it('composes both stacks from the shared constants, not inline literals', () => {
    expect(DOCUMENT_LATIN_STACK).toContain('ORYX Naskh');
    expect(DOCUMENT_LATIN_STACK).toContain('ORYX Sans');
    expect(DOCUMENT_FONT_STACK).toContain('ORYX Naskh');
  });
});
