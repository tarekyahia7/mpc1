/**
 * مسار خادم MCP — Streamable HTTP (قسم 8 من المواصفة).
 *
 * - يستخدم SDK الرسمي حصريًا: McpServer + WebStandardStreamableHTTPServerTransport
 *   (نسخة Web Standards تعمل مباشرة مع Web Request/Response في App Router بلا أي تحويل).
 * - وضع Stateful مع خريطة جلسات في الذاكرة: تعمل محليًا وعلى Vercel Fluid Compute
 *   (النسخ الدافئة تعيد استخدام نفس العملية؛ مع onsessioninitialized/onsessionclosed للتنظيف).
 * - الأدوات الخمس: generate_image / generate_video / merge_videos / get_task / list_media.
 * - الوصف الإنجليزي للعميل، ونتائج الاستدعاء تُصاغ بالعربية عبر formatToolOutcome.
 * - progress notifications كل ~3 ثوانٍ عند وجود _meta.progressToken في الطلب.
 *
 * ملاحظة قرار: أدوات merge_videos تحتفظ بحدّي minItems/maxItems في المخطط (حرفيًا من
 * المواصفة) مع رسائل zod عربية مخصصة — رسالة التحقق تصل العميل كما هي داخل خطأ
 * -32602، فتتحقق معيارا القبول 3 و9 معًا. كما يفحص runMerge العدد المجمّع دفاعيًا.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import {
  runGeneration, runMerge, refreshTask, formatToolOutcome,
  type ProgressSender,
} from "@/lib/coordinator";
import { findModel, getModels, DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@/lib/models";
import { listRecentTasks } from "@/lib/turso";
import { arType, arStatus, safeParse } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// نافذة الانتظار حتى 240 ثانية + هامش — Fluid Compute على Vercel يسمح بـ 300
export const maxDuration = 300;

const SERVER_INFO = { name: "media-generator-mcp", version: "1.2.0" };

/** النص الجاهز المُرسل مع initialize (حرفي من قسم 8 من المواصفة) */
const SERVER_INSTRUCTIONS = `AI media generation server (kie.ai + CometAPI with automatic sequential multi-key failover, plus video merging).
Workflow: call generate_image or generate_video. If the response contains finished URLs, show them to the user.
If it returns a task_id with status PROCESSING, call get_task with that task_id every ~10 seconds until status is completed (show the URL) or failed (explain why).
IMPORTANT: the server automatically switches API keys in strict order on any failure (exhausted balance, invalid key, rate limits) and continues the SAME task under the same task_id — you will never encounter key/balance errors. Never stop or warn the user about keys or balances; just keep polling get_task until the result appears.
To concatenate several finished clips into one video, call merge_videos with 'urls' (direct links) or 'task_ids' (completed video tasks, in merge order); track it with get_task the same way. Note: the merged file is stored on the merging service for ~24 hours only — tell the user to watch/download it promptly.
Use list_media to recall previously generated media from the database.`;

/* ============================ الجلسات ============================ */

interface SessionPair {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
}

const SESSIONS = new Map<string, SessionPair>();

function buildServer(): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: SERVER_INSTRUCTIONS });
  registerTools(server);
  return server;
}

/** إنشاء زوج server/transport جديد وتسجيله عند initialize */
function createSessionPair(): SessionPair {
  const server = buildServer();
  const pair: SessionPair = { server, transport: undefined as unknown as WebStandardStreamableHTTPServerTransport };
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId) => {
      SESSIONS.set(sessionId, pair);
    },
    onsessionclosed: (sessionId) => {
      SESSIONS.delete(sessionId);
    },
    keepAliveMs: 15_000,
  });
  transport.onclose = () => {
    if (transport.sessionId) SESSIONS.delete(transport.sessionId);
  };
  pair.transport = transport;
  void server.connect(transport);
  return pair;
}

/* ============================ بث التقدم ============================ */

interface ToolExtraLike {
  _meta?: { progressToken?: unknown };
  sendNotification: (notification: ServerNotification) => Promise<void>;
}

/** بث progress notifications فقط عند تزويد العميل progressToken — كل ~3 ثوانٍ من المنسق */
function progressSenderFor(extra: ToolExtraLike): ProgressSender {
  const token = extra?._meta?.progressToken;
  if (typeof token !== "string" && typeof token !== "number") {
    // العميل لم يطلب بث التقدم — أداة صامتة
    return async () => {};
  }
  return async (progress, message) => {
    try {
      await extra.sendNotification({
        method: "notifications/progress",
        params: { progressToken: token, progress, total: 100, message },
      });
    } catch {
      // فشل البث لا يُعطّل التدفق الرئيسي أبدًا
    }
  };
}

/* ============================ الأدوات الخمس ============================ */

const toolResult = (text: string, isError = false) => ({
  content: [{ type: "text" as const, text }],
  isError,
});

function registerTools(server: McpServer): void {
  /* ---- 1) generate_image ---- */
  server.registerTool(
    "generate_image",
    {
      title: "Generate Image",
      description:
        "Generate an image with gpt-image-2-6/flare-text-to-image (automatic sequential failover across all active API keys). " +
        "Returns the finished image URL directly if it completes within the wait window; otherwise returns a task_id — " +
        "then call get_task with it every ~10 seconds until status is completed (show the URL) or failed, and stop.",
      inputSchema: {
        prompt: z.string().min(1).describe("What to draw. Detailed prompts give better results."),
        model: z
          .enum([DEFAULT_IMAGE_MODEL, "gpt-image-2.6/flare-text-to-image"])
          .default(DEFAULT_IMAGE_MODEL)
          .describe("Image model (dot and dash spellings are unified automatically)."),
        aspect_ratio: z
          .enum(["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "21:9", "9:21", "3:1", "1:3"])
          .default("auto")
          .describe("Image aspect ratio."),
        resolution: z.enum(["1K", "2K", "4K"]).default("1K").describe("Image resolution."),
        background: z.enum(["auto", "transparent", "opaque"]).default("auto").describe("Only applied at 1K."),
        output_format: z.enum(["png", "jpeg", "webp", "gif"]).default("png").describe("Output image format."),
        wait_seconds: z
          .number().int().min(0).max(240)
          .default(90)
          .describe("How long to wait for the finished URL before returning a task_id (0-240 seconds)."),
      },
    },
    async (args, extra) => {
      const modelDef = findModel(args.model, "image");
      if (!modelDef) {
        return toolResult(
          `❌ موديل غير معروف: ${args.model ?? "(فارغ)"}. المتاح للصور: ${DEFAULT_IMAGE_MODEL} (أو الصيغة البديلة بالنقاط).`,
          true
        );
      }
      // لا يُرسل background إلا عند تحديده صراحة (auto = سلوك المزود الافتراضي)
      const input: Record<string, unknown> = {
        prompt: args.prompt,
        aspect_ratio: args.aspect_ratio,
        resolution: args.resolution,
        output_format: args.output_format,
        ...(args.background && args.background !== "auto" ? { background: args.background } : {}),
      };
      const outcome = await runGeneration({
        type: "image",
        modelDef,
        input,
        waitSeconds: args.wait_seconds,
        sendProgress: progressSenderFor(extra),
      });
      const { text, isError } = formatToolOutcome(outcome);
      return toolResult(text, isError);
    }
  );

  /* ---- 2) generate_video ---- */
  server.registerTool(
    "generate_video",
    {
      title: "Generate Video",
      description:
        "Generate a video with grok-imagine-video-1-5-preview (native synchronized audio — dialogue/effects/music; optional image-to-video). " +
        "Video takes minutes: the tool waits briefly with live progress streaming, then returns a task_id — " +
        "call get_task with it every ~10 seconds until completed (show the URL) or failed.",
      inputSchema: {
        prompt: z.string().max(4096).describe("Scene description. Dialogue in the prompt is spoken in the video."),
        image_url: z.string().optional().describe("Optional public image URL as the first frame (image-to-video)."),
        model: z
          .enum([DEFAULT_VIDEO_MODEL, "grok-imagine-video-1.5-preview"])
          .default(DEFAULT_VIDEO_MODEL)
          .describe("Video model (dot and dash spellings are unified automatically)."),
        aspect_ratio: z.enum(["auto", "1:1", "16:9", "9:16", "3:2", "2:3"]).default("auto").describe("Video aspect ratio."),
        resolution: z.enum(["480p", "720p", "1080p"]).default("480p").describe("Video resolution."),
        enable_audio: z.boolean().default(true).describe("Generate native synchronized audio."),
        duration: z.number().int().min(1).max(15).default(8).describe("Duration in seconds."),
        wait_seconds: z
          .number().int().min(0).max(240)
          .default(25)
          .describe("How long to wait before returning a task_id (0-240 seconds)."),
      },
    },
    async (args, extra) => {
      const modelDef = findModel(args.model, "video");
      if (!modelDef) {
        return toolResult(
          `❌ موديل غير معروف: ${args.model ?? "(فارغ)"}. المتاح للفيديو: ${DEFAULT_VIDEO_MODEL} (أو الصيغة البديلة بالنقاط).`,
          true
        );
      }
      const input: Record<string, unknown> = {
        prompt: args.prompt,
        aspect_ratio: args.aspect_ratio,
        resolution: args.resolution,
        duration: args.duration,
        enable_audio: args.enable_audio,
        ...(args.image_url ? { image_url: args.image_url } : {}),
      };
      const outcome = await runGeneration({
        type: "video",
        modelDef,
        input,
        waitSeconds: args.wait_seconds,
        sendProgress: progressSenderFor(extra),
      });
      const { text, isError } = formatToolOutcome(outcome);
      return toolResult(text, isError);
    }
  );

  /* ---- 3) merge_videos ---- */
  const mergeNeedsTwo =
    "❌ الدمج يحتاج مقطعَين على الأقل. مرّر urls (روابط مباشرة) أو task_ids لمهام مكتملة.";
  const mergeMaxTen = "❌ أقصى عدد مقاطع للدمج هو 10 (خدمة الدمج تقبل 10 مقاطع كحد أقصى).";

  server.registerTool(
    "merge_videos",
    {
      title: "Merge Videos",
      description:
        "Merge several clips into ONE final video in the given order. Pass 'urls' (public direct video links — e.g. the URLs returned by generate_video) " +
        "or 'task_ids' (ids of COMPLETED video generation tasks; their result URLs are resolved from the database in this order — ideal after generating several clips). " +
        "Merging is usually fast: the tool waits briefly with live progress streaming, then returns a merge task_id — track it with get_task the same way. " +
        "Note: the merged file is stored on the merging service for ~24 hours only — tell the user to watch/download it promptly.",
      inputSchema: {
        urls: z
          .array(z.string())
          .min(2, mergeNeedsTwo)
          .max(10, mergeMaxTen)
          .optional()
          .describe("Public direct video URLs (http/https) in merge order — the first clip starts the final video."),
        task_ids: z
          .array(z.string())
          .min(2, mergeNeedsTwo)
          .max(10, mergeMaxTen)
          .optional()
          .describe("Alternative to urls: task_ids of COMPLETED video generation tasks — their result URLs are merged in this order."),
        wait_seconds: z
          .number().int().min(0).max(240)
          .default(60)
          .describe("How long to wait before returning a task_id (0-240 seconds)."),
      },
    },
    async (args, extra) => {
      const outcome = await runMerge({
        urls: args.urls,
        taskIds: args.task_ids,
        waitSeconds: args.wait_seconds,
        sendProgress: progressSenderFor(extra),
      });
      const { text, isError } = formatToolOutcome(outcome);
      return toolResult(text, isError);
    }
  );

  /* ---- 4) get_task ---- */
  server.registerTool(
    "get_task",
    {
      title: "Get Task",
      description:
        "Track any task by its id — image/video generation AND merging (reads the database and refreshes live from the provider/merging service while still processing). " +
        "Poll it every ~10 seconds; when status is completed you will find the result URLs — show them to the user and stop polling.",
      inputSchema: {
        task_id: z.string().min(1).describe("The task_id returned by generate_image / generate_video / merge_videos."),
      },
    },
    async (args) => {
      const r = await refreshTask(args.task_id);
      return toolResult(r.text, r.isError);
    }
  );

  /* ---- 5) list_media ---- */
  server.registerTool(
    "list_media",
    {
      title: "List Media",
      description:
        "List the most recent images/videos/merges stored with their result URLs from the database (no re-generation) — use it to recall previously generated media.",
      inputSchema: {
        type: z.enum(["image", "video", "merge"]).optional().describe("Filter by media type."),
        status: z.enum(["completed", "failed", "processing"]).optional().describe("Filter by task status."),
        limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of items to return (1-50)."),
      },
    },
    async (args) => {
      const rows = await listRecentTasks(args.limit ?? 10, { type: args.type, status: args.status });
      if (!rows.length) {
        return toolResult("📁 لا توجد وسائط مخزنة بعد" + (args.type || args.status ? " مطابقة للتصفية المطلوبة." : "."));
      }
      const lines = rows.map((t, i) => {
        const urls = safeParse<string[]>(t.result_urls_json, []);
        const icon = t.status === "completed" ? "✅" : t.status === "failed" ? "❌" : "⏳";
        let line = `${i + 1}) ${icon} [${arType(t.type)}] ${t.model} — ${arStatus(t.status)} — ${t.created_at} UTC\n   task_id: ${t.id}`;
        if (urls.length) line += `\n   الرابط: ${urls.join(" | ")}`;
        if (t.status === "failed" && t.error_message) line += `\n   السبب: ${t.error_message}`;
        return line;
      });
      return toolResult(`📁 أحدث الوسائط المخزنة (${rows.length}):\n\n${lines.join("\n\n")}`);
    }
  );
}

/* ============================ معالجة HTTP ============================ */

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, MCP-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, MCP-Session-Id",
};

function corsify(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

function jsonError(status: number, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

async function handleMcpRequest(request: Request): Promise<Response> {
  // حماية اختيارية بـ Bearer token (MCP_ACCESS_TOKEN) — تظهر في الواجهة والـ health
  const requiredToken = (process.env.MCP_ACCESS_TOKEN ?? "").trim();
  if (requiredToken) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${requiredToken}`) {
      return corsify(jsonError(401, -32001, "Unauthorized: Bearer token required"));
    }
  }

  const sessionId = request.headers.get("mcp-session-id") ?? request.headers.get("MCP-SESSION-ID");

  // DELETE لإنهاء الجلسة و GET لتيار SSE المستقل — كلاهما يتطلب معرف جلسة صالحًا
  if (request.method === "DELETE" || request.method === "GET") {
    if (!sessionId) {
      // Streamable HTTP: لا نقدم SSE مستقلاً عبر GET بلا جلسة → 405؛ DELETE بلا جلسة → 400
      if (request.method === "GET") {
        return corsify(new Response("Method Not Allowed: no standalone SSE stream", { status: 405 }));
      }
      return corsify(jsonError(400, -32600, "Bad Request: Mcp-Session-Id header is required"));
    }
    const pair = SESSIONS.get(sessionId);
    if (!pair) {
      return corsify(jsonError(404, -32001, "Session not found"));
    }
    return corsify(await pair.transport.handleRequest(request));
  }

  // POST: بجلسة معروفة → النقل نفسه؛ بلا جلسة → زوج جديد (initialize يسجّله عبر onsessioninitialized)
  if (sessionId) {
    const pair = SESSIONS.get(sessionId);
    if (!pair) {
      return corsify(jsonError(404, -32001, "Session not found"));
    }
    return corsify(await pair.transport.handleRequest(request));
  }

  const pair = createSessionPair();
  try {
    return corsify(await pair.transport.handleRequest(request));
  } catch (e) {
    // زوج لم يكتمل تهيئته (طلب غير initialize مثلًا) — تنظيف
    if (pair.transport.sessionId) SESSIONS.delete(pair.transport.sessionId);
    throw e;
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
