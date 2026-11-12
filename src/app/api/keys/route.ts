/**
 * مدير المفاتيح للواجهة (قسم 4.4 من المواصفة):
 * GET  → القائمة كاملة مع إخفاء المفاتيح دائمًا (maskKey) — لا يُعاد المفتاح الكامل أبدًا.
 * POST → إضافة {provider, api_key, label?} مع رفض التكرار لنفس المزود.
 */
import {
  listApiKeys, findDuplicateKey, insertApiKey,
  type ApiKeyRow,
} from "@/lib/turso";
import { maskKey } from "@/lib/format";

export const runtime = "nodejs";

const VALID_PROVIDERS = ["kie", "cometapi"];

/** تحويل صف القاعدة إلى شكل الواجهة (camelCase) — المفتاح مُقنَّع دائمًا (القاعدة الذهبية 9) */
function toKeyItem(row: ApiKeyRow) {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label || null,
    maskedKey: maskKey(row.api_key),
    status: row.status,
    usageCount: row.usage_count,
    successCount: row.success_count,
    failCount: row.fail_count,
    lastUsedAt: row.last_used_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
    createdAt: row.created_at,
  };
}

export async function GET() {
  try {
    const rows = await listApiKeys();
    return Response.json({ keys: rows.map(toKeyItem) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر جلب المفاتيح" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as
      | { provider?: string; api_key?: string; label?: string }
      | null;

    const provider = String(body?.provider ?? "").trim();
    const apiKey = String(body?.api_key ?? "").trim();
    const label = String(body?.label ?? "").trim().slice(0, 100);

    if (!VALID_PROVIDERS.includes(provider)) {
      return Response.json(
        { error: "المزود غير مدعوم — اختر kie.ai أو CometAPI." },
        { status: 400 }
      );
    }
    if (!apiKey) {
      return Response.json({ error: "أدخل مفتاح API أولًا." }, { status: 400 });
    }

    // رفض التكرار لنفس المزود (نفس قيمة المفتاح)
    const dup = await findDuplicateKey(provider, apiKey);
    if (dup) {
      return Response.json(
        { error: "هذا المفتاح مُضاف مسبقًا لنفس المزود — لا يُقبل التكرار." },
        { status: 409 }
      );
    }

    const row = await insertApiKey(provider, apiKey, label);
    return Response.json({ key: toKeyItem(row) }, { status: 201 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر إضافة المفتاح" },
      { status: 500 }
    );
  }
}
