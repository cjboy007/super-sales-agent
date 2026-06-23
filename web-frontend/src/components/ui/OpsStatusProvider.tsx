"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useProject } from "@/lib/project";
import { summarizeOpsStatus, type OpsStatusSummary, type OpsStatusWorker } from "@/lib/runtime/ops-status-summary";

interface HealthPayload {
  timestamp?: string;
  worker?: OpsStatusWorker | null;
}

interface SideEffectResponse {
  data?: Array<{ status?: string }>;
}

const OpsStatusContext = createContext<OpsStatusSummary | null>(null);

function pendingReviewCount(json: SideEffectResponse | null): number {
  if (!Array.isArray(json?.data)) return 0;
  return json.data.filter((item) => {
    const status = String(item?.status || "").toLowerCase();
    return status === "requested" || status === "retry_requested" || status === "blocked";
  }).length;
}

export function OpsStatusProvider({ children }: { children: React.ReactNode }) {
  const { apiFetch } = useProject();
  const [status, setStatus] = useState<OpsStatusSummary>(() => summarizeOpsStatus());

  const load = useCallback(async () => {
    let health: HealthPayload | null = null;
    let actionReviews = 0;

    try {
      let response = await apiFetch("/api/health", { cache: "no-store" });
      if (!response.ok) response = await fetch("/api/health", { cache: "no-store" });
      if (response.ok) health = await response.json();
    } catch {
      health = null;
    }

    try {
      const response = await apiFetch("/api/runtime?action=side-effects&limit=20", { cache: "no-store" });
      if (response.ok) actionReviews = pendingReviewCount(await response.json());
    } catch {
      actionReviews = 0;
    }

    setStatus(summarizeOpsStatus({
      worker: health?.worker,
      actionReviews,
      timestamp: health?.timestamp,
    }));
  }, [apiFetch]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (cancelled) return;
      await load();
    }

    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  const value = useMemo(() => status, [status]);

  return <OpsStatusContext.Provider value={value}>{children}</OpsStatusContext.Provider>;
}

export function useOpsStatus(): OpsStatusSummary {
  return useContext(OpsStatusContext) ?? summarizeOpsStatus();
}
