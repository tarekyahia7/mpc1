# Task 2 — واجهة الإدارة العربية (MCP Media Generator)

**المهام المنجزة:** بناء واجهة لوحة الإدارة العربية الكاملة (RTL) للمشروع — Tailwind فقط، بلا أي اعتماديات جديدة.

## الملفات التي أنشأتها / عدّلتها (ملكي وحدي)

| الملف | الحالة |
|---|---|
| `src/app/layout.tsx` | معدّل — `<html lang="ar" dir="rtl">`، خط Cairo عبر Google Fonts `<link>` داخل head (يُرفع تلقائيًا بواسطة React 19)، metadata «MCP Media Generator — لوحة الإدارة»، `className="dark"` |
| `src/app/globals.css` | معدّل — ثيم داكن موحّد، `color-scheme: dark`، تعريف `--font-sans/--font-mono` (استبدلت مراجع Geist المحذوفة)، scrollbar رقيق `.slim-scroll`، **مع الحفاظ الكامل على متغيرات shadcn `:root/.dark` لعدم كسر `src/components/ui/*`** |
| `src/app/page.tsx` | معدّل — صفحة واحدة: هيدر + شبكة (مدير المفاتيح + ربط السيرفر جنبًا لجنب على lg) + لوحة المهام بعرض كامل + فوتر أمان |
| `src/components/types.ts` | جديد — أنواع العقود الثابتة (Health, ApiKey, Tasks…) |
| `src/components/utils.ts` | جديد — `apiFetch` (معالجة {error} عربي + فشل شبكة)، `formatArabicDateTime/Time` (Intl ar + أرقام لاتينية)، `copyToClipboard` مع fallback، `excerpt`, `clampPercent` |
| `src/components/icons.tsx` | جديد — ~23 أيقونة SVG inline مولّدة من factory (بلا lucide) |
| `src/components/ui.tsx` | جديد — Badge, Card, InlineAlert, useFlash, EmptyState, LoadingState, CopyButton («تم النسخ ✓» لثانيتين), ProgressBar, StatTile |
| `src/components/use-health.ts` | جديد — polling لـ `/api/health` كل 30 ثانية عبر سلسلة setTimeout مع تنظيف صحيح |
| `src/components/dashboard-header.tsx` | جديد — العنوان + الوصف + شارات: Turso متصل/غير متصل، خدمة الدمج، «محمي بـ Bearer token» |
| `src/components/keys-manager.tsx` | جديد — نموذج إضافة (select kie/cometapi + label + password) → POST /api/keys؛ قائمة GET /api/keys مع maskedKey mono ltr، شارات الحالة، عدّادات، lastError مع title، PATCH تعطيل/تنشيط، DELETE مع confirm عربي |
| `src/components/tasks-panel.tsx` | جديد — إحصائيات من GET /api/tasks?limit=25 + قائمة تُحدّث كل 5 ثوانٍ (interval مع cleanup + alive flag)، شارات النوع/الحالة (جارية بنبض)، شريط تقدم، روابط النتائج، أخطاء حمراء |
| `src/components/server-connect.tsx` | جديد — حقل readOnly `${origin}/mcp` (عبر `useSyncExternalStore` لتجنّب hydration mismatch)، 3 تبويبات JSON جاهزة للنسخ (ChatGPT / Claude / Cursor) مع headers شرطية عند `authRequired`، رقائق الأدوات الخمس، الملاحظة الكهرمانية الحرفية |

## ملاحظات للمهندس الآخر / الوكلاء القادمين

- **عقود API المستهلكة كما هي في المواصفات:** `/api/health`, `/api/keys` (GET/POST/PATCH/DELETE), `/api/tasks?limit=25`. كل الاستدعاءات متسامحة مع 404/500 وتعرض «تعذر الاتصال بالسيرفر» مع استمرار الـ polling.
- **لا ألمس** `src/lib/**`, `src/app/api/**`, `src/app/mcp/**`, `package.json` — لم يُعدَّل أي منها.
- إذا كانت صفحة `/mcp` تستخدم مكونات shadcn فستعمل لأن متغيرات CSS محفوظة و `<html class="dark">` يفعّل الثيم الداكن.
- المكونات العامة القابلة لإعادة الاستخدام موجودة في `src/components/ui.tsx` و`icons.tsx` (أيقونات SVG بلا lucide).
- عند تغيير مفتاح `authRequired` في /api/health ستتحدث قوالب JSON تلقائيًا بإضافة `Authorization: Bearer <MCP_ACCESS_TOKEN>`.

## قرارات التصميم

- **ثيم داكن موحّد** (zinc-950/900) مع لون مميز **emerald**؛ الأزرق (sky) مستخدم فقط لشارة/إحصائية «جارية» كما هو مطلوب.
- خط **Cairo** (400–800) + fallback نظام؛ المصطلحات التقنية (API key, MCP, task_id, Turso) لاتينية بـ `dir="ltr"` و/أو mono.
- رسائل العمليات عبر InlineAlert داخل كل بطاقة (نجاح 5 ثوانٍ / خطأ قابل للإغلاق) + زر إعادة محاولة عند فشل القوائم.
- أرقام التواريخ لاتينية (`ar-u-nu-latn`) للاتساق مع العدّادات، مع fallback `ar`.

## نتيجة lint

`bun run lint` → **نظيف، 0 أخطاء / 0 تحذيرات**. (عولجت: `react-hooks/set-state-in-effect` بنقل التحميلات لداخل الـ effect بعد `await` واستخدام `useSyncExternalStore` لعنوان MCP، و`no-page-custom-font` بتعليق disable مسبب لأن القاعدة مخصصة لـ Pages Router).
