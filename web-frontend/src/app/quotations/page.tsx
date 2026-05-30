"use client";

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
  type: "QT" | "PI" | "PN" | "SPL";
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Confirmed" | "Expired";
  date: string;
  filePath: string;
  fileName?: string;
  fileType: string;
  mainProducts?: string;
}

interface QuotationStats {
  total: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  totalAmount: string;
}

type TypeFilter = "All" | "QT" | "PI" | "PN" | "SPL";
type StatusFilter = "All" | "Draft" | "Sent" | "Confirmed" | "Expired";

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
  if (language !== "zh") return type;
  return type === "All" ? "全部" : type;
}

function fileLabel(quote: Quotation): string {
  return quote.fileName || quote.filePath.split(/[\\/]/).pop() || quote.fileType || "-";
}

function fileUrl(quote: Quotation): string {
  const params = new URLSearchParams({
    path: quote.filePath,
    project: "farreach",
  });
  return `/api/files?${params.toString()}`;
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
  const [createCustomer, setCreateCustomer] = useState("");
  const [createType, setCreateType] = useState<Quotation["type"]>("QT");
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

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

  async function createQuote() {
    if (!createCustomer) return;
    setCreating(true);
    setMessage("");
    try {
      const res = await fetch("/api/quotations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: createType, customer: createCustomer }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Generation failed");
      setMessage(`Generated ${json.quotationNo || createType}`);
      setCreateCustomer("");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setCreating(false);
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
                  {(["All", "QT", "PI", "PN", "SPL"] as const).map((item) => (
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
                <table className="w-full min-w-[840px] text-left text-xs">
                  <thead className="border-b border-slate-800 bg-slate-950/70 text-[10px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">{language === "zh" ? "报价编号" : "Quote ID"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "文件" : "File"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "客户" : "Customer"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "主要产品" : "Main Products"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "类型" : "Type"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "金额" : "Amount"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "状态" : "Status"}</th>
                      <th className="px-3 py-2">{language === "zh" ? "日期" : "Date"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {quotations.map((quote) => (
                      <tr key={`${quote.id}-${quote.filePath}`} className="hover:bg-slate-800/35">
                        <td className="px-3 py-2 font-mono text-slate-300">{quote.id}</td>
                        <td className="min-w-[220px] max-w-[260px] px-3 py-2">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[11px] text-slate-200" title={quote.filePath}>
                                {fileLabel(quote)}
                              </p>
                              <p className="font-mono text-[10px] uppercase text-slate-500">{quote.fileType || "file"}</p>
                              <p className="mt-1 line-clamp-2 text-[10px] text-slate-400 md:hidden">
                                {quote.mainProducts || "—"}
                              </p>
                            </div>
                            <a
                              href={fileUrl(quote)}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 rounded border border-slate-700 px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-slate-300 hover:border-emerald-400 hover:text-emerald-300"
                            >
                              {language === "zh" ? "打开" : "Open"}
                            </a>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-slate-200">{quote.customer}</td>
                        <td className="max-w-[260px] px-3 py-2 text-slate-300">
                          <span className="line-clamp-2" title={quote.mainProducts || undefined}>
                            {quote.mainProducts || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2"><BattleBadge tone="purple">{quote.type}</BattleBadge></td>
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
            title={language === "zh" ? "生成报价" : "Create Quote"}
            meta={language === "zh" ? "仅生成文件，不会发给客户" : "creates files only; does not send to customers"}
          >
            <div className="space-y-3 p-3">
              <SelectField value={createType} onChange={(event) => setCreateType(event.target.value as Quotation["type"])} className="w-full">
                {(["QT", "PI", "PN", "SPL"] as const).map((item) => <option key={item}>{item}</option>)}
              </SelectField>
              <InputField value={createCustomer} onChange={(event) => setCreateCustomer(event.target.value)} placeholder={language === "zh" ? "客户名称" : "Customer name"} />
              <div className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                <BattleText
                  en="This creates quote files only. Nothing is sent to a customer from this page."
                  zh="这里只生成报价文件，不会从本页发给客户。"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-[10px] text-slate-500">{message || (language === "zh" ? "等待生成报价" : "ready to create quote")}</p>
                <CommandButton variant="primary" disabled={!createCustomer || creating} onClick={createQuote}>
                  {creating ? <BattleText en="Creating" zh="生成中" /> : <BattleText en="Create" zh="生成" />}
                </CommandButton>
              </div>
            </div>
          </BattlePanel>
        </div>

        <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
          <span>{language === "zh" ? "总金额" : "TOTAL AMOUNT"} {stats.totalAmount}</span>
          <div className="flex gap-2">
            <CommandButton variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><BattleText en="Prev" zh="上一页" /></CommandButton>
            <CommandButton variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><BattleText en="Next" zh="下一页" /></CommandButton>
          </div>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
