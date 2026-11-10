"use client";

/* لوحة المهام: إحصائيات + قائمة تُحدّث تلقائيًا كل 5 ثوانٍ */
import { useEffect, useState, type ReactNode } from "react";
import { Badge, Card, EmptyState, InlineAlert, LoadingState, ProgressBar, StatTile, type Tone } from "./ui";
import { IconExternal, IconImage, IconLayers, IconListChecks, IconVideo } from "./icons";
import { apiFetch, clampPercent, excerpt, formatArabicDateTime, formatArabicTime, NETWORK_ERROR_MSG } from "./utils";
import type { TaskItem, TasksResponse } from "./types";

const TYPE_META: Record<string, { label: string; icon: ReactNode }> = {
  image: { label: "صورة", icon: <IconImage className="h-3.5 w-3.5" /> },
  video: { label: "فيديو", icon: <IconVideo className="h-3.5 w-3.5" /> },
  merge: { label: "دمج", icon: <IconLayers className="h-3.5 w-3.5" /> },
};

function typeMeta(type: string): { label: string; icon: ReactNode } {
  return TYPE_META[type] ?? { label: type, icon: null };
}

function statusMeta(status: string): { label: string; tone: Tone; pulse?: boolean } {
  if (status === "completed") return { label: "مكتملة", tone: "emerald" };
  if (status === "failed") return { label: "فاشلة", tone: "red" };
  if (status === "processing") return { label: "جارية", tone: "sky", pulse: true };
  if (status === "pending") return { label: "بانتظار", tone: "zinc" };
  return { label: status, tone: "zinc" };
}

function progressTone(status: string): Tone {
  if (status === "completed") return "emerald";
  if (status === "failed") return "red";
  if (status === "processing") return "sky";
  return "zinc";
}

function TaskRow({ task }: { task: TaskItem }) {
  const tMeta = typeMeta(task.type);
  const sMeta = statusMeta(task.status);
  const pct = clampPercent(task.progress);
  const urls = Array.isArray(task.resultUrls) ? task.resultUrls.filter((u) => typeof u === "string" && u) : [];
  const promptText = excerpt(task.prompt, 100) || (task.type === "merge" ? "دمج مقاطع" : "");

  return (
    <li className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 transition-colors hover:border-zinc-700">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="zinc">
          {tMeta.icon}
          {tMeta.label}
        </Badge>
        <Badge tone={sMeta.tone} dot pulse={sMeta.pulse}>
          {sMeta.label}
        </Badge>
        <span className="text-[11px] font-semibold text-zinc-500">المحاولات: {task.attemptsCount ?? 0}</span>
        <span className="ms-auto text-[11px] text-zinc-500">{formatArabicDateTime(task.createdAt)}</span>
      </div>

      {task.model ? (
        <code
          dir="ltr"
          title={task.model}
          className="mt-2.5 inline-block max-w-full truncate rounded-md bg-zinc-900 px-2 py-0.5 font-mono text-[11px] text-zinc-400"
        >
          {task.model}
        </code>
      ) : null}

      {promptText ? <p className="mt-2 text-[13px] leading-6 text-zinc-300">{promptText}</p> : null}

      <div className="mt-3 flex items-center gap-3">
        <ProgressBar value={pct} tone={progressTone(task.status)} label="تقدم المهمة" />
        <span dir="ltr" className="shrink-0 font-mono text-[11px] text-zinc-400">
          {pct}%
        </span>
      </div>

      {task.status === "failed" && task.error ? (
        <p dir="auto" className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300">
          {task.error}
        </p>
      ) : null}

      {task.status === "completed" && urls.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {urls.map((url, index) => (
            <a
              key={`${task.id}-${index}`}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <IconExternal className="h-3.5 w-3.5" />
              {urls.length > 1 ? `فتح الرابط ${index + 1}` : "فتح الرابط"}
            </a>
          ))}
        </div>
      ) : null}
    </li>
  );
}

export function TasksPanel() {
  const [data, setData] = useState<TasksResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fetchError, setFetchError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      const res = await apiFetch<TasksResponse>("/api/tasks?limit=25");
      if (!alive) return;
      if (res.ok && res.data) {
        setData({
          stats: {
            total: res.data.stats?.total ?? 0,
            completed: res.data.stats?.completed ?? 0,
            failed: res.data.stats?.failed ?? 0,
            processing: res.data.stats?.processing ?? 0,
          },
          tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
        });
        setFetchError("");
        setLastUpdated(Date.now());
      } else {
        setFetchError(res.error ?? NETWORK_ERROR_MSG);
      }
      setLoaded(true);
    };

    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const stats = data?.stats ?? null;
  const tasks = data?.tasks ?? [];

  return (
    <Card
      icon={<IconListChecks className="h-5 w-5" />}
      title="لوحة المهام"
      description="أحدث عمليات التوليد والدمج — تحديث تلقائي كل 5 ثوانٍ"
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700/70 bg-zinc-900/80 px-2.5 py-1 text-[11px] font-bold text-zinc-400">
          <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          {loaded && lastUpdated !== null ? `آخر تحديث ${formatArabicTime(lastUpdated)}` : "بث حي"}
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="الإجمالي" value={stats ? (stats.total ?? 0) : null} tone="zinc" />
        <StatTile label="مكتملة" value={stats ? (stats.completed ?? 0) : null} tone="emerald" />
        <StatTile label="فاشلة" value={stats ? (stats.failed ?? 0) : null} tone="red" />
        <StatTile label="جارية" value={stats ? (stats.processing ?? 0) : null} tone="sky" />
      </div>

      {fetchError && (
        <div className="mt-4">
          <InlineAlert tone="error" text={`${fetchError} — سيُعاد المحاولة تلقائيًا كل 5 ثوانٍ.`} />
        </div>
      )}

      <div className="mt-5">
        {!loaded && <LoadingState />}

        {loaded && tasks.length === 0 && !fetchError && (
          <EmptyState
            icon={<IconListChecks className="h-6 w-6" />}
            title="لا توجد مهام بعد"
            hint="ستظهر هنا عمليات توليد الصور والفيديو ودمج المقاطع فور إرسالها من الدردشة."
          />
        )}

        {loaded && tasks.length > 0 && (
          <ul className="slim-scroll max-h-96 space-y-3 overflow-y-auto pe-1">
            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default TasksPanel;
