/**
 * أدوات تنسيق مشتركة — إخفاء المفاتيح إلزامي في كل الاستجابات والسجلات
 * (القاعدة الذهبية 9) وصياغة عربية موحدة لحالات المهام.
 */

/** إخفاء المفتاح: أول 7 أحرف + 8 نقاط + آخر 4 — والقصيرة أول 3 + نقاط */
export function maskKey(key: string): string {
  if (!key) return "";
  if (key.length < 14) return `${key.slice(0, 3)}${"•".repeat(6)}`;
  return `${key.slice(0, 7)}${"•".repeat(8)}${key.slice(-4)}`;
}

/** ملصقات عربية لنوع المهمة */
export function arType(type: string): string {
  switch (type) {
    case "image": return "صورة";
    case "video": return "فيديو";
    case "merge": return "دمج";
    default: return type;
  }
}

/** ملصقات عربية لحالة المهمة */
export function arStatus(status: string): string {
  switch (status) {
    case "pending": return "بانتظار";
    case "processing": return "جارية";
    case "completed": return "مكتملة";
    case "failed": return "فاشلة";
    default: return status;
  }
}

/** تحليل تاريخ قاعدة البيانات (datetime('now') بصيغة UTC بلا منطقة زمنية) */
export function parseDbDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const normalized = s.includes("T") ? s : s.replace(" ", "T");
  const withZone = /[zZ]|[+\-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const d = new Date(withZone);
  return isNaN(d.getTime()) ? null : d;
}

export const nowIso = () => new Date().toISOString();
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** تحقق صارم: رابط http/https مباشر وعام (قسم 7.3.1) */
export function isPublicHttpUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const h = url.hostname.toLowerCase();
    if (/^(localhost|0\.0\.0\.0|\[::1\]|127\.|10\.|192\.168\.|169\.254\.)/.test(h)) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    if (h.endsWith(".local") || h.endsWith(".internal")) return false;
    return true;
  } catch {
    return false;
  }
}

/** جمع كل روابط http(s) من بنية JSON متداخلة بشكل دفاعي (لنتائج المزودين المتغيرة) */
export function deepCollectUrls(value: unknown, max = 10): string[] {
  const found: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (found.length >= max || depth > 8 || v == null) return;
    if (typeof v === "string") {
      if (/^https?:\/\/\S+$/i.test(v.trim()) && !found.includes(v.trim())) found.push(v.trim());
      return;
    }
    if (Array.isArray(v)) { v.forEach((x) => visit(x, depth + 1)); return; }
    if (typeof v === "object") { Object.values(v as Record<string, unknown>).forEach((x) => visit(x, depth + 1)); }
  };
  visit(value, 0);
  return found;
}

/** تحليل نص JSON بشكل آمن */
export function safeParse<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try { return JSON.parse(text) as T; } catch { return fallback; }
}
