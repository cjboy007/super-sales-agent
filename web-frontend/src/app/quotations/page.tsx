"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  EmptyState,
  InputField,
  SelectField,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";

interface Quotation {
  id: string;
  type: "QT" | "PI" | "SPL";
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Confirmed" | "Expired";
  date: string;
  filePath: string;
  fileName?: string;
  fileType: string;
  mainProducts?: string;
  files?: QuotationFileLink[];
}

interface QuotationFileLink {
  format: "pdf" | "excel";
  path: string;
  fileName: string;
  fileType: string;
}

interface QuotationStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  totalAmount: string;
}

type TypeFilter = "All" | Quotation["type"];
type StatusFilter = "All" | "Draft" | "Sent" | "Confirmed" | "Expired";
type OpenState = "idle" | "opening" | "opened" | "error";

const PAGE_SIZE = 20;

function statusTone(status: Quotation["status"]): BattleTone {
  if (status === "Confirmed") return "emerald";
  if (status === "Sent") return "blue";
  if (status === "Expired") return "red";
  return "amber";
}

function statusLabel(status: StatusFilter | Quotation["status"], language: "en" | "zh") {
  if (language !== "zh") return status;
  const labels: Record<string, string> = {
    All: "全部",
    Draft: "草稿",
    Sent: "已发送",
    Confirmed: "已确认",
    Expired: "已过期",
  };
  return labels[status] || status;
}

function typeLabel(type: TypeFilter | Quotation["type"], language: "en" | "zh") {
  const labels: Record<TypeFilter, { en: string; zh: string }> = {
    All: { en: "All", zh: "全部" },
    QT: { en: "Quotation", zh: "报价" },
    SPL: { en: "Sample Order", zh: "样品单" },
    PI: { en: "Bulk PI", zh: "大货 PI" },
  };
  return labels[type]?.[language] || type;
}

function fileLabel(file: Pick<QuotationFileLink, "fileName" | "path" | "fileType">): string {
  return file.fileName || file.path.split(/[\\/]/).pop() || file.fileType || "-";
}

function fileFormatLabel(format: QuotationFileLink["format"], language: "en" | "zh") {
  if (format === "pdf") return "PDF";
  return language === "zh" ? "Excel" : "Excel";
}

export default function QuotationsPage() {
  const language = useBattleLanguage();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<QuotationStats>({ total: 0, byType: {}, byStatus: {}, totalAmount: "—" });
  const [search, setSearch] = useState("");
  const [type, setType] = useState<TypeFilter>("All");
  const [status, setStatus] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [openStateByPath, setOpenStateByPath] = useState<Record<string, OpenState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        search,
        type,
        status,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/quotations?${params.toString()}`),
        fetch("/api/quotations?action=stats"),
      ]);
      const [listJson, statsJson] = await Promise.all([listRes.json(), statsRes.json()]);
      if (!listRes.ok || listJson.error) throw new Error(listJson.error || "Failed to load quotations");
      const quoteRows = Array.isArray(listJson.data) ? listJson.data : listJson.quotations;
      setQuotations(quoteRows || []);
      setTotalPages(listJson.totalPages || 1);
      if (statsJson.success) setStats(statsJson.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load quotations");
    } finally {
      setLoading(false);
    }
  }, [page, search, status, type]);

  useEffect(() => {
    load();
  }, [load]);

  async function openQuoteFile(path: string) {
    setOpenStateByPath((current) => ({ ...current, [path]: "opening" }));
    try {
      const res = await fetch("/api/files/open?project=farreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Open failed");
      setOpenStateByPath((current) => ({ ...current, [path]: "opened" }));
      window.setTimeout(() => {
        setOpenStateByPath((current) => ({ ...current, [path]: "idle" }));
      }, 1800);
    } catch (err) {
      setOpenStateByPath((current) => ({ ...current, [path]: "error" }));
      setMessage(err instanceof Error ? err.message : "Open failed");
    }
  }

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Quotation Control"
        zhTitle="报价控制台"
        meta="QUOTE FILES / STATUS REVIEW / FILES ONLY"
        zhMeta="报价文件 / 状态复核 / 只生成文件"
        active="/quotations"
      >
        <BattleBadge tone={loading ? "blue" : "emerald"} pulse={loading}>
          {loading ? <BattleText en="SCAN" zh="扫描" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={() => load()}><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "全部报价" : "Total Quotes"} value={stats.total} tone="emerald" />
          <StatCell label={language === "zh" ? "草稿" : "Drafts"} value={stats.byStatus?.Draft || 0} tone="amber" />
          <StatCell label={language === "zh" ? "已发送" : "Sent"} value={stats.byStatus?.Sent || 0} tone="blue" />
          <StatCell label={language === "zh" ? "已确认" : "Confirmed"} value={stats.byStatus?.Confirmed || 0} tone="purple" />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <BattlePanel
            title={language === "zh" ? "报价清单" : "Quote List"}
            meta={language === "zh" ? `第 ${page} 页 / 共 ${totalPages} 页` : `PAGE ${page} / ${totalPages}`}
            action={
              <div className="flex items-center gap-2">
                <InputField value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={language === "zh" ? "搜索客户或编号" : "Search customer or number"} className="w-52" />
                <SelectField value={type} onChange={(event) => { setType(event.target.value as TypeFilter); setPage(1); }}>
                  {(["All", "QT", "SPL", "PI"] as const).map((item) => (
                    <option key={item} value={item}>{typeLabel(item, language)}</option>
                  ))}
                </SelectField>
                <SelectField value={status} onChange={(event) => { setStatus(event.target.value as StatusFilter); setPage(1); }}>
                  {(["All", "Draft", "Sent", "Confirmed", "Expired"] as const).map((item) => (
                    <option key={item} value={item}>{statusLabel(item, language)}</option>
                  ))}
                </SelectField>
              </div>
            }
          >
            {error ? (
              <EmptyState label={error} />
            ) : quotations.length === 0 ? (
              <EmptyState label={language === "zh" ? (loading ? "正在读取报价" : "没有匹配报价") : (loading ? "loading quotes" : "no matching quotes")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{language === "zh" ? "报价编号" : "Quote ID"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "文件" : "File"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "报价类型" : "Quote Type"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "客户" : "Customer"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "主要产品" : "Main Products"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "金额" : "Amount"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "状态" : "Status"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "日期" : "Date"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {quotations.map((quote) => (
                      <tr key={`${quote.id}-${quote.filePath}`} className="hover:bg-slate-800/35">
                        <td className="px-3 py-2 font-mono text-slate-300">{quote.id}</td>
                        <td className="min-w-[240px] max-w-[320px] px-3 py-2">
                          <div className="space-y-1.5">
                            {(quote.files || []).length > 0 ? quote.files!.map((file) => (
                              <div key={file.path} className="flex items-center justify-between gap-2 rounded border border-slate-800 bg-slate-950/55 px-2 py-1.5">
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-[11px] text-slate-200" title={file.path}>
                                    {fileLabel(file)}
                                  </p>
                                  <p className="font-mono text-[10px] uppercase text-slate-500">
                                    {fileFormatLabel(file.format, language)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => openQuoteFile(file.path)}
                                  disabled={openStateByPath[file.path] === "opening"}
                                  className="shrink-0 rounded border border-slate-700 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
                                >
                                  {openStateByPath[file.path] === "opening"
                                    ? language === "zh" ? "打开中" : "Opening"
                                    : openStateByPath[file.path] === "opened"
                                      ? language === "zh" ? "已打开" : "Opened"
                                      : language === "zh" ? "打开" : "Open"}
                                </button>
                              </div>
                            )) : (
                              <p className="font-mono text-[10px] uppercase text-slate-500">
                                {language === "zh" ? "没有 PDF / Excel" : "No PDF / Excel"}
                              </p>
                            )}
                            <p className="mt-1 line-clamp-2 text-[10px] text-slate-400 md:hidden">
                              {quote.mainProducts || "—"}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-2"><BattleBadge tone="purple">{typeLabel(quote.type, language)}</BattleBadge></td>
                        <td className="px-3 py-2 text-slate-200">{quote.customer}</td>
                        <td className="max-w-[260px] px-3 py-2 text-slate-300">
                          <span className="line-clamp-2" title={quote.mainProducts || undefined}>
                            {quote.mainProducts || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-300">{quote.amount}</td>
                        <td className="px-3 py-2"><BattleBadge tone={statusTone(quote.status)}>{statusLabel(quote.status, language)}</BattleBadge></td>
                        <td className="px-3 py-2 font-mono text-slate-500">{quote.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </BattlePanel>

          <BattlePanel
            title={language === "zh" ? "快速报价" : "Quick Quote"}
            meta={language === "zh" ? "客户 / 成本 / 参考价 / PI" : "customer / cost / references / PI"}
            tone="emerald"
          >
            <div className="space-y-3 p-3">
              <div className="grid gap-2">
                {[
                  {
                    label: language === "zh" ? "报价输入" : "Quote Input",
                    value: language === "zh" ? "客户 / 产品 / 条款" : "Customer / Products / Terms",
                  },
                  {
                    label: language === "zh" ? "内部参考" : "Internal Reference",
                    value: language === "zh" ? "成本 / 供应商 / 历史价" : "Cost / Supplier / Price History",
                  },
                  {
                    label: language === "zh" ? "输出文件" : "Output",
                    value: language === "zh" ? "英文预览 / 导出 PI" : "English Preview / Export PI",
                  },
                ].map((item) => (
                  <div key={item.label} className="rounded-md border border-slate-800 bg-slate-950/55 px-3 py-2">
                    <p className="font-mono text-[10px] uppercase tracking-wide text-emerald-300">{item.label}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-200">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                <BattleText
                  en="Quotes now start from the full quick quote workflow, then export PI and archive files from there."
                  zh="报价统一从快速报价开始，再导出 PI 并归档文件。"
                />
              </div>
              <Link
                href="/quotations/quick-quote"
                className="inline-flex h-[var(--ui-button-height)] w-full items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-500"
              >
                <BattleText en="Open Quick Quote" zh="打开快速报价" />
              </Link>
            </div>
          </BattlePanel>
        </div>

        <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
          <span>{message || `${language === "zh" ? "总金额" : "TOTAL AMOUNT"} ${stats.totalAmount}`}</span>
          <div className="flex gap-2">
            <CommandButton variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><BattleText en="Prev" zh="上一页" /></CommandButton>
            <CommandButton variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><BattleText en="Next" zh="下一页" /></CommandButton>
          </div>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
