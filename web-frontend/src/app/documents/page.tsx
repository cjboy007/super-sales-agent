"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createDefaultTradeData,
  type DocType,
  type HistoryDoc,
  type TradeDocumentData,
  type TradeProduct,
} from "@/lib/trade-docs";
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
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import PageCommandPanel from "@/components/ui/PageCommandPanel";
import { useProject } from "@/lib/project";

interface GeneratedDoc {
  type: string;
  filename: string;
  fileName: string;
  size: number;
  downloadUrl: string;
}

interface PiRecord {
  piNo: string;
  customer: string;
  date: string;
  amount: string;
  productSummary: string;
  updatedAt: string;
  data: TradeDocumentData;
}

const SHIPMENT_DOC_TYPES: Array<Extract<DocType, "CI" | "PL">> = ["CI", "PL"];

function fileSize(size: number) {
  if (!size) return "0B";
  if (size < 1024) return `${size}B`;
  return `${Math.round(size / 1024)}KB`;
}

export default function DocumentsPage() {
  const language = useBattleLanguage();
  const { apiFetch } = useProject();
  const [formData, setFormData] = useState<TradeDocumentData>(createDefaultTradeData());
  const [docTypes, setDocTypes] = useState<Array<Extract<DocType, "CI" | "PL">>>(["CI", "PL"]);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [historyDocs, setHistoryDocs] = useState<HistoryDoc[]>([]);
  const [piQuery, setPiQuery] = useState("");
  const [piRecords, setPiRecords] = useState<PiRecord[]>([]);
  const [loadingPiRecords, setLoadingPiRecords] = useState(false);
  const [selectedPiNo, setSelectedPiNo] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = useCallback(<T extends keyof TradeDocumentData>(
    section: T,
    field: string,
    value: string | number
  ) => {
    setFormData((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as Record<string, unknown>),
        [field]: value,
      },
    }));
  }, []);

  const updateProduct = useCallback(<K extends keyof TradeProduct>(index: number, field: K, value: TradeProduct[K]) => {
    setFormData((prev) => {
      const products = [...prev.products];
      products[index] = { ...products[index], [field]: value };
      return { ...prev, products };
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await apiFetch("/api/documents/generate");
      const json = await res.json();
      if (json.success) setHistoryDocs(json.documents || []);
    } catch {
      // history is optional
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const fetchPiRecords = useCallback(async (query = "") => {
    setLoadingPiRecords(true);
    try {
      const params = new URLSearchParams({ query });
      const res = await apiFetch(`/api/documents/pi-records?${params.toString()}`);
      const json = await res.json();
      if (json.success) setPiRecords(json.records || []);
    } catch {
      setPiRecords([]);
    } finally {
      setLoadingPiRecords(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    fetchPiRecords("");
  }, [fetchPiRecords]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      fetchPiRecords(piQuery);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [fetchPiRecords, piQuery]);

  const toggleDocType = useCallback((type: Extract<DocType, "CI" | "PL">) => {
    setDocTypes((prev) => {
      const next = prev.includes(type)
        ? prev.filter((item) => item !== type)
        : [...prev, type];
      return next.length ? next : prev;
    });
  }, []);

  function loadPiRecord(record: PiRecord) {
    setFormData(record.data);
    setSelectedPiNo(record.piNo);
    setPiQuery(record.piNo);
    setDocTypes(["CI", "PL"]);
    setError(null);
  }

  async function generate() {
    if (!selectedPiNo) {
      setError(language === "zh" ? "请先选择一个已保存的 PI。" : "Select a saved PI first.");
      return;
    }
    setGenerating(true);
    setError(null);
    setGeneratedDocs([]);
    try {
      const res = await apiFetch("/api/documents/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: formData, docTypes }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Generation failed");
      setGeneratedDocs(json.documents || []);
      await fetchHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const totalAmount = formData.products.reduce((sum, p) => sum + p.quantity * p.unit_price, 0);
  const totalPackages = formData.products.reduce((sum, p) => sum + p.packages, 0);
  const totalNetWeight = formData.products.reduce((sum, p) => sum + p.net_weight_kg * p.quantity, 0);
  const product = formData.products[0];
  const commandContext = {
    docTypes,
    piNo: formData.pi_info.pi_no,
    ciNo: formData.ci_info.ci_no,
    plNo: formData.pl_info.pl_no,
    company: formData.company.name,
    customer: {
      company: formData.customer.company_name,
      contact: formData.customer.contact,
      email: formData.customer.email,
    },
    shipment: {
      date: formData.shipment.date,
      incoterms: formData.shipment.incoterms,
      departure: formData.shipment.departure_port,
      destination: formData.shipment.destination_port,
    },
    product: {
      description: product.description,
      hsCode: product.hs_code,
      specification: product.specification,
      quantity: product.quantity,
      unitPrice: product.unit_price,
      unitCost: product.unit_cost || 0,
      supplier: product.supplier || "",
    },
    totals: {
      currency: formData.currency,
      amount: totalAmount,
      packages: totalPackages,
      netWeightKg: totalNetWeight,
    },
    generatedCount: generatedDocs.length,
    historyCount: historyDocs.length,
  };
  const commandSummary = [
    language === "zh" ? "出货文件" : "Shipment Documents",
    `${language === "zh" ? "文件" : "Files"} ${docTypes.join("+")}`,
    `${language === "zh" ? "客户" : "Customer"} ${formData.customer.company_name || (language === "zh" ? "未填写" : "not set")}`,
    `${language === "zh" ? "金额" : "Amount"} ${formData.currency} ${totalAmount.toFixed(2)}`,
    `${language === "zh" ? "已生成" : "Generated"} ${generatedDocs.length}`,
  ].join(" / ");

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Shipment Documents"
        zhTitle="出货文件"
        meta="CI / PL FROM SAVED PI / FILES ONLY"
        zhMeta="从已保存 PI 生成 CI / PL / 不会外发"
        active="/documents"
      >
        <BattleBadge tone={generating ? "blue" : "emerald"} pulse={generating}>
          {generating ? <BattleText en="RUNNING" zh="运行中" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={fetchHistory}><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "PI 来源" : "PI Source"} value={selectedPiNo || (language === "zh" ? "未选择" : "Not selected")} tone="purple" />
          <StatCell label={language === "zh" ? "金额" : "Amount"} value={`${formData.currency} ${totalAmount.toFixed(2)}`} tone="emerald" />
          <StatCell label={language === "zh" ? "净重" : "Net Weight"} value={`${totalNetWeight.toFixed(1)}kg`} tone="blue" />
          <StatCell label={language === "zh" ? "待生成" : "To Create"} value={docTypes.join("+")} tone="amber" />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <BattlePanel
            title={language === "zh" ? "PI 后续文件" : "PI Follow-Up Files"}
            meta={`${formData.pi_info.pi_no} / ${formData.shipment.incoterms}`}
            action={
              <div className="flex items-center gap-2">
                {SHIPMENT_DOC_TYPES.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleDocType(type)}
                    className={`h-7 rounded-md border px-2 font-mono text-[10px] ${
                      docTypes.includes(type)
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-700 bg-slate-800 text-slate-400"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            }
          >
            <div className="border-b border-slate-800 bg-slate-950/60 p-3">
              <div className="grid gap-3 lg:grid-cols-[minmax(240px,360px)_minmax(0,1fr)]">
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "检索 PI 编号" : "Search PI Number"}
                  <InputField
                    value={piQuery}
                    onChange={(event) => setPiQuery(event.target.value)}
                    placeholder={language === "zh" ? "输入 PI 编号或客户名" : "Type PI number or customer"}
                    className="mt-1 w-full"
                    mono
                  />
                </label>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    <BattleText en="Choose a saved PI first" zh="先选择已保存的 PI" />
                  </p>
                  <div className="mt-1 flex min-h-8 items-center gap-2 overflow-x-auto">
                    {loadingPiRecords ? (
                      <span className="font-mono text-[10px] text-slate-500">
                        <BattleText en="searching PI records..." zh="正在检索 PI 记录..." />
                      </span>
                    ) : piRecords.length === 0 ? (
                      <span className="font-mono text-[10px] text-slate-500">
                        <BattleText en="No saved PI yet. Create one from Quick Quote first." zh="还没有保存的 PI。请先从快速报价导出 PI。" />
                      </span>
                    ) : (
                      piRecords.slice(0, 6).map((record) => (
                        <button
                          key={record.piNo}
                          type="button"
                          onClick={() => loadPiRecord(record)}
                          className={`shrink-0 rounded-md border px-3 py-1.5 text-left transition ${
                            selectedPiNo === record.piNo
                              ? "border-emerald-500 bg-emerald-500/15"
                              : "border-slate-700 bg-slate-900 hover:border-slate-600"
                          }`}
                        >
                          <span className="block font-mono text-[10px] text-slate-200">{record.piNo}</span>
                          <span className="block max-w-[220px] truncate text-[10px] text-slate-500">
                            {record.customer} / {record.amount}
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    PI No.
                    <InputField value={formData.pi_info.pi_no} readOnly className="mt-1 w-full opacity-80" mono />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Customer
                    <InputField value={formData.customer.company_name} readOnly className="mt-1 w-full opacity-80" />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Contact
                    <InputField value={formData.customer.contact} onChange={(e) => updateField("customer", "contact", e.target.value)} className="mt-1 w-full" />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Email
                    <InputField value={formData.customer.email} onChange={(e) => updateField("customer", "email", e.target.value)} className="mt-1 w-full" mono />
                  </label>
                  <label className="md:col-span-2 text-[10px] uppercase tracking-wide text-slate-500">
                    Address
                    <InputField value={formData.customer.address} onChange={(e) => updateField("customer", "address", e.target.value)} className="mt-1 w-full" />
                  </label>
                </div>

                <div className="grid gap-2 md:grid-cols-3">
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Ship Date
                    <InputField type="date" value={formData.shipment.date} onChange={(e) => updateField("shipment", "date", e.target.value)} className="mt-1 w-full" mono />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Departure
                    <InputField value={formData.shipment.departure_port} onChange={(e) => updateField("shipment", "departure_port", e.target.value)} className="mt-1 w-full" />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Destination
                    <InputField value={formData.shipment.destination_port} onChange={(e) => updateField("shipment", "destination_port", e.target.value)} className="mt-1 w-full" />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Currency
                    <SelectField value={formData.currency} disabled className="mt-1 w-full opacity-80">
                      {["USD", "EUR", "CNY", "GBP"].map((item) => <option key={item}>{item}</option>)}
                    </SelectField>
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Freight
                    <InputField type="number" value={formData.freight} onChange={(e) => setFormData((prev) => ({ ...prev, freight: Number(e.target.value) }))} className="mt-1 w-full" mono />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Insurance
                    <InputField type="number" value={formData.insurance} onChange={(e) => setFormData((prev) => ({ ...prev, insurance: Number(e.target.value) }))} className="mt-1 w-full" mono />
                  </label>
                </div>
              </div>

              <div className="space-y-3">
                <BattlePanel title={language === "zh" ? "装箱与出货补充" : "Packing And Shipment"} meta={language === "zh" ? "按 PI 产品补齐" : "derived from PI products"}>
                  <div className="grid gap-2 p-3 md:grid-cols-2">
                    <label className="md:col-span-2 text-[10px] uppercase tracking-wide text-slate-500">
                      Description
                      <InputField value={product.description} readOnly className="mt-1 w-full opacity-80" />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      HS Code
                      <InputField value={product.hs_code} onChange={(e) => updateProduct(0, "hs_code", e.target.value)} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Specification
                      <InputField value={product.specification} readOnly className="mt-1 w-full opacity-80" />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Qty
                      <InputField type="number" value={product.quantity} readOnly className="mt-1 w-full opacity-80" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Unit Price
                      <InputField type="number" value={product.unit_price} readOnly className="mt-1 w-full opacity-80" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Net kg
                      <InputField type="number" value={product.net_weight_kg} onChange={(e) => updateProduct(0, "net_weight_kg", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Gross kg
                      <InputField type="number" value={product.gross_weight_kg} onChange={(e) => updateProduct(0, "gross_weight_kg", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Packages
                      <InputField type="number" value={product.packages} onChange={(e) => updateProduct(0, "packages", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Carton / Package Type
                      <InputField value={product.package_type} onChange={(e) => updateProduct(0, "package_type", e.target.value)} className="mt-1 w-full" />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Dimensions
                      <InputField value={product.dimensions_cm} onChange={(e) => updateProduct(0, "dimensions_cm", e.target.value)} placeholder="40x30x20cm" className="mt-1 w-full" />
                    </label>
                    <label className="md:col-span-2 text-[10px] uppercase tracking-wide text-slate-500">
                      Marks
                      <InputField value={formData.shipment.marks} onChange={(e) => updateField("shipment", "marks", e.target.value)} className="mt-1 w-full" />
                    </label>
                  </div>
                </BattlePanel>

                <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className="font-mono text-[10px] text-slate-500">
                    {error || (language === "zh" ? `本次已生成 ${generatedDocs.length} 个文件` : `${generatedDocs.length} ready this session`)}
                  </span>
                  <CommandButton variant="primary" disabled={generating || !selectedPiNo} onClick={generate}>
                    {generating ? <BattleText en="Creating" zh="生成中" /> : <BattleText en="Create CI / PL" zh="生成 CI / PL" />}
                  </CommandButton>
                </div>
              </div>
            </div>
          </BattlePanel>

          <div className="space-y-3">
            <PageCommandPanel
              page="documents"
              summary={commandSummary}
              context={commandContext}
              placeholder="Ask Jaden to inspect CI/PL fields, prepare missing packing details, or check shipment terms"
              zhPlaceholder="让 Jaden 检查 CI/PL 字段、补齐装箱信息，或核对运输条款"
            />

            <BattlePanel title={language === "zh" ? "新生成文件" : "New Documents"} meta={language === "zh" ? "本次操作" : "this session"}>
              {generatedDocs.length === 0 ? (
                <EmptyState label={language === "zh" ? "本次还没有生成文件" : "no documents created yet"} />
              ) : (
                <div className="divide-y divide-slate-800">
                  {generatedDocs.map((doc) => (
                    <div key={`${doc.type}:${doc.fileName || doc.filename}:${doc.downloadUrl}`} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs font-semibold text-slate-200">{doc.filename}</p>
                        <BattleBadge tone="emerald">{doc.type}</BattleBadge>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">{fileSize(doc.size)}</p>
                    </div>
                  ))}
                </div>
              )}
            </BattlePanel>

            <BattlePanel title={language === "zh" ? "最近文件" : "Recent Documents"} meta={language === "zh" ? `${historyDocs.length} 个已保存文件` : `${historyDocs.length} saved files`}>
              {historyDocs.length === 0 ? (
                <EmptyState label={language === "zh" ? "还没有已生成文件" : "no generated documents found"} />
              ) : (
                <div className="max-h-[420px] divide-y divide-slate-800 overflow-y-auto">
                  {historyDocs.slice(0, 20).map((doc) => (
                    <div key={`${doc.type}:${doc.fileName || doc.filename}:${doc.created}`} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="truncate text-xs text-slate-200">{doc.filename}</p>
                        <BattleBadge tone="purple">{doc.type}</BattleBadge>
                      </div>
                      <p className="mt-1 font-mono text-[10px] text-slate-500">
                        {new Date(doc.created).toLocaleString("en-CA", { hour12: false })} / {fileSize(doc.size)}
                      </p>
                    </div>
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
