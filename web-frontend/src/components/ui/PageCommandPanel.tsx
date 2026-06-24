"use client";

import { useState } from "react";
import { useProject } from "@/lib/project";
import JadenTaskDrawer from "@/components/battle-station/JadenTaskDrawer";
import { BattleBadge, BattlePanel, BattleText, CommandButton, TextAreaField } from "./BattlePage";
import { useTheme } from "./ThemeProvider";

interface PageCommandPanelProps {
  page: string;
  summary: string;
  context: Record<string, unknown>;
  surface?: string;
  mode?: string;
  target?: {
    type: string;
    id?: string;
    label?: string;
  };
  placeholder?: string;
  zhPlaceholder?: string;
}

export default function PageCommandPanel({
  page,
  summary,
  context,
  surface = page,
  mode = "page_assist",
  target = { type: "none" },
  placeholder = "Tell Jaden what to inspect, draft, verify, or prepare from this page",
  zhPlaceholder = "告诉 Jaden 要检查、整理、起草或准备什么",
}: PageCommandPanelProps) {
  const { apiFetch } = useProject();
  const { language } = useTheme();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "queued" | "error">("idle");
  const [receipt, setReceipt] = useState("");
  const [commandThreadId, setCommandThreadId] = useState<string | undefined>();
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed || status === "sending") return;
    setStatus("sending");
    setReceipt("");
    setTaskDrawerOpen(false);
    try {
      const res = await apiFetch("/api/operator-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page,
          surface: surface,
          mode: mode,
          message: trimmed,
          target: target,
          context,
          url: window.location.pathname,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Command rejected");
      setStatus("queued");
      const queuedTasks = Number(json.data?.queuedTasks || 0);
      setCommandThreadId(typeof json.data?.commandThreadId === "string" ? json.data.commandThreadId : undefined);
      setReceipt(
        language === "zh"
          ? queuedTasks > 0
            ? `已保存待复核，Jaden 会准备 ${queuedTasks} 项后续任务。`
            : "已保存待复核。"
          : queuedTasks > 0
            ? `Saved for review. Jaden will prepare ${queuedTasks} next-step task${queuedTasks === 1 ? "" : "s"}.`
            : "Saved for review."
      );
      setMessage("");
    } catch (err) {
      setStatus("error");
      setReceipt(err instanceof Error ? err.message : "Command rejected");
    }
  }

  return (
    <>
      <BattlePanel
        title={language === "zh" ? "让 Jaden 帮我看" : "Ask Jaden About This Page"}
        meta={language === "zh" ? "会带上本页筛选和当前数据，不会外发" : "uses the current filters and visible data; no external send"}
        action={
          <BattleBadge tone={status === "error" ? "red" : status === "sending" ? "blue" : status === "queued" ? "emerald" : "neutral"} pulse={status === "sending"}>
            {status === "sending" ? <BattleText en="asking" zh="发送中" /> : status === "queued" ? <BattleText en="saved" zh="已保存" /> : status === "error" ? <BattleText en="error" zh="错误" /> : <BattleText en="ready" zh="就绪" />}
          </BattleBadge>
        }
      >
        <div className="space-y-3 p-3">
          <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">
              <BattleText en="What Jaden can see" zh="Jaden 会参考这些内容" />
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              <BattleText
                en="Your note is saved with this page's current filters, visible records, and totals so Jaden knows what you are looking at."
                zh="你发出的说明会和本页当前筛选、可见记录、统计数字一起保存，Jaden 就知道你正在看什么。"
              />
            </p>
            <p className="mt-2 font-mono text-[10px] leading-4 text-slate-500">{summary}</p>
          </div>
          <TextAreaField
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit();
            }}
            placeholder={language === "zh" ? zhPlaceholder : placeholder}
            className="min-h-24 w-full resize-none"
          />
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 flex-1 truncate text-[10px] text-slate-500">
              {receipt || (
                <BattleText
                  en="Nothing is sent to customers. This is saved for review in the workspace."
                  zh="不会发给客户，只会保存到工作台内等待复核。"
                />
              )}
            </p>
            {commandThreadId && (
              <CommandButton variant="ghost" onClick={() => setTaskDrawerOpen(true)}>
                {language === "zh" ? "查看任务" : "View task"}
              </CommandButton>
            )}
            <CommandButton variant="primary" disabled={!message.trim() || status === "sending"} onClick={submit}>
              <BattleText en="Ask Jaden" zh="提交给 Jaden" />
            </CommandButton>
          </div>
        </div>
      </BattlePanel>
      <JadenTaskDrawer
        open={taskDrawerOpen}
        threadId={commandThreadId}
        onClose={() => setTaskDrawerOpen(false)}
      />
    </>
  );
}
