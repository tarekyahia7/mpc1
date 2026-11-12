"use client";

/* جلب حالة /api/health عند التحميل ثم كل 30 ثانية (مع تنظيف صحيح وتحمّل الأخطاء) */
import { useEffect, useState } from "react";
import { apiFetch } from "./utils";
import type { HealthData } from "./types";

export function useHealth(intervalMs = 30000) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      const res = await apiFetch<HealthData>("/api/health");
      if (!alive) return;
      setHealth(res.ok && res.data ? res.data : null);
      setPending(false);
      timer = setTimeout(() => void tick(), intervalMs);
    };

    void tick();

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [intervalMs]);

  return { health, pending };
}
