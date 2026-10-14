import { Module } from '@nestjs/common';
import { DocumentSequenceService } from './document-sequence.service';
import { AccountingPostingService } from './accounting-posting.service';
import { ErpContextService } from './erp-context.service';

/**
 * Shared ERP core services used by every Execution 02 operational module:
 * document numbering, the double-entry posting engine, and the tenant/plan
 * context resolver. Kept in one module so the posting engine has exactly one
 * instance across the accounting, sales, purchasing and inventory modules.
 */
@Module({
  providers: [DocumentSequenceService, AccountingPostingService, ErpContextService],
  exports: [DocumentSequenceService, AccountingPostingService, ErpContextService],
})
export class ErpCommonModule {}
