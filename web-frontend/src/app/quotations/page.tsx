"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton, InputField, SelectField } from "@/components/ui/CommandControls";
import { useProject } from "@/lib/project";

interface Quotation {
  id: string;
  type: "QT" | "PI" | "PN" | "SPL";
  customer: string;
  amount: string;
  status: "Draft" | "Sent" | "Confirmed" | "Expired";
  date: string;
  filePath: string;
  fileType: string;
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

const TYPE_LABELS: Record<string, string> = {
  QT: "Quotation",
  PI: "Proforma Invoice",
  PN: "Payment Notice",
  SPL: "Sample Order",
};

const STATUS_LABELS: Record<string, string> = {
  Draft: "Draft",
  Sent: "Sent",
  Confirmed: "Confirmed",
  Expired: "Expired",
};

const DOC_TYPES = [
  { key: "QT", label: "Quotation", desc: "Product quotation" },
  { key: "PI", label: "Proforma Invoice", desc: "Commercial pre-invoice" },
  { key: "PN", label: "Payment Notice", desc: "Payment instruction" },
  { key: "SPL", label: "Sample Order", desc: "Sample order form" },
];

function typeTone(type: string): Tone {
  if (type === "QT") return "blue";
  if (type === "PI") return "emerald";
  if (type === "PN") return "purple";
  if (type === "SPL") return "amber";
  return "neutral";
}

function statusTone(status: string): Tone {
  if (status === "Draft") return "neutral";
  if (status === "Sent") return "blue";
  if (status === "Confirmed") return "emerald";
  if (status === "Expired") return "red";
  return "neutral";
}

function CreateModal({ open, onClose, onCreated, apiUrl }: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  apiUrl: (path: string) => string;
}) {
  const [selectedType, setSelectedType] = useState("");
  const [customer, setCustomer] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<"idle" | "success" | "error">("idle");
  const [genError, setGenError] = useState("");
  const [generatedNo, setGeneratedNo] = useState("");

  if (!open) return null;

  const canCreate = Boolean(customer && selectedType && !generating);

  const resetAndClose = () => {
    if (generating) return;
    onClose();
    setSelectedType("");
    setCustomer("");
    setShowForm(false);
    setGenStatus("idle");
    setGeneratedNo("");
    setGenError("");
  };

  const handleCreate = async () => {
    if (!canCreate) return;
    setGenerating(true);
    setGenStatus("idle");
    setGenError("");
    try {
      const res = await fetch(apiUrl("/api/quotations/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: selectedType, customer }),
      });
      const json = await res.json();
      if (json.success) {
        setGenStatus("success");
        setGeneratedNo(json.quotationNo || "");
        onCreated?.();
        window.setTimeout(resetAndClose, 1400);
      } else {
        setGenStatus("error");
        setGenError(json.error || "Generation failed");
      }
    } catch (e: unknown) {
      setGenStatus("error");
      setGenError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={resetAndClose}>
      <div className="w-full max-w-2xl overflow-hidden rounded-md border border-slate-800 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Create Sales Document</h2>
          <button onClick={resetAndClose} disabled={generating} className="font-mono text-xs text-slate-500 hover:text-slate-200 disabled:opacity-40">CLOSE</button>
        </div>
        <div className="space-y-3 p-4">
          {genStatus === "success" && (
            <div className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              Document generated {generatedNo && <span className="font-mono">{generatedNo}</span>}
            </div>
          )}
          {genStatus === "error" && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{genError}</div>
          )}

          {!showForm ? (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {DOC_TYPES.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => setSelectedType(type.key)}
                    className={`rounded-md border p-3 text-left ${selectedType === type.key ? "border-emerald-500 bg-emerald-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-xs font-semibold text-slate-200">{type.key}</p>
                      <Badge tone={typeTone(type.key)}>{type.label}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{type.desc}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <CommandButton variant="ghost" onClick={resetAndClose}>Cancel</CommandButton>
                <CommandButton disabled={!selectedType} onClick={() => setShowForm(true)}>Next</CommandButton>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-600">Selected Type</p>
                <div className="mt-1 flex items-center justify-between">
                  <p className="font-mono text-xs text-slate-200">{selectedType}</p>
                  <Badge tone={typeTone(selectedType)}>{TYPE_LABELS[selectedType]}</Badge>
                </div>
              </div>
              <InputField label="Customer" value={customer} onChange={(e) => setCustomer(e.target.value)} disabled={generating} placeholder="Acme Corp" />
              <div className="flex justify-end gap-2 border-t border-slate-800 pt-3">
                <CommandButton variant="ghost" disabled={generating} onClick={() => setShowForm(false)}>Back</CommandButton>
                <CommandButton disabled={!canCreate} onClick={handleCreate}>{generating ? "Generating" : "Generate"}</CommandButton>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ quotation, onClose, apiUrl }: {
  quotation: Quotation | null;
  onClose: () => void;
  apiUrl: (path: string) => string;
}) {
  const [previewMode, setPreviewMode] = useState<"info" | "preview">("info");
  const [previewUrl, setPreviewUrl] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const resetPreview = useCallback(() => {
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl);
    setPreviewMode("info");
    setPreviewUrl("");
    setPreviewError("");
    setPreviewLoading(false);
  }, [previewUrl]);

  const loadPreview = useCallback(async () => {
    if (!quotation?.filePath) return;
    setPreviewLoading(true);
    setPreviewError("");
    const ext = quotation.fileType?.toLowerCase() || "";

    if (ext === "pdf" || ext === "html" || ext === "htm") {
      setPreviewUrl(apiUrl(`/api/files?path=${encodeURIComponent(quotation.filePath)}`));
      setPreviewLoading(false);
      return;
    }

    if (["xlsx", "xls", "docx", "doc"].includes(ext)) {
      try {
        const res = await fetch(apiUrl(`/api/files/preview?path=${encodeURIComponent(quotation.filePath)}`));
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("text/html")) {
          const html = await res.text();
          const blob = new Blob([html], { type: "text/html" });
          setPreviewUrl(URL.createObjectURL(blob));
          setPreviewLoading(false);
          return;
        }
      } catch {
        setPreviewError("Preview load failed");
        setPreviewLoading(false);
        return;
      }
    }

    setPreviewError("Preview unavailable for this file type");
    setPreviewLoading(false);
  }, [apiUrl, quotation]);

  useEffect(() => {
    if (quotation && previewMode === "preview") loadPreview();
  }, [loadPreview, previewMode, quotation]);

  if (!quotation) return null;

  const downloadUrl = quotation.filePath
    ? apiUrl(`/api/files?path=${encodeURIComponent(quotation.filePath)}&download=true`)
    : "";

  const close = () => {
    resetPreview();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div className="w-full max-w-4xl overflow-hidden rounded-md border border-slate-800 bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="flex h-11 items-center justify-between border-b border-slate-800 px-3">
          <h2 className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {previewMode === "preview" ? "Document Preview" : quotation.id}
          </h2>
          <button onClick={close} className="font-mono text-xs text-slate-500 hover:text-slate-200">CLOSE</button>
        </div>

        {previewMode === "info" ? (
          <div className="space-y-3 p-4">
            <div className="flex flex-wrap gap-2">
              <Badge tone={typeTone(quotation.type)}>{TYPE_LABELS[quotation.type] || quotation.type}</Badge>
              <Badge tone={statusTone(quotation.status)}>{STATUS_LABELS[quotation.status] || quotation.status}</Badge>
              <Badge tone="neutral">{quotation.fileType || "file"}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {[
                ["Customer", quotation.customer],
                ["Amount", quotation.amount],
                ["Date", quotation.date],
                ["File", quotation.filePath || "NA"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-600">{label}</p>
                  <p className="mt-1 break-all font-mono text-xs text-slate-200">{value}</p>
                </div>
              ))}
            </div>
            {quotation.filePath && (
              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
                <CommandButton onClick={() => setPreviewMode("preview")}>Preview</CommandButton>
                <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="flex h-7 items-center justify-center rounded-md border border-slate-700 bg-slate-800 px-3 text-xs font-semibold text-slate-300 hover:text-slate-100">
                  Download
                </a>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <button onClick={resetPreview} className="font-mono text-[10px] uppercase text-slate-500 hover:text-slate-200">Back</button>
              {downloadUrl && <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] uppercase text-emerald-400">Download</a>}
            </div>
            <div className="relative min-h-[420px]">
              {previewLoading ? (
                <div className="flex items-center justify-center py-20 text-xs text-slate-500">Loading preview</div>
              ) : previewError ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-xs text-slate-500">
                  <p>{previewError}</p>
                  {downloadUrl && <a href={downloadUrl} target="_blank" rel="noopener noreferrer" className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Download File</a>}
                </div>
              ) : previewUrl ? (
                <iframe src={previewUrl} className="h-[calc(90vh-140px)] min-h-[420px] w-full border-0" title="Document Preview" sandbox="allow-same-origin allow-scripts" />
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function QuotationsPage() {
  const { apiUrl, projectId } = useProject();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("All");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("create") === "true";
  });
  const [previewQuotation, setPreviewQuotation] = useState<Quotation | null>(null);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [stats, setStats] = useState<QuotationStats>({ total: 0, byType: {}, byStatus: {}, totalAmount: "NA" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchRef = useRef(0);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/quotations?action=stats"));
      const data = await res.json();
      if (data.data) setStats(data.data);
    } catch {
      // Stats are non-critical for the command view.
    }
  }, [apiUrl]);

  const fetchQuotations = useCallback(async () => {
    const fetchId = ++fetchRef.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(PAGE_SIZE),
        search,
        type: typeFilter === "All" ? "" : typeFilter,
        status: statusFilter === "All" ? "" : statusFilter,
      });
      const res = await fetch(apiUrl(`/api/quotations?${params}`));
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      if (fetchId === fetchRef.current) {
        setQuotations(data.quotations || []);
        setStats((prev) => ({ ...prev, total: data.total || 0 }));
      }
    } catch (e: unknown) {
      if (fetchId === fetchRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fetchId === fetchRef.current) setLoading(false);
    }
  }, [apiUrl, page, search, statusFilter, typeFilter]);

  useEffect(() => { fetchStats(); }, [fetchStats, projectId]);
  useEffect(() => { fetchQuotations(); }, [fetchQuotations]);

  const totalPages = Math.max(1, Math.ceil(stats.total / PAGE_SIZE));
  const activeFilters = [typeFilter !== "All", statusFilter !== "All", Boolean(search)].filter(Boolean).length;

  return (
    <PageShell>
      <PageHeader title="Quotation Command" meta={`${projectId} / ${stats.total} docs / ${stats.totalAmount || "NA"}`}>
        <CommandButton variant="ghost" size="xs" onClick={() => { fetchStats(); fetchQuotations(); }} disabled={loading}>Refresh</CommandButton>
        <CommandButton size="xs" onClick={() => setCreateOpen(true)}>New Doc</CommandButton>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-y-auto p-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-3">
          <PanelSection title="Quote Stats">
            <div className="divide-y divide-slate-800">
              {DOC_TYPES.map((type) => (
                <div key={type.key} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="font-mono text-xs font-semibold text-slate-200">{type.key}</p>
                    <p className="text-[10px] text-slate-600">{type.label}</p>
                  </div>
                  <Badge tone={typeTone(type.key)}>{stats.byType[type.key] || 0}</Badge>
                </div>
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Filters" action={activeFilters ? <Badge tone="amber">{activeFilters}</Badge> : <Badge tone="neutral">clear</Badge>}>
            <div className="space-y-2 p-3">
              <InputField mono placeholder="Search ID or customer" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} onKeyDown={(e) => { if (e.key === "Enter") fetchQuotations(); }} />
              <SelectField value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as TypeFilter); setPage(1); }}>
                <option value="All">All document types</option>
                {Object.entries(TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </SelectField>
              <SelectField value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}>
                <option value="All">All states</option>
                {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </SelectField>
            </div>
          </PanelSection>
        </aside>

        <PanelSection title="Document Queue" action={<span className="font-mono text-[10px] text-slate-500">{PAGE_SIZE} rows/page</span>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">ID</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Amount</th>
                  <th className="px-3 py-2 font-semibold">State</th>
                  <th className="px-3 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold">Format</th>
                  <th className="px-3 py-2 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {loading ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">Loading documents</td></tr>
                ) : error ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-red-400">{error}</td></tr>
                ) : quotations.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-12 text-center text-slate-500">No documents match current filters</td></tr>
                ) : quotations.map((quote) => (
                  <tr key={`${quote.id}-${quote.fileType}-${quote.filePath || quote.date}`} className="cursor-pointer hover:bg-slate-800/30" onClick={() => setPreviewQuotation(quote)}>
                    <td className="max-w-[220px] truncate px-3 py-2 font-mono text-[11px] text-slate-200">{quote.id}</td>
                    <td className="px-3 py-2"><Badge tone={typeTone(quote.type)}>{TYPE_LABELS[quote.type] || quote.type}</Badge></td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-slate-300">{quote.customer}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-100">{quote.amount}</td>
                    <td className="px-3 py-2"><Badge tone={statusTone(quote.status)}>{STATUS_LABELS[quote.status] || quote.status}</Badge></td>
                    <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{quote.date}</td>
                    <td className="px-3 py-2 font-mono text-[11px] uppercase text-slate-500">{quote.fileType || "NA"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={(e) => { e.stopPropagation(); setPreviewQuotation(quote); }} className="font-mono text-[10px] font-semibold uppercase text-emerald-400 hover:text-emerald-300">
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && !loading && (
            <div className="flex items-center justify-between border-t border-slate-800 px-3 py-2">
              <span className="font-mono text-[10px] text-slate-500">
                {(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, stats.total)} / {stats.total}
              </span>
              <div className="flex gap-1">
                <CommandButton variant="ghost" size="xs" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</CommandButton>
                <span className="flex h-7 items-center rounded-md border border-slate-800 bg-slate-950 px-3 font-mono text-[10px] text-slate-400">{page} / {totalPages}</span>
                <CommandButton variant="ghost" size="xs" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</CommandButton>
              </div>
            </div>
          )}
        </PanelSection>
      </div>

      <CreateModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { fetchStats(); fetchQuotations(); }} apiUrl={apiUrl} />
      <PreviewModal quotation={previewQuotation} onClose={() => setPreviewQuotation(null)} apiUrl={apiUrl} />
    </PageShell>
  );
}
