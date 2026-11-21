import { readFileSync, writeFileSync } from 'node:fs';
import { renderPrintDocument } from '../apps/admin/src/lib/print-document';
import type { PrintDocumentDto, Locale } from '@oryx/shared';

const dto = JSON.parse(readFileSync(process.argv[2], 'utf8')) as PrintDocumentDto;
const locale = (process.argv[3] ?? 'en') as Locale;
const html = renderPrintDocument(dto, locale);
writeFileSync(process.argv[4] ?? '/tmp/admin-preview.html', html);
console.log('wrote', html.length, 'bytes');
