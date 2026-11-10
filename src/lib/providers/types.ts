/**
 * واجهة موحدة للمزودين (قسم 5.2 من المواصفة).
 * أي خطأ يُرمى كـ ProviderError ليُصنَّف في جدول التصنيف ثم يقرر المنسق الإجراء.
 */
import type { ProviderId } from "../models";
import { ProviderError } from "../errors";

export interface ProviderKeyRef {
  id: string;
  provider: ProviderId;
  label: string;
  apiKey: string;
}

export interface CheckTaskResult {
  status: "processing" | "completed" | "failed";
  urls?: string[];
  error?: string;
  progress?: number;
}

export interface ProviderAdapter {
  /** مهمة غير متزامنة (فيديو، وبعض الصور): تعيد providerTaskId */
  createTask(
    key: ProviderKeyRef,
    providerModel: string,
    input: Record<string, unknown>
  ): Promise<{ providerTaskId: string }>;

  /** صور متزامنة إن كان المزود يدعمها (CometAPI تعيد النتيجة فورًا) */
  createImageSync?(
    key: ProviderKeyRef,
    providerModel: string,
    input: Record<string, unknown>
  ): Promise<{ urls: string[] }>;

  /** استعلام حالة مهمة جارية */
  checkTask(key: ProviderKeyRef, providerTaskId: string): Promise<CheckTaskResult>;
}

/** أداة fetch موحدة مع timeout وترمي ProviderError مع الرسالة الفعلية */
export async function providerFetch(
  url: string,
  key: ProviderKeyRef,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key.apiKey}`,
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // انقطاع شبكة/timeout → temporary (التصنيف الافتراضي)
    const msg = e instanceof Error ? e.message : String(e);
    throw new ProviderError(undefined, `network error: ${msg}`);
  }
  return res;
}

/** قراءة جسم JSON بشكل آمن */
export async function readJson(res: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** استخراج رسالة خطأ مفهومة من جسم المزود */
export function extractErrorBody(body: Record<string, unknown> | null, res: Response): string {
  const candidates = ["message", "msg", "error", "error_message", "failMsg", "detail"];
  for (const c of candidates) {
    const v = body?.[c];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      const inner = (v as Record<string, unknown>).message;
      if (typeof inner === "string" && inner.trim()) return inner.trim();
    }
  }
  return `HTTP ${res.status}`;
}
