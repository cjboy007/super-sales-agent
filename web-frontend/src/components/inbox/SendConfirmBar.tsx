"use client";

import type { ReplyStyle } from "@/types/inbox";

interface SendConfirmBarProps {
  selectedStyle: ReplyStyle | null;
  onSend: () => void;
  onReselect: () => void;
  sending: boolean;
  sent: boolean;
}

const styleConfig = {
  steady: {
    bg: "bg-blue-600 hover:bg-blue-500",
    shadow: "shadow-blue-500/30",
    label: "Send Steady Reply",
    icon: "🛡️",
  },
  aggressive: {
    bg: "bg-red-600 hover:bg-red-500",
    shadow: "shadow-red-500/30",
    label: "Send Aggressive Reply",
    icon: "⚔️",
  },
  creative: {
    bg: "bg-purple-600 hover:bg-purple-500",
    shadow: "shadow-purple-500/30",
    label: "Send Creative Reply",
    icon: "🎲",
  },
};

export default function SendConfirmBar({
  selectedStyle,
  onSend,
  onReselect,
  sending,
  sent,
}: SendConfirmBarProps) {
  if (!selectedStyle) return null;

  const config = styleConfig[selectedStyle];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:relative md:bottom-auto md:left-auto md:right-auto">
      <div className="bg-[var(--sidebar-bg)]/95 backdrop-blur-md border-t border-[var(--border-color)] px-4 py-3 md:rounded-xl md:border md:bg-[var(--card-bg)]">
        {sent ? (
          <div className="flex items-center justify-center gap-3 py-1">
            <span className="text-2xl">✅</span>
            <div>
              <p className="text-sm font-semibold text-green-400">Email sent successfully!</p>
              <p className="text-xs text-gray-400">Returning to inbox...</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={onReselect}
              disabled={sending}
              className="px-4 py-2.5 text-sm bg-white/5 border border-white/10 text-gray-400 rounded-xl hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40 flex-shrink-0"
            >
              ← Reselect
            </button>
            <button
              onClick={onSend}
              disabled={sending}
              className={`flex-1 py-2.5 text-sm font-semibold text-white rounded-xl transition-all shadow-lg ${config.bg} ${config.shadow} disabled:opacity-60 flex items-center justify-center gap-2`}
            >
              {sending ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <span>{config.icon}</span>
                  {config.label}
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
