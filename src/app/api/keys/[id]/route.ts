/**
 * PATCH  /api/keys/{id} — تعطيل/تنشيط يدوي {status: "active" | "disabled"}
 * DELETE /api/keys/{id} — حذف المفتاح نهائيًا
 */
import { getApiKey, setApiKeyStatus, deleteApiKey, type ApiKeyRow } from "@/lib/turso";
import { maskKey } from "@/lib/format";

export const runtime = "nodejs";

const VALID_STATUSES = ["active", "disabled", "exhausted"];

/** نفس شكل الواجهة — المفتاح مُقنَّع دائمًا */
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => null)) as { status?: string } | null;
    const status = String(body?.status ?? "").trim();

    if (!VALID_STATUSES.includes(status)) {
      return Response.json(
        { error: "حالة غير صالحة — القيم المسموحة: active أو disabled." },
        { status: 400 }
      );
    }

    const existing = await getApiKey(id);
    if (!existing) {
      return Response.json({ error: "المفتاح غير موجود." }, { status: 404 });
    }

    await setApiKeyStatus(id, status);
    const row = await getApiKey(id);
    return Response.json({ key: row ? toKeyItem(row) : null });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر تحديث المفتاح" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await getApiKey(id);
    if (!existing) {
      return Response.json({ error: "المفتاح غير موجود." }, { status: 404 });
    }
    await deleteApiKey(id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر حذف المفتاح" },
      { status: 500 }
    );
  }
}
