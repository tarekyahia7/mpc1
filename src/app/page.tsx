"use client";

/* لوحة الإدارة العربية لمشروع MCP Media Generator */
import { DashboardHeader } from "@/components/dashboard-header";
import { IconShield } from "@/components/icons";
import { KeysManager } from "@/components/keys-manager";
import { ServerConnect } from "@/components/server-connect";
import { TasksPanel } from "@/components/tasks-panel";
import { useHealth } from "@/components/use-health";

export default function HomePage() {
  const { health, pending } = useHealth();
  const authRequired = health?.authRequired === true;

  return (
    <div className="relative flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-72 bg-[radial-gradient(65%_60%_at_50%_0%,rgba(16,185,129,0.08),transparent_70%)]"
      />

      <DashboardHeader health={health} pending={pending} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2 lg:gap-6">
          <KeysManager />
          <ServerConnect authRequired={authRequired} />
        </div>
        <div className="mt-5 lg:mt-6">
          <TasksPanel />
        </div>
      </main>

      <footer className="mt-auto border-t border-zinc-800/70">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-6">
          <IconShield className="h-4 w-4 shrink-0 text-emerald-500/70" />
          <p className="text-center text-xs leading-5 text-zinc-500">
            جميع المفاتيح مخفية دائمًا ولا تُعاد كاملة من السيرفر إطلاقًا.
          </p>
        </div>
      </footer>
    </div>
  );
}
