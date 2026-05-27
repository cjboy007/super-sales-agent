import type { AnalysisBlock, BattleStationCopy, FocusCase } from "@/lib/battle-station-data";
import AppTopBar from "@/components/ui/AppTopBar";
import SectionChrome from "./SectionChrome";
import StatusBadge from "./StatusBadge";
import { cx, toneClasses } from "./theme";

interface FocusModeProps {
  focusCase: FocusCase;
  copy: BattleStationCopy["focus"];
  draft: string;
  subject: string;
  approvalState: string;
  onDraftChange: (draft: string) => void;
  onSubjectChange: (subject: string) => void;
  onBack: () => void;
  onApprove: () => void;
  onSave: () => void;
  onRegenerate: () => void;
  onReject: () => void;
}

function AnalysisPanel({ block }: { block: AnalysisBlock }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/65 p-3">
      <h3 className="text-xs font-semibold text-slate-300">{block.title}</h3>
      {block.rows && (
        <dl className="mt-2 space-y-2">
          {block.rows.map(([label, value, tone]) => (
            <div key={label} className="flex items-start justify-between gap-3 text-xs">
              <dt className="text-slate-500">{label}</dt>
              <dd className={cx("text-right font-mono", tone ? toneClasses[tone].softText : "text-slate-300")}>
                {value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {block.body && <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{block.body}</p>}
      {block.tags && (
        <div className="mt-2 flex flex-wrap gap-1">
          {block.tags.map((tag) => (
            <span
              key={tag}
              className="rounded border border-slate-800 bg-slate-950/70 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

export default function FocusMode({
  focusCase,
  copy,
  draft,
  subject,
  approvalState,
  onDraftChange,
  onSubjectChange,
  onBack,
  onApprove,
  onSave,
  onRegenerate,
  onReject,
}: FocusModeProps) {
  const title = `${copy.focusPrefix} ${focusCase.title}`;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-200">
      <AppTopBar title={title} meta={copy.humanApprovalRequired} active="/">
        <div className="flex min-w-0 items-center justify-end gap-2">
          <StatusBadge tone="pending" pulse className="hidden px-1.5 sm:inline-flex">
            {approvalState}
          </StatusBadge>
          <button
            type="button"
            onClick={onBack}
            className="h-7 shrink-0 rounded-md border border-slate-600 bg-slate-900/45 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          >
            {copy.back}
          </button>
        </div>
      </AppTopBar>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
        <section className="min-h-0 border-r border-slate-800 bg-slate-900/35 lg:col-span-4">
          <SectionChrome
            title={copy.emailThread}
            meta={focusCase.threadSummary}
            className="sticky top-0 z-10"
          />
          <div className="h-full overflow-y-auto p-3 pb-14">
            <div className="space-y-3">
              {focusCase.messages.map((message) => {
                const tone = message.role === "customer" ? "processing" : message.role === "ai" ? "intel" : "safe";
                return (
                  <article
                    key={message.id}
                    className={cx("rounded-lg border p-3", toneClasses[tone].bg, toneClasses[tone].border)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white", toneClasses[tone].progress)}>
                          {message.initials}
                        </div>
                        <h3 className="truncate text-xs font-semibold text-slate-200">{message.sender}</h3>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-500">{message.timestamp}</span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {message.body.map((line) => (
                        <p key={line} className="text-xs leading-relaxed text-slate-400">
                          {line}
                        </p>
                      ))}
                    </div>
                    {message.quote && (
                      <dl className="mt-2 space-y-1 rounded bg-slate-950/55 p-2 font-mono text-[11px]">
                        {message.quote.map(([label, value]) => (
                          <div key={label} className="flex justify-between gap-3">
                            <dt className="text-slate-600">{label}</dt>
                            <dd className="text-slate-300">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </article>
                );
              })}
              <div className="rounded border border-slate-800/70 bg-slate-800/30 p-2 text-center text-[10px] text-slate-600">
                {copy.collapsedMessages}
              </div>
            </div>
          </div>
        </section>

        <section className="min-h-0 border-r border-slate-800 bg-slate-950/65 lg:col-span-4">
          <SectionChrome title={copy.aiAnalysis} meta={copy.aiAnalysisMeta} />
          <div className="h-full overflow-y-auto p-3 pb-14">
            <div className="space-y-3">
              {focusCase.analysis.map((block) => (
                <AnalysisPanel key={block.title} block={block} />
              ))}
              <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xs font-semibold text-amber-300">{copy.approvalGate}</h3>
                  <StatusBadge tone="pending" pulse>
                    {copy.blocked}
                  </StatusBadge>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                  {copy.approvalGateBody}
                </p>
              </section>
            </div>
          </div>
        </section>

        <section className="flex min-h-0 flex-col bg-slate-900/35 lg:col-span-4">
          <SectionChrome title={copy.draftEditor} meta={copy.draftEditorMeta} />
          <div className="shrink-0 border-b border-slate-800 p-3">
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="focus-subject">
              {copy.subject}
            </label>
            <input
              id="focus-subject"
              value={subject}
              onChange={(event) => onSubjectChange(event.target.value)}
              className="mt-1 w-full rounded border border-slate-700 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200 outline-none transition focus:border-emerald-500"
            />
          </div>
          <div className="min-h-0 flex-1 p-3">
            <textarea
              value={draft}
              onChange={(event) => onDraftChange(event.target.value)}
              className="h-full min-h-[320px] w-full resize-none rounded-lg border border-slate-700 bg-slate-950/75 p-3 font-mono text-[11px] leading-relaxed text-slate-300 outline-none transition placeholder:text-slate-600 focus:border-emerald-500"
              spellCheck={false}
            />
          </div>
          <div className="shrink-0 space-y-2 border-t border-slate-800 bg-slate-900/75 p-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onApprove}
                className="rounded bg-emerald-600 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
              >
                {copy.approveSend}
              </button>
              <button
                type="button"
                onClick={onSave}
                className="rounded bg-slate-700 py-2 text-xs font-semibold text-white transition hover:bg-slate-600"
              >
                {copy.saveDraft}
              </button>
              <button
                type="button"
                onClick={onRegenerate}
                className="rounded border border-slate-700 bg-slate-800 py-2 text-xs font-semibold text-slate-300 transition hover:border-blue-500 hover:text-blue-300"
              >
                {copy.regenerate}
              </button>
              <button
                type="button"
                onClick={onReject}
                className="rounded bg-red-600/75 py-2 text-xs font-semibold text-white transition hover:bg-red-500"
              >
                {copy.reject}
              </button>
            </div>
            <p className="rounded border border-amber-500/25 bg-amber-500/5 px-2 py-1.5 text-center text-[10px] text-amber-300">
              {copy.sendGuardrail}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
