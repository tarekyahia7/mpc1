/**
 * سجل الموديلات (قسم 5.1 من المواصفة).
 * - canonical: الاسم الذي يراه عميل MCP.
 * - aliases: صيغ بديلة نقبلها ونوحّدها (شرطات/نقاط).
 * - providerModel: اسم الموديل كما يُرسل فعليًا لكل مزود، قابل للتجاوز بمتغيرات البيئة:
 *   KIE_IMAGE_MODEL / KIE_VIDEO_MODEL / COMETAPI_IMAGE_MODEL / COMETAPI_VIDEO_MODEL
 */
export type ProviderId = "kie" | "cometapi";
export type TaskProvider = ProviderId | "merger";
export type MediaType = "image" | "video" | "merge";

export interface ModelDef {
  canonical: string;
  aliases: string[];
  type: MediaType;
  providers: ProviderId[];
  providerModel: Record<ProviderId, string>;
}

export const DEFAULT_IMAGE_MODEL = "gpt-image-2-6/flare-text-to-image";
export const DEFAULT_VIDEO_MODEL = "grok-imagine-video-1-5-preview";

export function getModels(): ModelDef[] {
  return [
    {
      canonical: DEFAULT_IMAGE_MODEL,
      aliases: ["gpt-image-2.6/flare-text-to-image"],
      type: "image",
      providers: ["kie", "cometapi"],
      providerModel: {
        kie: process.env.KIE_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
        // صيغة CometAPI تُرسل بشرطات بدل النقاط
        cometapi: process.env.COMETAPI_IMAGE_MODEL || "gpt-image-2.6-flare-text-to-image",
      },
    },
    {
      canonical: DEFAULT_VIDEO_MODEL,
      aliases: ["grok-imagine-video-1.5-preview"],
      type: "video",
      providers: ["kie", "cometapi"],
      providerModel: {
        kie: process.env.KIE_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
        cometapi: process.env.COMETAPI_VIDEO_MODEL || DEFAULT_VIDEO_MODEL,
      },
    },
  ];
}

/** توحيد الاسم: نقاط → شرطات + حروف صغيرة (يقبل الصيغ البديلة) */
function normalizeModelName(name: string): string {
  return name.trim().replace(/\./g, "-").toLowerCase();
}

/**
 * إيجاد الموديل بالاسم المُمرر (canonical أو alias) مع مطابقة النوع.
 * يعيد null إن كان غير معروف → خطأ معطيات فوري عند المنسق.
 */
export function findModel(name: string | undefined | null, type?: MediaType): ModelDef | null {
  if (!name) return null;
  const norm = normalizeModelName(name);
  const model = getModels().find(
    (m) =>
      normalizeModelName(m.canonical) === norm ||
      m.aliases.some((a) => normalizeModelName(a) === norm)
  );
  if (!model) return null;
  if (type && model.type !== type) return null;
  return model;
}
