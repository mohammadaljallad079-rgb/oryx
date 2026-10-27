# ORYX Marketplace — معاينة التصميم / design preview

كل الصور هنا **روابط مباشرة من هذا المستودع**، فتعمل بدون أي جلسة مؤقتة.
الصور مولّدة من التطبيق الذي يعمل فعلاً، وليست صوراً مولّدة أو مركّبة.

**النسخة المعروضة تفاعلياً (GitHub Pages):**
[mohammadaljallad079-rgb.github.io/oryx/mobile](https://mohammadaljallad079-rgb.github.io/oryx/mobile/)

**تنزيل APK 1.0.7 — أيقونات التصنيفات المعتمدة + Splash واحد:**
`fe1fe2713312395ebe8ccf96653f57fbe836c21d8454c5bcbee6eb02313f588f` · 76,503,077 بايت
[releases/tag/mobile-apk-1.0.7](https://github.com/mohammadaljallad079-rgb/oryx/releases/tag/mobile-apk-1.0.7)

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

## 7. فحص الوظائف — كل المسارات

شُغّل فحص فعلي على **37 مسارًا** (30 للعميل + 7 للتاجر): كل مسار يُزار داخل
التطبيق، ويُسجَّل نص الصفحة وأخطاء الـconsole ولقطة شاشة.

| النتيجة | القيمة |
| --- | --- |
| المسارات المفحوصة | 37 |
| شاشات بيضاء | **0** |
| مسارات بها أخطاء console | **0** |
| حالات خطأ ظاهرة | **0** |

البيانات الكاملة: [functional/audit.json](functional/audit.json)

### أقسام تأكدت من وجودها بعد التصميم

العروض والمتاجر — وهي الأقسام التي حُذفت سابقًا — مؤكدة في لقطات التمرير:

| القسم | اللقطة |
| --- | --- |
| العروض والخصومات | [home-light-en-part2.png](splash-home/home-light-en-part2.png) |
| المتاجر المميزة | [home-light-en-part3.png](splash-home/home-light-en-part3.png) |

---

## 8. كيف قيست المطابقة

المرجعان إطاران لجهاز حقيقي، ويشملان **شريط حالة أندرويد** (صف «9:41» عند 3.5%)،
بينما لقطة الويب لا تحتويه. لذلك تُقصّ الصورة المرجعية أسفل شريط الحالة قبل
المقارنة، وإلا دخل فرق ثابت 5.7% ليس اختلافًا في التصميم.

الأدوات المرفوعة، وكلها قابلة لإعادة التشغيل:

| السكربت | ما يقيسه |
| --- | --- |
| `.run/compare-content.py` | موضع كل عنصر في المرجع مقابل التنفيذ، منسوبًا لارتفاع الإطار |
| `.run/structure.py` | حدود الأشرطة: كحلي / صورة / كحلي |
| `.run/sections-ref.py` | حدود الأقسام والفراغات بينها |
| `.run/audit-functional.mjs` | 37 مسارًا: أخطاء، نصوص، لقطات |
| `.run/grade-hero.py` | اشتقاق أصل الـSplash بدرجة ألوان مطابقة للمرجع |

**نتيجة القياس بعد الإصلاح:**

| العنصر | المرجع | التنفيذ | الفرق |
| --- | --- | --- | --- |
| عنوان الـHero | 14.0% | 21.6% | +7.6 نقطة |
| حقل البحث | 34.3% | 39.8% | +5.5 |
| بطاقة SENSAGE | 50.8% | 57.6% | +6.9 |
| شريط المزودين | 63.4% | 68.6% | +5.2 |
| الشريط السفلي | 95.2% | 98.0% | +2.9 |

والأهم: نسبة البكسلات الدافئة في الـHero صارت **0.58–1.00** مقابل **0.28–0.33**
في المرجع، بعد أن كانت **0.00** — أي أن الصورة تقرأ ذهبية لا زرقاء.


---

## 9. حدود صريحة

- **هذه البيئة لا ترى الصور بصرياً.** جُرّبت أداة المتصفح وأداة الصور: كلتاهما
  تُرجع «تم القراءة» أو تحفظ ملفاً، **بدون إرجاع أي بكسلات**، لذا **لم يُحكم على
  التركيب بالعين**. لا أدّعي مطابقة بصرية. كل ما قيل عن المرجع استُخرج برمجياً: OCR للنصوص
  وترتيب الأقسام، ومنحنيات الإضاءة والحواف للتركيب العمودي، وحدود البكسل المضيء
  للشعار، ونص الـ DOM لما ترسمه الشاشة فعلاً.
- **لا ندّعي تطابقاً بالبكسل.** أوراق المقارنة منشورة **لتحكموا أنتم**.
- **لا تشغيل على هاتف أو محاكي.** لا `/dev/kvm` في هذه البيئة، فالـ APK موثّق بالبناء
  وسلامة الأرشيف وفحص أن الحزمة لا تتصل بأي خادم — وليس بتشغيل فعلي على جهاز.
- **الـ APK موقّع بمفتاح debug** — نسخة مراجعة، ليست نسخة متجر.

---

*أُنشئت هذه الصفحة بواسطة وكيل ذكاء اصطناعي (OpenHands) نيابةً عن مالك المستودع.*

---

## 10. أدلة أندرويد الحقيقية — APK 1.0.6

لقطات مأخوذة من **محاكي أندرويد فعلي** (Android 14 / API 34، x86_64) من نفس الـAPK
المنشور، وليست من معاينة الويب.

| الشاشة | اللقطة |
| --- | --- |
| شاشة الفحص بأزرار الكاميرا والمعرض | [1.0.6-inspection.png](android-crash/1.0.6-inspection.png) |
| كاميرا أندرويد مفتوحة | [1.0.6-final-camera.png](android-crash/1.0.6-final-camera.png) |
| الصورة بعد التصوير داخل التطبيق | [1.0.6-final-preview.png](android-crash/1.0.6-final-preview.png) |
| التحليل أثناء التنفيذ | [1.0.6-analysis-progress.png](android-crash/1.0.6-analysis-progress.png) |
| التقرير جاهز | [1.0.6-report-ready.png](android-crash/1.0.6-report-ready.png) |
| شاشة 360dp | [responsive-360dp.png](android-crash/responsive-360dp.png) |
| شاشة 768dp (تابلت) | [responsive-768dp-tablet.png](android-crash/responsive-768dp-tablet.png) |

**ملف يُثبت الأزرار بدل ادّعائها:**
[1.0.6-final-preview-ui.xml](android-crash/1.0.6-final-preview-ui.xml) — تسلسل الواجهة
لحظة معاينة الصورة، وفيه `Retake` و`Remove photo` و`Start analysis`.

**نتائج اختبار أندرويد:**

| الخطوة | النتيجة |
| --- | --- |
| التثبيت | نجح |
| التشغيل من حالة إيقاف كامل | نعم |
| حوار صلاحية الكاميرا | ظهر |
| فتح كاميرا أندرويد | `com.android.camera2` CaptureActivity |
| الغالق ثم Done | عادت الصورة إلى التطبيق: PHOTO PREVIEW · 1 |
| أزرار Retake / Remove / Start analysis | موجودة |
| فتح معرض النظام | `PhotoPickerActivity` |
| إلغاء المعرض | عاد التطبيق والصورة سليمة |
| التحليل | المراحل الأربع ثم «التقرير جاهز» |
| استثناءات قاتلة | **0** |
| أحجام الشاشة | 360dp · 390dp · 430dp · 768dp بلا انهيار |

**قيود:** لا تشغيل على هاتف حقيقي — الكاميرا جُرّبت عبر كاميرا أندرويد على محاكي.
والمحاكي عمل بدون KVM فكان بطيئاً.

---

## 11. APK 1.0.7 — الأيقونات المعتمدة وSplash واحد

| الشاشة | اللقطة |
| --- | --- |
| الصفحة الرئيسية على أندرويد | [1.0.7-homepage-android.png](android-crash/1.0.7-homepage-android.png) |
| تسلسل الواجهة الكامل | [1.0.7-homepage-ui.xml](android-crash/1.0.7-homepage-ui.xml) |

**ما تغيّر:**

1. **أيقونات التصنيفات الخمسة** — كان المرجع يسمّيها صراحةً (ترس، مفتاح، ورقة فحص،
   سطحة، جنط) وكان التطبيق يعرض صوراً فوتوغرافية. صارت الآن مسارات متجهية حقيقية
   (`react-native-svg`) بلون ذهبي واحد، تتحجّم بلا تشويش، وترتيبها ينعكس في العربية.

2. **Splash واحد فقط** — التسلسل المعتمد `تشغيل ← Splash ← الرئيسية` كان يمرّ بشاشة
   onboarding. صار يفتح السوق مباشرة.

3. **الصورة: النص المزدوج اختفى** — الاستخراج السابق أزاح أقنعة النص عن مواضعها،
   فبقيت كلمة «Everything Your Car Needs» في الصورة ورسمها التطبيق فوقها. الآن:
   **صفر نص في الصورة** (مؤكد بـOCR)، الدقة 852×1638 بدل 533×1024 (التكبير ×1.27
   بدل ×2.03)، والارتباط مع المشهد المعتمد **0.988**.

**نتائج أندرويد:**

| الفحص | النتيجة |
| --- | --- |
| التثبيت | نجح |
| التشغيل من إيقاف كامل | نعم — `Running "main"` |
| Splash ← الرئيسية بلا onboarding | نعم |
| التصنيفات الخمسة | قطع الغيار · صيانة · فحص · سحب · إكسسوارات |
| القائمة السفلية الخمسة | الرئيسية · الأقسام · البحث · حجوزاتي · حسابي |
| SENSAGE AI وشريط المزودين | موجودان |
| استثناءات قاتلة | **0** |
