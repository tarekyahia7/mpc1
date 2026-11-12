/**
 * GET  /api/health — فحص شامل (قسم 9 من المواصفة):
 * قاعدة البيانات، نقطتا /mcp، سجل الموديلات، جهوزية خدمة الدمج، وحالة الحماية.
 */
import { dbHealthy } from "@/lib/turso";
import { getModels } from "@/lib/models";
import { mergerBase, mergerHealthy, MERGER_CONFIGURED } from "@/lib/merger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** كاش قصير لفحص خدمة الدمج الخارجية (يستعلمه الـ dashboard كل 30 ثانية) */
let mergerCache: { at: number; healthy: boolean } | null = null;
const MERGER_CACHE_MS = 15_000;

async function mergerHealthyCached(): Promise<boolean> {
  if (mergerCache && Date.now() - mergerCache.at < MERGER_CACHE_MS) return mergerCache.healthy;
  const healthy = await mergerHealthy();
  mergerCache = { at: Date.now(), healthy };
  return healthy;
}

export async function GET() {
  try {
    const dbOk = await dbHealthy();
    const models = getModels().map((m) => ({
      canonical: m.canonical,
      type: m.type,
      providers: m.providers,
    }));
    const mergerHealthyFlag = MERGER_CONFIGURED ? await mergerHealthyCached() : false;
    return Response.json({
      ok: dbOk,
      database: dbOk ? "turso-connected" : "disconnected",
      mcpEndpoint: "/mcp",
      models,
      merger: { base: mergerBase(), healthy: mergerHealthyFlag },
      authRequired: Boolean((process.env.MCP_ACCESS_TOKEN ?? "").trim()),
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        database: "disconnected",
        mcpEndpoint: "/mcp",
        error: e instanceof Error ? e.message : "خطأ غير معروف في فحص الجهوزية",
      },
      { status: 500 }
    );
  }
}
