import { Controller, Get, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { PrintDocumentDto } from '@oryx/shared';
import {
  CurrentPrincipal,
  RequireAnyPermission,
  type RequestPrincipal,
} from '../auth/auth.decorators';
import { PrintService } from './print.service';
import type { PrintDocumentKind } from '@oryx/shared';

const PRINT_PERMISSIONS = [
  'erp.sales.read',
  'erp.sales.invoice.manage',
  'erp.sales.order.manage',
  'erp.sales.credit_note.manage',
  'erp.sales.payment.manage',
  'erp.accounting.read',
  'erp.accounting.payment.manage',
];

/**
 * Read-only print model.
 *
 * The route deliberately requires no module: it only ever returns data the
 * caller could already read through the owning module's own endpoints, and a
 * tenant whose plan has lapsed must still be able to reprint a document it
 * already issued.
 */
@ApiTags('print')
@ApiBearerAuth()
@Controller('print')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get(':kind/:id')
  @RequireAnyPermission(...PRINT_PERMISSIONS)
  @ApiOperation({ summary: 'Resolve a printable document (invoice, quotation, order, credit note, receipt)' })
  document(
    @Param('kind') kind: PrintDocumentKind,
    @Param('id') id: string,
    @CurrentPrincipal() p: RequestPrincipal,
  ): Promise<PrintDocumentDto> {
    return this.print.build(kind, id, p);
  }
}
