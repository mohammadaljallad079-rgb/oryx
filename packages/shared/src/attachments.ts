/**
 * Attachment catalogue.
 *
 * Every attachable record in the platform is declared here exactly once. The
 * API validates an upload against this catalogue, so an entity type that is not
 * declared cannot be attached to, and the admin UI derives its permission and
 * label from the same declaration. Adding an attachable entity is therefore a
 * one-line change here rather than a new endpoint.
 */

export interface AttachmentEntityDefinition {
  /** Stable key stored in `EntityAttachment.entityType`. */
  entityType: string;
  labelEn: string;
  labelAr: string;
  /** Module whose licence gates the entity. */
  moduleKey?: string;
  /** Permission required to list and read attachments. */
  readPermission: string;
  /** Permission required to upload, replace or delete attachments. */
  writePermission: string;
  /** Extra permission required to read a row flagged confidential. */
  confidentialPermission?: string;
}

const E = (
  entityType: string,
  labelEn: string,
  labelAr: string,
  readPermission: string,
  writePermission: string,
  moduleKey?: string,
  confidentialPermission?: string,
): AttachmentEntityDefinition => ({
  entityType,
  labelEn,
  labelAr,
  moduleKey,
  readPermission,
  writePermission,
  confidentialPermission,
});

export const ATTACHMENT_ENTITIES: readonly AttachmentEntityDefinition[] = [
  // ------------------------------------------------------------- platform
  E('COMPANY', 'Company', 'شركة', 'company.read', 'company.update'),
  E('BRANCH', 'Branch', 'فرع', 'company.branch.read', 'company.branch.update'),
  E('USER', 'User account', 'حساب مستخدم', 'company.user.read', 'company.user.update'),
  E('ROLE', 'Role', 'دور', 'company.role.read', 'company.role.update'),
  // CMS content is platform-global, so its only gate is the CMS permission. A
  // tenant read permission here would lock out the sole principal who manages it.
  E('CMS_PAGE', 'Website page', 'صفحة الموقع', 'platform.cms.manage', 'platform.cms.manage'),
  E('CMS_BANNER', 'Website banner', 'بانر الموقع', 'platform.cms.manage', 'platform.cms.manage'),

  // ---------------------------------------------------------------- finance
  E('JOURNAL_ENTRY', 'Journal entry', 'قيد يومية', 'erp.accounting.read', 'erp.accounting.journal.post', 'financial_accounting'),
  E('ACCOUNT', 'Account', 'حساب', 'erp.accounting.read', 'erp.accounting.coa.manage', 'financial_accounting'),
  E('FISCAL_YEAR', 'Fiscal year', 'سنة مالية', 'erp.accounting.read', 'erp.accounting.fiscal.manage', 'financial_accounting'),
  E('PAYMENT', 'Payment', 'دفعة', 'erp.accounting.read', 'erp.accounting.payment.manage', 'financial_accounting'),

  // ------------------------------------------------------ sales & purchasing
  E('SALES_INVOICE', 'Sales invoice', 'فاتورة بيع', 'erp.sales.read', 'erp.sales.invoice.manage', 'sales_pos'),
  E('SALES_ORDER', 'Sales order', 'أمر بيع', 'erp.sales.read', 'erp.sales.order.manage', 'sales_pos'),
  E('QUOTATION', 'Quotation', 'عرض سعر', 'erp.sales.read', 'erp.sales.order.manage', 'sales_pos'),
  E('CREDIT_NOTE', 'Credit note', 'إشعار دائن', 'erp.sales.read', 'erp.sales.credit_note.manage', 'sales_pos'),
  E('POS_SALE', 'POS sale', 'بيع نقطة بيع', 'erp.sales.read', 'erp.sales.pos.operate', 'sales_pos'),
  E('CASHIER_SESSION', 'Cashier session', 'جلسة كاشير', 'erp.sales.read', 'erp.sales.pos.manage', 'sales_pos'),
  E('CUSTOMER', 'Customer', 'عميل', 'erp.sales.read', 'erp.sales.customer.manage', 'sales_pos'),
  E('PRODUCT', 'Product', 'منتج', 'erp.inventory.read', 'erp.inventory.item.manage', 'warehouses_inventory'),
  E('SUPPLIER', 'Supplier', 'مورد', 'erp.purchasing.read', 'erp.purchasing.supplier.manage', 'purchasing_procurement'),
  E('PURCHASE_REQUISITION', 'Purchase requisition', 'طلب شراء', 'erp.purchasing.read', 'erp.purchasing.requisition.manage', 'purchasing_procurement'),
  E('PURCHASE_ORDER', 'Purchase order', 'أمر شراء', 'erp.purchasing.read', 'erp.purchasing.order.manage', 'purchasing_procurement'),
  E('GOODS_RECEIPT', 'Goods receipt', 'استلام بضائع', 'erp.purchasing.read', 'erp.purchasing.receipt.manage', 'purchasing_procurement'),
  E('SUPPLIER_INVOICE', 'Supplier invoice', 'فاتورة مورد', 'erp.purchasing.read', 'erp.purchasing.invoice.manage', 'purchasing_procurement'),
  E('PURCHASE_RETURN', 'Purchase return', 'مرتجع شراء', 'erp.purchasing.read', 'erp.purchasing.return.manage', 'purchasing_procurement'),

  // ------------------------------------------------------------- inventory
  E('WAREHOUSE', 'Warehouse', 'مستودع', 'erp.inventory.read', 'erp.inventory.warehouse.manage', 'warehouses_inventory'),
  E('STOCK_TRANSFER', 'Stock transfer', 'تحويل مخزون', 'erp.inventory.read', 'erp.inventory.transfer.manage', 'warehouses_inventory'),
  E('STOCK_ADJUSTMENT', 'Stock adjustment', 'تسوية مخزون', 'erp.inventory.read', 'erp.inventory.adjustment.manage', 'warehouses_inventory'),

  // -------------------------------------------------------------------- HR
  E('EMPLOYEE', 'Employee', 'موظف', 'erp.hr.read', 'erp.hr.employee.manage', 'human_resources', 'erp.hr.document.confidential'),
  E('EMPLOYEE_DOCUMENT', 'Employee document', 'مستند موظف', 'erp.hr.document.read', 'erp.hr.employee.manage', 'human_resources', 'erp.hr.document.confidential'),
  E('EMPLOYMENT_CONTRACT', 'Employment contract', 'عقد عمل', 'erp.hr.read', 'erp.hr.employee.manage', 'human_resources', 'erp.hr.document.confidential'),
  E('LEAVE_REQUEST', 'Leave request', 'طلب إجازة', 'erp.hr.read', 'erp.hr.leave.request', 'human_resources'),
  E('ATTENDANCE_RECORD', 'Attendance record', 'سجل حضور', 'erp.hr.read', 'erp.hr.attendance.manage', 'human_resources'),
  E('PAYROLL_RUN', 'Payroll run', 'تشغيل رواتب', 'erp.hr.read', 'erp.hr.payroll.run', 'human_resources', 'erp.hr.salary.read'),
  E('PAYSLIP', 'Payslip', 'قسيمة راتب', 'erp.hr.read', 'erp.hr.payroll.run', 'human_resources', 'erp.hr.salary.read'),
  E('EMPLOYEE_PENALTY', 'Disciplinary action', 'إجراء إداري', 'erp.hr.read', 'erp.hr.penalty.manage', 'human_resources', 'erp.hr.document.confidential'),
  E('EMPLOYEE_BONUS', 'Bonus', 'مكافأة', 'erp.hr.read', 'erp.hr.bonus.manage', 'human_resources', 'erp.hr.salary.read'),
  E('EMPLOYEE_ADVANCE', 'Employee advance', 'سلفة موظف', 'erp.hr.read', 'erp.hr.advance.manage', 'human_resources', 'erp.hr.salary.read'),

  // ------------------------------------------------------------- CRM & ops
  E('LEAD', 'Lead', 'عميل محتمل', 'erp.crm.read', 'erp.crm.lead.manage', 'crm'),
  E('OPPORTUNITY', 'Opportunity', 'فرصة', 'erp.crm.read', 'erp.crm.opportunity.manage', 'crm'),
  E('SUPPORT_TICKET', 'Support ticket', 'تذكرة دعم', 'erp.crm.read', 'erp.crm.ticket.manage', 'crm'),
  E('PROJECT', 'Project', 'مشروع', 'erp.operations.read', 'erp.operations.project.manage', 'operations'),
  E('PROJECT_TASK', 'Task', 'مهمة', 'erp.operations.read', 'erp.operations.task.manage', 'operations'),
  E('WORK_ORDER', 'Work order', 'أمر عمل', 'erp.operations.read', 'erp.operations.work_order.manage', 'operations'),
  E('APPROVAL_REQUEST', 'Approval request', 'طلب اعتماد', 'erp.operations.read', 'erp.operations.approval.manage', 'operations'),

  // ----------------------------------------------------------- automotive
  E('VEHICLE', 'Vehicle', 'مركبة', 'erp.vehicle.read', 'erp.vehicle.manage', 'automotive_inspections'),
  E('INSPECTION_BOOKING', 'Inspection booking', 'حجز فحص', 'erp.inspection.read', 'erp.inspection.booking.manage', 'automotive_inspections'),
  E('INSPECTION_REPORT', 'Inspection report', 'تقرير فحص', 'erp.inspection.read', 'erp.inspection.report.approve', 'automotive_inspections'),
  E('MAINTENANCE_BOOKING', 'Maintenance booking', 'حجز صيانة', 'erp.maintenance.read', 'erp.maintenance.booking.manage', 'automotive_maintenance'),
  E('JOB_CARD', 'Job card', 'بطاقة عمل', 'erp.maintenance.read', 'erp.maintenance.jobcard.manage', 'automotive_maintenance'),
  E('REPAIR_ESTIMATE', 'Repair estimate', 'تقدير إصلاح', 'erp.maintenance.read', 'erp.maintenance.estimate.manage', 'automotive_maintenance'),
  E('PART_REFERENCE', 'Spare part', 'قطعة غيار', 'erp.spare_parts.read', 'erp.spare_parts.write', 'spare_parts'),
  E('INSPECTION_SERVICE', 'Inspection service', 'خدمة فحص', 'erp.inspection.read', 'erp.inspection.service.manage', 'automotive_inspections'),

  // ------------------------------------------- bookings, marketplace, money
  E('BOOKING', 'Booking', 'حجز', 'erp.booking.read', 'erp.booking.manage', 'booking_engine'),
  E('BOOKING_RESOURCE', 'Booking resource', 'مورد حجز', 'erp.booking.read', 'erp.booking.resource.manage', 'booking_engine'),
  E('MARKETPLACE_PROVIDER', 'Service provider', 'مزود خدمة', 'erp.provider_portal.read', 'erp.provider_portal.manage', 'provider_portal'),
  E('PROVIDER_SERVICE_LISTING', 'Provider listing', 'عرض خدمة', 'erp.provider_portal.read', 'erp.marketplace.listing.manage', 'provider_portal'),
  E('SERVICE_REQUEST', 'Service request', 'طلب خدمة', 'erp.provider_portal.read', 'erp.marketplace.request.manage', 'provider_portal'),
  E('PROVIDER_SETTLEMENT', 'Provider settlement', 'تسوية مزود', 'erp.payments.read', 'erp.marketplace.commission.manage', 'payments'),
  E('PAYMENT_INTENT', 'Payment intent', 'نية دفع', 'erp.payments.read', 'erp.payments.manage', 'payments'),
  E('REFUND', 'Refund', 'استرداد', 'erp.payments.read', 'erp.payments.manage', 'payments'),
  E('CUSTOMER_ACCOUNT', 'Customer account', 'حساب عميل', 'erp.customer_portal.read', 'erp.customer_portal.read', 'customer_portal'),
];

const BY_ENTITY_TYPE = new Map(ATTACHMENT_ENTITIES.map((e) => [e.entityType, e]));

export function getAttachmentEntity(entityType: string): AttachmentEntityDefinition | undefined {
  return BY_ENTITY_TYPE.get(entityType);
}

export function isAttachmentEntityType(entityType: string): boolean {
  return BY_ENTITY_TYPE.has(entityType);
}

/** Hard ceiling per uploaded file. Kept in sync with the API multer limit. */
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;

/** Up to this many files may be attached in one request. */
export const ATTACHMENT_MAX_FILES_PER_REQUEST = 10;

/**
 * Accepted MIME types. Anything outside this list is refused by the API, so a
 * browser cannot upload an executable disguised as a document.
 */
export const ATTACHMENT_ALLOWED_MIME_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/tab-separated-values',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.spreadsheet',
  'application/zip',
  'application/json',
  'application/xml',
];

export type AttachmentPreviewKind = 'image' | 'pdf' | 'text' | 'office' | 'none';

const EXTENSION_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  zip: 'application/zip',
  json: 'application/json',
  xml: 'application/xml',
};

export function extensionOf(fileName: string): string {
  const idx = fileName.lastIndexOf('.');
  return idx === -1 ? '' : fileName.slice(idx + 1).toLowerCase();
}

/** Best-effort MIME type: the browser value when present, else the extension. */
export function resolveMimeType(fileName: string, declared?: string | null): string {
  const cleaned = (declared ?? '').split(';')[0].trim().toLowerCase();
  if (cleaned && cleaned !== 'application/octet-stream') return cleaned;
  return EXTENSION_MIME[extensionOf(fileName)] ?? 'application/octet-stream';
}

export function isAllowedAttachmentType(mimeType: string): boolean {
  return ATTACHMENT_ALLOWED_MIME_TYPES.includes(mimeType);
}

/**
 * How the admin UI can show a file without downloading it.
 *
 * Office documents are `office`: the browser cannot render them, so the UI
 * offers the download and says so plainly rather than pretending to preview.
 */
export function attachmentPreviewKind(mimeType: string | null | undefined, fileName: string): AttachmentPreviewKind {
  const mime = resolveMimeType(fileName, mimeType);
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/plain' || mime === 'text/csv' || mime === 'text/tab-separated-values' || mime === 'application/json' || mime === 'application/xml') {
    return 'text';
  }
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-powerpoint' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mime === 'application/vnd.oasis.opendocument.text' ||
    mime === 'application/vnd.oasis.opendocument.spreadsheet'
  ) {
    return 'office';
  }
  return 'none';
}
