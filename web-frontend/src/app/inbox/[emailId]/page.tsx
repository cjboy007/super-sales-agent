"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import EmailDetail from "@/components/inbox/EmailDetail";
import EmailPreview from "@/components/inbox/EmailPreview";
import ReplyGrid from "@/components/inbox/ReplyGrid";
import ReplySwiper from "@/components/inbox/ReplySwiper";
import SendConfirmBar from "@/components/inbox/SendConfirmBar";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection } from "@/components/ui/BattleTokens";
import type { InboundEmail, ReplyOption, ReplyStyle } from "@/types/inbox";

interface FullEmail {
  subject: string;
  body: string;
  attachments?: string[];
}

interface PageProps {
  params: { emailId: string };
}

export default function InboxApprovalPage({ params }: PageProps) {
  const router = useRouter();
  const emailId = params.emailId;
  const [email, setEmail] = useState<InboundEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOption, setSelectedOption] = useState<ReplyOption | null>(null);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [fullEmail, setFullEmail] = useState<FullEmail | null>(null);
  const [editedBody, setEditedBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`/api/inbox/${emailId}`);
        const json = await res.json();
        if (json.success) {
          setEmail(json.data);
        } else {
          setError("Email not found");
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [emailId]);

  const handleSelectOption = useCallback(async (option: ReplyOption) => {
    setSelectedOption(option);
    setFullEmail(null);
    setEditedBody("");
    setGeneratingEmail(true);
    try {
      const res = await fetch(`/api/inbox/${emailId}/select`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ style: option.style }),
      });
      const json = await res.json();
      if (json.success) {
        setFullEmail(json.full_email);
        setEditedBody(json.full_email.body);
      }
    } catch {
      // Keep operator on the approval screen if generation fails.
    } finally {
      setGeneratingEmail(false);
    }
  }, [emailId]);

  const handleReselect = () => {
    setSelectedOption(null);
    setFullEmail(null);
    setEditedBody("");
  };

  const handleSaveForApproval = async () => {
    if (!email || !fullEmail || !selectedOption) return;
    setSaving(true);
    try {
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      setSaved(true);
      window.setTimeout(() => router.push("/inbox"), 1200);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageShell>
        <div className="flex flex-1 items-center justify-center text-xs text-slate-500">Loading email approval case</div>
      </PageShell>
    );
  }

  if (error || !email) {
    return (
      <PageShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-xs">
          <p className="text-red-400">{error ?? "Email not found"}</p>
          <Link href="/inbox" className="text-emerald-400 hover:text-emerald-300">Back to inbox</Link>
        </div>
      </PageShell>
    );
  }

  const options = email.options ?? [];

  return (
    <PageShell className="pb-24 md:pb-0">
      <PageHeader title="Inbox Approval Focus" meta={`${email.id} / human approval required`}>
        <Link href="/inbox" className="font-mono text-[10px] uppercase text-slate-500 hover:text-slate-200">Back</Link>
        <Badge tone="amber" pulse>human gate</Badge>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-12 lg:overflow-hidden">
        <section className="min-h-0 border-r border-slate-800 bg-slate-900/35 lg:col-span-4">
          <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Email Thread</h2>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{email.from_email}</p>
          </div>
          <div className="h-full overflow-y-auto p-3 pb-14">
            <EmailDetail email={email} />
          </div>
        </section>

        <section className="min-h-0 border-r border-slate-800 bg-slate-950/65 lg:col-span-4">
          <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">AI Strategy Analysis</h2>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{options.length} reply strategies / no customer send</p>
          </div>
          <div className="h-full overflow-y-auto p-3 pb-14">
            <div className="md:hidden">
              <ReplySwiper options={options} selectedId={selectedOption?.id ?? null} onSelect={handleSelectOption} loading={generatingEmail} />
            </div>
            <div className="hidden md:block">
              <ReplyGrid options={options} selectedId={selectedOption?.id ?? null} onSelect={handleSelectOption} loading={generatingEmail} />
            </div>
            <div className="mt-3 rounded-md border border-amber-500/25 bg-amber-500/5 p-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-amber-300">Approval Gate</h3>
                <Badge tone="amber" pulse>blocked</Badge>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                SSA can draft and reason here. A customer-facing email must be explicitly approved by Wilson before any external send path is allowed.
              </p>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-slate-900/35 lg:col-span-4">
          <div className="border-b border-slate-800 bg-slate-950/80 px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Draft Editor</h2>
            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-600">{selectedOption ? selectedOption.style : "select strategy"}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!selectedOption ? (
              <PanelSection title="No Strategy Selected">
                <div className="p-8 text-center text-xs text-slate-500">Select an AI strategy to generate a draft.</div>
              </PanelSection>
            ) : generatingEmail ? (
              <PanelSection title="Generating Draft">
                <div className="p-8 text-center text-xs text-slate-500">AI draft generation in progress</div>
              </PanelSection>
            ) : fullEmail ? (
              <EmailPreview email={fullEmail} toEmail={email.from_email} toName={email.from_name} selectedStyle={selectedOption.style as ReplyStyle} onEdit={setEditedBody} />
            ) : null}
          </div>
          {fullEmail && !generatingEmail && (
            <div className="hidden shrink-0 border-t border-slate-800 bg-slate-900/75 p-3 md:block">
              <SendConfirmBar
                selectedStyle={selectedOption?.style as ReplyStyle}
                onSend={handleSaveForApproval}
                onReselect={handleReselect}
                sending={saving}
                sent={saved}
              />
            </div>
          )}
        </section>
      </div>

      {selectedOption && fullEmail && !generatingEmail && (
        <div className="md:hidden">
          <SendConfirmBar
            selectedStyle={selectedOption.style as ReplyStyle}
            onSend={handleSaveForApproval}
            onReselect={handleReselect}
            sending={saving}
            sent={saved}
          />
        </div>
      )}
    </PageShell>
  );
}
