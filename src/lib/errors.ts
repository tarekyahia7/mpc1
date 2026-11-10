/**
 * تصنيف أخطاء المزودين — قلب سياسة التبديل التسلسلي (قسم 4.2 من المواصفة).
 * كل خطأ قادم من مزود خارجي يُرمى كـ ProviderError ثم يُصنَّف هنا لتحديد الإجراء:
 * disabled  → المفتاح مرفوض (علّمه disabled تلقائيًا وانتقل للتالي)
 * exhausted → نفاد الرصيد (علّمه exhausted وانتقل للتالي — يبقى في القاعدة لاستئنافه بعد الشحن)
 * provider  → الموديل غير مدعوم لدى هذا المزود (انتقل للتالي دون تغيير حالة المفتاح)
 * params    → خطأ معطيات الطلب (توقف فورًا — تبديل المفاتيح لن يحل المشكلة)
 * temporary → 429/5xx/انقطاع شبكة/timeout (انتقل للتالي والمفتاح يبقى سليمًا)
 */
export type ErrorClass = "disabled" | "exhausted" | "provider" | "params" | "temporary";

export class ProviderError extends Error {
  /** كود HTTP (أو الكود الداخلي للمزود إن أرسل HTTP 200 مع code داخلي) */
  status?: number;

  constructor(status: number | undefined, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/**
 * أنماط نفاد الرصيد — تُفحص قبل فحص 400/422 لأن بعض المزودين
 * يرسلون رسائل الرصيد بحالة HTTP 400 (توصية المواصفة الصريحة).
 */
const EXHAUSTED_RE =
  /insufficient|quota|balance|credit|out of credits|exhausted|充值|payment required/i;

/** أنماط رفض المفتاح */
const DISABLED_RE =
  /invalid api key|invalid_api_key|unauthorized|forbidden|authentication|api key not valid/i;

/** أنماط موديل غير مدعوم */
const MODEL_RE = /model not found|unsupported model|no such model|unknown model/i;

/**
 * نمط أخطاء مفتاح/رصيد التي لا يجب أن تخرج للعميل أبدًا (قسم 4.3.2):
 * تُستخدم للكشف عن فشل منتصف المهمة الذي يرجح مشكلة مفتاح/رصيد فيُعاد
 * إنشاء نفس المهمة بنفس task_id على المفتاح التالي بصمت.
 */
export const KEY_FAIL_RE =
  /(insufficient|balance|credit|quota|exhausted|充值|invalid api key|unauthorized|forbidden|authentication)|\b40[12]\b/i;

export function classifyProviderError(status: number | undefined, message: string): ErrorClass {
  const msg = (message || "").trim();
  // 1) رموز الحالة الأقوى دلالة أولًا
  if (status === 401 || status === 403) return "disabled";
  if (status === 402) return "exhausted";
  // 2) رسائل الرصيد قبل 400/422 (بعض المزودين يرسلونها بحالة 400)
  if (EXHAUSTED_RE.test(msg)) return "exhausted";
  // 3) رسائل رفض المفتاح
  if (DISABLED_RE.test(msg)) return "disabled";
  // 4) موديل غير مدعوم مع 400/404/422
  if (MODEL_RE.test(msg) && (status === 400 || status === 404 || status === 422)) return "provider";
  // 5) معطيات غير صالحة → توقف فوري
  if (status === 400 || status === 422) return "params";
  // 6) 429 / 5xx / انقطاع شبكة / timeout / غير معروف → مؤقت
  return "temporary";
}

/** إزالة أي أثر لمفاتيح من رسالة خطأ قبل عرضها (دفاع إضافي) */
export function scrubSecrets(message: string): string {
  return (message || "")
    .replace(/Bearer\s+[\w.\-]+/gi, "Bearer ***")
    .replace(/sk-[\w\-]{10,}/g, "***")
    .slice(0, 300);
}
