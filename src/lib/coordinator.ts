/**
 * منسق التوليد (قسم 6) وسياسة التبديل التسلسلي «لا توقف أبدًا» (قسم 4.3):
 *
 * 1. التجربة تسلسلية صارمة حسب ترتيب الإضافة — أول نجاح يربط المهمة بالمزود والمفتاح.
 * 2. كل محاولة (نجاح/فشل + الفئة) تُسجَّل في attempts_json وتُحدَّث عدّادات المفتاح دائمًا.
 * 3. فشل منتصف المهمة برسالة تشبه مشكلات مفتاح/رصيد → إعادة إنشاء نفس المهمة بنفس
 *    task_id على المفتاح التالي تلقائيًا — العميل يرى «قيد المعالجة» فقط.
 * 4. فشل الإنشاء على كل المفاتيح → المهمة تبقى processing «بانتظار توفر مفتاح صالح…»
 *    وتُعاد المحاولة مع كل get_task بعد تهدئة ~45 ثانية (فإن شُحن رصيد اكتملت تلقائيًا).
 * 5. نموذج الذكاء الاصطناعي لا يرى أبدًا خطأ مفتاح أو رصيد — التبديل صامت تمامًا.
 */
import {
  getTask, insertTask, updateTask, getKeyPool, getApiKey,
  updateKeyAfterUse, type ApiKeyRow, type TaskRow, type AttemptEntry,
} from "./turso";
import { ProviderError, classifyProviderError, KEY_FAIL_RE, scrubSecrets } from "./errors";
import { findModel, type ModelDef } from "./models";
import { getAdapter, type ProviderKeyRef } from "./providers";
import {
  createMergeJob, processMergeJob, getMergeStatus, MERGER_CONFIGURED, MERGER_LIMITS,
} from "./merger";
import { arType, arStatus, isPublicHttpUrl, parseDbDate, safeParse, sleep, nowIso } from "./format";

export type ProgressSender = (progress: number, message: string) => Promise<void>;
export const noopProgress: ProgressSender = async () => {};

const POLL_INTERVAL_MS = 3_000;
const RECREATE_COOLDOWN_MS = 45_000;
/** قفل في الذاكرة: POST .../process يُطلق مرة واحدة فقط لكل jobId (قسم 7.3.3) */
const PROCESS_IN_FLIGHT = new Set<string>();

export interface ToolOutcome {
  kind: "completed" | "processing" | "failed" | "no_keys";
  taskId?: string;
  urls?: string[];
  message?: string;
  taskType?: string;
}

export interface RefreshResult {
  found: boolean;
  isError: boolean;
  text: string;
}

function keyRefOf(row: ApiKeyRow): ProviderKeyRef {
  return { id: row.id, provider: row.provider as ProviderKeyRef["provider"], label: row.label, apiKey: row.api_key };
}

/** تسجيل محاولة في attempts_json + تحديث عدّادات المفتاح (دائمًا) */
async function logAttempt(
  taskId: string, keyRow: ApiKeyRow | null, ok: boolean, errorClass?: string, error?: string
): Promise<void> {
  const entry: AttemptEntry = {
    provider: keyRow?.provider ?? null,
    keyId: keyRow?.id ?? null,
    keyLabel: keyRow?.label ?? "",
    ok,
    errorClass,
    error: error ? scrubSecrets(error) : undefined,
    at: nowIso(),
  };
  await updateTask(taskId, { appendAttempt: entry });
  if (keyRow) await updateKeyAfterUse(keyRow.id, { ok, errorClass, error });
}

/* ==================== إنشاء المهمة على مسبحة المفاتيح ==================== */

type CreateOutcome =
  | { ok: true; provider: string; providerTaskId?: string; syncUrls?: string[]; keyId: string }
  | { ok: false; paramsError?: string };

/**
 * تجربة المرشحين بالترتيب التسلسلي حتى أول نجاح.
 * skipKeyIds: مفاتيح يُستثنى من هذه الجولة فقط (المفتاح الذي فشل للتو في منتصف المهمة) —
 * الجولات اللاحقة تبدأ من الصفر ليعمل استئناف المفاتيح بعد الشحن.
 */
async function tryCreateOnPool(
  task: TaskRow,
  modelDef: ModelDef,
  input: Record<string, unknown>,
  skipKeyIds: Set<string>
): Promise<CreateOutcome> {
  const pool = await getKeyPool(modelDef.providers);
  for (const keyRow of pool) {
    if (skipKeyIds.has(keyRow.id)) continue;
    const key = keyRefOf(keyRow);
    const adapter = getAdapter(keyRow.provider);
    const providerModel = modelDef.providerModel[keyRow.provider as "kie" | "cometapi"] ?? modelDef.canonical;
    try {
      if (modelDef.type === "image" && adapter.createImageSync) {
        // صور متزامنة (CometAPI تعيد الرابط فورًا)
        const { urls } = await adapter.createImageSync(key, providerModel, input);
        await logAttempt(task.id, keyRow, true);
        return { ok: true, provider: keyRow.provider, syncUrls: urls, keyId: keyRow.id };
      }
      const { providerTaskId } = await adapter.createTask(key, providerModel, input);
      await logAttempt(task.id, keyRow, true);
      return { ok: true, provider: keyRow.provider, providerTaskId, keyId: keyRow.id };
    } catch (e) {
      const status = e instanceof ProviderError ? e.status : undefined;
      const msg = e instanceof Error ? e.message : String(e);
      const cls = classifyProviderError(status, msg);
      await logAttempt(task.id, keyRow, false, cls, msg);
      if (cls === "params") {
        // توقف فورًا — تبديل المفاتيح لن يحل خطأ معطيات
        return { ok: false, paramsError: msg };
      }
      // disabled/exhausted/provider/temporary → انتقل للمفتاح التالي فورًا
      continue;
    }
  }
  return { ok: false };
}

function completedOutcome(task: TaskRow): ToolOutcome {
  return {
    kind: "completed",
    taskId: task.id,
    urls: safeParse<string[]>(task.result_urls_json, []),
    taskType: task.type,
  };
}

/** تقدير تقدم تصاعدي هادئ (kie لا يوفر نسبة جاهزة) */
function estimateProgress(task: TaskRow): number {
  return Math.min(95, Math.max(task.progress, 10) + 7);
}

/* ==================== الفحص الموحد لمهام التوليد ==================== */

/**
 * فحص مهمة توليد جارية من المزود مع كل منطق التبديل:
 * - اكتمال → completed + روابط.
 * - فشل حقيقي (سياسة/معطيات) → failed نهائي.
 * - فشل مفتاح/رصيد (رسالة أو كود) → إعادة إنشاء بنفس task_id على المفتاح التالي.
 * - لم تُنشأ بعد → إعادة محاولة الإنشاء بعد تهدئة 45 ثانية.
 */
async function checkGenerationTask(
  taskId: string
): Promise<{ done: boolean; result?: ToolOutcome; progress?: number }> {
  const task = await getTask(taskId);
  if (!task) return { done: true, result: { kind: "failed", message: "❌ المهمة غير موجودة" } };
  if (task.status === "completed") return { done: true, result: completedOutcome(task) };
  if (task.status === "failed") {
    return { done: true, result: { kind: "failed", message: `❌ فشلت المهمة: ${task.error_message ?? "سبب غير معروف"}` } };
  }

  const modelDef = findModel(task.model);
  const params = safeParse<{ input?: Record<string, unknown> }>(task.params_json, {});
  const input = params.input ?? {};

  // لم تُنشأ بعد لدى المزود (فشل كل المفاتيح سابقًا) → إعادة محاولة بعد التهدئة
  if (!task.provider_task_id) {
    const last = parseDbDate(task.updated_at)?.getTime() ?? 0;
    if (Date.now() - last < RECREATE_COOLDOWN_MS) return { done: false, progress: task.progress || 5 };
    if (!modelDef) return { done: false, progress: task.progress || 5 };
    const created = await tryCreateOnPool(task, modelDef, input, new Set());
    if (created.ok) {
      await updateTask(taskId, {
        provider: created.provider, providerTaskId: created.providerTaskId ?? null,
        keyId: created.keyId, errorMessage: null, progress: created.syncUrls ? 100 : 15,
      });
      if (created.syncUrls) {
        await updateTask(taskId, { status: "completed", resultUrls: created.syncUrls });
        const t2 = await getTask(taskId);
        return { done: true, result: completedOutcome(t2 ?? task) };
      }
      return { done: false, progress: 15 };
    }
    // رفع updated_at عبر أي تحديث يبدأ تهدئة جديدة حتى get_task القادم
    await updateTask(taskId, { errorMessage: "بانتظار توفر مفتاح صالح…" });
    return { done: false, progress: task.progress || 5 };
  }

  const keyRow = task.key_id ? await getApiKey(task.key_id) : null;
  if (!keyRow || !modelDef) {
    // المفتاح حُذف أو الموديل لم يعد معروفًا → إعادة إنشاء على المسبحة
    return await recreateAfterBindLoss(taskId, task, modelDef, input);
  }

  const adapter = getAdapter(task.provider!);
  try {
    const chk = await adapter.checkTask(keyRefOf(keyRow), task.provider_task_id);

    if (chk.status === "completed" && chk.urls?.length) {
      await updateTask(taskId, { status: "completed", resultUrls: chk.urls });
      await logAttempt(taskId, keyRow, true);
      const t2 = await getTask(taskId);
      return { done: true, result: completedOutcome(t2 ?? task) };
    }

    if (chk.status === "failed") {
      const msg = chk.error ?? "";
      if (KEY_FAIL_RE.test(msg)) {
        // فشل مفتاح/رصيد معلن في منتصف المهمة → علّم المفتاح وأعد الإنشاء على التالي
        const cls = classifyProviderError(undefined, msg);
        await logAttempt(taskId, keyRow, false, cls, msg);
        return await recreateAfterBindLoss(taskId, task, modelDef, input, keyRow.id);
      }
      // فشل حقيقي (انتهاك سياسة/معطيات) → failed نهائي
      const reason = scrubSecrets(msg) || "فشل غير محدد لدى المزود";
      await logAttempt(taskId, keyRow, false, undefined, msg);
      await updateTask(taskId, { status: "failed", errorMessage: reason });
      return { done: true, result: { kind: "failed", message: `❌ فشلت المهمة: ${reason}` } };
    }

    return { done: false, progress: estimateProgress(task) };
  } catch (e) {
    if (e instanceof ProviderError) {
      const cls = classifyProviderError(e.status, e.message);
      if (cls === "disabled" || cls === "exhausted") {
        // المفتاح مات أثناء الاستعلام (401/402/رسالة رفض) → تبديل صامت
        await logAttempt(taskId, keyRow, false, cls, e.message);
        return await recreateAfterBindLoss(taskId, task, modelDef, input, keyRow.id);
      }
    }
    // خطأ استعلام مؤقت (شبكة/timeout) → استمر بالاستعلام
    return { done: false, progress: estimateProgress(task) };
  }
}

/** إعادة إنشاء نفس المهمة بنفس task_id على المفتاح التالي (بعد فك الربط القديم) */
async function recreateAfterBindLoss(
  taskId: string,
  task: TaskRow,
  modelDef: ModelDef | null,
  input: Record<string, unknown>,
  skipKeyId?: string
): Promise<{ done: boolean; result?: ToolOutcome; progress?: number }> {
  await updateTask(taskId, { providerTaskId: null, keyId: null });
  if (!modelDef) {
    await updateTask(taskId, { errorMessage: "بانتظار توفر مفتاح صالح…" });
    return { done: true, result: { kind: "processing", taskId, taskType: task.type } };
  }
  const created = await tryCreateOnPool(task, modelDef, input, new Set(skipKeyId ? [skipKeyId] : []));
  if (created.ok) {
    await updateTask(taskId, {
      provider: created.provider, providerTaskId: created.providerTaskId ?? null,
      keyId: created.keyId, errorMessage: null, progress: created.syncUrls ? 100 : 40,
    });
    if (created.syncUrls) {
      await updateTask(taskId, { status: "completed", resultUrls: created.syncUrls });
      const t2 = await getTask(taskId);
      return { done: true, result: completedOutcome(t2 ?? task) };
    }
    return { done: false, progress: 40 };
  }
  // فشل على كل المفاتيح → تبقى processing والعميل يرى «جارية» فقط
  await updateTask(taskId, { status: "processing", errorMessage: "بانتظار توفر مفتاح صالح…" });
  return { done: true, result: { kind: "processing", taskId, taskType: task.type } };
}

/* ==================== runGeneration — تدفق generate_image / generate_video ==================== */

export async function runGeneration(opts: {
  type: "image" | "video";
  modelDef: ModelDef;
  input: Record<string, unknown>;
  waitSeconds: number;
  sendProgress?: ProgressSender;
}): Promise<ToolOutcome> {
  const { type, modelDef, input, waitSeconds, sendProgress = noopProgress } = opts;

  const pool = await getKeyPool(modelDef.providers);
  if (!pool.length) {
    return {
      kind: "no_keys",
      taskType: type,
      message: `❌ لا توجد مفاتيح نشطة لخدمة ${modelDef.canonical}. أضف مفتاحًا واحدًا على الأقل من واجهة الإدارة، ثم أعد المحاولة.`,
    };
  }

  // سجّل المهمة في Turso قبل أي نداء خارجي (حتى لو انقطع الاتصال تبقى قابلة للتتبع)
  const task = await insertTask({
    type,
    model: modelDef.canonical,
    prompt: String(input.prompt ?? ""),
    paramsJson: JSON.stringify({ model: modelDef.canonical, input, waitSeconds }),
    status: "processing",
    progress: 5,
  });

  // جرّب المرشحين بالترتيب حتى نجاح الإنشاء
  const created = await tryCreateOnPool(task, modelDef, input, new Set());
  if (!created.ok) {
    if (created.paramsError) {
      const reason = `المعطيات المرسلة غير مقبولة من المزود: ${scrubSecrets(created.paramsError)}`;
      await updateTask(task.id, { status: "failed", errorMessage: reason });
      return { kind: "failed", message: `❌ فشلت المهمة: ${reason}`, taskId: task.id, taskType: type };
    }
    await updateTask(task.id, { status: "processing", errorMessage: "بانتظار توفر مفتاح صالح…" });
    return { kind: "processing", taskId: task.id, taskType: type };
  }

  await updateTask(task.id, {
    provider: created.provider,
    providerTaskId: created.providerTaskId ?? null,
    keyId: created.keyId,
    errorMessage: null,
    progress: created.syncUrls ? 100 : 15,
  });

  if (created.syncUrls) {
    // صور متزامنة اكتملت فورًا
    await updateTask(task.id, { status: "completed", resultUrls: created.syncUrls });
    await sendProgress(100, "اكتمل التوليد");
    return { kind: "completed", taskId: task.id, urls: created.syncUrls, taskType: type };
  }

  // نافذة الانتظار (0–240 ثانية): استعلم كل 3 ثوانٍ مع بث progress notifications
  const deadline = Date.now() + waitSeconds * 1000;
  let lastProgress = 15;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const chk = await checkGenerationTask(task.id);
    if (chk.done) return chk.result!;
    lastProgress = Math.max(lastProgress, chk.progress ?? lastProgress);
    await updateTask(task.id, { progress: lastProgress });
    await sendProgress(lastProgress, `قيد التوليد… ${lastProgress}%`);
  }

  // انتهت النافذة والنتيجة لم تظهر → أعِد المهمة بحالة processing والعميل يتابع بـ get_task
  return { kind: "processing", taskId: task.id, taskType: type };
}

/* ==================== refreshTask — للمتابعة عبر get_task ==================== */

export async function refreshTask(taskId: string): Promise<RefreshResult> {
  const task = await getTask(taskId);
  if (!task) return { found: false, isError: true, text: `❌ لا توجد مهمة بالمعرف: ${taskId}` };

  if (task.type === "merge") return await refreshMergeTask(taskId);

  if (task.status === "completed") return { found: true, isError: false, text: formatCompletedTask(task) };
  if (task.status === "failed") {
    return { found: true, isError: true, text: `❌ فشلت المهمة: ${task.error_message ?? "سبب غير معروف"}` };
  }

  // جارية → حدّث حية من المزود مع نفس منطق التبديل
  const chk = await checkGenerationTask(taskId);
  if (chk.done && chk.result?.kind === "completed") {
    const t2 = await getTask(taskId);
    return { found: true, isError: false, text: formatCompletedTask(t2 ?? task) };
  }
  if (chk.done && chk.result?.kind === "failed") {
    return { found: true, isError: true, text: chk.result.message ?? "❌ فشلت المهمة" };
  }
  const t2 = await getTask(taskId);
  return { found: true, isError: false, text: formatProcessingTask(t2 ?? task) };
}

/* ==================== الصياغة العربية للردود ==================== */

export function formatCompletedTask(task: TaskRow): string {
  const urls = safeParse<string[]>(task.result_urls_json, []);
  if (task.type === "image") {
    const imgs = urls.map((u) => `![image](${u})`).join("\n\n");
    return `✅ تم توليد الصورة بنجاح\n\n${imgs}\n\nالرابط المباشر: ${urls[0] ?? ""}`;
  }
  if (task.type === "video") {
    const links = urls.map((u) => `- ${u}`).join("\n");
    return `✅ تم توليد الفيديو بنجاح\n\nالروابط المباشرة:\n${links}`;
  }
  // merge — التحذير مذكور حرفيًا وفق المواصفة
  return `✅ تم دمج المقاطع بنجاح\n\nالرابط المباشر: ${urls[0] ?? ""}\n\n⚠️ ملف الدمج يُحذف من خدمة الدمج بعد ~24 ساعة — شاهده/نزّله سريعًا.`;
}

export function formatProcessingTask(task: TaskRow): string {
  const pct = task.progress > 0 ? `\n\nالتقدم الحالي: ~${task.progress}%` : "";
  return `⏳ المهمة قيد المعالجة — task_id: ${task.id}${pct}\n\nتابع بـ get_task كل ~10 ثوانٍ حتى تكتمل.`;
}

/* ==================== دمج الفيديو — runMerge (قسم 7.3) ==================== */

export async function runMerge(opts: {
  urls?: string[];
  taskIds?: string[];
  waitSeconds: number;
  sendProgress?: ProgressSender;
}): Promise<ToolOutcome> {
  const { waitSeconds, sendProgress = noopProgress } = opts;

  // 1) حل task_ids بالترتيب — روابط task_ids أولًا ثم urls المباشرة بنفس ترتيبها
  const details: string[] = [];
  const resolved: string[] = [];
  for (const tid of opts.taskIds ?? []) {
    const t = await getTask(String(tid));
    if (!t) { details.push(`- ${tid}: غير موجودة`); continue; }
    if (t.type !== "video") { details.push(`- ${tid}: ليست مهمة فيديو (${arType(t.type)})`); continue; }
    if (t.status !== "completed") { details.push(`- ${tid}: الحالة «${arStatus(t.status)}» — يجب أن تكون مكتملة`); continue; }
    const u = safeParse<string[]>(t.result_urls_json, [])[0];
    if (!u) { details.push(`- ${tid}: لا يوجد رابط نتيجة`); continue; }
    resolved.push(u);
  }
  const all = [...resolved, ...(opts.urls ?? []).map(String)];

  // 2) تحقق صارم بعد جمع الروابط
  if (all.length < 2) {
    let msg = "❌ الدمج يحتاج مقطعَين على الأقل. مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة.";
    if (details.length) msg += `\n\nتفاصيل المعرفات غير الصالحة:\n${details.join("\n")}`;
    return { kind: "failed", message: msg, taskType: "merge" };
  }
  if (all.length > MERGER_LIMITS.maxVideos) {
    return {
      kind: "failed",
      taskType: "merge",
      message: `❌ أقصى عدد مقاطع للدمج هو ${MERGER_LIMITS.maxVideos} (خدمة الدمج تقبل 10 مقاطع كحد أقصى).`,
    };
  }
  const bad = all.find((u) => !isPublicHttpUrl(u));
  if (bad) {
    return { kind: "failed", taskType: "merge", message: `❌ الرابط التالي ليس رابط فيديو مباشرًا عامًا صالحًا: ${bad}` };
  }
  if (!MERGER_CONFIGURED) {
    return {
      kind: "failed",
      taskType: "merge",
      message: "❌ خدمة الدمج غير مهيأة على السيرفر — يجب ضبط متغير البيئة MERGER_API_BASE بعنوان الخدمة الحقيقي ثم إعادة المحاولة.",
    };
  }

  // 3) سجّل مهمة الدمج في Turso أولًا
  const task = await insertTask({
    type: "merge",
    provider: "merger",
    model: "video-merger",
    prompt: "",
    paramsJson: JSON.stringify({ urls: all, waitSeconds }),
    status: "processing",
    progress: 5,
  });

  // 4) POST /api/jobs
  try {
    const job = await createMergeJob(all);
    await updateTask(task.id, { providerTaskId: job.jobId, progress: 15 });
    // 5) أطلق process خلفيًا وبمرة واحدة فقط (قفل في الذاكرة)
    maybeStartProcess(task.id, job.jobId);

    // 6) نافذة الانتظار مع استعلام كل 3 ثوانٍ وبث التقدم — تحديث الحالة في Turso فورًا
    const deadline = Date.now() + waitSeconds * 1000;
    let lastProgress = 15;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const chk = await pollMergeTask(task.id, job.jobId);
      if (chk.done) return chk.result!;
      lastProgress = Math.max(lastProgress, chk.progress ?? lastProgress);
      await updateTask(task.id, { progress: lastProgress });
      await sendProgress(lastProgress, `جارٍ دمج المقاطع… ${lastProgress}%`);
    }
    return { kind: "processing", taskId: task.id, taskType: "merge" };
  } catch (e) {
    if (e instanceof ProviderError) {
      // أي خطأ HTTP معلن من الخدمة = فشل نهائي فوري — لا إعادة محاولة
      const reason = `رفضت خدمة الدمج إنشاء المهمة: ${scrubSecrets(e.message)}`;
      await logAttempt(task.id, null, false, undefined, e.message);
      await updateTask(task.id, { status: "failed", errorMessage: reason });
      return { kind: "failed", message: `❌ فشلت المهمة: ${reason}`, taskId: task.id, taskType: "merge" };
    }
    // أخطاء شبكتنا = مؤقتة → تبقى processing ويكملها get_task بعد التهدئة
    await updateTask(task.id, { errorMessage: "تعذر الوصول لخدمة الدمج مؤقتًا — ستتم إعادة المحاولة تلقائيًا" });
    return { kind: "processing", taskId: task.id, taskType: "merge" };
  }
}

/**
 * إطلاق POST .../process مرة واحدة فقط لكل jobId:
 * قفل في الذاكرة + علامة processStarted في params_json.
 * خطأ HTTP معلن → فشل نهائي؛ خطأ شبكة → يُرفع القفل ليُعاد من get_task لاحقًا.
 */
function maybeStartProcess(taskId: string, jobId: string): void {
  if (PROCESS_IN_FLIGHT.has(jobId)) return;
  void (async () => {
    const task = await getTask(taskId);
    if (!task) return;
    const params = safeParse<{ processStarted?: boolean }>(task.params_json, {});
    if (params.processStarted) return;
    PROCESS_IN_FLIGHT.add(jobId);
    try {
      await updateTask(taskId, { paramsJson: JSON.stringify({ ...params, processStarted: true }) });
      processMergeJob(jobId)
        .then(async (res) => {
          const url = res.videoUrl ?? res.downloadUrl;
          const t = await getTask(taskId);
          if (url && t && t.status === "processing") {
            await updateTask(taskId, { status: "completed", resultUrls: [url] });
          }
        })
        .catch(async (e) => {
          const t = await getTask(taskId);
          if (!t || t.status !== "processing") return;
          if (e instanceof ProviderError) {
            const reason = `فشلت خدمة الدمج: ${scrubSecrets(e.message)}`;
            await updateTask(taskId, { status: "failed", errorMessage: reason });
          } else {
            // شبكة → مؤقت: اسمح بإعادة الطلق من get_task القادم
            const p = safeParse<{ processStarted?: boolean }>(t.params_json, {});
            await updateTask(taskId, { paramsJson: JSON.stringify({ ...p, processStarted: false }) });
          }
        })
        .finally(() => PROCESS_IN_FLIGHT.delete(jobId));
    } catch {
      PROCESS_IN_FLIGHT.delete(jobId);
    }
  })();
}

/** استعلام حالة مهمة دمج مع كتابة النتيجة في Turso فورًا */
async function pollMergeTask(
  taskId: string,
  jobId: string
): Promise<{ done: boolean; result?: ToolOutcome; progress?: number }> {
  try {
    const st = await getMergeStatus(jobId);
    if (st.state === "done") {
      await updateTask(taskId, { status: "completed", resultUrls: [st.videoUrl!] });
      return { done: true, result: { kind: "completed", taskId, urls: [st.videoUrl!], taskType: "merge" } };
    }
    if (st.state === "failed") {
      const reason = `فشلت خدمة الدمج: ${scrubSecrets(st.error ?? "خطأ غير معروف")}`;
      await updateTask(taskId, { status: "failed", errorMessage: reason });
      return { done: true, result: { kind: "failed", message: `❌ فشلت المهمة: ${reason}`, taskId, taskType: "merge" } };
    }
    return { done: false, progress: Math.max(15, st.progress) };
  } catch (e) {
    if (e instanceof ProviderError && e.status === 404) {
      // 404 → حُذفت أو انتهت صلاحيتها بعد 24 ساعة → فشل نهائي (الصياغة حرفية من المواصفة)
      const reason = "مهمة الدمج غير موجودة في الخدمة (حُذفت أو انتهت صلاحيتها بعد 24 ساعة)";
      await updateTask(taskId, { status: "failed", errorMessage: reason });
      return { done: true, result: { kind: "failed", message: `❌ فشلت المهمة: ${reason}`, taskId, taskType: "merge" } };
    }
    // أخطاء شبكتنا مؤقتة → استمر بالاستعلام حتى انتهاء النافذة
    return { done: false };
  }
}

/** get_task لمهمة دمج — تحديث من GET /api/jobs/{id} مع إطلاق process عند الحاجة */
async function refreshMergeTask(taskId: string): Promise<RefreshResult> {
  const task = await getTask(taskId);
  if (!task) return { found: false, isError: true, text: `❌ لا توجد مهمة بالمعرف: ${taskId}` };

  if (task.status === "completed") return { found: true, isError: false, text: formatCompletedTask(task) };
  if (task.status === "failed") {
    return { found: true, isError: true, text: `❌ فشلت المهمة: ${task.error_message ?? "سبب غير معروف"}` };
  }

  // جارية — إن لم يُنشأ الـ job بعد أعد المحاولة بعد التهدئة
  if (!task.provider_task_id) {
    const params = safeParse<{ urls?: string[] }>(task.params_json, {});
    const last = parseDbDate(task.updated_at)?.getTime() ?? 0;
    if (MERGER_CONFIGURED && params.urls?.length && Date.now() - last >= RECREATE_COOLDOWN_MS) {
      try {
        const job = await createMergeJob(params.urls);
        await updateTask(taskId, { providerTaskId: job.jobId, errorMessage: null, progress: 15 });
        maybeStartProcess(taskId, job.jobId);
      } catch (e) {
        if (e instanceof ProviderError) {
          const reason = `رفضت خدمة الدمج إنشاء المهمة: ${scrubSecrets(e.message)}`;
          await updateTask(taskId, { status: "failed", errorMessage: reason });
          return { found: true, isError: true, text: `❌ فشلت المهمة: ${reason}` };
        }
        await updateTask(taskId, { errorMessage: "تعذر الوصول لخدمة الدمج مؤقتًا — ستتم إعادة المحاولة تلقائيًا" });
      }
    }
    const t2 = await getTask(taskId);
    return { found: true, isError: false, text: formatProcessingTask(t2 ?? task) };
  }

  // الـ job موجود — نفّذ process إن لم يُنفَّذ بعد ثم استعلم الحالة
  maybeStartProcess(taskId, task.provider_task_id);
  const chk = await pollMergeTask(taskId, task.provider_task_id);
  if (chk.done && chk.result?.kind === "failed") {
    return { found: true, isError: true, text: chk.result.message ?? "❌ فشلت المهمة" };
  }
  if (chk.done) {
    const t2 = await getTask(taskId);
    if (t2?.status === "completed") return { found: true, isError: false, text: formatCompletedTask(t2) };
  }
  const t2 = await getTask(taskId);
  return { found: true, isError: false, text: formatProcessingTask(t2 ?? task) };
}
