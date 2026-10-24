/**
 * The record registry.
 *
 * Every list screen in the app is generated from this table: the API path, the
 * permission that guards it, the columns to show and — where the API supports it
 * — the fields to create. That keeps one screen honest across the whole ERP
 * instead of thirty hand-written pages that drift.
 *
 * The `permission` on each entry mirrors the `@RequirePermissions` decorator on
 * the matching API route. It is used to *hide* a resource the signed-in user
 * cannot read; the API enforces the same rule regardless, so hiding is a
 * convenience and never the control.
 */

import type { TranslateKey } from './i18n';

export type FieldKind = 'text' | 'number' | 'money' | 'quantity' | 'select' | 'date' | 'boolean';

export interface FieldSpec {
  /** Key in the create payload. */
  key: string;
  label: TranslateKey;
  kind: FieldKind;
  required?: boolean;
  /** Options for a `select`, as API values. */
  options?: string[];
  /** Default value, as a string, for a pre-filled form. */
  defaultValue?: string;
}

export type ColumnKind = 'text' | 'code' | 'money' | 'quantity' | 'date' | 'datetime' | 'status' | 'basisPoints';

export interface ColumnSpec {
  /** Property on the DTO. */
  key: string;
  label: TranslateKey;
  kind: ColumnKind;
  /** Currency property on the DTO, when `kind` is `money`. */
  currencyKey?: string;
}

export interface ResourceSpec {
  key: string;
  path: string;
  title: TranslateKey;
  /** Permission required to read, mirroring the API decorator. */
  permission: string;
  /** Permission required to create; absent means the resource is read-only here. */
  createPermission?: string;
  columns: ColumnSpec[];
  fields?: FieldSpec[];
  /** Server-side search parameter, when the route supports one. */
  searchParam?: string;
  /** Server-side status filter, when the route supports one. */
  statusParam?: string;
  /** Status values offered as filter chips. */
  statuses?: string[];
  /** Extra query parameters the route requires. */
  params?: Record<string, string>;
}

export const RESOURCES: ResourceSpec[] = [
  // ------------------------------------------------------------------- sales
  {
    key: 'customers',
    path: '/sales/customers',
    title: 'resCustomers',
    permission: 'erp.sales.read',
    createPermission: 'erp.sales.customer.manage',
    searchParam: 'search',
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'nameAr', label: 'nameAr', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
      { key: 'city', label: 'city', kind: 'text' },
      { key: 'creditLimitMinor', label: 'price', kind: 'money', currencyKey: 'currency' },
    ],
    fields: [
      { key: 'code', label: 'code', kind: 'text', required: true },
      { key: 'nameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'nameAr', label: 'nameAr', kind: 'text', required: true },
      { key: 'email', label: 'email', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
      { key: 'city', label: 'city', kind: 'text' },
    ],
  },
  {
    key: 'invoices',
    path: '/sales/invoices',
    title: 'resInvoices',
    permission: 'erp.sales.read',
    statusParam: 'status',
    statuses: ['DRAFT', 'POSTED', 'PARTIAL', 'PAID', 'CANCELLED'],
    columns: [
      { key: 'invoiceNumber', label: 'code', kind: 'code' },
      { key: 'customerNameEn', label: 'name', kind: 'text' },
      { key: 'invoiceDate', label: 'date', kind: 'date' },
      { key: 'dueDate', label: 'dueDate', kind: 'date' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'totalMinor', label: 'total', kind: 'money', currencyKey: 'currency' },
    ],
  },
  {
    key: 'quotations',
    path: '/sales/quotations',
    title: 'resQuotations',
    permission: 'erp.sales.read',
    statusParam: 'status',
    statuses: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'],
    columns: [
      { key: 'quoteNumber', label: 'code', kind: 'code' },
      { key: 'customerNameEn', label: 'name', kind: 'text' },
      { key: 'issueDate', label: 'date', kind: 'date' },
      { key: 'validUntil', label: 'dueDate', kind: 'date' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'totalMinor', label: 'total', kind: 'money', currencyKey: 'currency' },
    ],
  },
  {
    key: 'orders',
    path: '/sales/orders',
    title: 'resOrders',
    permission: 'erp.sales.read',
    statusParam: 'status',
    statuses: ['DRAFT', 'CONFIRMED', 'FULFILLED', 'CANCELLED'],
    columns: [
      { key: 'orderNumber', label: 'code', kind: 'code' },
      { key: 'customerNameEn', label: 'name', kind: 'text' },
      { key: 'orderDate', label: 'date', kind: 'date' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'totalMinor', label: 'total', kind: 'money', currencyKey: 'currency' },
    ],
  },

  // --------------------------------------------------------------- inventory
  {
    key: 'products',
    path: '/inventory/products',
    title: 'resProducts',
    permission: 'erp.inventory.read',
    createPermission: 'erp.inventory.item.manage',
    searchParam: 'search',
    columns: [
      { key: 'sku', label: 'sku', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'nameAr', label: 'nameAr', kind: 'text' },
      { key: 'type', label: 'type', kind: 'text' },
      { key: 'salesPriceMinor', label: 'price', kind: 'money' },
      { key: 'reorderLevel', label: 'quantity', kind: 'quantity' },
    ],
    fields: [
      { key: 'sku', label: 'sku', kind: 'text', required: true },
      { key: 'nameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'nameAr', label: 'nameAr', kind: 'text', required: true },
      { key: 'type', label: 'type', kind: 'select', options: ['PRODUCT', 'SERVICE'], defaultValue: 'PRODUCT' },
      { key: 'unit', label: 'unit', kind: 'text', defaultValue: 'EA' },
      { key: 'salesPriceMinor', label: 'price', kind: 'money' },
      { key: 'costPriceMinor', label: 'unitPrice', kind: 'money' },
      { key: 'reorderLevel', label: 'quantity', kind: 'quantity' },
    ],
  },
  {
    key: 'warehouses',
    path: '/inventory/warehouses',
    title: 'resWarehouses',
    permission: 'erp.inventory.read',
    createPermission: 'erp.inventory.warehouse.manage',
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'nameAr', label: 'nameAr', kind: 'text' },
      { key: 'branchNameEn', label: 'branch', kind: 'text' },
    ],
    fields: [
      { key: 'code', label: 'code', kind: 'text', required: true },
      { key: 'nameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'nameAr', label: 'nameAr', kind: 'text', required: true },
    ],
  },
  {
    key: 'transfers',
    path: '/inventory/transfers',
    title: 'resTransfers',
    permission: 'erp.inventory.read',
    statuses: ['DRAFT', 'POSTED', 'CANCELLED'],
    columns: [
      { key: 'transferNumber', label: 'code', kind: 'code' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'postedAt', label: 'date', kind: 'datetime' },
      { key: 'notes', label: 'notes', kind: 'text' },
    ],
  },
  {
    key: 'movements',
    path: '/inventory/movements',
    title: 'resMovements',
    permission: 'erp.inventory.read',
    columns: [
      { key: 'sku', label: 'sku', kind: 'code' },
      { key: 'productNameEn', label: 'name', kind: 'text' },
      { key: 'warehouseNameEn', label: 'branch', kind: 'text' },
      { key: 'movementType', label: 'type', kind: 'text' },
      { key: 'quantity', label: 'quantity', kind: 'quantity' },
      { key: 'occurredAt', label: 'date', kind: 'datetime' },
    ],
  },

  // -------------------------------------------------------------- purchasing
  {
    key: 'suppliers',
    path: '/purchasing/suppliers',
    title: 'resSuppliers',
    permission: 'erp.purchasing.read',
    createPermission: 'erp.purchasing.supplier.manage',
    searchParam: 'search',
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'nameAr', label: 'nameAr', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
      { key: 'city', label: 'city', kind: 'text' },
    ],
    fields: [
      { key: 'code', label: 'code', kind: 'text', required: true },
      { key: 'nameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'nameAr', label: 'nameAr', kind: 'text', required: true },
      { key: 'email', label: 'email', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
      { key: 'city', label: 'city', kind: 'text' },
    ],
  },
  {
    key: 'purchasing-orders',
    path: '/purchasing/orders',
    title: 'resPurchasingOrders',
    permission: 'erp.purchasing.read',
    statusParam: 'status',
    statuses: ['DRAFT', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    columns: [
      { key: 'orderNumber', label: 'code', kind: 'code' },
      { key: 'supplierNameEn', label: 'name', kind: 'text' },
      { key: 'orderDate', label: 'date', kind: 'date' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'totalMinor', label: 'total', kind: 'money', currencyKey: 'currency' },
    ],
  },

  // ---------------------------------------------------------------------- HR
  {
    key: 'employees',
    path: '/hr/employees',
    title: 'resEmployees',
    permission: 'erp.hr.read',
    createPermission: 'erp.hr.employee.manage',
    searchParam: 'search',
    statusParam: 'status',
    statuses: ['ACTIVE', 'ON_LEAVE', 'SUSPENDED', 'TERMINATED'],
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'fullNameEn', label: 'nameEn', kind: 'text' },
      { key: 'fullNameAr', label: 'nameAr', kind: 'text' },
      { key: 'departmentNameEn', label: 'type', kind: 'text' },
      { key: 'jobTitleNameEn', label: 'name', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
    ],
    fields: [
      { key: 'code', label: 'code', kind: 'text', required: true },
      { key: 'fullNameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'fullNameAr', label: 'nameAr', kind: 'text', required: true },
      { key: 'email', label: 'email', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
      { key: 'hireDate', label: 'date', kind: 'date', required: true },
    ],
  },

  // --------------------------------------------------------------------- CRM
  {
    key: 'leads',
    path: '/crm/leads',
    title: 'resLeads',
    permission: 'erp.crm.read',
    createPermission: 'erp.crm.lead.manage',
    searchParam: 'search',
    statusParam: 'status',
    statuses: ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'],
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'contactName', label: 'name', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'estimatedValueMinor', label: 'price', kind: 'money', currencyKey: 'currency' },
    ],
    fields: [
      { key: 'code', label: 'code', kind: 'text', required: true },
      { key: 'nameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'nameAr', label: 'nameAr', kind: 'text', required: true },
      { key: 'contactName', label: 'name', kind: 'text' },
      { key: 'email', label: 'email', kind: 'text' },
      { key: 'phone', label: 'phone', kind: 'text' },
    ],
  },
  {
    key: 'opportunities',
    path: '/crm/opportunities',
    title: 'resOpportunities',
    permission: 'erp.crm.read',
    statusParam: 'status',
    statuses: ['OPEN', 'WON', 'LOST'],
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'title', label: 'name', kind: 'text' },
      { key: 'stageNameEn', label: 'type', kind: 'text' },
      { key: 'probabilityBp', label: 'taxRate', kind: 'basisPoints' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'amountMinor', label: 'price', kind: 'money', currencyKey: 'currency' },
    ],
  },
  {
    key: 'tickets',
    path: '/crm/tickets',
    title: 'resTickets',
    permission: 'erp.crm.read',
    createPermission: 'erp.crm.ticket.manage',
    statusParam: 'status',
    statuses: ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'],
    columns: [
      { key: 'ticketNumber', label: 'code', kind: 'code' },
      { key: 'subject', label: 'name', kind: 'text' },
      { key: 'priority', label: 'type', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'createdAt', label: 'date', kind: 'datetime' },
    ],
    fields: [
      { key: 'subject', label: 'name', kind: 'text', required: true },
      { key: 'priority', label: 'type', kind: 'select', options: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], defaultValue: 'NORMAL' },
    ],
  },

  // -------------------------------------------------------------- operations
  {
    key: 'projects',
    path: '/operations/projects',
    title: 'resProjects',
    permission: 'erp.operations.read',
    createPermission: 'erp.operations.project.manage',
    statusParam: 'status',
    statuses: ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'nameAr', label: 'nameAr', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'startDate', label: 'date', kind: 'date' },
    ],
    fields: [
      { key: 'code', label: 'code', kind: 'text', required: true },
      { key: 'nameEn', label: 'nameEn', kind: 'text', required: true },
      { key: 'nameAr', label: 'nameAr', kind: 'text', required: true },
    ],
  },
  {
    key: 'tasks',
    path: '/operations/tasks',
    title: 'resTasks',
    permission: 'erp.operations.read',
    createPermission: 'erp.operations.task.manage',
    statusParam: 'status',
    statuses: ['TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'],
    columns: [
      { key: 'title', label: 'name', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'priority', label: 'type', kind: 'text' },
      { key: 'dueDate', label: 'dueDate', kind: 'date' },
    ],
    fields: [
      { key: 'title', label: 'name', kind: 'text', required: true },
      { key: 'priority', label: 'type', kind: 'select', options: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], defaultValue: 'NORMAL' },
    ],
  },
  {
    key: 'work-orders',
    path: '/operations/work-orders',
    title: 'resWorkOrders',
    permission: 'erp.operations.read',
    statusParam: 'status',
    columns: [
      { key: 'orderNumber', label: 'code', kind: 'code' },
      { key: 'title', label: 'name', kind: 'text' },
      { key: 'type', label: 'type', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'dueDate', label: 'dueDate', kind: 'date' },
    ],
  },

  // -------------------------------------------------------------- automotive
  {
    key: 'vehicles',
    path: '/automotive/vehicles',
    title: 'resVehicles',
    permission: 'erp.vehicle.read',
    createPermission: 'erp.vehicle.manage',
    searchParam: 'search',
    columns: [
      { key: 'vin', label: 'code', kind: 'code' },
      { key: 'plateNumber', label: 'sku', kind: 'text' },
      { key: 'make', label: 'nameEn', kind: 'text' },
      { key: 'model', label: 'nameAr', kind: 'text' },
      { key: 'customerNameEn', label: 'name', kind: 'text' },
      { key: 'mileage', label: 'quantity', kind: 'text' },
    ],
  },
  {
    key: 'job-cards',
    path: '/automotive/job-cards',
    title: 'resJobCards',
    permission: 'erp.maintenance.read',
    statusParam: 'status',
    columns: [
      { key: 'jobNumber', label: 'code', kind: 'code' },
      { key: 'plateNumber', label: 'sku', kind: 'text' },
      { key: 'make', label: 'nameEn', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'createdAt', label: 'date', kind: 'datetime' },
    ],
  },

  // --------------------------------------------------------------- accounting
  {
    key: 'accounts',
    path: '/accounting/accounts',
    title: 'resAccounts',
    permission: 'erp.accounting.read',
    columns: [
      { key: 'code', label: 'code', kind: 'code' },
      { key: 'nameEn', label: 'nameEn', kind: 'text' },
      { key: 'nameAr', label: 'nameAr', kind: 'text' },
      { key: 'type', label: 'type', kind: 'text' },
      { key: 'currency', label: 'unit', kind: 'text' },
    ],
  },
  {
    key: 'journals',
    path: '/accounting/journals',
    title: 'resJournals',
    permission: 'erp.accounting.read',
    statusParam: 'status',
    statuses: ['DRAFT', 'POSTED', 'REVERSED'],
    columns: [
      { key: 'entryNumber', label: 'code', kind: 'code' },
      { key: 'entryDate', label: 'date', kind: 'date' },
      { key: 'sourceType', label: 'type', kind: 'text' },
      { key: 'status', label: 'status', kind: 'status' },
      { key: 'totalDebitMinor', label: 'total', kind: 'money', currencyKey: 'currency' },
    ],
  },
  {
    key: 'payments',
    path: '/accounting/payments',
    title: 'resPayments',
    permission: 'erp.payments.read',
    columns: [
      { key: 'paymentNumber', label: 'code', kind: 'code' },
      { key: 'partyNameEn', label: 'name', kind: 'text' },
      { key: 'direction', label: 'type', kind: 'text' },
      { key: 'method', label: 'unit', kind: 'text' },
      { key: 'paidAt', label: 'date', kind: 'date' },
      { key: 'amountMinor', label: 'total', kind: 'money', currencyKey: 'currency' },
    ],
  },
];

const BY_KEY: ReadonlyMap<string, ResourceSpec> = new Map(RESOURCES.map((r) => [r.key, r]));

export function resourceFor(key: string | undefined): ResourceSpec | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

/** The resources a principal with these permissions may open. */
export function visibleResources(permissions: string[]): ResourceSpec[] {
  const held = new Set(permissions);
  return RESOURCES.filter((r) => held.has(r.permission));
}
