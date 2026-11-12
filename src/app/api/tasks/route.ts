/**
 * GET /api/tasks?limit=25&type=&status= — لوحة المهام:
 * شرائح الإحصائيات + أحدث المهام بروابط النتائج وعدد المحاولات (camelCase للواجهة).
 */
import { listRecentTasks, taskStats } from "@/lib/turso";
import { safeParse } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit") ?? 25) || 25));
    const type = url.searchParams.get("type") ?? undefined;
    const status = url.searchParams.get("status") ?? undefined;

    const [rows, stats] = await Promise.all([
      listRecentTasks(limit, { type: type || undefined, status: status || undefined }),
      taskStats(),
    ]);

    const tasks = rows.map((t) => ({
      id: t.id,
      type: t.type,
      model: t.model || null,
      status: t.status,
      progress: t.progress,
      prompt: t.prompt || null,
      resultUrls: safeParse<string[]>(t.result_urls_json, []),
      error: t.error_message,
      attemptsCount: safeParse<{ ok: boolean }[]>(t.attempts_json, []).length,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    return Response.json({ stats, tasks });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "تعذر جلب المهام" },
      { status: 500 }
    );
  }
}
