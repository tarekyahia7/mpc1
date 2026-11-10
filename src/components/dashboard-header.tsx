"use client";

/* هيدر اللوحة: العنوان + الوصف + شارات الحالة المجلوبة من /api/health */
import { Badge } from "./ui";
import { IconDatabase, IconShield, IconSparkles } from "./icons";
import type { HealthData } from "./types";

interface DashboardHeaderProps {
  health: HealthData | null;
  pending: boolean;
}

export function DashboardHeader({ health, pending }: DashboardHeaderProps) {
  const connected = health?.ok === true && health.database === "turso-connected";
  const mergerHealthy = health?.merger?.healthy === true;
  const authRequired = health?.authRequired === true;

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800/80 bg-zinc-950/85 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/70">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 text-zinc-950 shadow-lg shadow-emerald-500/20"
          >
            <IconSparkles className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xl font-extrabold sm:text-2xl">
              <span dir="ltr" className="tracking-tight text-white">
                MCP Media Generator
              </span>
              <span className="rounded-lg border border-zinc-700/80 bg-zinc-800/70 px-2 py-0.5 text-[11px] font-bold text-zinc-300">
                لوحة الإدارة
              </span>
            </h1>
            <p className="mt-1.5 text-[13px] leading-6 text-zinc-400 sm:text-sm">
              خادم MCP لتوليد الصور والفيديو ودمج المقاطع — بالذكاء الاصطناعي
            </p>
          </div>
        </div>

        <div aria-live="polite" className="flex flex-wrap items-center gap-2">
          {pending ? (
            <Badge tone="zinc" dot pulse>
              جارٍ التحقق…
            </Badge>
          ) : connected ? (
            <Badge tone="emerald" dot>
              <IconDatabase className="h-3.5 w-3.5" />
              Turso متصل
            </Badge>
          ) : (
            <Badge tone="red" dot>
              غير متصل
            </Badge>
          )}

          {!pending &&
            (mergerHealthy ? (
              <Badge tone="emerald" dot small>
                خدمة الدمج جاهزة
              </Badge>
            ) : (
              <Badge tone="red" dot small>
                خدمة الدمج غير متاحة
              </Badge>
            ))}

          {authRequired && (
            <Badge tone="amber" small>
              <IconShield className="h-3 w-3" />
              محمي بـ Bearer token
            </Badge>
          )}
        </div>
      </div>
    </header>
  );
}

export default DashboardHeader;
