# ORYX Marketplace — معاينة التصميم / design preview

كل الصور هنا **روابط مباشرة من هذا المستودع**، فتعمل بدون أي جلسة مؤقتة.
الصور مولّدة من التطبيق الذي يعمل فعلاً، وليست صوراً مولّدة أو مركّبة.

**النسخة المعروضة تفاعلياً (GitHub Pages):**
[mohammadaljallad079-rgb.github.io/oryx/mobile](https://mohammadaljallad079-rgb.github.io/oryx/mobile/)

**تنزيل APK (رابط دائم، بدون تسجيل دخول):**
[releases/tag/mobile-apk-1.0.0](https://github.com/mohammadaljallad079-rgb/oryx/releases/tag/mobile-apk-1.0.0)
· الحجم 70,037,349 بايت · SHA-256 `19f79e7f…`

> **ملاحظة عن أسماء ملفات المرجع.** الصورتان المعتمدتان مسمّاتان بالمقلوب:
> `ORYX_Splash_Reference.jpg` تحمل صفحة المتجر الكاملة، و`ORYX_Homepage_Reference.jpg`
> تحمل تركيبة البداية فقط. التنفيذ يتبع **المحتوى** لا اسم الملف.

---

## 1. المقارنة: المرجع مقابل المنفَّذ

المرجع على اليسار، والتطبيق الفعلي على اليمين.

### Splash — English

![Splash reference vs implemented, English](splash-home/compare-splash-en.png)

### Splash — العربية

![مقارنة شاشة البداية، العربية](splash-home/compare-splash-ar.png)

### Homepage — English

![Homepage reference vs implemented, English](splash-home/compare-home-en.png)

### Homepage — العربية

![مقارنة الصفحة الرئيسية، العربية](splash-home/compare-home-ar.png)

---

## 2. Splash

| English — phone | العربية — هاتف | English — tablet | العربية — لوحي |
| --- | --- | --- | --- |
| ![splash en phone](splash-home/splash-en-phone.png) | ![splash ar phone](splash-home/splash-ar-phone.png) | ![splash en tablet](splash-home/splash-en-tablet.png) | ![splash ar tablet](splash-home/splash-ar-tablet.png) |

---

## 3. Homepage — الصفحة الرئيسية

الشاشة الأولى، بالثيمين واللغتين:

| English — light | English — dark | العربية — فاتح | العربية — داكن |
| --- | --- | --- | --- |
| ![home en light](splash-home/home-light-en-phone.png) | ![home en dark](splash-home/home-dark-en-phone.png) | ![home ar light](splash-home/home-light-ar-phone.png) | ![home ar dark](splash-home/home-dark-ar-phone.png) |

### الأقسام المستعادة: العروض والمتاجر

الصفحة أطول من الشاشة، لذا **العروض** و**المتاجر** لا تظهر إلا بعد التمرير.
هاتان اللقطتان تُثبتان وجودهما — وهما القسمان الذي كان البناء المعتمد قد حذفهما:

| English — العروض | English — المتاجر | العربية — العروض | العربية — المتاجر |
| --- | --- | --- | --- |
| ![offers en](splash-home/home-light-en-part2.png) | ![stores en](splash-home/home-light-en-part3.png) | ![العروض](splash-home/home-light-ar-part2.png) | ![المتاجر](splash-home/home-light-ar-part3.png) |

---

## 4. كل الشاشات — Contact Sheet

![كل الشاشات في صورة واحدة](marketplace-demo/screenshots/contact-sheet.png)

---

## 5. شاشات مختارة (من 67 شاشة)

### العميل — English (LTR)

| Home | Categories | Search | Parts | SENSAGE |
| --- | --- | --- | --- | --- |
| ![home](marketplace-demo/screenshots/en/home.png) | ![categories](marketplace-demo/screenshots/en/categories.png) | ![search](marketplace-demo/screenshots/en/search.png) | ![parts](marketplace-demo/screenshots/en/parts.png) | ![sensage](marketplace-demo/screenshots/en/sensage.png) |

| Bookings | Cart | Checkout | Orders | Account |
| --- | --- | --- | --- | --- |
| ![bookings](marketplace-demo/screenshots/en/bookings.png) | ![cart](marketplace-demo/screenshots/en/cart.png) | ![checkout](marketplace-demo/screenshots/en/checkout.png) | ![orders](marketplace-demo/screenshots/en/orders.png) | ![account](marketplace-demo/screenshots/en/account.png) |

### العميل — العربية (RTL)

| الرئيسية | الأقسام | البحث | الحجوزات | حسابي |
| --- | --- | --- | --- | --- |
| ![الرئيسية](marketplace-demo/screenshots/ar/home.png) | ![الأقسام](marketplace-demo/screenshots/ar/categories.png) | ![البحث](marketplace-demo/screenshots/ar/search.png) | ![الحجوزات](marketplace-demo/screenshots/ar/bookings.png) | ![حسابي](marketplace-demo/screenshots/ar/account.png) |

### لوحة التاجر — Merchant shell

| Dashboard | Orders | Products | Services | Profile |
| --- | --- | --- | --- | --- |
| ![merchant dashboard](marketplace-demo/screenshots/merchant/merchant-dashboard.png) | ![merchant orders](marketplace-demo/screenshots/merchant/merchant-orders.png) | ![merchant products](marketplace-demo/screenshots/merchant/merchant-products.png) | ![merchant services](marketplace-demo/screenshots/merchant/merchant-services.png) | ![merchant profile](marketplace-demo/screenshots/merchant/merchant-profile.png) |

### شاشة البداية على أندرويد

| English | العربية |
| --- | --- |
| ![launch en](marketplace-demo/screenshots/launch-en.png) | ![launch ar](marketplace-demo/screenshots/launch-ar.png) |

---

## 6. الفهارس الكاملة

| المجموعة | العدد | الفهرس |
| --- | --- | --- |
| كل الشاشات | 67 | [marketplace-demo/README.md](marketplace-demo/README.md) |
| Splash وHomepage | 32 | [splash-home/](splash-home/) |
| بيانات الشاشات (JSON) | — | [manifest.json](marketplace-demo/screenshots/manifest.json) |

---

## 7. حدود صريحة

- **هذه البيئة لا ترى الصور بصرياً.** أداة العرض تُرجع «تم القراءة» بدون بكسلات، لذا
  **لم يُحكم على التركيب بالعين**. كل ما قيل عن المرجع استُخرج برمجياً: OCR للنصوص
  وترتيب الأقسام، ومنحنيات الإضاءة والحواف للتركيب العمودي، وحدود البكسل المضيء
  للشعار، ونص الـ DOM لما ترسمه الشاشة فعلاً.
- **لا ندّعي تطابقاً بالبكسل.** أوراق المقارنة منشورة **لتحكموا أنتم**.
- **لا تشغيل على هاتف أو محاكي.** لا `/dev/kvm` في هذه البيئة، فالـ APK موثّق بالبناء
  وسلامة الأرشيف وفحص أن الحزمة لا تتصل بأي خادم — وليس بتشغيل فعلي على جهاز.
- **الـ APK موقّع بمفتاح debug** — نسخة مراجعة، ليست نسخة متجر.

---

*أُنشئت هذه الصفحة بواسطة وكيل ذكاء اصطناعي (OpenHands) نيابةً عن مالك المستودع.*
