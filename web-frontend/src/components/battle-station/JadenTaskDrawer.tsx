"use client";

import { useEffect, useMemo, useState } from "react";
import { useProject } from "@/lib/project";
import { cx } from "./theme";

type TaskStatus = "planned" | "queued" | "running" | "needs_review" | "done" | "error";

interface PublicJadenTaskThread {
  id: string;
  createdAt: string;
  surface: string;
  mode: string;
  status: TaskStatus;
  target?: {
    type?: string;
    id?: string;
    label?: string;
  };
  plan: {
    intent: string;
    confidence: number;
    needsHumanReview: boolean;
    workflows: string[];
    sideEffectKinds: string[];
  };
  queuedTasks: Array<{
    title: string;
    workflow: string;
    status: "queued" | "running" | "completed" | "failed";
  }>;
  warnings: string[];
}

interface JadenTaskDrawerProps {
  open: boolean;
  threadId?: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  planned: "planned",
  queued: "queued",
  running: "running",
  needs_review: "needs review",
  done: "done",
  error: "error",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  planned: "border-sky-800 bg-sky-950/55 text-sky-200",
  queued: "border-emerald-800 bg-emerald-950/55 text-emerald-200",
  running: "border-blue-800 bg-blue-950/55 text-blue-200",
  needs_review: "border-amber-800 bg-amber-950/55 text-amber-200",
  done: "border-emerald-800 bg-emerald-950/55 text-emerald-200",
  error: "border-red-800 bg-red-950/55 text-red-200",
};

function titleCase(value: string): string {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function JadenTaskDrawer({ open, threadId, onClose }: JadenTaskDrawerProps) {
  const { apiFetch } = useProject();
  const [thread, setThread] = useState<PublicJadenTaskThread | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (!open || !threadId) return;
    let cancelled = false;

    async function loadThread() {
      setStatus("loading");
      try {
        const response = await apiFetch(`/api/operator-command/threads?threadId=${encodeURIComponent(threadId || "")}`, {
          cache: "no-store",
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || json?.success === false) throw new Error(json?.error || "Task summary unavailable");
        if (cancelled) return;
        setThread(json?.data?.threads?.[0] || null);
        setStatus("idle");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    loadThread();
    const timer = window.setInterval(loadThread, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [apiFetch, open, threadId]);

  const targetLabel = useMemo(() => {
    if (!thread?.target) return "No target selected";
    if (thread.target.label) return thread.target.label;
    if (thread.target.type && thread.target.type !== "none") return titleCase(thread.target.type);
    return "No target selected";
  }, [thread]);

  if (!open) return null;

  return (
    <aside className="fixed bottom-16 right-4 z-40 w-[min(420px,calc(100vw-2rem))] rounded-lg border border-slate-800 bg-slate-950 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
        <div>
          <p className="text-xs font-semibold text-slate-100">Jaden Task Thread</p>
          <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-500">safe plan summary</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 rounded-md border border-slate-800 px-2 text-xs text-slate-400 transition hover:border-slate-700 hover:text-slate-100"
        >
          Close
        </button>
      </div>

      <div className="max-h-[60vh] space-y-3 overflow-y-auto p-4">
        {status === "loading" && !thread ? (
          <p className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">Loading task thread...</p>
        ) : status === "error" ? (
          <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-200">Task thread could not be loaded.</p>
        ) : thread ? (
          <>
            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-100">{titleCase(thread.plan.intent)}</p>
                  <p className="mt-1 text-xs text-slate-500">{targetLabel} · {titleCase(thread.surface)} · {titleCase(thread.mode)}</p>
                </div>
                <span className={cx("shrink-0 rounded border px-2 py-1 text-[10px] font-semibold uppercase", STATUS_TONE[thread.status])}>
                  {STATUS_LABELS[thread.status]}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
                <p className="text-slate-500">Confidence</p>
                <p className="mt-1 font-semibold text-slate-200">{Math.round(thread.plan.confidence * 100)}%</p>
              </div>
              <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
                <p className="text-slate-500">Review</p>
                <p className="mt-1 font-semibold text-slate-200">{thread.plan.needsHumanReview ? "Required" : "Not required"}</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Queued Work</p>
              <div className="mt-2 space-y-2">
                {thread.queuedTasks.length > 0 ? thread.queuedTasks.map((task, index) => (
                  <div key={`${task.workflow}-${index}`} className="flex items-center justify-between gap-3 rounded border border-slate-800 bg-slate-950 px-2 py-2">
                    <span className="min-w-0 truncate text-xs text-slate-300">{task.title}</span>
                    <span className="shrink-0 text-[10px] uppercase text-slate-500">{task.status}</span>
                  </div>
                )) : (
                  <p className="text-xs text-slate-500">No background tasks queued yet.</p>
                )}
              </div>
            </div>

            {thread.warnings.length > 0 && (
              <div className="rounded-md border border-amber-900 bg-amber-950/35 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-amber-300">Safety Notes</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-100/85">
                  {thread.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] leading-4 text-slate-500">
              Raw chat stays out of durable sales memory. Customer-facing actions still require SSA approval gates.
            </p>
          </>
        ) : (
          <p className="rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-400">No task thread selected.</p>
        )}
      </div>
    </aside>
  );
}
