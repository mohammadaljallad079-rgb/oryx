import { Module } from '@nestjs/common';
import { DocumentSequenceService } from './document-sequence.service';
import { AccountingPostingService } from './accounting-posting.service';
import { ErpContextService } from './erp-context.service';
import { QrService } from '../documents/pdf/qr.service';

/**
 * Shared ERP core services used by every Execution 02 operational module:
 * document numbering, the double-entry posting engine, and the tenant/plan
 * context resolver. Kept in one module so the posting engine has exactly one
 * instance across the accounting, sales, purchasing and inventory modules.
 *
 * `QrService` lives here too: the issued document and the on-demand print form
 * must encode the *same* verification URL for one record, so both paths resolve
 * it from a single provider rather than each minting its own.
 */
@Module({
  providers: [DocumentSequenceService, AccountingPostingService, ErpContextService, QrService],
  exports: [DocumentSequenceService, AccountingPostingService, ErpContextService, QrService],
})
export class ErpCommonModule {}
