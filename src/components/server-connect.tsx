"use client";

/* بطاقة ربط السيرفر: رابط MCP + قوالب إعداد جاهزة للنسخ + رقائق الأدوات */
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Card, CopyButton } from "./ui";
import { IconAlert, IconArchive, IconCpu, IconImage, IconInfo, IconLayers, IconSearch, IconVideo } from "./icons";

type TabId = "chatgpt" | "claude" | "cursor";

const TABS: { id: TabId; title: string }[] = [
  { id: "chatgpt", title: "ChatGPT / GPT Agents" },
  { id: "claude", title: "Claude Desktop" },
  { id: "cursor", title: "Cursor / Windsurf / Cline" },
];

const TOOLS: { name: string; desc: string; icon: ReactNode }[] = [
  { name: "generate_image", desc: "توليد صورة من وصف نصي", icon: <IconImage className="h-4 w-4" /> },
  { name: "generate_video", desc: "توليد فيديو مع صوت متزامن", icon: <IconVideo className="h-4 w-4" /> },
  { name: "merge_videos", desc: "دمج عدة مقاطع في فيديو واحد بالترتيب", icon: <IconLayers className="h-4 w-4" /> },
  { name: "get_task", desc: "متابعة حالة أي مهمة بمعرّفها", icon: <IconSearch className="h-4 w-4" /> },
  { name: "list_media", desc: "استرجاع الوسائط المخزنة سابقًا", icon: <IconArchive className="h-4 w-4" /> },
];

const TOKEN_PLACEHOLDER = "<MCP_ACCESS_TOKEN>";

/* قراءة عنوان السيرفر عبر useSyncExternalStore: آمن مع الـ hydration وبلا setState داخل effect */
let cachedMcpUrl: string | null = null;
function getMcpUrlSnapshot(): string {
  if (cachedMcpUrl === null) cachedMcpUrl = `${window.location.origin}/mcp`;
  return cachedMcpUrl;
}
function getMcpUrlServerSnapshot(): string {
  return "";
}
function subscribeNoop(): () => void {
  return () => {};
}

interface ServerConnectProps {
  authRequired: boolean;
}

export function ServerConnect({ authRequired }: ServerConnectProps) {
  /* يُحسب عبر useSyncExternalStore لتجنّب hydration mismatch (قيمة السيرفر فارغة ثم تُستبدل بعد الـ hydration) */
  const mcpUrl = useSyncExternalStore(subscribeNoop, getMcpUrlSnapshot, getMcpUrlServerSnapshot);
  const [activeTab, setActiveTab] = useState<TabId>("chatgpt");

  const displayUrl = mcpUrl || "<MCP_URL>";

  const snippet = useMemo(() => {
    const server: Record<string, unknown> =
      activeTab === "claude" ? { type: "http", url: displayUrl } : { url: displayUrl };
    if (authRequired) server.headers = { Authorization: `Bearer ${TOKEN_PLACEHOLDER}` };
    return { mcpServers: { "media-generator": server } };
  }, [activeTab, authRequired, displayUrl]);

  const jsonText = useMemo(() => JSON.stringify(snippet, null, 2), [snippet]);

  const hint: ReactNode =
    activeTab === "chatgpt" ? (
      <>
        في ChatGPT:{" "}
        <span dir="ltr" className="font-semibold text-zinc-300">
          Settings → Connectors → Create → Custom MCP server
        </span>{" "}
        وضع الرابط في «Server URL».
      </>
    ) : activeTab === "claude" ? (
      <>
        ضعه في ملف{" "}
        <code dir="ltr" className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
          claude_desktop_config.json
        </code>
        .
      </>
    ) : (
      <>
        ضعه في{" "}
        <code dir="ltr" className="rounded-md bg-zinc-900 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
          mcp.json
        </code>
        .
      </>
    );

  return (
    <Card
      icon={<IconCpu className="h-5 w-5" />}
      title="ربط السيرفر"
      description="أضف خادم MCP إلى تطبيق الدردشة المفضل لديك"
    >
      <div>
        <label htmlFor="mcp-url" className="mb-1.5 block text-xs font-bold text-zinc-400">
          عنوان خادم MCP
        </label>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <input
            id="mcp-url"
            type="text"
            readOnly
            dir="ltr"
            value={mcpUrl}
            placeholder="/mcp"
            onClick={(e) => e.currentTarget.select()}
            className="h-11 w-full flex-1 rounded-xl border border-zinc-700/90 bg-zinc-950/70 px-3.5 font-mono text-sm text-zinc-100 shadow-sm transition-colors placeholder:text-zinc-600 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25"
          />
          <CopyButton text={mcpUrl} label="نسخ الرابط" disabled={!mcpUrl} size="lg" className="sm:w-40" />
        </div>
        {authRequired && (
          <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-5 text-amber-400">
            <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              السيرفر محمي بـ Bearer token — استبدل{" "}
              <code dir="ltr" className="font-mono">
                {TOKEN_PLACEHOLDER}
              </code>{" "}
              برمز الوصول الخاص بك في الإعدادات أدناه.
            </span>
          </p>
        )}
      </div>

      <div
        role="tablist"
        aria-label="اختر التطبيق المستهدف"
        className="mt-6 flex flex-wrap gap-1.5 rounded-xl border border-zinc-800 bg-zinc-950/70 p-1.5"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`h-10 min-w-[8.5rem] flex-1 rounded-lg px-3 text-[13px] font-bold transition-colors ${
                active
                  ? "border border-zinc-700 bg-zinc-800 text-white shadow-sm"
                  : "border border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              }`}
            >
              {tab.title}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="mt-3">
        <div className="mb-2 flex items-center justify-between">
          <span dir="ltr" className="font-mono text-[11px] font-bold tracking-wider text-zinc-500">
            JSON
          </span>
          <CopyButton text={jsonText} label="نسخ" size="sm" />
        </div>
        <pre
          dir="ltr"
          className="slim-scroll max-h-80 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left font-mono text-[13px] leading-6 text-zinc-300"
        >
          {jsonText}
        </pre>
        <p className="mt-2.5 flex items-start gap-2 text-xs leading-5 text-zinc-400">
          <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="min-w-0">{hint}</span>
        </p>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-bold text-zinc-200">الأدوات المتاحة</h3>
        <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <li
              key={tool.name}
              className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/50 px-3 py-2.5 transition-colors hover:border-zinc-700"
            >
              <span aria-hidden="true" className="mt-0.5 text-emerald-400/90">
                {tool.icon}
              </span>
              <div className="min-w-0">
                <code dir="ltr" className="block font-mono text-[13px] font-bold text-zinc-100">
                  {tool.name}
                </code>
                <span className="mt-0.5 block text-xs leading-5 text-zinc-400">{tool.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-3 text-[13px] leading-6 text-amber-300">
        <IconAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p>
          الفيديو يحتاج دقائق: يعيد السيرفر{" "}
          <code dir="ltr" className="rounded bg-amber-500/15 px-1 font-mono text-[12px]">
            task_id
          </code>{" "}
          فورًا، ويتابَع تلقائيًا بـ{" "}
          <code dir="ltr" className="rounded bg-amber-500/15 px-1 font-mono text-[12px]">
            get_task
          </code>{" "}
          كل 10 ثوانٍ — وعند اكتمال المهمة يُعرض الرابط في الدردشة ويتوقف. أثناء الانتظار يُبَث تقدم حي (Progress
          notifications) حتى لا تنقطع العملية.
        </p>
      </div>
    </Card>
  );
}

export default ServerConnect;
