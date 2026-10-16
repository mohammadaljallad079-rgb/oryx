/**
 * ORYX external integration catalog.
 *
 * The platform talks to a small, known set of third parties: payment gateways,
 * message transports, mapping, storage and identity. Each one is described here
 * once so the admin UI, the API and the tests cannot drift apart.
 *
 * ## The honesty rule
 *
 * A provider definition describes what *would* be needed to use it. It is never
 * a claim that the provider works. `IntegrationProviderState` is derived at
 * runtime from whether credentials exist and whether a verification actually
 * succeeded:
 *
 *  - `OPERATIONAL` — credentials present and a real verification returned success.
 *  - `CONFIGURED` — credentials present, not yet verified.
 *  - `AWAITING_CREDENTIALS` — the adapter exists but no credentials are supplied.
 *  - `DISABLED` — an operator turned it off.
 *  - `ERROR` — the last verification failed; `lastCheckMessage` says why.
 *
 * Only `OPERATIONAL` may be presented to a customer as working. No provider in
 * this repository reaches `OPERATIONAL` from seeded data alone, because that
 * would require a real credential and a real network round trip.
 */

export type IntegrationCategory =
  | 'PAYMENTS'
  | 'MESSAGING'
  | 'MAPS'
  | 'STORAGE'
  | 'IDENTITY'
  | 'ANALYTICS';

export type IntegrationProviderState =
  | 'OPERATIONAL'
  | 'CONFIGURED'
  | 'AWAITING_CREDENTIALS'
  | 'DISABLED'
  | 'ERROR';

/** How far along a provider's code is, independent of credentials. */
export type IntegrationImplementation =
  /** The adapter performs real work when configured (e.g. in-app, cash). */
  | 'IMPLEMENTED'
  /** Adapter and validation exist; the vendor call is not written yet. */
  | 'ADAPTER_ONLY'
  /** Reserved for a later execution. */
  | 'NOT_STARTED';

export interface IntegrationCredentialField {
  /** Environment/DB key, e.g. `BENEFITPAY_API_KEY`. */
  key: string;
  labelEn: string;
  labelAr: string;
  /** Secrets are masked in every response and encrypted at rest. */
  secret: boolean;
  required: boolean;
  /** Shown as a hint; never a real value. */
  placeholder?: string;
}

export interface IntegrationProviderDefinition {
  key: string;
  nameEn: string;
  nameAr: string;
  category: IntegrationCategory;
  descriptionEn: string;
  descriptionAr: string;
  implementation: IntegrationImplementation;
  /** Whether an operator can edit credentials from the admin app. */
  configurable: boolean;
  /** Whether the provider is billed per tenant rather than platform-wide. */
  perCompany: boolean;
  credentials: IntegrationCredentialField[];
  /** What must be true before this can be called operational. */
  activationRequirementEn: string;
  activationRequirementAr: string;
  docsUrl?: string;
}

const C = (
  key: string,
  labelEn: string,
  labelAr: string,
  secret: boolean,
  required = true,
): IntegrationCredentialField => ({ key, labelEn, labelAr, secret, required });

export const INTEGRATION_PROVIDERS: readonly IntegrationProviderDefinition[] = [
  {
    key: 'BENEFITPAY',
    nameEn: 'BenefitPay',
    nameAr: 'بنفت بي',
    category: 'PAYMENTS',
    descriptionEn: 'Bahrain online payments and wallet checkout.',
    descriptionAr: 'المدفوعات الإلكترونية والمحفظة في البحرين.',
    implementation: 'ADAPTER_ONLY',
    configurable: true,
    perCompany: true,
    credentials: [
      C('BENEFITPAY_MERCHANT_ID', 'Merchant ID', 'رقم التاجر', false),
      C('BENEFITPAY_API_KEY', 'API key', 'مفتاح الواجهة', true),
      C('BENEFITPAY_API_SECRET', 'API secret', 'سر الواجهة', true),
      C('BENEFITPAY_BASE_URL', 'Gateway base URL', 'عنوان البوابة', false),
      C('BENEFITPAY_WEBHOOK_SECRET', 'Webhook signing secret', 'سر توقيع الإشعارات', true),
    ],
    activationRequirementEn:
      'A merchant agreement with the bank, production credentials and one verified sandbox transaction.',
    activationRequirementAr:
      'اتفاقية تاجر مع البنك، وبيانات اعتماد إنتاجية، وعملية تجريبية موثقة واحدة.',
  },
  {
    key: 'CARD_ONLINE',
    nameEn: 'Online card gateway',
    nameAr: 'بوابة البطاقات الإلكترونية',
    category: 'PAYMENTS',
    descriptionEn: 'A hosted card checkout for any acquirer added later.',
    descriptionAr: 'صفحة دفع بطاقات مستضافة لأي مزود يُضاف لاحقاً.',
    implementation: 'ADAPTER_ONLY',
    configurable: true,
    perCompany: true,
    credentials: [
      C('CARD_GATEWAY_PROVIDER', 'Gateway provider', 'مزود البوابة', false),
      C('CARD_GATEWAY_API_KEY', 'API key', 'مفتاح الواجهة', true),
    ],
    activationRequirementEn: 'A chosen acquirer, its API key and a verified test charge.',
    activationRequirementAr: 'اختيار مزود، ومفتاح واجهته، وعملية اختبار موثقة.',
  },
  {
    key: 'CASH',
    nameEn: 'Cash & card terminal',
    nameAr: 'النقد والجهاز الطرفي',
    category: 'PAYMENTS',
    descriptionEn: 'Counter payments recorded by staff and posted to the ledger.',
    descriptionAr: 'مدفوعات الصندوق يسجلها الموظف وتُرحّل إلى دفتر الأستاذ.',
    implementation: 'IMPLEMENTED',
    configurable: false,
    perCompany: false,
    credentials: [],
    activationRequirementEn: 'None — this is an internal record, not a gateway call.',
    activationRequirementAr: 'لا شيء — هذا سجل داخلي وليس نداء بوابة.',
  },
  {
    key: 'EMAIL',
    nameEn: 'Email',
    nameAr: 'البريد الإلكتروني',
    category: 'MESSAGING',
    descriptionEn: 'Transactional email for receipts, bookings and password resets.',
    descriptionAr: 'بريد المعاملات للإيصالات والحجوزات واستعادة كلمة المرور.',
    implementation: 'ADAPTER_ONLY',
    configurable: true,
    perCompany: false,
    credentials: [
      C('EMAIL_PROVIDER', 'Provider', 'المزود', false),
      C('EMAIL_API_KEY', 'API key', 'مفتاح الواجهة', true, false),
      C('SMTP_HOST', 'SMTP host', 'خادم SMTP', false, false),
    ],
    activationRequirementEn: 'A provider API key, or an SMTP host, plus a verified test send.',
    activationRequirementAr: 'مفتاح مزود أو خادم SMTP، مع إرسال اختباري موثق.',
  },
  {
    key: 'SMS',
    nameEn: 'SMS',
    nameAr: 'الرسائل النصية',
    category: 'MESSAGING',
    descriptionEn: 'Delivery and reminder texts to customers.',
    descriptionAr: 'رسائل التسليم والتذكير للعملاء.',
    implementation: 'ADAPTER_ONLY',
    configurable: true,
    perCompany: false,
    credentials: [
      C('SMS_PROVIDER', 'Provider', 'المزود', false),
      C('SMS_API_KEY', 'API key', 'مفتاح الواجهة', true),
      C('SMS_SENDER_ID', 'Sender ID', 'معرّف المرسل', false),
    ],
    activationRequirementEn: 'An aggregator account, an approved sender ID and a verified test send.',
    activationRequirementAr: 'حساب مزود، ومعرّف مرسل معتمد، وإرسال اختباري موثق.',
  },
  {
    key: 'WHATSAPP',
    nameEn: 'WhatsApp Business',
    nameAr: 'واتساب للأعمال',
    category: 'MESSAGING',
    descriptionEn: 'Template messages over the WhatsApp Business API.',
    descriptionAr: 'رسائل القوالب عبر واجهة واتساب للأعمال.',
    implementation: 'ADAPTER_ONLY',
    configurable: true,
    perCompany: false,
    credentials: [
      C('WHATSAPP_PHONE_NUMBER_ID', 'Phone number ID', 'معرّف رقم الهاتف', false),
      C('WHATSAPP_ACCESS_TOKEN', 'Access token', 'رمز الوصول', true),
    ],
    activationRequirementEn: 'A verified business sender and approved message templates.',
    activationRequirementAr: 'مرسل أعمال موثق وقوالب رسائل معتمدة.',
  },
  {
    key: 'PUSH',
    nameEn: 'Push notifications',
    nameAr: 'الإشعارات الفورية',
    category: 'MESSAGING',
    descriptionEn: 'Mobile push to the ORYX customer app.',
    descriptionAr: 'إشعارات فورية لتطبيق ORYX للعملاء.',
    implementation: 'ADAPTER_ONLY',
    configurable: true,
    perCompany: false,
    credentials: [
      C('PUSH_PROVIDER', 'Provider', 'المزود', false),
      C('PUSH_SERVER_KEY', 'Server key', 'مفتاح الخادم', true),
    ],
    activationRequirementEn: 'FCM/APNs credentials and a registered device-token store.',
    activationRequirementAr: 'بيانات اعتماد FCM/APNs ومخزن رموز أجهزة مسجل.',
  },
  {
    key: 'IN_APP',
    nameEn: 'In-app notifications',
    nameAr: 'الإشعارات داخل التطبيق',
    category: 'MESSAGING',
    descriptionEn: 'Notification centre inside the admin, website and mobile app.',
    descriptionAr: 'مركز الإشعارات داخل لوحة التحكم والموقع والتطبيق.',
    implementation: 'IMPLEMENTED',
    configurable: false,
    perCompany: false,
    credentials: [],
    activationRequirementEn: 'None — messages are stored and read back from the database.',
    activationRequirementAr: 'لا شيء — تُخزَّن الرسائل وتُقرأ من قاعدة البيانات.',
  },
];

export const INTEGRATION_PROVIDER_BY_KEY: ReadonlyMap<string, IntegrationProviderDefinition> =
  new Map(INTEGRATION_PROVIDERS.map((p) => [p.key, p]));

export const INTEGRATION_CATEGORIES: readonly IntegrationCategory[] = Array.from(
  new Set(INTEGRATION_PROVIDERS.map((p) => p.category)),
);

export function getIntegrationProvider(key: string): IntegrationProviderDefinition | undefined {
  return INTEGRATION_PROVIDER_BY_KEY.get(key);
}

export function isKnownIntegrationProvider(key: string): boolean {
  return INTEGRATION_PROVIDER_BY_KEY.has(key);
}

/**
 * Whether a state means the provider can actually be used. Only `OPERATIONAL`
 * qualifies; everything else must be reported as not working.
 */
export function isOperational(state: IntegrationProviderState): boolean {
  return state === 'OPERATIONAL';
}
