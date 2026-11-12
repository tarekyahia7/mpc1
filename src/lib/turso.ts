/**
 * طبقة Turso (libSQL عبر HTTP) — إلزامية للتوافق مع Vercel (لا ملفات SQLite محلية).
 * عميل واحد + ensureSchema() تنشئ الجداول عند أول وصول (CREATE TABLE IF NOT EXISTS)
 * فلا حاجة لأداة migrations، و dbHealthy() لفحص الجهوزية.
 */
import { createClient, type Client, type Row } from "@libsql/client";
import { parseDbDate, safeParse } from "./format";

let _client: Client | null = null;
let _schemaReady: Promise<void> | null = null;

export function getTurso(): Client {
  if (!_client) {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    if (!url || !authToken) {
      throw new Error("متغيرات البيئة TURSO_DATABASE_URL و TURSO_AUTH_TOKEN مطلوبة");
    }
    _client = createClient({ url, authToken });
  }
  return _client;
}

/** إنشاء المخطط عند أول وصول (memoized) */
export async function ensureSchema(): Promise<void> {
  if (!_schemaReady) {
    _schemaReady = (async () => {
      const db = getTurso();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          provider TEXT,
          provider_task_id TEXT,
          key_id TEXT,
          model TEXT NOT NULL,
          type TEXT NOT NULL,
          prompt TEXT DEFAULT '',
          params_json TEXT DEFAULT '{}',
          status TEXT NOT NULL,
          progress INTEGER DEFAULT 0,
          result_urls_json TEXT,
          error_message TEXT,
          attempts_json TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now')),
          updated_at TEXT DEFAULT (datetime('now')),
          completed_at TEXT
        )
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL,
          label TEXT DEFAULT '',
          api_key TEXT NOT NULL,
          status TEXT DEFAULT 'active',
          usage_count INTEGER DEFAULT 0,
          success_count INTEGER DEFAULT 0,
          fail_count INTEGER DEFAULT 0,
          last_used_at TEXT,
          last_checked_at TEXT,
          last_error TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
    })().catch((err) => {
      // اسمح بإعادة المحاولة عند فشل أول اتصال
      _schemaReady = null;
      throw err;
    });
  }
  return _schemaReady;
}

/** فحص صحة قاعدة البيانات: SELECT 1 */
export async function dbHealthy(): Promise<boolean> {
  try {
    await ensureSchema();
    const rs = await getTurso().execute("SELECT 1");
    return rs.rows.length > 0;
  } catch {
    return false;
  }
}

/* ============================ المهام ============================ */

export interface AttemptEntry {
  provider: string | null;
  keyId: string | null;
  keyLabel: string;
  ok: boolean;
  errorClass?: string;
  error?: string;
  at: string;
}

export interface TaskRow {
  id: string;
  provider: string | null;
  provider_task_id: string | null;
  key_id: string | null;
  model: string;
  type: string;
  prompt: string;
  params_json: string;
  status: string;
  progress: number;
  result_urls_json: string | null;
  error_message: string | null;
  attempts_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

function rowToTask(r: Row): TaskRow {
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  const n = (k: string) => (r[k] == null ? 0 : Number(r[k]));
  return {
    id: s("id")!,
    provider: s("provider"),
    provider_task_id: s("provider_task_id"),
    key_id: s("key_id"),
    model: s("model") ?? "",
    type: s("type") ?? "",
    prompt: s("prompt") ?? "",
    params_json: s("params_json") ?? "{}",
    status: s("status") ?? "processing",
    progress: n("progress"),
    result_urls_json: s("result_urls_json"),
    error_message: s("error_message"),
    attempts_json: s("attempts_json") ?? "[]",
    created_at: s("created_at") ?? "",
    updated_at: s("updated_at") ?? "",
    completed_at: s("completed_at"),
  };
}

export interface NewTaskInput {
  id?: string;
  provider?: string;
  providerTaskId?: string;
  keyId?: string;
  model: string;
  type: string;
  prompt?: string;
  paramsJson?: string;
  status?: string;
  progress?: number;
}

/** تسجيل المهمة قبل أي نداء خارجي (حتى لو انقطع الاتصال تبقى قابلة للتتبع) */
export async function insertTask(t: NewTaskInput): Promise<TaskRow> {
  await ensureSchema();
  const id = t.id ?? crypto.randomUUID();
  await getTurso().execute({
    sql: `INSERT INTO tasks (id, provider, provider_task_id, key_id, model, type, prompt, params_json, status, progress)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      t.provider ?? null,
      t.providerTaskId ?? null,
      t.keyId ?? null,
      t.model,
      t.type,
      t.prompt ?? "",
      t.paramsJson ?? "{}",
      t.status ?? "processing",
      t.progress ?? 0,
    ],
  });
  const task = await getTask(id);
  return task!;
}

export async function getTask(id: string): Promise<TaskRow | null> {
  await ensureSchema();
  const rs = await getTurso().execute({
    sql: "SELECT * FROM tasks WHERE id = ?",
    args: [id],
  });
  return rs.rows.length ? rowToTask(rs.rows[0]) : null;
}

export interface TaskPatch {
  provider?: string | null;
  providerTaskId?: string | null;
  keyId?: string | null;
  status?: string;
  progress?: number;
  resultUrls?: string[] | null;
  errorMessage?: string | null;
  /** استبدال معطيات الطلب المخزنة (يُستخدم لقفل processStarted في مهام الدمج) */
  paramsJson?: string;
  /** إلحاق محاولة جديدة بسجل attempts_json */
  appendAttempt?: AttemptEntry;
}

/**
 * تحديث جزئي للمهمة — يضيف attempts ويرفع updated_at تلقائيًا،
 * ويضبط completed_at و progress=100 تلقائيًا عند الاكتمال.
 */
export async function updateTask(id: string, patch: TaskPatch): Promise<void> {
  await ensureSchema();
  const sets: string[] = [];
  const args: (string | number | null)[] = [];

  if ("provider" in patch) { sets.push("provider = ?"); args.push(patch.provider ?? null); }
  if ("providerTaskId" in patch) { sets.push("provider_task_id = ?"); args.push(patch.providerTaskId ?? null); }
  if ("keyId" in patch) { sets.push("key_id = ?"); args.push(patch.keyId ?? null); }
  if (patch.status) { sets.push("status = ?"); args.push(patch.status); }
  if (typeof patch.progress === "number") { sets.push("progress = ?"); args.push(Math.max(0, Math.min(100, Math.round(patch.progress)))); }
  if ("resultUrls" in patch) {
    sets.push("result_urls_json = ?");
    args.push(patch.resultUrls ? JSON.stringify(patch.resultUrls) : null);
  }
  if ("errorMessage" in patch) { sets.push("error_message = ?"); args.push(patch.errorMessage ?? null); }
  if ("paramsJson" in patch) { sets.push("params_json = ?"); args.push(patch.paramsJson ?? "{}"); }

  if (patch.appendAttempt) {
    // قراءة-تعديل-كتابة: التزامن هنا محدود (مهمة واحدة يتابعها مسار واحد غالبًا)
    const current = await getTask(id);
    const attempts = safeParse<AttemptEntry[]>(current?.attempts_json, []);
    attempts.push(patch.appendAttempt);
    sets.push("attempts_json = ?");
    args.push(JSON.stringify(attempts));
  }

  if (patch.status === "completed") {
    sets.push("completed_at = COALESCE(completed_at, datetime('now'))");
    sets.push("progress = 100");
  }

  sets.push("updated_at = datetime('now')");
  args.push(id);
  await getTurso().execute({ sql: `UPDATE tasks SET ${sets.join(", ")} WHERE id = ?`, args });
}

export async function listRecentTasks(
  limit: number,
  filters?: { type?: string; status?: string }
): Promise<TaskRow[]> {
  await ensureSchema();
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filters?.type) { where.push("type = ?"); args.push(filters.type); }
  if (filters?.status) { where.push("status = ?"); args.push(filters.status); }
  args.push(Math.max(1, Math.min(50, limit)));
  const rs = await getTurso().execute({
    // rowid يضمن ترتيب الإدراج عند تساوي الثانية — الأحدث أولًا
    sql: `SELECT * FROM tasks ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
          ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    args,
  });
  return rs.rows.map(rowToTask);
}

export async function taskStats(): Promise<{
  total: number; completed: number; failed: number; processing: number;
}> {
  await ensureSchema();
  const rs = await getTurso().execute(`
    SELECT
      COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
      COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN status IN ('processing','pending') THEN 1 ELSE 0 END), 0) AS processing
    FROM tasks
  `);
  const r = rs.rows[0];
  return {
    total: Number(r?.total ?? 0),
    completed: Number(r?.completed ?? 0),
    failed: Number(r?.failed ?? 0),
    processing: Number(r?.processing ?? 0),
  };
}

/* ============================ المفاتيح ============================ */

export interface ApiKeyRow {
  id: string;
  provider: string;
  label: string;
  api_key: string;
  status: string;
  usage_count: number;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  last_checked_at: string | null;
  last_error: string | null;
  created_at: string;
}

function rowToKey(r: Row): ApiKeyRow {
  const s = (k: string) => (r[k] == null ? null : String(r[k]));
  const n = (k: string) => (r[k] == null ? 0 : Number(r[k]));
  return {
    id: s("id")!,
    provider: s("provider") ?? "",
    label: s("label") ?? "",
    api_key: s("api_key") ?? "",
    status: s("status") ?? "active",
    usage_count: n("usage_count"),
    success_count: n("success_count"),
    fail_count: n("fail_count"),
    last_used_at: s("last_used_at"),
    last_checked_at: s("last_checked_at"),
    last_error: s("last_error"),
    created_at: s("created_at") ?? "",
  };
}

/**
 * جلب مسبحة المفاتيح للترتيب التسلسلي الصارم — القاعدة الذهبية 2:
 * أول مفتاح أُضيف يُجرَّب أولًا (created_at ASC, id ASC) — ليس round-robin.
 * المستنزف (exhausted) يبقى في القائمة ويعاد تجربته (يستأنف بعد الشحن)،
 * والاستثناء الوحيد للإقصاء هو التعطيل اليدوي (disabled).
 */
export async function getKeyPool(providers: string[]): Promise<ApiKeyRow[]> {
  await ensureSchema();
  const placeholders = providers.map(() => "?").join(",");
  const rs = await getTurso().execute({
    sql: `SELECT * FROM api_keys
          WHERE status != 'disabled' AND provider IN (${placeholders})
          ORDER BY created_at ASC, id ASC`,
    args: providers,
  });
  return rs.rows.map(rowToKey);
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  await ensureSchema();
  const rs = await getTurso().execute(
    "SELECT * FROM api_keys ORDER BY created_at ASC, id ASC"
  );
  return rs.rows.map(rowToKey);
}

export async function getApiKey(id: string): Promise<ApiKeyRow | null> {
  await ensureSchema();
  const rs = await getTurso().execute({ sql: "SELECT * FROM api_keys WHERE id = ?", args: [id] });
  return rs.rows.length ? rowToKey(rs.rows[0]) : null;
}

export async function findDuplicateKey(provider: string, apiKey: string): Promise<ApiKeyRow | null> {
  await ensureSchema();
  const rs = await getTurso().execute({
    sql: "SELECT * FROM api_keys WHERE provider = ? AND api_key = ? LIMIT 1",
    args: [provider, apiKey],
  });
  return rs.rows.length ? rowToKey(rs.rows[0]) : null;
}

export async function insertApiKey(provider: string, apiKey: string, label: string): Promise<ApiKeyRow> {
  await ensureSchema();
  const id = crypto.randomUUID();
  await getTurso().execute({
    sql: `INSERT INTO api_keys (id, provider, label, api_key) VALUES (?, ?, ?, ?)`,
    args: [id, provider, label, apiKey],
  });
  return (await getApiKey(id))!;
}

export async function setApiKeyStatus(id: string, status: string): Promise<void> {
  await ensureSchema();
  await getTurso().execute({
    sql: "UPDATE api_keys SET status = ?, last_checked_at = datetime('now') WHERE id = ?",
    args: [status, id],
  });
}

export async function deleteApiKey(id: string): Promise<void> {
  await ensureSchema();
  await getTurso().execute({ sql: "DELETE FROM api_keys WHERE id = ?", args: [id] });
}

export interface KeyUsageUpdate {
  ok: boolean;
  errorClass?: string;
  error?: string;
}

/**
 * تحديث عدّادات المفتاح بعد كل محاولة (نجاح أو فشل) — يُستدعى دائمًا.
 * التصنيف disabled/exhausted يغيّر حالة المفتاح تلقائيًا.
 */
export async function updateKeyAfterUse(id: string, u: KeyUsageUpdate): Promise<void> {
  await ensureSchema();
  const key = await getApiKey(id);
  if (!key) return;
  const usage = key.usage_count + 1;
  const success = key.success_count + (u.ok ? 1 : 0);
  const fail = key.fail_count + (u.ok ? 0 : 1);
  let status = key.status;
  if (!u.ok && u.errorClass === "disabled") status = "disabled";
  if (!u.ok && u.errorClass === "exhausted") status = "exhausted";
  await getTurso().execute({
    sql: `UPDATE api_keys
          SET usage_count = ?, success_count = ?, fail_count = ?, status = ?,
              last_used_at = datetime('now'), last_checked_at = datetime('now'), last_error = ?
          WHERE id = ?`,
    args: [usage, success, fail, status, u.ok ? null : (u.error ? String(u.error).slice(0, 500) : null), id],
  });
}

/** حذف كل مهام الاختبار (تنظيف بعد الاختبارات — القاعدة 12 من معايير القبول) */
export async function clearAllTasks(): Promise<void> {
  await ensureSchema();
  await getTurso().execute("DELETE FROM tasks");
}
