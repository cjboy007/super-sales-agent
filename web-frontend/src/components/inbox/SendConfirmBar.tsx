"use client";

import { Badge } from "@/components/ui/BattleTokens";
import type { ReplyStyle } from "@/types/inbox";

const styleLabels: Record<ReplyStyle, string> = {
  steady: "Steady",
  aggressive: "Aggressive",
  creative: "Creative",
};

export default function SendConfirmBar({
  selectedStyle,
  onSend,
  onReselect,
  sending,
  sent,
}: {
  selectedStyle: ReplyStyle | null;
  onSend: () => void;
  onReselect: () => void;
  sending: boolean;
  sent: boolean;
}) {
  if (!selectedStyle) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto md:left-auto md:right-auto">
      <div className="border-t border-slate-800 bg-slate-900/95 px-3 py-3 md:rounded-md md:border">
        {sent ? (
          <div className="flex items-center justify-center gap-3 py-1">
            <Badge tone="emerald">saved</Badge>
            <div>
              <p className="text-sm font-semibold text-emerald-400">Draft saved for human approval.</p>
              <p className="text-xs text-slate-500">Returning to inbox.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-center text-[10px] text-amber-300">
              Customer-facing send is blocked until operator approval.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onReselect}
                disabled={sending}
                className="h-8 shrink-0 rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:text-slate-100 disabled:opacity-40"
              >
                Reselect
              </button>
              <button
                onClick={onSend}
                disabled={sending}
                className="flex h-8 flex-1 items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                {sending ? "Saving Draft" : `Save ${styleLabels[selectedStyle]} Draft`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
