/**
 * Mobile internationalisation and direction.
 *
 * Arabic is the default locale and the app is Arabic-first RTL; English is LTR.
 * The device locale seeds the initial choice, but the customer's stored
 * preference wins once the profile loads, because the website and the app must
 * agree on the language of the same account.
 */

export type Locale = 'ar' | 'en';
export type Direction = 'rtl' | 'ltr';

export function directionFor(locale: Locale): Direction {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

type Entry = { ar: string; en: string };

const strings: Record<string, Entry> = {
  appName: { ar: 'أوريكس', en: 'ORYX' },
  tagline: { ar: 'منصة السيارات المتكاملة', en: 'The integrated automotive platform' },

  // Auth
  signIn: { ar: 'تسجيل الدخول', en: 'Sign in' },
  signUp: { ar: 'إنشاء حساب', en: 'Create account' },
  signOut: { ar: 'تسجيل الخروج', en: 'Sign out' },
  email: { ar: 'البريد الإلكتروني', en: 'Email' },
  password: { ar: 'كلمة المرور', en: 'Password' },
  fullName: { ar: 'الاسم الكامل', en: 'Full name' },
  phone: { ar: 'رقم الهاتف', en: 'Phone number' },
  forgotPassword: { ar: 'نسيت كلمة المرور؟', en: 'Forgot password?' },
  resetSent: {
    ar: 'إذا كان البريد مسجلاً فستصلك رسالة لإعادة التعيين.',
    en: 'If that email is registered, a reset link is on its way.',
  },
  mfaCode: { ar: 'رمز التحقق', en: 'Verification code' },
  mfaPrompt: {
    ar: 'أدخل الرمز من تطبيق المصادقة.',
    en: 'Enter the code from your authenticator app.',
  },
  verify: { ar: 'تحقق', en: 'Verify' },
  noAccount: { ar: 'ليس لديك حساب؟', en: 'No account yet?' },
  haveAccount: { ar: 'لديك حساب؟', en: 'Already have an account?' },

  // Navigation
  home: { ar: 'الرئيسية', en: 'Home' },
  garage: { ar: 'مرآب سياراتي', en: 'Garage' },
  bookings: { ar: 'حجوزاتي', en: 'Bookings' },
  services: { ar: 'الخدمات', en: 'Services' },
  account: { ar: 'حسابي', en: 'Account' },

  // Dashboard
  welcome: { ar: 'أهلاً', en: 'Welcome' },
  dashboardSubtitle: {
    ar: 'إليك ملخص خدمات سياراتك.',
    en: 'Here is a summary of your vehicle services.',
  },
  upcomingBookings: { ar: 'الحجوزات القادمة', en: 'Upcoming bookings' },
  activeRequests: { ar: 'الطلبات النشطة', en: 'Active requests' },
  savedVehicles: { ar: 'السيارات المسجلة', en: 'Saved vehicles' },
  openInvoices: { ar: 'الفواتير', en: 'Invoices' },
  bookInspection: { ar: 'حجز فحص', en: 'Book an inspection' },
  bookMaintenance: { ar: 'حجز صيانة', en: 'Book maintenance' },
  requestService: { ar: 'طلب خدمة', en: 'Request a service' },
  browseProviders: { ar: 'تصفح المزودين', en: 'Browse providers' },

  // Garage
  addVehicle: { ar: 'إضافة سيارة', en: 'Add vehicle' },
  vin: { ar: 'رقم الهيكل (VIN)', en: 'VIN' },
  plate: { ar: 'رقم اللوحة', en: 'Plate number' },
  make: { ar: 'الشركة المصنعة', en: 'Make' },
  model: { ar: 'الطراز', en: 'Model' },
  year: { ar: 'سنة الصنع', en: 'Model year' },
  color: { ar: 'اللون', en: 'Colour' },
  mileage: { ar: 'العداد (كم)', en: 'Mileage (km)' },
  noVehicles: { ar: 'لم تضف أي سيارة بعد.', en: 'You have not added a vehicle yet.' },
  serviceHistory: { ar: 'سجل الخدمة', en: 'Service history' },
  remove: { ar: 'إزالة', en: 'Remove' },

  // Bookings
  book: { ar: 'احجز', en: 'Book' },
  date: { ar: 'التاريخ', en: 'Date' },
  duration: { ar: 'المدة', en: 'Duration' },
  availableSlots: { ar: 'الأوقات المتاحة', en: 'Available slots' },
  noSlots: {
    ar: 'لا توجد أوقات متاحة في هذا اليوم.',
    en: 'No slots are available on that day.',
  },
  bookingCreated: { ar: 'تم إنشاء الحجز', en: 'Booking created' },
  cancelBooking: { ar: 'إلغاء الحجز', en: 'Cancel booking' },
  cancelReason: { ar: 'سبب الإلغاء', en: 'Reason for cancellation' },
  noBookings: { ar: 'لا توجد حجوزات.', en: 'No bookings yet.' },
  reference: { ar: 'المرجع', en: 'Reference' },
  status: { ar: 'الحالة', en: 'Status' },

  // Services and providers
  category: { ar: 'التصنيف', en: 'Category' },
  provider: { ar: 'المزود', en: 'Provider' },
  rating: { ar: 'التقييم', en: 'Rating' },
  price: { ar: 'السعر', en: 'Price' },
  noProviders: { ar: 'لا يوجد مزودون متاحون.', en: 'No providers are available.' },
  describeIssue: { ar: 'صف المشكلة', en: 'Describe the issue' },
  submitRequest: { ar: 'إرسال الطلب', en: 'Submit request' },
  requestSubmitted: { ar: 'تم إرسال الطلب', en: 'Request submitted' },
  myRequests: { ar: 'طلباتي', en: 'My requests' },

  // Invoices and notifications
  invoices: { ar: 'الفواتير والمدفوعات', en: 'Invoices and payments' },
  amount: { ar: 'المبلغ', en: 'Amount' },
  noPayments: { ar: 'لا توجد مدفوعات.', en: 'No payments yet.' },
  notifications: { ar: 'الإشعارات', en: 'Notifications' },
  markAllRead: { ar: 'تعليم الكل كمقروء', en: 'Mark all as read' },
  noNotifications: { ar: 'لا توجد إشعارات.', en: 'No notifications.' },
  refunded: { ar: 'مسترد', en: 'Refunded' },

  // Account
  language: { ar: 'اللغة', en: 'Language' },
  theme: { ar: 'المظهر', en: 'Theme' },
  dark: { ar: 'داكن', en: 'Dark' },
  light: { ar: 'فاتح', en: 'Light' },
  arabic: { ar: 'العربية', en: 'Arabic' },
  english: { ar: 'الإنجليزية', en: 'English' },
  save: { ar: 'حفظ', en: 'Save' },
  saved: { ar: 'تم الحفظ', en: 'Saved' },
  support: { ar: 'الدعم', en: 'Support' },
  supportHint: {
    ar: 'للاستفسارات والمساعدة، تواصل معنا.',
    en: 'For questions and help, get in touch.',
  },
  version: { ar: 'الإصدار', en: 'Version' },

  // Shared
  loading: { ar: 'جارٍ التحميل…', en: 'Loading…' },
  retry: { ar: 'إعادة المحاولة', en: 'Retry' },
  error: { ar: 'حدث خطأ', en: 'Something went wrong' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  confirm: { ar: 'تأكيد', en: 'Confirm' },
  close: { ar: 'إغلاق', en: 'Close' },
  required: { ar: 'هذا الحقل مطلوب', en: 'This field is required' },
  none: { ar: 'لا شيء', en: 'None' },
  today: { ar: 'اليوم', en: 'Today' },
  tomorrow: { ar: 'غداً', en: 'Tomorrow' },
  currency: { ar: 'ر.ب', en: 'BHD' },
};

export function translate(locale: Locale, key: keyof typeof strings): string {
  const entry = strings[key];
  if (!entry) return String(key);
  return entry[locale];
}

export type TranslateKey = keyof typeof strings;
