import type { BattleTone } from "@/lib/battle-station-data";

export const toneClasses: Record<
  BattleTone,
  {
    text: string;
    softText: string;
    bg: string;
    border: string;
    glow: string;
    dot: string;
    progress: string;
  }
> = {
  safe: {
    text: "text-emerald-300",
    softText: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/35",
    glow: "shadow-[0_0_18px_rgba(16,185,129,0.16)]",
    dot: "bg-emerald-400",
    progress: "bg-emerald-500",
  },
  pending: {
    text: "text-amber-300",
    softText: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/35",
    glow: "shadow-[0_0_18px_rgba(245,158,11,0.16)]",
    dot: "bg-amber-400",
    progress: "bg-amber-500",
  },
  risk: {
    text: "text-red-300",
    softText: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/35",
    glow: "shadow-[0_0_18px_rgba(239,68,68,0.18)]",
    dot: "bg-red-400",
    progress: "bg-red-500",
  },
  processing: {
    text: "text-blue-300",
    softText: "text-blue-400",
    bg: "bg-blue-500/10",
    border: "border-blue-500/35",
    glow: "shadow-[0_0_18px_rgba(59,130,246,0.14)]",
    dot: "bg-blue-400",
    progress: "bg-blue-500",
  },
  intel: {
    text: "text-violet-300",
    softText: "text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/35",
    glow: "shadow-[0_0_18px_rgba(139,92,246,0.14)]",
    dot: "bg-violet-400",
    progress: "bg-violet-500",
  },
  neutral: {
    text: "text-slate-300",
    softText: "text-slate-400",
    bg: "bg-slate-800/70",
    border: "border-slate-700",
    glow: "",
    dot: "bg-slate-400",
    progress: "bg-slate-500",
  },
};

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
