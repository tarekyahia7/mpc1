/**
 * محول CometAPI — المزود الثاني.
 * الأشكال وفق التوثيق المنشور على cometapi.com (مقاسة من صفحات التوثيق الرسمية):
 * - الصور: نقطة متوافقة مع OpenAI تعيد الرابط فورًا → POST /v1/images/generations
 * - الفيديو: مهام غير متزامنة → POST /v1/videos ثم GET /v1/videos/{task_id}
 *   (مع GET /v1/videos/{task_id}/content للتنزيل — نستخدم روابط الاستعلام مباشرة)
 * كل الأشكال تُقرأ بشكل دفاعي (deepCollectUrls) لتحمل أي اختلاف بسيط في الاستجابة.
 */
import { ProviderError } from "../errors";
import { deepCollectUrls } from "../format";
import { providerFetch, readJson, extractErrorBody, type ProviderAdapter, type ProviderKeyRef } from "./types";

const BASE = "https://api.cometapi.com";

/** تحويل aspect_ratio إلى أقرب size متوافق مع نقطة الصور */
function mapSize(aspectRatio?: unknown): string {
  const ar = String(aspectRatio ?? "auto");
  if (ar === "1:1" || ar === "auto") return "1024x1024";
  const [w, h] = ar.split(":").map((n) => parseInt(n, 10));
  if (!w || !h) return "1024x1024";
  return w >= h ? "1536x1024" : "1024x1536";
}

async function cometRequest(
  key: ProviderKeyRef,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  const res = await providerFetch(`${BASE}${path}`, key, init, timeoutMs);
  const body = await readJson(res);
  if (!res.ok) throw new ProviderError(res.status, extractErrorBody(body, res));
  return body ?? {};
}

export const cometapiAdapter: ProviderAdapter = {
  async createImageSync(key, providerModel, input) {
    const body = await cometRequest(key, "/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({
        model: providerModel,
        prompt: input.prompt,
        n: 1,
        size: mapSize(input.aspect_ratio),
        response_format: "url",
      }),
    });
    // الشكل المتوافق مع OpenAI: { data: [{ url | b64_json }] }
    const data = Array.isArray(body.data) ? body.data : [];
    const urls = deepCollectUrls(data);
    if (!urls.length) {
      // b64_json فقط لا يصلح (نخزن روابط فقط — القاعدة الذهبية 1)
      // → تصنف temporary فتنتقل السلسلة للمفتاح/المزود التالي
      throw new ProviderError(200, "cometapi returned image without a public url (b64 only)");
    }
    return { urls };
  },

  async createTask(key, providerModel, input) {
    const body = await cometRequest(key, "/v1/videos", {
      method: "POST",
      body: JSON.stringify({
        model: providerModel,
        prompt: input.prompt,
        ...(input.image_url ? { image_url: input.image_url } : {}),
        ...(input.aspect_ratio && input.aspect_ratio !== "auto"
          ? { aspect_ratio: input.aspect_ratio }
          : {}),
        ...(typeof input.duration === "number" ? { duration: input.duration } : {}),
        ...(typeof input.enable_audio === "boolean" ? { enable_audio: input.enable_audio } : {}),
      }),
    });
    // معرفات محتملة: {id} | {task_id} | {taskId} | {data:{...}}
    const nested = body.data as Record<string, unknown> | undefined;
    const taskId =
      (typeof body.id === "string" && body.id) ||
      (typeof body.task_id === "string" && body.task_id) ||
      (typeof body.taskId === "string" && body.taskId) ||
      (nested && typeof nested.id === "string" && nested.id) ||
      (nested && typeof nested.task_id === "string" && nested.task_id);
    if (!taskId) throw new ProviderError(200, "cometapi create response had no task id");
    return { providerTaskId: String(taskId) };
  },

  async checkTask(key, providerTaskId) {
    const body = await cometRequest(key, `/v1/videos/${encodeURIComponent(providerTaskId)}`, {}, 20_000);
    const status = String(body.status ?? body.state ?? "").toLowerCase();

    if (["completed", "succeeded", "success", "done", "finished"].includes(status)) {
      const urls = deepCollectUrls(body);
      if (!urls.length) return { status: "failed", error: "انتهى التوليد دون إعادة أي رابط نتيجة" };
      return { status: "completed", urls };
    }
    if (["failed", "error", "cancelled", "canceled"].includes(status)) {
      return { status: "failed", error: String(body.error ?? body.message ?? "فشل غير محدد لدى المزود") };
    }
    return { status: "processing" };
  },
};
