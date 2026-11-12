/* أدوات مساعدة مشتركة للوحة الإدارة (تعمل على العميل فقط عمليًا) */

export const NETWORK_ERROR_MSG = "تعذر الاتصال بالسيرفر";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

/** استدعاء API مع معالجة أخطاء الشبكة و {error} العربي القادم من السيرفر */
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      /* الاستجابة ليست JSON (مثل صفحة 404/500) */
      data = null;
    }
    let apiError: string | undefined;
    if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
      const value = (data as Record<string, unknown>).error;
      if (typeof value === "string" && value.trim()) apiError = value;
    }
    return { ok: res.ok, status: res.status, data: (data as T | null) ?? null, error: apiError };
  } catch {
    return { ok: false, status: 0, data: null, error: NETWORK_ERROR_MSG };
  }
}

/** مقتطف نصي بطول محدد مع علامة الحذف */
export function excerpt(text: string | null | undefined, max = 100): string {
  if (!text) return "";
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trimEnd()}…`;
}

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* منسّقات عربية (أرقام لاتينية للاتساق مع بقية اللوحة) */
let dateTimeFormatter: Intl.DateTimeFormat | null | undefined;
function getDateTimeFormatter(): Intl.DateTimeFormat | null {
  if (dateTimeFormatter !== undefined) return dateTimeFormatter;
  try {
    dateTimeFormatter = new Intl.DateTimeFormat("ar-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    try {
      dateTimeFormatter = new Intl.DateTimeFormat("ar", { dateStyle: "medium", timeStyle: "short" });
    } catch {
      dateTimeFormatter = null;
    }
  }
  return dateTimeFormatter;
}

let timeFormatter: Intl.DateTimeFormat | null | undefined;
function getTimeFormatter(): Intl.DateTimeFormat | null {
  if (timeFormatter !== undefined) return timeFormatter;
  try {
    timeFormatter = new Intl.DateTimeFormat("ar-u-nu-latn", { timeStyle: "medium" });
  } catch {
    try {
      timeFormatter = new Intl.DateTimeFormat("ar", { timeStyle: "medium" });
    } catch {
      timeFormatter = null;
    }
  }
  return timeFormatter;
}

/** تاريخ ووقت بصيغة عربية مقروءة */
export function formatArabicDateTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  const f = getDateTimeFormatter();
  if (f) return f.format(d);
  try {
    return d.toLocaleString("ar");
  } catch {
    return d.toISOString();
  }
}

/** وقت فقط بصيغة عربية (للمؤشرات الحية) */
export function formatArabicTime(input: DateInput): string {
  const d = toDate(input);
  if (!d) return "—";
  const f = getTimeFormatter();
  if (f) return f.format(d);
  try {
    return d.toLocaleTimeString("ar");
  } catch {
    return d.toISOString();
  }
}

/** تقييد نسبة التقدم بين 0 و 100 */
export function clampPercent(value: number | null | undefined): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** نسخ إلى الحافظة مع بديل عند غياب navigator.clipboard */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* نجرب الطريقة البديلة أدناه */
  }
  try {
    if (typeof document === "undefined") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
