/**
 * ERP mobile internationalisation and direction.
 *
 * Arabic is the default locale and the app is Arabic-first RTL; English is LTR.
 * The device locale seeds the initial choice, but the signed-in user's stored
 * preference wins once the profile loads, because the control plane and the app
 * must agree on the language of the same account.
 */

export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export function directionFor(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

type Entry = { ar: string; en: string };

const strings: Record<string, Entry> = {
  appName: { ar: 'أوريكس ERP', en: 'ORYX ERP' },
  tagline: { ar: 'منصة إدارة الأعمال', en: 'Business management platform' },

  // Auth
  signIn: { ar: 'تسجيل الدخول', en: 'Sign in' },
  signOut: { ar: 'تسجيل الخروج', en: 'Sign out' },
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  password: { ar: 'كلمة المرور', en: 'Password' },
  mfaCode: { ar: 'رمز التحقق', en: 'Verification code' },
  mfaPrompt: {
    ar: 'أدخل الرمز من تطبيق المصادقة.',
    en: 'Enter the code from your authenticator app.',
  },
  verify: { ar: 'تحقق', en: 'Verify' },
  sessionExpired: {
    ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
    en: 'Your session ended. Please sign in again.',
  },
  signingIn: { ar: 'جارٍ تسجيل الدخول…', en: 'Signing in…' },

  // Navigation
  dashboard: { ar: 'لوحة المعلومات', en: 'Dashboard' },
  browse: { ar: 'السجلات', en: 'Records' },
  newInvoice: { ar: 'فاتورة', en: 'Invoice' },
  transfer: { ar: 'تحويل', en: 'Transfer' },
  account: { ar: 'حسابي', en: 'Account' },
  notifications: { ar: 'الإشعارات', en: 'Notifications' },

  // Dashboard
  welcome: { ar: 'أهلاً', en: 'Welcome' },
  dashboardSubtitle: {
    ar: 'ملخص أداء الشركة.',
    en: 'A summary of company performance.',
  },
  revenue: { ar: 'الإيرادات', en: 'Revenue' },
  invoices: { ar: 'الفواتير', en: 'Invoices' },
  outstanding: { ar: 'المبالغ المستحقة', en: 'Outstanding' },
  customers: { ar: 'العملاء', en: 'Customers' },
  lowStock: { ar: 'مخزون منخفض', en: 'Low stock' },
  activeProjects: { ar: 'المشاريع النشطة', en: 'Active projects' },
  employees: { ar: 'الموظفون', en: 'Employees' },
  openTickets: { ar: 'التذاكر المفتوحة', en: 'Open tickets' },
  recentActivity: { ar: 'آخر النشاطات', en: 'Recent activity' },
  demoData: {
    ar: 'هذه الأرقام بيانات تجريبية.',
    en: 'These figures are demo data.',
  },

  // Records
  search: { ar: 'بحث', en: 'Search' },
  all: { ar: 'الكل', en: 'All' },
  none: { ar: 'لا توجد سجلات.', en: 'No records found.' },
  loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
  error: { ar: 'تعذّر تحميل البيانات.', en: 'Could not load the data.' },
  retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  create: { ar: 'إنشاء', en: 'Create' },
  edit: { ar: 'تعديل', en: 'Edit' },
  editRecord: { ar: 'تعديل السجل', en: 'Edit record' },
  save: { ar: 'حفظ', en: 'Save' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  close: { ar: 'إغلاق', en: 'Close' },
  required: { ar: 'حقل مطلوب', en: 'This field is required' },
  saved: { ar: 'تم الحفظ.', en: 'Saved.' },
  results: { ar: 'نتيجة', en: 'results' },
  loadMore: { ar: 'المزيد', en: 'Load more' },

  // Scope
  company: { ar: 'الشركة', en: 'Company' },
  branch: { ar: 'الفرع', en: 'Branch' },
  allBranches: { ar: 'كل الفروع', en: 'All branches' },
  switchCompany: { ar: 'تغيير الشركة', en: 'Switch company' },

  // Resources
  resCustomers: { ar: 'العملاء', en: 'Customers' },
  resProducts: { ar: 'المنتجات', en: 'Products' },
  resInvoices: { ar: 'فواتير البيع', en: 'Sales invoices' },
  resQuotations: { ar: 'عروض الأسعار', en: 'Quotations' },
  resOrders: { ar: 'أوامر البيع', en: 'Sales orders' },
  resSuppliers: { ar: 'الموردون', en: 'Suppliers' },
  resWarehouses: { ar: 'المستودعات', en: 'Warehouses' },
  resTransfers: { ar: 'التحويلات', en: 'Stock transfers' },
  resMovements: { ar: 'حركات المخزون', en: 'Stock movements' },
  resEmployees: { ar: 'الموظفون', en: 'Employees' },
  resLeads: { ar: 'العملاء المحتملون', en: 'Leads' },
  resOpportunities: { ar: 'الفرص', en: 'Opportunities' },
  resTickets: { ar: 'تذاكر الدعم', en: 'Support tickets' },
  resProjects: { ar: 'المشاريع', en: 'Projects' },
  resTasks: { ar: 'المهام', en: 'Tasks' },
  resWorkOrders: { ar: 'أوامر العمل', en: 'Work orders' },
  resVehicles: { ar: 'المركبات', en: 'Vehicles' },
  resJobCards: { ar: 'بطاقات العمل', en: 'Job cards' },
  resJournals: { ar: 'القيود المحاسبية', en: 'Journal entries' },
  resAccounts: { ar: 'دليل الحسابات', en: 'Chart of accounts' },
  resPayments: { ar: 'المدفوعات', en: 'Payments' },
  resPurchasingOrders: { ar: 'أوامر الشراء', en: 'Purchase orders' },

  // Records labels
  code: { ar: 'الرمز', en: 'Code' },
  name: { ar: 'الاسم', en: 'Name' },
  customer: { ar: 'العميل', en: 'Customer' },
  nameEn: { ar: 'الاسم بالإنجليزية', en: 'Name (English)' },
  nameAr: { ar: 'الاسم بالعربية', en: 'Name (Arabic)' },
  status: { ar: 'الحالة', en: 'Status' },
  phone: { ar: 'الهاتف', en: 'Phone' },
  city: { ar: 'المدينة', en: 'City' },
  sku: { ar: 'رمز الصنف', en: 'SKU' },
  vin: { ar: 'رقم الهيكل', en: 'VIN' },
  plate: { ar: 'رقم اللوحة', en: 'Plate' },
  make: { ar: 'الصانع', en: 'Make' },
  model: { ar: 'الطراز', en: 'Model' },
  modelYear: { ar: 'سنة الصنع', en: 'Model year' },
  color: { ar: 'اللون', en: 'Colour' },
  price: { ar: 'السعر', en: 'Price' },
  total: { ar: 'الإجمالي', en: 'Total' },
  date: { ar: 'التاريخ', en: 'Date' },
  dueDate: { ar: 'تاريخ الاستحقاق', en: 'Due date' },
  quantity: { ar: 'الكمية', en: 'Quantity' },
  unit: { ar: 'الوحدة', en: 'Unit' },
  type: { ar: 'النوع', en: 'Type' },
  notes: { ar: 'ملاحظات', en: 'Notes' },
  actions: { ar: 'إجراءات', en: 'Actions' },
  view: { ar: 'عرض', en: 'View' },

  // Invoice
  newInvoiceTitle: { ar: 'فاتورة بيع جديدة', en: 'New sales invoice' },
  selectCustomer: { ar: 'العميل', en: 'Customer' },
  addLine: { ar: 'إضافة سطر', en: 'Add line' },
  lineDescription: { ar: 'الوصف', en: 'Description' },
  unitPrice: { ar: 'سعر الوحدة', en: 'Unit price' },
  taxRate: { ar: 'الضريبة %', en: 'Tax %' },
  discount: { ar: 'الخصم %', en: 'Discount %' },
  subtotal: { ar: 'المجموع الفرعي', en: 'Subtotal' },
  tax: { ar: 'الضريبة', en: 'Tax' },
  postInvoice: { ar: 'ترحيل الفاتورة', en: 'Post the invoice' },
  issueStock: { ar: 'إخراج المخزون', en: 'Issue stock' },
  invoiceCreated: { ar: 'تم إنشاء الفاتورة', en: 'Invoice created' },
  removeLine: { ar: 'حذف', en: 'Remove' },
  linesRequired: { ar: 'أضف سطراً واحداً على الأقل.', en: 'Add at least one line.' },

  // Transfer
  newTransferTitle: { ar: 'تحويل مخزون', en: 'New stock transfer' },
  fromWarehouse: { ar: 'من مستودع', en: 'From warehouse' },
  toWarehouse: { ar: 'إلى مستودع', en: 'To warehouse' },
  product: { ar: 'المنتج', en: 'Product' },
  postTransfer: { ar: 'ترحيل التحويل', en: 'Post the transfer' },
  transferCreated: { ar: 'تم إنشاء التحويل', en: 'Transfer created' },
  transferPosted: { ar: 'تم ترحيل التحويل', en: 'Transfer posted' },
  sameWarehouse: {
    ar: 'يجب أن يكون المستودعان مختلفين.',
    en: 'The two warehouses must differ.',
  },
  available: { ar: 'المتاح', en: 'Available' },

  // Account
  profile: { ar: 'الملف الشخصي', en: 'Profile' },
  language: { ar: 'اللغة', en: 'Language' },
  arabic: { ar: 'العربية', en: 'Arabic' },
  english: { ar: 'الإنجليزية', en: 'English' },
  appearance: { ar: 'المظهر', en: 'Appearance' },
  darkTheme: { ar: 'داكن', en: 'Dark' },
  lightTheme: { ar: 'فاتح', en: 'Light' },
  permissions: { ar: 'الصلاحيات', en: 'Permissions' },
  sessions: { ar: 'الجلسات', en: 'Sessions' },
  revokeSession: { ar: 'إنهاء الجلسة', en: 'Revoke' },
  thisDevice: { ar: 'هذا الجهاز', en: 'This device' },
  version: { ar: 'الإصدار', en: 'Version' },
  modules: { ar: 'الوحدات المرخّصة', en: 'Licensed modules' },
  noPermission: {
    ar: 'لا تملك صلاحية عرض هذا السجل.',
    en: 'You do not have permission to view this record.',
  },
};

export type TranslateKey = keyof typeof strings;

export function translate(locale: Locale, key: TranslateKey): string {
  const entry = strings[key];
  if (!entry) return String(key);
  return entry[locale];
}
