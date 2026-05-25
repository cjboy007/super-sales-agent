"use client";

import { useState } from "react";
import { Badge, TagPill } from "@/components/ui/BattleTokens";
import { withoutFlagMarkers } from "@/lib/display-text";
import type { InboundEmail } from "@/types/inbox";

export default function EmailDetail({ email }: { email: InboundEmail }) {
  const [expanded, setExpanded] = useState(true);
  const analysis = email.analysis;

  return (
    <div className="overflow-hidden rounded-md border border-slate-800 bg-slate-900/75">
      <button onClick={() => setExpanded((value) => !value)} className="flex w-full items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 text-left hover:bg-slate-800/40">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-slate-200">{email.subject}</p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-slate-500">
            {email.from_name} &lt;{email.from_email}&gt; / {new Date(email.received_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[10px] uppercase text-slate-500">{expanded ? "collapse" : "expand"}</span>
      </button>

      {analysis && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 px-3 py-2">
          {analysis.tags.map((tag) => <TagPill key={tag.label}>{withoutFlagMarkers(tag.label)}</TagPill>)}
          <Badge tone="purple">{analysis.intent}</Badge>
          <Badge tone={analysis.urgency === "high" ? "red" : analysis.urgency === "medium" ? "amber" : "emerald"}>
            {analysis.urgency}
          </Badge>
        </div>
      )}

      {expanded && (
        <div>
          {analysis?.key_points && analysis.key_points.length > 0 && (
            <div className="border-b border-slate-800 bg-blue-500/5 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400">AI Key Points</p>
              <ul className="mt-2 space-y-1">
                {analysis.key_points.map((point) => (
                  <li key={point} className="text-xs leading-relaxed text-slate-300">{point}</li>
                ))}
              </ul>
            </div>
          )}
          <pre className="whitespace-pre-wrap px-3 py-3 font-sans text-xs leading-relaxed text-slate-300">
            {email.body_text}
          </pre>
        </div>
      )}
    </div>
  );
}
