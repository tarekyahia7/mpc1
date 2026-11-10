"use client";

/* مكونات واجهة صغيرة مشتركة للوحة الإدارة — Tailwind فقط */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { copyToClipboard } from "./utils";
import { IconAlert, IconCheck, IconCopy, IconInfo, IconSpinner, IconX } from "./icons";

export type Tone = "emerald" | "amber" | "red" | "sky" | "zinc";

const TONE_BADGE: Record<Tone, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  red: "border-red-500/30 bg-red-500/10 text-red-400",
  sky: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  zinc: "border-zinc-600/50 bg-zinc-800/70 text-zinc-300",
};

/* ---------- Badge ---------- */
interface BadgeProps {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  small?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}

export function Badge({ tone = "zinc", dot = false, pulse = false, small = false, title, className = "", children }: BadgeProps) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border font-bold ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"} ${TONE_BADGE[tone]} ${className}`}
    >
      {dot && (
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${pulse ? "animate-pulse" : ""}`} />
      )}
      {children}
    </span>
  );
}

/* ---------- Card ---------- */
interface CardProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ icon, title, description, actions, children, className = "" }: CardProps) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/20 ${className}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-800/80 bg-zinc-900/80 px-5 py-4 sm:px-6">
        {icon && (
          <span
            aria-hidden="true"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
          >
            {icon}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold text-zinc-50 sm:text-lg">{title}</h2>
          {description && <div className="mt-0.5 text-[13px] leading-5 text-zinc-400">{description}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

/* ---------- تنبيهات فورية ---------- */
export type FlashTone = "success" | "error" | "warning" | "info";
export interface FlashAlert {
  tone: FlashTone;
  text: string;
}

const ALERT_TONE: Record<FlashTone, { cls: string; icon: ReactNode }> = {
  success: {
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    icon: <IconCheck className="h-4 w-4 shrink-0" />,
  },
  error: {
    cls: "border-red-500/30 bg-red-500/10 text-red-300",
    icon: <IconAlert className="h-4 w-4 shrink-0" />,
  },
  warning: {
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    icon: <IconAlert className="h-4 w-4 shrink-0" />,
  },
  info: {
    cls: "border-zinc-700 bg-zinc-900 text-zinc-300",
    icon: <IconInfo className="h-4 w-4 shrink-0" />,
  },
};

interface InlineAlertProps {
  tone: FlashTone;
  text: string;
  onClose?: () => void;
}

export function InlineAlert({ tone, text, onClose }: InlineAlertProps) {
  const t = ALERT_TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-sm leading-6 ${t.cls}`}
    >
      {t.icon}
      <p className="min-w-0 flex-1">{text}</p>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق التنبيه"
          className="rounded-md p-1 opacity-70 transition hover:opacity-100"
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** رسائل نجاح/فشل قصيرة العمر لكل بطاقة */
export function useFlash(durationMs = 5000) {
  const [alert, setAlert] = useState<FlashAlert | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setAlert(null);
  }, []);

  const show = useCallback(
    (tone: FlashTone, text: string) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setAlert({ tone, text });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setAlert(null);
      }, durationMs);
    },
    [durationMs]
  );

  return { alert, show, clear };
}

/* ---------- حالات فارغة وتحميل ---------- */
interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  hint?: string;
}

export function EmptyState({ icon, title, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-zinc-800 bg-zinc-950/40 px-6 py-10 text-center">
      {icon && (
        <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900 text-zinc-600">
          {icon}
        </span>
      )}
      <p className="text-sm font-bold text-zinc-300">{title}</p>
      {hint && <p className="max-w-sm text-xs leading-5 text-zinc-500">{hint}</p>}
    </div>
  );
}

export function LoadingState({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm font-semibold text-zinc-400">
      <IconSpinner className="h-4 w-4 text-emerald-400" />
      <span>{label}</span>
    </div>
  );
}

/* ---------- زر النسخ ---------- */
type CopySize = "sm" | "md" | "lg";

const COPY_SIZE: Record<CopySize, string> = {
  sm: "h-8 rounded-lg px-2.5 text-xs",
  md: "h-10 rounded-xl px-3.5 text-sm",
  lg: "h-11 rounded-xl px-4 text-sm",
};

interface CopyButtonProps {
  text: string;
  label?: string;
  size?: CopySize;
  disabled?: boolean;
  className?: string;
}

export function CopyButton({ text, label = "نسخ", size = "md", disabled = false, className = "" }: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    if (disabled || !text) return;
    const ok = await copyToClipboard(text);
    setState(ok ? "ok" : "fail");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setState("idle"), 2000);
  };

  const toneCls =
    state === "ok"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
      : state === "fail"
        ? "border-red-500/40 bg-red-500/10 text-red-400"
        : "border-zinc-700 bg-zinc-800/70 text-zinc-200 hover:bg-zinc-800 hover:text-white";

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled}
      aria-live="polite"
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 border font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${COPY_SIZE[size]} ${toneCls} ${className}`}
    >
      {state === "idle" ? <IconCopy className="h-4 w-4" /> : state === "ok" ? <IconCheck className="h-4 w-4" /> : <IconAlert className="h-4 w-4" />}
      <span>{state === "idle" ? label : state === "ok" ? "تم النسخ ✓" : "تعذر النسخ"}</span>
    </button>
  );
}

/* ---------- شريط التقدم ---------- */
const BAR_TONE: Record<Tone, string> = {
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  sky: "bg-sky-500",
  zinc: "bg-zinc-500",
};

interface ProgressBarProps {
  value: number;
  tone?: Tone;
  label?: string;
  className?: string;
}

export function ProgressBar({ value, tone = "sky", label, className = "" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
  return (
    <div className={`min-w-0 flex-1 ${className}`}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-label={label}
        className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800"
      >
        <div className={`h-full rounded-full transition-all duration-500 ${BAR_TONE[tone]}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}

/* ---------- شريحة إحصائية ---------- */
const STAT_TONE: Record<Tone, { box: string; value: string }> = {
  zinc: { box: "border-zinc-800 bg-zinc-950/60", value: "text-zinc-100" },
  emerald: { box: "border-emerald-500/25 bg-emerald-500/5", value: "text-emerald-400" },
  red: { box: "border-red-500/25 bg-red-500/5", value: "text-red-400" },
  sky: { box: "border-sky-500/25 bg-sky-500/5", value: "text-sky-400" },
  amber: { box: "border-amber-500/25 bg-amber-500/5", value: "text-amber-400" },
};

interface StatTileProps {
  label: string;
  value: number | null;
  tone?: Tone;
}

export function StatTile({ label, value, tone = "zinc" }: StatTileProps) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${STAT_TONE[tone].box}`}>
      <p className={`text-2xl font-extrabold leading-7 ${STAT_TONE[tone].value}`}>{value === null ? "—" : value}</p>
      <p className="mt-0.5 text-xs font-bold text-zinc-400">{label}</p>
    </div>
  );
}
