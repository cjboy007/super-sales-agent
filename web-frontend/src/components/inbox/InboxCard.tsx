"use client";

import Link from "next/link";
import { Badge, TagPill } from "@/components/ui/BattleTokens";
import { withoutFlagMarkers } from "@/lib/display-text";
import type { InboundEmail } from "@/types/inbox";

interface InboxCardProps {
  email: InboundEmail;
}

const urgencyTone = {
  high: "red",
  medium: "amber",
  low: "emerald",
} as const;

const urgencyLabels = { high: "urgent", medium: "normal", low: "low" };

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
      <div className="rounded-md border border-slate-800 bg-slate-900/75 p-3 transition-colors hover:border-emerald-500/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md border border-slate-800 bg-slate-950 font-mono text-[10px] font-bold text-slate-400">
              {email.from_name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-200">{email.from_name}</p>
              <p className="truncate font-mono text-[10px] text-slate-500">{email.from_email}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className="font-mono text-[10px] text-slate-500">{timeAgo(email.received_at)}</span>
            <Badge tone={urgencyTone[urgency]}>{urgencyLabels[urgency]}</Badge>
          </div>
        </div>

        <p className="mt-2 line-clamp-1 text-sm font-medium text-slate-100">
          {email.subject}
        </p>

        <p className="mt-1 line-clamp-2 text-xs text-slate-500">
          {email.body_text.slice(0, 160)}...
        </p>

        {analysis?.tags && analysis.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {analysis.tags.slice(0, 4).map((tag) => (
              <TagPill key={tag.label}>{withoutFlagMarkers(tag.label)}</TagPill>
            ))}
            {analysis?.intent && (
              <Badge tone="purple">{intentLabels[analysis.intent] ?? analysis.intent}</Badge>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between border-t border-slate-800 pt-2">
          <span className="font-mono text-[10px] text-slate-600">
            {analysis?.key_points?.length ?? 0} key points · {email.options?.length ?? 0} reply options
          </span>
          <span className="text-xs font-medium text-emerald-400">
            review
          </span>
        </div>
      </div>
    </Link>
  );
}
