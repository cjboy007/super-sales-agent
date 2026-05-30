"use client";

import { useCallback, useEffect, useState } from "react";
import {
  autoNumberDocs,
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

interface GeneratedDoc {
  type: string;
  filename: string;
  path: string;
  size: number;
}

const DOC_TYPES: DocType[] = ["ALL", "PI", "CI", "PL"];

function fileSize(size: number) {
  if (!size) return "0B";
  if (size < 1024) return `${size}B`;
  return `${Math.round(size / 1024)}KB`;
}

export default function DocumentsPage() {
  const language = useBattleLanguage();
  const [formData, setFormData] = useState<TradeDocumentData>(createDefaultTradeData());
  const [docTypes, setDocTypes] = useState<DocType[]>(["ALL"]);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [historyDocs, setHistoryDocs] = useState<HistoryDoc[]>([]);
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

  const updateProduct = useCallback((index: number, field: keyof TradeProduct, value: string | number) => {
    setFormData((prev) => {
      const products = [...prev.products];
      products[index] = { ...products[index], [field]: value };
      return { ...prev, products };
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/documents/generate");
      const json = await res.json();
      if (json.success) setHistoryDocs(json.documents || []);
    } catch {
      // history is optional
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const toggleDocType = useCallback((type: DocType) => {
    setDocTypes((prev) => {
      if (type === "ALL") return ["ALL"];
      const filtered = prev.filter((item) => item !== "ALL");
      if (filtered.includes(type)) {
        const next = filtered.filter((item) => item !== type);
        return next.length ? next : ["ALL"];
      }
      return [...filtered, type];
    });
  }, []);

  function autoNumber() {
    const nums = autoNumberDocs("ALL");
    setFormData((prev) => ({
      ...prev,
      pi_info: { ...prev.pi_info, pi_no: nums.pi_no },
      ci_info: { ...prev.ci_info, ci_no: nums.ci_no },
      pl_info: { ...prev.pl_info, pl_no: nums.pl_no },
    }));
  }

  async function generate() {
    setGenerating(true);
    setError(null);
    setGeneratedDocs([]);
    try {
      const res = await fetch("/api/documents/generate", {
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
    language === "zh" ? "单证工作站" : "Document Station",
    `${language === "zh" ? "文件" : "Files"} ${docTypes.join("+")}`,
    `${language === "zh" ? "客户" : "Customer"} ${formData.customer.company_name || (language === "zh" ? "未填写" : "not set")}`,
    `${language === "zh" ? "金额" : "Amount"} ${formData.currency} ${totalAmount.toFixed(2)}`,
    `${language === "zh" ? "已生成" : "Generated"} ${generatedDocs.length}`,
  ].join(" / ");

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Document Station"
        zhTitle="单证工作站"
        meta="PI / CI / PL FILES ONLY / NOT SENT"
        zhMeta="PI / CI / PL 只生成文件 / 不会外发"
        active="/documents"
      >
        <BattleBadge tone={generating ? "blue" : "emerald"} pulse={generating}>
          {generating ? <BattleText en="RUNNING" zh="运行中" /> : <BattleText en="READY" zh="就绪" />}
        </BattleBadge>
        <CommandButton variant="ghost" onClick={fetchHistory}><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "文件类型" : "Document Set"} value={docTypes.join("+")} tone="purple" />
          <StatCell label={language === "zh" ? "金额" : "Amount"} value={`${formData.currency} ${totalAmount.toFixed(2)}`} tone="emerald" />
          <StatCell label={language === "zh" ? "净重" : "Net Weight"} value={`${totalNetWeight.toFixed(1)}kg`} tone="blue" />
          <StatCell label={language === "zh" ? "箱数" : "Packages"} value={totalPackages} tone="amber" />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <BattlePanel
            title={language === "zh" ? "单证信息" : "Document Details"}
            meta={`${formData.pi_info.pi_no} / ${formData.shipment.incoterms}`}
            action={
              <div className="flex items-center gap-2">
                {DOC_TYPES.map((type) => (
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
                <CommandButton variant="ghost" onClick={autoNumber}><BattleText en="Fill Numbers" zh="填入编号" /></CommandButton>
              </div>
            }
          >
            <div className="grid gap-3 p-3 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Company
                    <InputField value={formData.company.name} onChange={(e) => updateField("company", "name", e.target.value)} className="mt-1 w-full" />
                  </label>
                  <label className="text-[10px] uppercase tracking-wide text-slate-500">
                    Customer
                    <InputField value={formData.customer.company_name} onChange={(e) => updateField("customer", "company_name", e.target.value)} className="mt-1 w-full" />
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
                    <SelectField value={formData.currency} onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))} className="mt-1 w-full">
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
                <BattlePanel title={language === "zh" ? "产品明细" : "Product Line"} meta={language === "zh" ? "第 1 项" : "first item"}>
                  <div className="grid gap-2 p-3 md:grid-cols-2">
                    <label className="md:col-span-2 text-[10px] uppercase tracking-wide text-slate-500">
                      Description
                      <InputField value={product.description} onChange={(e) => updateProduct(0, "description", e.target.value)} className="mt-1 w-full" />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      HS Code
                      <InputField value={product.hs_code} onChange={(e) => updateProduct(0, "hs_code", e.target.value)} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Specification
                      <InputField value={product.specification} onChange={(e) => updateProduct(0, "specification", e.target.value)} className="mt-1 w-full" />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Qty
                      <InputField type="number" value={product.quantity} onChange={(e) => updateProduct(0, "quantity", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Unit Price
                      <InputField type="number" value={product.unit_price} onChange={(e) => updateProduct(0, "unit_price", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Net kg
                      <InputField type="number" value={product.net_weight_kg} onChange={(e) => updateProduct(0, "net_weight_kg", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                    <label className="text-[10px] uppercase tracking-wide text-slate-500">
                      Gross kg
                      <InputField type="number" value={product.gross_weight_kg} onChange={(e) => updateProduct(0, "gross_weight_kg", Number(e.target.value))} className="mt-1 w-full" mono />
                    </label>
                  </div>
                </BattlePanel>

                <div className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-950 px-3 py-2">
                  <span className="font-mono text-[10px] text-slate-500">
                    {error || (language === "zh" ? `本次已生成 ${generatedDocs.length} 个文件` : `${generatedDocs.length} ready this session`)}
                  </span>
                  <CommandButton variant="primary" disabled={generating} onClick={generate}>
                    {generating ? <BattleText en="Creating" zh="生成中" /> : <BattleText en="Create Files" zh="生成文件" />}
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
              placeholder="Ask Jaden to inspect document fields, prepare missing details, check shipment terms, or draft a PI/CI/PL note"
              zhPlaceholder="让 Jaden 检查单证字段、补齐缺失信息、核对运输条款，或起草 PI/CI/PL 备注"
            />

            <BattlePanel title={language === "zh" ? "新生成文件" : "New Documents"} meta={language === "zh" ? "本次操作" : "this session"}>
              {generatedDocs.length === 0 ? (
                <EmptyState label={language === "zh" ? "本次还没有生成文件" : "no documents created yet"} />
              ) : (
                <div className="divide-y divide-slate-800">
                  {generatedDocs.map((doc) => (
                    <div key={doc.path} className="px-3 py-2">
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
                    <div key={doc.path} className="px-3 py-2">
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
