"use client";

/* بطاقة مدير المفاتيح: إضافة / تعطيل / تنشيط / حذف مفاتيح المزودين */
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Badge, Card, EmptyState, InlineAlert, LoadingState, useFlash } from "./ui";
import { IconClock, IconInfo, IconKey, IconPlus, IconPower, IconRefresh, IconSpinner, IconTrash } from "./icons";
import { apiFetch, excerpt, formatArabicDateTime, NETWORK_ERROR_MSG } from "./utils";
import type { ApiKeyItem, KeyProvider } from "./types";

const PROVIDER_OPTIONS: { value: KeyProvider; label: string }[] = [
  { value: "kie", label: "kie.ai" },
  { value: "cometapi", label: "CometAPI" },
];

function providerLabel(provider: string): string {
  if (provider === "kie") return "kie.ai";
  if (provider === "cometapi") return "CometAPI";
  return provider;
}

const FIELD_CLS =
  "h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-950/70 px-3.5 text-sm text-zinc-100 shadow-sm transition-colors placeholder:text-zinc-500 focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/25";

const LABEL_CLS = "mb-1.5 block text-xs font-bold text-zinc-400";

type ListState = "loading" | "ready" | "error";

export function KeysManager() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [listState, setListState] = useState<ListState>("loading");
  const [listError, setListError] = useState("");
  const [provider, setProvider] = useState<KeyProvider>("kie");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { alert, show, clear } = useFlash();

  const loadKeys = useCallback(async () => {
    const res = await apiFetch<{ keys: ApiKeyItem[] }>("/api/keys");
    if (res.ok && res.data && Array.isArray(res.data.keys)) {
      setKeys(res.data.keys);
      setListState("ready");
      setListError("");
    } else {
      setListState("error");
      setListError(res.error ?? NETWORK_ERROR_MSG);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const initialLoad = async () => {
      const res = await apiFetch<{ keys: ApiKeyItem[] }>("/api/keys");
      if (!alive) return;
      if (res.ok && res.data && Array.isArray(res.data.keys)) {
        setKeys(res.data.keys);
        setListState("ready");
        setListError("");
      } else {
        setListState("error");
        setListError(res.error ?? NETWORK_ERROR_MSG);
      }
    };
    void initialLoad();
    return () => {
      alive = false;
    };
  }, []);

  const handleAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (adding) return;
    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      show("error", "أدخل مفتاح API أولًا قبل الإضافة.");
      return;
    }
    setAdding(true);
    clear();
    const body: Record<string, string> = { provider, api_key: trimmedKey };
    const trimmedLabel = label.trim();
    if (trimmedLabel) body.label = trimmedLabel;
    const res = await apiFetch<{ key: ApiKeyItem }>("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setAdding(false);
    if (res.ok) {
      setApiKey("");
      setLabel("");
      show("success", "تمت إضافة المفتاح بنجاح.");
      await loadKeys();
    } else {
      show("error", res.error ?? NETWORK_ERROR_MSG);
    }
  };

  const handleToggle = async (item: ApiKeyItem) => {
    if (busyId) return;
    const nextStatus = item.status === "active" ? "disabled" : "active";
    setBusyId(item.id);
    const res = await apiFetch<{ key: ApiKeyItem }>(`/api/keys/${encodeURIComponent(item.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setBusyId(null);
    if (res.ok) {
      show("success", nextStatus === "active" ? "تم تنشيط المفتاح." : "تم تعطيل المفتاح.");
      await loadKeys();
    } else {
      show("error", res.error ?? NETWORK_ERROR_MSG);
    }
  };

  const handleDelete = async (item: ApiKeyItem) => {
    if (busyId) return;
    const confirmed = window.confirm(
      item.label
        ? `هل تريد حذف المفتاح «${item.label}» نهائيًا؟ لا يمكن التراجع عن هذه العملية.`
        : "هل تريد حذف هذا المفتاح نهائيًا؟ لا يمكن التراجع عن هذه العملية."
    );
    if (!confirmed) return;
    setBusyId(item.id);
    const res = await apiFetch<{ ok: boolean }>(`/api/keys/${encodeURIComponent(item.id)}`, {
      method: "DELETE",
    });
    setBusyId(null);
    if (res.ok) {
      show("success", "تم حذف المفتاح.");
      await loadKeys();
    } else {
      show("error", res.error ?? NETWORK_ERROR_MSG);
    }
  };

  return (
    <Card
      icon={<IconKey className="h-5 w-5" />}
      title="مدير المفاتيح"
      description={
        <>
          إدارة مفاتيح مزودي التوليد — <span dir="ltr" className="font-mono">kie.ai / CometAPI</span>
        </>
      }
    >
      <div className="flex items-start gap-2.5 rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 text-[13px] leading-6 text-zinc-400">
        <IconInfo className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400/90" />
        <p>
          أضف عدة مفاتيح لكل مزود — التجربة تسلسلية (أول مفتاح ثم التالي ثم التالي) مع تبديل فوري تلقائي عند أي خطأ أو نفاد رصيد دون توقف.
        </p>
      </div>

      <form onSubmit={handleAdd} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="key-provider" className={LABEL_CLS}>
              المزود
            </label>
            <select
              id="key-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value as KeyProvider)}
              className={FIELD_CLS}
            >
              {PROVIDER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="key-label" className={LABEL_CLS}>
              التسمية <span className="font-semibold text-zinc-500">(اختياري)</span>
            </label>
            <input
              id="key-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="مثال: حساب رئيسي"
              maxLength={80}
              className={FIELD_CLS}
            />
          </div>
        </div>
        <div>
          <label htmlFor="key-value" className={LABEL_CLS}>
            المفتاح <span dir="ltr" className="font-semibold text-zinc-500">(API Key)</span>
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              id="key-value"
              type="password"
              dir="ltr"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="الصق المفتاح هنا"
              autoComplete="off"
              className={`${FIELD_CLS} flex-1 font-mono`}
            />
            <button
              type="submit"
              disabled={adding}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 text-sm font-extrabold text-zinc-950 shadow-sm transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60 sm:min-w-[11rem]"
            >
              {adding ? <IconSpinner className="h-4 w-4" /> : <IconPlus className="h-4 w-4" />}
              {adding ? "جارٍ الإضافة…" : "إضافة المفتاح"}
            </button>
          </div>
        </div>
      </form>

      {alert && (
        <div className="mt-4">
          <InlineAlert tone={alert.tone} text={alert.text} onClose={clear} />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold text-zinc-200">
          المفاتيح <span className="font-semibold text-zinc-500">({listState === "ready" ? keys.length : "—"})</span>
        </h3>
        <button
          type="button"
          onClick={() => void loadKeys()}
          disabled={listState === "loading"}
          aria-label="تحديث قائمة المفاتيح"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:opacity-50"
        >
          <IconRefresh className="h-3.5 w-3.5" />
          تحديث
        </button>
      </div>

      <div className="mt-3">
        {listState === "loading" && <LoadingState />}

        {listState === "error" && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-sm text-red-300">
            <p className="leading-6">{listError}</p>
            <button
              type="button"
              onClick={() => {
                setListState("loading");
                void loadKeys();
              }}
              className="mt-2.5 inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 text-xs font-bold text-red-300 transition hover:bg-red-500/20"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              إعادة المحاولة
            </button>
          </div>
        )}

        {listState === "ready" && keys.length === 0 && (
          <EmptyState icon={<IconKey className="h-6 w-6" />} title="لا توجد مفاتيح بعد — أضف أول مفتاح للبدء" />
        )}

        {listState === "ready" && keys.length > 0 && (
          <ul className="slim-scroll max-h-96 space-y-3 overflow-y-auto pe-1">
            {keys.map((item) => {
              const isBusy = busyId === item.id;
              const statusMeta =
                item.status === "active"
                  ? { label: "نشط", tone: "emerald" as const }
                  : item.status === "exhausted"
                    ? { label: "مستنزف", tone: "amber" as const }
                    : item.status === "disabled"
                      ? { label: "معطّل", tone: "zinc" as const }
                      : { label: item.status, tone: "zinc" as const };
              return (
                <li
                  key={item.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 transition-colors hover:border-zinc-700"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <code
                      dir="ltr"
                      className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[13px] text-zinc-100"
                    >
                      {item.maskedKey}
                    </code>
                    <Badge tone="zinc" className="font-mono">
                      {providerLabel(item.provider)}
                    </Badge>
                    <Badge tone={statusMeta.tone} dot>
                      {statusMeta.label}
                    </Badge>
                    {item.label ? (
                      <span className="max-w-[12rem] truncate text-xs text-zinc-400" title={item.label}>
                        {item.label}
                      </span>
                    ) : null}
                    <span className="ms-auto flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggle(item)}
                        disabled={isBusy}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-bold text-zinc-200 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <IconPower className="h-3.5 w-3.5" />
                        {item.status === "active" ? "تعطيل" : "تنشيط"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        disabled={isBusy}
                        className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 text-xs font-bold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                        حذف
                      </button>
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
                    <span>
                      الاستخدام: <span className="font-bold text-zinc-300">{item.usageCount ?? 0}</span>
                    </span>
                    <span className="text-emerald-400/90">
                      النجاح: <span className="font-bold">{item.successCount ?? 0}</span>
                    </span>
                    <span className="text-red-400/90">
                      الفشل: <span className="font-bold">{item.failCount ?? 0}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <IconClock className="h-3.5 w-3.5" />
                      أُضيف: {formatArabicDateTime(item.createdAt)}
                    </span>
                  </div>
                  {item.lastError ? (
                    <p
                      dir="auto"
                      title={item.lastError}
                      className="mt-2.5 truncate rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-xs text-red-300/90"
                    >
                      آخر خطأ: {excerpt(item.lastError, 120)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default KeysManager;
