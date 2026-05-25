"use client";

export type Tone = "emerald" | "amber" | "red" | "blue" | "purple" | "neutral" | "safe" | "pending" | "risk" | "processing" | "intel";

const TONE_CLASSES: Record<Tone, { text: string; softText: string; bg: string; border: string; dot: string }> = {
  emerald: { text: "text-emerald-300", softText: "text-emerald-400", bg: "bg-emerald-500/10", border: "ring-1 ring-emerald-500/20", dot: "bg-emerald-400" },
  amber: { text: "text-amber-300", softText: "text-amber-400", bg: "bg-amber-500/10", border: "ring-1 ring-amber-500/20", dot: "bg-amber-400" },
  red: { text: "text-red-300", softText: "text-red-400", bg: "bg-red-500/10", border: "ring-1 ring-red-500/20", dot: "bg-red-400" },
  blue: { text: "text-blue-300", softText: "text-blue-400", bg: "bg-blue-500/10", border: "ring-1 ring-blue-500/20", dot: "bg-blue-400" },
  purple: { text: "text-purple-300", softText: "text-purple-400", bg: "bg-purple-500/10", border: "ring-1 ring-purple-500/20", dot: "bg-purple-400" },
  neutral: { text: "text-slate-300", softText: "text-slate-400", bg: "bg-slate-800", border: "ring-1 ring-slate-700/80", dot: "bg-slate-400" },
  safe: { text: "text-emerald-300", softText: "text-emerald-400", bg: "bg-emerald-500/10", border: "ring-1 ring-emerald-500/20", dot: "bg-emerald-400" },
  pending: { text: "text-amber-300", softText: "text-amber-400", bg: "bg-amber-500/10", border: "ring-1 ring-amber-500/20", dot: "bg-amber-400" },
  risk: { text: "text-red-300", softText: "text-red-400", bg: "bg-red-500/10", border: "ring-1 ring-red-500/20", dot: "bg-red-400" },
  processing: { text: "text-blue-300", softText: "text-blue-400", bg: "bg-blue-500/10", border: "ring-1 ring-blue-500/20", dot: "bg-blue-400" },
  intel: { text: "text-purple-300", softText: "text-purple-400", bg: "bg-purple-500/10", border: "ring-1 ring-purple-500/20", dot: "bg-purple-400" },
};

export function getToneClasses(tone: Tone) {
  return TONE_CLASSES[tone];
}

export function Badge({ tone = "neutral", pulse, children }: { tone?: Tone; pulse?: boolean; children: React.ReactNode }) {
  const t = TONE_CLASSES[tone];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-wide ${t.bg} ${t.border} ${t.softText}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${t.dot} ${pulse ? "animate-pulse" : ""}`} />
      {children}
    </span>
  );
}

export function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300">
      {children}
    </span>
  );
}

export function PanelSection({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/75">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/75 px-3 py-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
