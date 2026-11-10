/**
 * محول kie.ai — المزود الأساسي عبر Jobs API الموحد (الأشكال الحقيقية المقاسة):
 *
 * POST https://api.kie.ai/api/v1/jobs/createTask
 *   {"model": "<providerModel>", "input": {...}} → {"code":200,"data":{"taskId":"..."}}
 *
 * GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>
 *   → {"code":200,"data":{"state":"waiting|queuing|generating|success|fail",
 *        "resultJson":"{\"resultUrls\":[\"https://...\"]}",  // نص JSON داخل JSON
 *        "failMsg":"..."}}
 *
 * ملاحظة مهمة (مقاسة فعليًا): kie يعيد HTTP 200 مع code داخلي != 200 عند الخطأ
 * (مثل {"code":422,"msg":"recordInfo is null"}) — لذا نرمي ProviderError بالكود الداخلي.
 */
import { ProviderError } from "../errors";
import { deepCollectUrls } from "../format";
import { providerFetch, readJson, extractErrorBody, type ProviderAdapter, type ProviderKeyRef } from "./types";

const BASE = "https://api.kie.ai";

/** نداء موحد لـ kie: يتحقق من HTTP status ومن code الداخلي */
async function kieRequest(
  key: ProviderKeyRef,
  path: string,
  init: RequestInit = {},
  timeoutMs = 30_000
): Promise<Record<string, unknown>> {
  const res = await providerFetch(`${BASE}${path}`, key, init, timeoutMs);
  const body = await readJson(res);
  if (!res.ok) {
    throw new ProviderError(res.status, extractErrorBody(body, res));
  }
  const code = typeof body?.code === "number" ? body.code : 200;
  if (code !== 200) {
    // الكود الداخلي هو المؤشر الحقيقي (401 مفتاح، 402 رصيد، 422 معطيات...)
    const msg = extractErrorBody(body, res);
    throw new ProviderError(code === 200 ? res.status : code, msg || `kie error code ${code}`);
  }
  return (body?.data ?? body ?? {}) as Record<string, unknown>;
}

export const kieAdapter: ProviderAdapter = {
  async createTask(key, providerModel, input) {
    const data = await kieRequest(key, "/api/v1/jobs/createTask", {
      method: "POST",
      body: JSON.stringify({ model: providerModel, input }),
    });
    const taskId = data.taskId ?? data.task_id ?? data.id;
    if (typeof taskId !== "string" || !taskId) {
      throw new ProviderError(undefined, "createTask: لم يُعد المزود أي taskId");
    }
    return { providerTaskId: taskId };
  },

  async checkTask(key, providerTaskId) {
    const data = await kieRequest(
      key,
      `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(providerTaskId)}`,
      {},
      20_000
    );
    const state = String(data.state ?? "").toLowerCase();

    // نجاح → resultJson نص JSON داخل JSON يحتاج JSON.parse ثانيًا (نتبع الشكل الحقيقي)
    if (state === "success" || state === "completed" || state === "succeeded") {
      let urls: string[] = [];
      const rj = data.resultJson;
      if (typeof rj === "string" && rj.trim()) {
        try {
          urls = deepCollectUrls(JSON.parse(rj));
        } catch {
          urls = deepCollectUrls(rj);
        }
      } else if (rj && typeof rj === "object") {
        urls = deepCollectUrls(rj);
      }
      if (!urls.length) urls = deepCollectUrls(data);
      if (!urls.length) {
        // نجاح بلا روابط — نعتبره فشلاً حقيقيًا بصياغة محايدة
        return { status: "failed", error: "انتهى التوليد دون إعادة أي رابط نتيجة" };
      }
      return { status: "completed", urls };
    }

    if (state === "fail" || state === "failed" || state === "error") {
      const failMsg = String(data.failMsg ?? data.errMsg ?? "فشل غير محدد لدى المزود");
      return { status: "failed", error: failMsg };
    }

    // waiting | queuing | generating | غير معروف → جارية (التقدم يقدَّر في المنسق)
    return { status: "processing" };
  },
};
