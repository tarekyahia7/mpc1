# MCP Media Generator

خادم **MCP (Model Context Protocol)** لتوليد الصور والفيديو بالذكاء الاصطناعي ودمج المقاطع — مع لوحة إدارة عربية RTL.

## القدرات

| الأداة | الوظيفة | الموديل المدمج |
|---|---|---|
| `generate_image` | توليد صور من وصف نصي | `gpt-image-2-6/flare-text-to-image` |
| `generate_video` | توليد فيديو بصوت متزامن أصلي | `grok-imagine-video-1-5-preview` |
| `merge_videos` | دمج عدة مقاطع في فيديو واحد بالترتيب | خدمة الدمج (MP4 H.264+AAC) |
| `get_task` | تتبع أي مهمة بمعرّفها | — |
| `list_media` | استرجاع الوسائط المخزنة بروابطها | — |

## القواعد الجوهرية

- **روابط فقط**: لا يُنزَّل أي ملف وسائط على السيرفر — تُخزَّن روابط النتائج فقط في قاعدة البيانات.
- **مفاتيح تسلسلية صارمة**: أول مفتاح أُضيف يُجرَّب أولًا (`created_at ASC`)، مع **تبديل تلقائي فوري صامت** عند أي خطأ أو نفاد رصيد — نفس المهمة تُستأنف بنفس `task_id` والعميل لا يرى أخطاء المفاتيح أبدًا.
- **مهمة بلا مفتاح صالح تبقى `processing`** وتُعاد محاولتها تلقائيًا مع كل `get_task` (بتهدئة ~45 ثانية) — فإن شُحن رصيد أي مفتاح اكتملت من تلقاء نفسها.
- الملفات المدموجة تُحذف من خدمة الدمج بعد **~24 ساعة**.

## التشغيل المحلي

```bash
bun install          # أو npm install
cp .env.example .env.local   # ثم املأ القيم الحقيقية
bun run dev          # http://localhost:3000
```

## متغيرات البيئة

```bash
TURSO_DATABASE_URL=libsql://<db-name>-<org>.turso.io
TURSO_AUTH_TOKEN=<token بصلاحيات كتابة>
MERGER_API_BASE=https://<عنوان خدمة الدمج>

# اختياري
MCP_ACCESS_TOKEN=            # إن ضُبط يُطلب Bearer token على /mcp
KIE_IMAGE_MODEL=             # تجاوز أسماء الموديلات إن لزم
KIE_VIDEO_MODEL=
COMETAPI_IMAGE_MODEL=
COMETAPI_VIDEO_MODEL=
```

> **ملاحظة:** مفاتيح المزودين (kie.ai / CometAPI) لا تُوضع في متغيرات البيئة — تُضاف من لوحة الإدارة وتُخزَّن مشفَّرة الجزء الظاهر فقط (maskKey) في قاعدة Turso.

## إنشاء قاعدة Turso مجانية

```bash
turso db create mcp
turso db show mcp --url            # → TURSO_DATABASE_URL
turso db tokens create mcp         # → TURSO_AUTH_TOKEN
```

## النشر على Vercel

1. اربط المستودع على [vercel.com/new](https://vercel.com/new).
2. أضف متغيرات البيئة الثلاثة (`TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `MERGER_API_BASE`) في Settings → Environment Variables.
3. Deploy — كل شيء يعمل بلا ملفات محلية لأن libSQL يتصل عبر HTTP ومسار `/mcp` يدعم الـ streaming.

## الربط من عملاء MCP

نقطة الاتصال: `<origin>/mcp`

**ChatGPT / GPT Agents:**
```json
{ "mcpServers": { "media-generator": { "url": "https://<domain>/mcp" } } }
```
(في ChatGPT: Settings → Connectors → Create → Custom MCP server ثم ضع الرابط في «Server URL»)

**Claude Desktop (`claude_desktop_config.json`):**
```json
{ "mcpServers": { "media-generator": { "type": "http", "url": "https://<domain>/mcp" } } }
```

**Cursor / Windsurf / Cline (`mcp.json`):**
```json
{ "mcpServers": { "media-generator": { "url": "https://<domain>/mcp" } } }
```

كامل قوالب JSON الجاهزة للنسخ موجودة في لوحة الإدارة (بطاقة «ربط السيرفر»).

## البنية

```
src/
├── app/
│   ├── mcp/route.ts            # خادم MCP (5 أدوات، Streamable HTTP، جلسات، progress)
│   ├── api/health/route.ts     # فحص شامل (Turso + الدمج + الموديلات)
│   ├── api/keys/route.ts       # GET/POST مفاتيح (مقنعة دائمًا)
│   ├── api/keys/[id]/route.ts  # PATCH/DELETE مفتاح
│   ├── api/tasks/route.ts      # إحصائيات + أحدث المهام للوحة
│   ├── layout.tsx              # RTL + خط Cairo
│   └── page.tsx                # لوحة الإدارة (مفاتيح + مهام + ربط)
├── components/                 # مكونات اللوحة (RTL، تحديث حي كل 5 ثوانٍ)
└── lib/
    ├── turso.ts                # عميل libSQL عبر HTTP + المخطط + العمليات
    ├── models.ts               # سجل الموديلات (canonical/aliases/providerModel)
    ├── errors.ts               # ProviderError + تصنيف الأخطاء الخمسة
    ├── format.ts               # maskKey + تحقق الروابط العامة + أدوات تنسيق
    ├── coordinator.ts          # منسق التوليد + التبديل التسلسلي + الدمج
    ├── merger.ts               # عميل Video Merger API v2
    └── providers/              # محولات kie.ai وCometAPI
```

## الاختبار السريع عبر curl

```bash
# تهيئة جلسة
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -D - \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0"}}}'

# قائمة الأدوات (بعد إرسال notifications/initialized ومفتاح mcp-session-id)
curl -s -X POST http://localhost:3000/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H "mcp-session-id: <من استجابة التهيئة>" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```
