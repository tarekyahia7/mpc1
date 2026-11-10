/**
 * عميل خدمة دمج الفيديو — Video Merger API v2 (قسم 7 من المواصفة).
 * بلا مفاتيح أو توثيق — العنوان من MERGER_API_BASE.
 * المخرجات: MP4 (H.264 + AAC) حتى 1080p بجودة CRF 18 — لا توجد معاملات resolution/fps.
 * القيود: 10 مقاطع كحد أقصى، 200MB لكل مصدر، 150MB للناتج، 600 ثانية مجموع المدد،
 * وكل الملفات تُحذف تلقائيًا بعد 24 ساعة (expiresAt في الاستجابات).
 *
 * القاعدة الحتمية: أي خطأ HTTP معلن من الخدمة (4xx/5xx بجسم error) = فشل نهائي فوري،
 * أما أخطاء شبكتنا (timeout/fetch) = مؤقتة → تستمر بالاستعلام.
 */
import { ProviderError } from "./errors";

const RAW_BASE = (process.env.MERGER_API_BASE || "").trim().replace(/\/+$/, "");

/** هل خدمة الدمج مهيأة؟ (قيم الـ placeholder مثل https://xxxxxxxx تعني غير مهيأة) */
export const MERGER_CONFIGURED =
  RAW_BASE.length > 0 && !/^https?:\/\/(xxxxxxxx|example\.|your-|placeholder)/i.test(RAW_BASE);

export function mergerBase(): string {
  return RAW_BASE || "https://xxxxxxxx";
}

/** حدود الخدمة الحالية (تُستخدم في فحص الجهوزية والتحقق) */
export const MERGER_LIMITS = {
  maxVideos: 10,
  maxPerVideoMB: 200,
  maxOutputMB: 150,
  maxTotalSeconds: 600,
  retentionHours: 24,
} as const;

async function mergerFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  // أخطاء الشبكة تُرمى كما هي (fetch/timeout) ليميزها المنسق عن أخطاء HTTP المعلنة
  return fetch(`${RAW_BASE}${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/* ============================ نقاط النهاية ============================ */

export interface MergeJobCreated {
  jobId: string;
  statusUrl?: string;
  expiresAt?: string;
}

/** POST /api/jobs — إنشاء مهمة دمج {"videos":["https://..."]} → {"jobId","status","statusUrl",...} */
export async function createMergeJob(videoUrls: string[]): Promise<MergeJobCreated> {
  const res = await mergerFetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videos: videoUrls }),
  });
  const body = await readBody(res);
  if (!res.ok) {
    throw new ProviderError(res.status, String(body?.error ?? `HTTP ${res.status}`));
  }
  const jobId = body?.jobId ?? body?.job_id ?? body?.id;
  if (typeof jobId !== "string" || !jobId) {
    throw new ProviderError(res.status, "createJob: لم يُعد رد الخدمة أي jobId");
  }
  return {
    jobId,
    statusUrl: typeof body?.statusUrl === "string" ? body.statusUrl : undefined,
    expiresAt: typeof body?.expiresAt === "string" ? body.expiresAt : undefined,
  };
}

/**
 * POST /api/jobs/{jobId}/process — يستغرق ~10-15 ثانية (blocking).
 * نجاح 200 → {"status":"done","videoUrl":...,"downloadUrl":...}
 * فشل → HTTP 500 + {"error":"..."} (مثل مصدر يرفض التحميل — فشل حتمي).
 */
export async function processMergeJob(
  jobId: string
): Promise<{ videoUrl?: string; downloadUrl?: string }> {
  const res = await mergerFetch(`/api/jobs/${encodeURIComponent(jobId)}/process`, {
    method: "POST",
  }, 120_000);
  const body = await readBody(res);
  // جسم فيه error دون نتيجة → فشل نهائي معلن
  if (!res.ok || (body?.error && !body?.videoUrl && !body?.downloadUrl)) {
    throw new ProviderError(res.status || 500, String(body?.error ?? `HTTP ${res.status}`));
  }
  return {
    videoUrl: typeof body?.videoUrl === "string" ? body.videoUrl : undefined,
    downloadUrl: typeof body?.downloadUrl === "string" ? body.downloadUrl : undefined,
  };
}

export interface MergeStatus {
  state: "queued" | "processing" | "done" | "failed";
  progress: number; // 0..100
  videoUrl?: string;
  error?: string;
}

/** تحليل الحالة دفاعيًا (قسم 7.2): مرادفات الحالات، progress كسرًا ×100، error بلا status → failed */
export async function getMergeStatus(jobId: string): Promise<MergeStatus> {
  const res = await mergerFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {}, 15_000);
  const body = await readBody(res);

  // 404 → المهمة حذفت أو انتهت صلاحيتها (24 ساعة) → فشل نهائي
  if (res.status === 404) {
    throw new ProviderError(404, "merge job not found (deleted or expired)");
  }
  if (!res.ok) {
    throw new ProviderError(res.status, String(body?.error ?? `HTTP ${res.status}`));
  }

  const rawError = typeof body?.error === "string" && body.error ? body.error : undefined;
  const rawStatus = String(body?.status ?? "").toLowerCase();
  const done = /^(done|completed|complete|success|succeeded|finished)$/.test(rawStatus);
  // انتبه: قد يرد الجسم فيه error بدون حقل status → عاملها failed فورًا
  const failed = (!rawStatus && !!rawError) ||
    /^(error|failed|failure|cancelled|canceled)$/.test(rawStatus);

  let progress = Number(body?.progress ?? 0);
  if (!isFinite(progress) || progress < 0) progress = 0;
  // progress يأتي أحيانًا كسرًا 0..1 → اضربه في 100
  if (progress > 0 && progress <= 1) progress = progress * 100;

  // رابط النتيجة: فضّل videoUrl ثم downloadUrl، وإن غابا فاضبط الرابط القياسي
  const videoUrl =
    (typeof body?.videoUrl === "string" && body.videoUrl) ||
    (typeof body?.downloadUrl === "string" && body.downloadUrl) ||
    `${RAW_BASE}/api/jobs/${encodeURIComponent(jobId)}/video`;

  const state: MergeStatus["state"] = done
    ? "done"
    : failed
      ? "failed"
      : rawStatus === "queued"
        ? "queued"
        : "processing";

  return {
    state,
    progress: done ? 100 : Math.min(99, Math.round(progress)),
    videoUrl,
    error: rawError,
  };
}

/** DELETE /api/jobs/{jobId} → حذف فوري (تنظيف اختياري بعد الاختبارات) */
export async function deleteMergeJob(jobId: string): Promise<boolean> {
  try {
    const res = await mergerFetch(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" }, 10_000);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

/** GET /api/config — فحص جهوزية الخدمة بمهلة 4 ثوانٍ (يُستخدم في /api/health) */
export async function mergerHealthy(): Promise<boolean> {
  if (!MERGER_CONFIGURED) return false;
  try {
    const res = await mergerFetch("/api/config", {}, 4_000);
    return res.ok;
  } catch {
    return false;
  }
}
