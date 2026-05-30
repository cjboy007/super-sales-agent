"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "@/lib/project";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  StatCell,
  TextAreaField,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import { cx } from "@/components/battle-station/theme";

type IntakeMessageRole = "user" | "assistant";

interface IntakeMessage {
  id: string;
  role: IntakeMessageRole;
  content: string;
  createdAt: string;
}

interface IntakeUpload {
  id: string;
  name: string;
  type: string;
  size: number;
  path: string;
  storedAt: string;
}

interface IntakeMatch {
  kind: "lead" | "quotation" | "document";
  title: string;
  detail: string;
  confidence: number;
}

interface IntakeAction {
  id: string;
  label: string;
  target: string;
  status: "ready" | "approval_required" | "needs_review";
}

interface IntakeAnalysis {
  source: "local" | "llm";
  itemType: string;
  destination: string;
  confidence: number;
  relatedParty: string;
  summary: string;
  evidence: string[];
  matches: IntakeMatch[];
  actions: IntakeAction[];
}

interface IntakeRecord {
  id: string;
  project: string;
  status: "draft" | "pending_review";
  createdAt: string;
  updatedAt: string;
  pastedText: string;
  uploads: IntakeUpload[];
  messages: IntakeMessage[];
  analysis: IntakeAnalysis;
}

interface IntakeSessionSummary {
  id: string;
  project: string;
  status: string;
  updatedAt: string;
  itemType: string;
  destination: string;
  confidence: number;
  uploads: number;
  messages: number;
}

const EMPTY_ANALYSIS: IntakeAnalysis = {
  source: "local",
  itemType: "Unclassified",
  destination: "intake/review",
  confidence: 0,
  relatedParty: "Unknown",
  summary: "Waiting for files, pasted text, or your notes.",
  evidence: [],
  matches: [],
  actions: [],
};

const EXAMPLE_PROMPTS = [
  "This is a revised PI from the German client. Match it to the right quote and hold for approval.",
  "This file is a competitor product sheet. Keep it as market intel, not a client record.",
  "This is a customer RFQ. Find the related lead and tell me whether we need a quotation.",
];

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-CA", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function confidenceTone(confidence: number): BattleTone {
  if (confidence >= 75) return "emerald";
  if (confidence >= 55) return "amber";
  if (confidence > 0) return "blue";
  return "neutral";
}

function statusTone(status: IntakeAction["status"]): BattleTone {
  if (status === "ready") return "emerald";
  if (status === "approval_required") return "amber";
  return "blue";
}

function kindTone(kind: IntakeMatch["kind"]): BattleTone {
  if (kind === "lead") return "emerald";
  if (kind === "quotation") return "purple";
  return "blue";
}

function actionLabel(status: IntakeAction["status"]) {
  if (status === "approval_required") return "needs approval";
  if (status === "needs_review") return "needs review";
  return "ready";
}

function pickFiles(fileList: FileList | null) {
  return Array.from(fileList || []).slice(0, 8);
}

export default function IntakePage() {
  const { apiUrl, project } = useProject();
  const language = useBattleLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [record, setRecord] = useState<IntakeRecord | null>(null);
  const [sessions, setSessions] = useState<IntakeSessionSummary[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [queuedReceipt, setQueuedReceipt] = useState("");

  const analysis = record?.analysis || EMPTY_ANALYSIS;
  const messages = record?.messages || [];
  const uploads = record?.uploads || [];

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/intake"));
      const json = await res.json();
      if (json.success) setSessions(json.data || []);
    } catch {
      // Recent intake history is helpful but not required for the workspace to run.
    }
  }, [apiUrl]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, sending]);

  const pendingSize = useMemo(
    () => files.reduce((sum, file) => sum + file.size, 0),
    [files]
  );

  async function submitIntake(nextMessage = message) {
    const trimmedMessage = nextMessage.trim();
    const trimmedText = pastedText.trim();
    if (sending || (!trimmedMessage && !trimmedText && files.length === 0)) return;

    setSending(true);
    setError(null);
    setQueuedReceipt("");

    try {
      const form = new FormData();
      if (record?.id) form.append("sessionId", record.id);
      if (trimmedMessage) form.append("message", trimmedMessage);
      if (trimmedText) form.append("pastedText", trimmedText);
      files.forEach((file) => form.append("files", file));

      const res = await fetch(apiUrl("/api/intake"), {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "SSA intake rejected the item");

      setRecord(json.data);
      setFiles([]);
      setMessage("");
      setPastedText("");
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "SSA intake rejected the item");
    } finally {
      setSending(false);
    }
  }

  async function queueReview() {
    if (!record || queueing) return;
    setQueueing(true);
    setQueuedReceipt("");
    try {
      const res = await fetch(apiUrl("/api/operator-command"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "intake",
          message: `Review intake ${record.id}: ${analysis.itemType} -> ${analysis.destination}`,
          url: "/intake",
          context: {
            intakeId: record.id,
            project: record.project,
            uploads: record.uploads.map((file) => ({ name: file.name, type: file.type, size: file.size })),
            analysis,
            messages: record.messages.slice(-6),
          },
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Review queue rejected the item");
      setQueuedReceipt(json.data?.id || "queued");
    } catch (err) {
      setQueuedReceipt(err instanceof Error ? err.message : "Review queue rejected the item");
    } finally {
      setQueueing(false);
    }
  }

  function startNew() {
    setRecord(null);
    setFiles([]);
    setPastedText("");
    setMessage("");
    setError(null);
    setQueuedReceipt("");
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const dropped = pickFiles(event.dataTransfer.files);
    if (dropped.length) setFiles((current) => [...current, ...dropped].slice(0, 8));
  }

  const contextSummary = [
    `${language === "zh" ? "项目" : "Project"} ${project.name}`,
    `${language === "zh" ? "文件" : "Files"} ${uploads.length + files.length}`,
    `${language === "zh" ? "把握度" : "Confidence"} ${analysis.confidence || 0}%`,
  ].join(" / ");

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Throw Me Anything"
        zhTitle="投递台"
        meta={`DROP FILES, NOTES, RFQS / SSA SORTS FOR REVIEW / ${project.name.toUpperCase()}`}
        zhMeta={`投递文件、备注、询盘 / SSA 整理后待复核 / ${project.name.toUpperCase()}`}
        active="/intake"
      >
        <BattleBadge tone={sending ? "blue" : confidenceTone(analysis.confidence)} pulse={sending}>
          {sending ? <BattleText en="ANALYZING" zh="分析中" /> : analysis.source === "llm" ? <BattleText en="AI ASSISTED" zh="AI 辅助" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={startNew}><BattleText en="New Intake" zh="新建投递" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "内容类型" : "Item Type"} value={analysis.itemType} tone={confidenceTone(analysis.confidence)} />
          <StatCell label={language === "zh" ? "把握度" : "Confidence"} value={`${analysis.confidence || 0}%`} tone={confidenceTone(analysis.confidence)} />
          <StatCell label={language === "zh" ? "匹配结果" : "Matches"} value={analysis.matches.length} tone="purple" />
          <StatCell label={language === "zh" ? "文件" : "Files"} value={uploads.length + files.length} tone="blue" />
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_430px]">
          <div className="space-y-3">
            <BattlePanel
              title={language === "zh" ? "投递区" : "Drop Zone"}
              meta={contextSummary}
              action={<BattleBadge tone={record ? "emerald" : "neutral"}>{record ? <BattleText en="saved" zh="已保存" /> : <BattleText en="new" zh="新建" />}</BattleBadge>}
            >
              <div className="grid gap-3 p-3 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1fr)]">
                <div
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                  className={cx(
                    "flex min-h-56 flex-col justify-between rounded-md border border-dashed bg-slate-950/55 p-4 transition",
                    dragActive ? "border-emerald-400 bg-emerald-500/10" : "border-slate-700"
                  )}
                >
                  <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const selected = pickFiles(event.target.files);
                      if (selected.length) setFiles((current) => [...current, ...selected].slice(0, 8));
                      event.target.value = "";
                    }}
                  />
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      <BattleText en="Drop files here" zh="把文件拖到这里" />
                    </p>
                    <p className="mt-2 text-xs leading-5 text-slate-400">
                      <BattleText
                        en="SSA keeps the originals safe, reads your notes, and suggests where each item belongs."
                        zh="SSA 会安全保留原件，结合你的说明，建议它们应该归到哪里。"
                      />
                    </p>
                  </div>

                  <div className="mt-4 space-y-2">
                    {files.length === 0 && uploads.length === 0 ? (
                      <div className="rounded-md border border-slate-800 bg-slate-900/45 px-3 py-3 font-mono text-[10px] uppercase tracking-wide text-slate-600">
                        <BattleText en="no files selected" zh="还没有选择文件" />
                      </div>
                    ) : (
                      <div className="max-h-40 space-y-2 overflow-y-auto">
                        {uploads.map((file) => (
                          <div key={file.id} className="rounded-md border border-slate-800 bg-slate-900/60 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-xs font-semibold text-slate-200">{file.name}</p>
                              <BattleBadge tone="emerald">saved</BattleBadge>
                            </div>
                            <p className="mt-1 font-mono text-[10px] text-slate-500">{formatSize(file.size)} / {file.type || "file"}</p>
                          </div>
                        ))}
                        {files.map((file, index) => (
                          <div key={`${file.name}-${file.size}-${index}`} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="truncate text-xs font-semibold text-slate-200">{file.name}</p>
                              <button
                                type="button"
                                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                                className="font-mono text-[10px] uppercase text-amber-300 hover:text-amber-100"
                              >
                                remove
                              </button>
                            </div>
                            <p className="mt-1 font-mono text-[10px] text-slate-500">{formatSize(file.size)} / pending</p>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-mono text-[10px] text-slate-500">
                        <BattleText en="waiting" zh="待保存" /> {files.length} / {formatSize(pendingSize)}
                      </p>
                      <CommandButton variant="secondary" onClick={() => inputRef.current?.click()}>
                        <BattleText en="Choose Files" zh="选择文件" />
                      </CommandButton>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-56 flex-col gap-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        <BattleText en="Paste Text Or Notes" zh="粘贴文字或备注" />
                      </label>
                      <span className="font-mono text-[10px] text-slate-600">{pastedText.length} <BattleText en="chars" zh="字" /></span>
                    </div>
                    <TextAreaField
                      value={pastedText}
                      onChange={(event) => setPastedText(event.target.value)}
                      placeholder={language === "zh" ? "粘贴邮件正文、询盘、产品备注，或任何帮助 SSA 判断归属的信息" : "Paste an email body, RFQ text, product note, or anything that helps SSA classify the item"}
                      className="min-h-32 w-full resize-none"
                    />
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    {EXAMPLE_PROMPTS.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => setMessage(prompt)}
                        className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-left text-[11px] leading-4 text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </BattlePanel>

            <BattlePanel
              title={language === "zh" ? "说明给 Jaden" : "Notes for Jaden"}
              meta={language === "zh" ? "告诉 Jaden 这是什么、该怎么处理" : "tell Jaden what this is and what to check"}
              action={<BattleBadge tone={messages.length ? "emerald" : "neutral"}>{messages.length} <BattleText en="notes" zh="条" /></BattleBadge>}
            >
              <div className="flex h-[460px] flex-col">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                  {messages.length === 0 ? (
                    <EmptyState label={language === "zh" ? "描述这是什么，然后交给 Jaden 分析" : "describe what this is, then ask Jaden to review it"} />
                  ) : (
                    messages.map((chat) => (
                      <div
                        key={chat.id}
                        className={cx(
                          "max-w-[88%] rounded-md border px-3 py-2",
                          chat.role === "user"
                            ? "ml-auto border-emerald-500/30 bg-emerald-500/10"
                            : "border-slate-800 bg-slate-950/75"
                        )}
                      >
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <p className="font-mono text-[10px] uppercase tracking-wide text-slate-500">
                            {chat.role === "user" ? "Operator" : "Jaden"}
                          </p>
                          <p className="font-mono text-[10px] text-slate-600">{formatTime(chat.createdAt)}</p>
                        </div>
                        <p className="whitespace-pre-wrap text-xs leading-5 text-slate-300">{chat.content}</p>
                      </div>
                    ))
                  )}
                  {sending && (
                    <div className="max-w-[88%] rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2">
                      <p className="font-mono text-[10px] uppercase tracking-wide text-blue-300">Jaden</p>
                      <p className="mt-1 text-xs text-slate-300">
                        <BattleText en="Reviewing your notes and saving the item..." zh="正在阅读你的说明并保存这条投递..." />
                      </p>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                <div className="border-t border-slate-800 bg-slate-900/75 p-3">
                  <TextAreaField
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        submitIntake();
                      }
                    }}
                    placeholder={language === "zh" ? "告诉 Jaden 这是什么、你认为它属于哪里、或要核对哪个客户关系" : "Tell Jaden what this is, where you think it belongs, or what relationship to check"}
                    className="min-h-20 w-full resize-none"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="truncate font-mono text-[10px] text-slate-500">
                      <BattleText en="Files and changes stay inside SSA until you approve an action." zh="你批准动作前，文件和变更只保存在 SSA 内。" />
                    </p>
                    <CommandButton
                      variant="primary"
                      disabled={sending || (!message.trim() && !pastedText.trim() && files.length === 0)}
                      onClick={() => submitIntake()}
                    >
                      {sending ? <BattleText en="Analyzing" zh="分析中" /> : <BattleText en="Ask Jaden" zh="交给 Jaden" />}
                    </CommandButton>
                  </div>
                </div>
              </div>
            </BattlePanel>
          </div>

          <div className="space-y-3">
            <BattlePanel
              title={language === "zh" ? "判断结果" : "Decision Panel"}
              meta={record ? (language === "zh" ? "已保存的投递" : "saved intake") : (language === "zh" ? "暂无投递" : "no active intake")}
              action={<BattleBadge tone={confidenceTone(analysis.confidence)}>{analysis.confidence || 0}%</BattleBadge>}
            >
              <div className="space-y-3 p-3">
                <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{analysis.itemType}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{analysis.destination}</p>
                    </div>
                    <BattleBadge tone={analysis.source === "llm" ? "purple" : "blue"}>{analysis.source}</BattleBadge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{analysis.summary}</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Related Company" zh="相关公司" /></p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-200">{analysis.relatedParty}</p>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Updated" zh="更新时间" /></p>
                    <p className="mt-1 font-mono text-xs text-slate-300">{formatTime(record?.updatedAt)}</p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Why SSA Thinks This" zh="判断依据" /></p>
                  {analysis.evidence.length === 0 ? (
                    <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[10px] text-slate-600">
                      <BattleText en="waiting for more information" zh="等待更多信息" />
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {analysis.evidence.map((item) => (
                        <div key={item} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                          {item}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Suggested Actions" zh="建议动作" /></p>
                    <CommandButton variant="ghost" disabled={!record || queueing} onClick={queueReview}>
                      {queueing ? <BattleText en="Saving" zh="保存中" /> : <BattleText en="Send for Review" zh="提交复核" />}
                    </CommandButton>
                  </div>
                  {analysis.actions.length === 0 ? (
                    <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3 text-center font-mono text-[10px] text-slate-600">
                      <BattleText en="no action proposed" zh="暂无建议动作" />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {analysis.actions.map((action) => (
                        <div key={action.id} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-semibold text-slate-200">{action.label}</p>
                            <BattleBadge tone={statusTone(action.status)}>{actionLabel(action.status)}</BattleBadge>
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{action.target}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 truncate font-mono text-[10px] text-slate-500">
                    {queuedReceipt || (language === "zh" ? "不会移动文件，只保存复核请求。" : "No files are moved. This only saves a review request.")}
                  </p>
                </div>
              </div>
            </BattlePanel>

            <BattlePanel title={language === "zh" ? "匹配结果" : "Matches Found"} meta={language === "zh" ? "客户、报价、单证" : "clients, quotes, documents"}>
              {analysis.matches.length === 0 ? (
                <EmptyState label={language === "zh" ? "还没有找到匹配结果" : "no match found yet"} />
              ) : (
                <div className="max-h-[360px] divide-y divide-slate-800 overflow-y-auto">
                  {analysis.matches.map((match, index) => (
                    <div key={`${match.kind}-${match.title}-${match.detail}-${index}`} className="px-3 py-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-100">{match.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-400">{match.detail}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <BattleBadge tone={kindTone(match.kind)}>{match.kind}</BattleBadge>
                          <span className="font-mono text-[10px] text-slate-500">{match.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </BattlePanel>

            <BattlePanel title={language === "zh" ? "最近投递" : "Recent Items"} meta={language === "zh" ? "最近保存的内容" : "recent saved items"}>
              {sessions.length === 0 ? (
                <EmptyState label={language === "zh" ? "暂无最近投递" : "no recent items"} />
              ) : (
                <div className="max-h-[280px] divide-y divide-slate-800 overflow-y-auto">
                  {sessions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setMessage(`Re-open and continue intake ${item.id}.`)}
                      className="block w-full px-3 py-2 text-left transition hover:bg-slate-800/35"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-slate-200">{item.itemType}</p>
                        <BattleBadge tone={confidenceTone(item.confidence)}>{item.confidence}%</BattleBadge>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-slate-500">
                        {item.id} / {item.destination} / {formatTime(item.updatedAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </BattlePanel>
          </div>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
