"use client";

import Link from "next/link";
import type { InboundEmail, UrgencyLevel } from "@/types/inbox";

interface InboxCardProps {
  email: InboundEmail;
}

const urgencyColors: Record<UrgencyLevel, string> = {
  urgent: "text-red-300 bg-red-500/15 border-red-400/30",
  high: "text-red-400 bg-red-500/10 border-red-500/20",
  medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  low: "text-green-400 bg-green-500/10 border-green-500/20",
};

const urgencyLabels: Record<UrgencyLevel, string> = {
  urgent: "🔴 Urgent",
  high: "🔴 Urgent",
  medium: "🟡 Normal",
  low: "🟢 Low",
};

const intentLabels: Record<string, string> = {
  inquiry: "Inquiry",
  negotiation: "Negotiation",
  order: "Order",
  complaint: "Complaint",
  follow_up: "Follow-up",
  other: "Other",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor(diff / 60000);
  if (h >= 24) return `${Math.floor(h / 24)}d ago`;
  if (h >= 1) return `${h}h ago`;
  return `${m}m ago`;
}

export default function InboxCard({ email }: InboxCardProps) {
  const analysis = email.analysis;
  const urgency = analysis?.urgency ?? "medium";

  return (
    <Link href={`/inbox/${email.id}`} className="block group">
      <div className="bg-[var(--card-bg)] border border-[var(--border-color)] rounded-xl p-4 hover:border-[var(--accent)]/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-200 cursor-pointer">
        {/* Top row: sender + time */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 border border-[var(--border-color)] flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
              {email.from_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{email.from_name}</p>
              <p className="text-xs text-gray-500 truncate">{email.from_email}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="text-xs text-gray-500">{timeAgo(email.received_at)}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${urgencyColors[urgency]}`}>
              {urgencyLabels[urgency]}
            </span>
          </div>
        </div>

        {/* Subject */}
        <p className="text-sm font-medium text-white/90 mb-1.5 line-clamp-1 group-hover:text-white transition-colors">
          {email.subject}
        </p>

        {/* Body preview */}
        <p className="text-xs text-gray-400 line-clamp-2 mb-3">
          {email.body_text.slice(0, 160)}...
        </p>

        {/* Tags */}
        {analysis?.tags && analysis.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {analysis.tags.slice(0, 4).map((tag) => (
              <span
                key={tag.label}
                className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300"
              >
                {tag.label}
              </span>
            ))}
            {analysis?.intent && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--accent)]/10 border border-[var(--accent)]/20 text-blue-400">
                {intentLabels[analysis.intent] ?? analysis.intent}
              </span>
            )}
          </div>
        )}

        {/* Bottom: key points count + CTA */}
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border-color)]">
          <span className="text-xs text-gray-500">
            {analysis?.key_points?.length ?? 0} key points · {email.options?.length ?? 0} reply options
          </span>
          <span className="text-xs text-[var(--accent)] font-medium group-hover:underline">
            Choose strategy →
          </span>
        </div>
      </div>
    </Link>
  );
}
