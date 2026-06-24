"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useProject } from "@/lib/project";
import JadenTaskDrawer from "@/components/battle-station/JadenTaskDrawer";
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

interface IntakeSynthesisResult {
  intakeId: string;
  synthesisId: string;
  title: string;
  fileName: string;
  downloadUrl: string;
  filesRead: number;
  filesSkipped: number;
  warnings: string[];
  source: "local" | "llm";
  summary: string;
  includedFiles: Array<{
    name: string;
    type: string;
    size: number;
    chars: number;
    method: string;
  }>;
}

const EMPTY_ANALYSIS: IntakeAnalysis = {
  source: "local",
  itemType: "Unclassified",
  destination: "intake/review",
  confidence: 0,
  relatedParty: "Unknown",
  summary: "Waiting for files or your notes.",
  evidence: [],
  matches: [],
  actions: [],
};

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

function localizedItemType(itemType: string, language: "en" | "zh") {
  if (language !== "zh") return itemType;
  const labels: Record<string, string> = {
    "Commercial Invoice": "商业发票",
    "Packing List": "装箱单",
    "Proforma Invoice": "形式发票",
    Quotation: "报价单",
    "Sample Request": "样品申请",
    "Payment Proof": "付款凭证",
    "Product Spec": "产品资料",
    "Lead List": "线索名单",
    "Customer Conversation": "客户沟通记录",
    Unclassified: "未分类",
  };
  return labels[itemType] || itemType;
}

function localizedDestination(destination: string, language: "en" | "zh") {
  if (language !== "zh") return destination;
  const labels: Record<string, string> = {
    "documents/trade-docs": "贸易单证",
    quotations: "报价",
    documents: "单证",
    "documents/payments": "付款单证",
    "documents/product-specs": "产品资料",
    "leads/imports": "线索导入",
    "mail/context": "客户沟通记录",
    "intake/review": "待确认",
  };
  return labels[destination] || destination;
}

function localizedRelatedParty(relatedParty: string, language: "en" | "zh") {
  if (language !== "zh") return relatedParty;
  return relatedParty === "Unknown" ? "未识别" : relatedParty;
}

function localizedSummary(analysis: IntakeAnalysis, language: "en" | "zh") {
  if (language !== "zh") return analysis.summary;
  if (
    analysis.summary === EMPTY_ANALYSIS.summary ||
    analysis.summary === "Waiting for upload, pasted text, or operator context." ||
    analysis.summary === "Waiting for files, pasted text, or your notes."
  ) {
    return "等待文件或说明。";
  }
  if (analysis.itemType === "Unclassified") {
    return "Jaden 已能保存这条投递，但还需要复核后才能判断归属。";
  }
  return `Jaden 判断这是${localizedItemType(analysis.itemType, language)}，复核通过后建议归入${localizedDestination(analysis.destination, language)}。`;
}

function localizedSource(source: IntakeAnalysis["source"], language: "en" | "zh") {
  if (language !== "zh") return source;
  return source === "llm" ? "AI 辅助" : "本地判断";
}

function localizedEvidence(item: string, language: "en" | "zh") {
  if (language !== "zh") return item;
  const uploadMatch = item.match(/^(\d+) uploaded file\(s\)$/);
  if (uploadMatch) return `${uploadMatch[1]} 个已上传文件`;
  if (item === "operator context supplied in chat" || item === "notes supplied in chat") return "已提供给 Jaden 的说明";
  if (item.startsWith("type signal: ")) return `内容类型信号：${localizedItemType(item.replace("type signal: ", ""), language)}`;
  if (item.startsWith("strongest local match: ")) return `最强本地匹配：${item.replace("strongest local match: ", "")}`;
  return item;
}

function localizedActionStatus(status: IntakeAction["status"], language: "en" | "zh") {
  if (language !== "zh") return actionLabel(status);
  if (status === "approval_required") return "需要确认";
  if (status === "needs_review") return "需要复核";
  return "可执行";
}

function localizedMatchKind(kind: IntakeMatch["kind"], language: "en" | "zh") {
  if (language !== "zh") return kind;
  if (kind === "lead") return "线索";
  if (kind === "quotation") return "报价";
  return "单证";
}

function localizedActionLabel(action: IntakeAction, language: "en" | "zh") {
  if (language !== "zh") return action.label;
  if (action.id === "archive-original") return "保留原始文件";
  if (action.id === "link-context") {
    return action.label === "Hold for client matching"
      ? "等待客户匹配"
      : `关联到 ${action.label.replace(/^Link context to /, "")}`;
  }
  if (action.id === "place-file") return `建议归入 ${localizedDestination(action.target.split("/").slice(-2).join("/"), language)}`;
  return action.label;
}

function localizedActionTarget(action: IntakeAction, language: "en" | "zh") {
  const destination = action.target.split("/").slice(-2).join("/");
  if (language !== "zh") return localizedDestination(destination, language);
  if (action.target === "manual review queue" || action.target === "review workspace") return "待确认事项";
  if (action.target === "local client context") return "本地客户资料";
  return localizedDestination(destination, language);
}

function pickFiles(fileList: FileList | null) {
  return Array.from(fileList || []).slice(0, 8);
}

export default function IntakePage() {
  const { apiFetch, project } = useProject();
  const language = useBattleLanguage();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const [record, setRecord] = useState<IntakeRecord | null>(null);
  const [sessions, setSessions] = useState<IntakeSessionSummary[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [sending, setSending] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [synthesis, setSynthesis] = useState<IntakeSynthesisResult | null>(null);
  const [synthesisReceipt, setSynthesisReceipt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [queuedReceipt, setQueuedReceipt] = useState("");
  const [commandThreadId, setCommandThreadId] = useState<string | undefined>();
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false);

  const analysis = record?.analysis || EMPTY_ANALYSIS;
  const messages = record?.messages || [];
  const uploads = record?.uploads || [];

  const loadSessions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/intake");
      const json = await res.json();
      if (json.success) setSessions(json.data || []);
    } catch {
      // Recent intake history is helpful but not required for the workspace to run.
    }
  }, [apiFetch]);

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
    if (sending || (!trimmedMessage && files.length === 0)) return;

    setSending(true);
    setError(null);
    setQueuedReceipt("");

    try {
      const form = new FormData();
      if (record?.id) form.append("sessionId", record.id);
      if (trimmedMessage) form.append("message", trimmedMessage);
      files.forEach((file) => form.append("files", file));

      const res = await apiFetch("/api/intake", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "SSA intake rejected the item");

      setRecord(json.data);
      setFiles([]);
      setMessage("");
      setSynthesis(null);
      setSynthesisReceipt("");
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
    setTaskDrawerOpen(false);
    try {
      const res = await apiFetch("/api/operator-command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          page: "intake",
          surface: "intake",
          mode: "file_intake",
          message: `Review intake ${record.id}: ${analysis.itemType} -> ${analysis.destination}`,
          url: "/intake",
          target: {
            type: "file",
            id: record.id,
            label: analysis.relatedParty !== "Unknown" ? analysis.relatedParty : analysis.itemType,
          },
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
      const queuedTasks = Number(json.data?.queuedTasks || 0);
      setCommandThreadId(typeof json.data?.commandThreadId === "string" ? json.data.commandThreadId : undefined);
      setQueuedReceipt(
        language === "zh"
          ? queuedTasks > 0
            ? `已保存待复核，Jaden 会准备 ${queuedTasks} 项后续任务。`
            : "已保存待复核。"
          : queuedTasks > 0
            ? `Saved for review. Jaden will prepare ${queuedTasks} next-step task${queuedTasks === 1 ? "" : "s"}.`
            : "Saved for review."
      );
    } catch (err) {
      setQueuedReceipt(err instanceof Error ? err.message : "The review workspace could not accept this item.");
    } finally {
      setQueueing(false);
    }
  }

  async function synthesizeRecord() {
    if (!record || synthesizing) return;
    setSynthesizing(true);
    setSynthesisReceipt("");
    try {
      const instruction = message.trim() || "Create a concise synthesis from this intake.";
      const res = await apiFetch(`/api/intake/${encodeURIComponent(record.id)}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Synthesis failed");
      const result = json.data as IntakeSynthesisResult;
      setSynthesis(result);
      setSynthesisReceipt(
        language === "zh"
          ? `已生成归纳，读取 ${result.filesRead} 个文件。`
          : `Synthesis generated from ${result.filesRead} file${result.filesRead === 1 ? "" : "s"}.`
      );
    } catch (err) {
      setSynthesisReceipt(err instanceof Error ? err.message : "Synthesis failed");
    } finally {
      setSynthesizing(false);
    }
  }

  function startNew() {
    setRecord(null);
    setFiles([]);
    setMessage("");
    setError(null);
    setQueuedReceipt("");
    setSynthesis(null);
    setSynthesisReceipt("");
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
  ].join(" / ");
  const displayItemType = localizedItemType(analysis.itemType, language);
  const displayDestination = localizedDestination(analysis.destination, language);

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Data Import"
        zhTitle="资料导入"
        meta={`FILES, NOTES, RFQS / SSA SORTS FOR REVIEW / ${project.name.toUpperCase()}`}
        zhMeta={`文件、备注、询盘 / SSA 整理后待复核 / ${project.name.toUpperCase()}`}
        active="/intake"
      >
        <BattleBadge tone={sending ? "blue" : confidenceTone(analysis.confidence)} pulse={sending}>
          {sending ? <BattleText en="ANALYZING" zh="分析中" /> : analysis.source === "llm" ? <BattleText en="AI ASSISTED" zh="AI 辅助" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={startNew}><BattleText en="New Import" zh="新建导入" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_430px]">
          <BattlePanel
            title={language === "zh" ? "资料区" : "Import Area"}
            meta={contextSummary}
            action={<BattleBadge tone={record ? "emerald" : "neutral"}>{record ? <BattleText en="saved" zh="已保存" /> : <BattleText en="new" zh="新建" />}</BattleBadge>}
          >
            <div className="p-3">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                className={cx(
                  "flex min-h-[304px] flex-col justify-between rounded-md border border-dashed bg-slate-950/55 p-4 transition",
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
                            <BattleBadge tone="emerald"><BattleText en="saved" zh="已保存" /></BattleBadge>
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
                              <BattleText en="remove" zh="移除" />
                            </button>
                          </div>
                          <p className="mt-1 font-mono text-[10px] text-slate-500">{formatSize(file.size)} / <BattleText en="pending" zh="待保存" /></p>
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
            </div>
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "说明给 Jaden" : "Notes for Jaden"}
            meta={language === "zh" ? "告诉 Jaden 这是什么、该怎么处理" : "tell Jaden what this is and what to check"}
            action={<BattleBadge tone={messages.length ? "emerald" : "neutral"}>{messages.length} <BattleText en="notes" zh="条" /></BattleBadge>}
          >
            <div className="flex min-h-[352px] flex-col">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                {messages.length === 0 ? (
                  <EmptyState label={language === "zh" ? "写一句说明，然后交给 Jaden 分析" : "write one instruction, then ask Jaden to review it"} />
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
                          {chat.role === "user" ? <BattleText en="You" zh="你" /> : "Jaden"}
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
                      <BattleText en="Reviewing your instruction and saving the item..." zh="正在阅读你的说明并保存这条资料..." />
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
                  placeholder={language === "zh" ? "例如：这是德国客户的新 PI，匹配到正确报价，先不要移动文件。" : "Example: This is a revised PI from the German client. Match it to the right quote and hold for review."}
                  className="min-h-24 w-full resize-none"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="truncate font-mono text-[10px] text-slate-500">
                    <BattleText en="Files and changes stay inside SSA until you confirm an action." zh="你确认动作前，文件和变更只保存在 SSA 内。" />
                  </p>
                  <CommandButton
                    variant="primary"
                    disabled={sending || (!message.trim() && files.length === 0)}
                    onClick={() => submitIntake()}
                  >
                    {sending ? <BattleText en="Analyzing" zh="分析中" /> : <BattleText en="Ask Jaden" zh="交给 Jaden" />}
                  </CommandButton>
                </div>
              </div>
            </div>
          </BattlePanel>
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_430px]">
          <BattlePanel
            title={language === "zh" ? "判断结果" : "Decision Panel"}
            meta={record ? (language === "zh" ? "已保存的投递" : "saved intake") : (language === "zh" ? "暂无投递" : "no active intake")}
            action={<BattleBadge tone={confidenceTone(analysis.confidence)}>{analysis.confidence || 0}%</BattleBadge>}
          >
              <div className="space-y-3 p-3">
                <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100">{displayItemType}</p>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{displayDestination}</p>
                    </div>
                    <BattleBadge tone={analysis.source === "llm" ? "purple" : "blue"}>{localizedSource(analysis.source, language)}</BattleBadge>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-slate-400">{localizedSummary(analysis, language)}</p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <StatCell label={language === "zh" ? "内容类型" : "Item Type"} value={displayItemType} tone={confidenceTone(analysis.confidence)} />
                  <StatCell label={language === "zh" ? "把握度" : "Confidence"} value={`${analysis.confidence || 0}%`} tone={confidenceTone(analysis.confidence)} />
                  <StatCell label={language === "zh" ? "匹配结果" : "Matches"} value={analysis.matches.length} tone="purple" />
                  <StatCell label={language === "zh" ? "文件" : "Files"} value={uploads.length + files.length} tone="blue" />
                  <StatCell label={language === "zh" ? "相关公司" : "Related Company"} value={localizedRelatedParty(analysis.relatedParty, language)} tone="neutral" />
                  <StatCell label={language === "zh" ? "更新时间" : "Updated"} value={formatTime(record?.updatedAt)} tone="neutral" />
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
                          {localizedEvidence(item, language)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500"><BattleText en="Suggested Actions" zh="建议动作" /></p>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <CommandButton variant="ghost" disabled={!record || synthesizing} onClick={synthesizeRecord}>
                        {synthesizing ? <BattleText en="Synthesizing" zh="归纳中" /> : <BattleText en="Synthesize" zh="生成归纳" />}
                      </CommandButton>
                      <CommandButton variant="ghost" disabled={!record || queueing} onClick={queueReview}>
                        {queueing ? <BattleText en="Saving" zh="保存中" /> : <BattleText en="Send for Review" zh="提交复核" />}
                      </CommandButton>
                      {commandThreadId && (
                        <CommandButton variant="ghost" onClick={() => setTaskDrawerOpen(true)}>
                          {language === "zh" ? "查看任务" : "View task"}
                        </CommandButton>
                      )}
                    </div>
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
                            <p className="text-xs font-semibold text-slate-200">{localizedActionLabel(action, language)}</p>
                            <BattleBadge tone={statusTone(action.status)}>{localizedActionStatus(action.status, language)}</BattleBadge>
                          </div>
                          <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{localizedActionTarget(action, language)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {synthesis && (
                    <div className="mt-3 rounded-md border border-blue-500/25 bg-blue-500/10 px-3 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-100">{synthesis.fileName}</p>
                          <p className="mt-1 font-mono text-[10px] uppercase text-blue-300">
                            {synthesis.filesRead} <BattleText en="read" zh="已读取" /> / {synthesis.filesSkipped} <BattleText en="skipped" zh="跳过" /> / {synthesis.source}
                          </p>
                        </div>
                        <a
                          href={synthesis.downloadUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded border border-blue-500/30 px-2 py-1 text-[11px] font-semibold text-blue-200 transition hover:border-blue-300 hover:text-white"
                        >
                          <BattleText en="Open" zh="打开" />
                        </a>
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-300">{synthesis.summary}</p>
                      {synthesis.warnings.length > 0 && (
                        <p className="mt-2 truncate font-mono text-[10px] text-amber-300">
                          {synthesis.warnings.length} <BattleText en="warning(s)" zh="条提醒" />
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mt-2 truncate font-mono text-[10px] text-slate-500">
                    {synthesisReceipt || queuedReceipt || (language === "zh" ? "不会移动文件，只保存复核请求。" : "No files are moved. This only saves a review request.")}
                  </p>
                </div>
              </div>
          </BattlePanel>

          <div className="space-y-3">
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
                          <BattleBadge tone={kindTone(match.kind)}>{localizedMatchKind(match.kind, language)}</BattleBadge>
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
                        <p className="truncate text-xs font-semibold text-slate-200">{localizedItemType(item.itemType, language)}</p>
                        <BattleBadge tone={confidenceTone(item.confidence)}>{item.confidence}%</BattleBadge>
                      </div>
                      <p className="mt-1 truncate font-mono text-[10px] text-slate-500">
                        {item.id} / {localizedDestination(item.destination, language)} / {formatTime(item.updatedAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </BattlePanel>
          </div>
        </div>
      </BattlePageBody>
      <JadenTaskDrawer
        open={taskDrawerOpen}
        threadId={commandThreadId}
        onClose={() => setTaskDrawerOpen(false)}
      />
    </BattlePageShell>
  );
}
