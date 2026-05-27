"use client";

import { useState } from "react";
import type { InboundEmail } from "@/types/inbox";

interface EmailDetailProps {
  email: InboundEmail;
}

export default function EmailDetail({ email }: EmailDetailProps) {
  const [expanded, setExpanded] = useState(true);

  const analysis = email.analysis;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-base">📨</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{email.subject}</p>
            <p className="text-xs text-gray-400">
              From: {email.from_name} &lt;{email.from_email}&gt; · {new Date(email.received_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        </div>
        <span className="text-gray-400 text-sm flex-shrink-0 ml-2">
          {expanded ? "▲ Collapse" : "▼ Expand"}
        </span>
      </button>

      {/* AI Analysis Tags — always visible */}
      {analysis && (
        <div className="px-4 pb-3 flex flex-wrap gap-1.5">
          {analysis.tags?.map((tag) => (
            <span
              key={tag.label}
              className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300"
            >
              {tag.label}
            </span>
          ))}
          {analysis.intent && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300">
              Intent: {analysis.intent} ({analysis.confidence ? (analysis.confidence * 100).toFixed(0) + '%' : 'N/A'})
            </span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full border ${
            analysis.urgency === "high"
              ? "bg-red-500/10 border-red-500/20 text-red-300"
              : analysis.urgency === "medium"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
              : "bg-green-500/10 border-green-500/20 text-green-300"
          }`}>
            {analysis.urgency || "low"} urgency
          </span>
        </div>
      )}

      {/* Expanded: full email + key points */}
      {expanded && (
        <div className="border-t border-[var(--border-color)]">
          {/* Key points */}
          {analysis?.key_points && analysis.key_points.length > 0 && (
            <div className="px-4 py-3 bg-blue-500/5 border-b border-[var(--border-color)]">
              <p className="text-xs font-semibold text-blue-400 mb-2">🧠 AI Key Points</p>
              <ul className="space-y-1">
                {analysis.key_points.map((point, i) => (
                  <li key={i} className="text-xs text-gray-300 flex gap-2">
                    <span className="text-blue-400 flex-shrink-0">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* AI Reasoning */}
          {analysis?.reasoning && (
            <div className="px-4 py-3 bg-yellow-500/5 border-b border-[var(--border-color)]">
              <p className="text-xs font-semibold text-yellow-400 mb-2">🤖 AI Reasoning</p>
              <p className="text-xs text-gray-300 italic">{analysis.reasoning}</p>
            </div>
          )}

          {/* Email body */}
          <div className="px-4 py-4">
            <pre className="text-xs text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">
              {email.body_text}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
