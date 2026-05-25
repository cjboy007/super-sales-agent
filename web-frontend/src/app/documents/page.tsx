"use client";

import { useCallback, useState } from "react";
import PageShell, { PageHeader } from "@/components/ui/PageShell";
import { Badge, PanelSection, type Tone } from "@/components/ui/BattleTokens";
import { CommandButton, InputField, SelectField } from "@/components/ui/CommandControls";
import { autoNumberDocs, createDefaultTradeData, type DocType, type HistoryDoc, type TradeDocumentData, type TradeProduct } from "@/lib/trade-docs";
import { useProject } from "@/lib/project";

interface GeneratedDoc {
  type: string;
  filename: string;
  path: string;
  size: number;
}

type Tab = "form" | "preview" | "history";

function docTone(type: string): Tone {
  if (type === "PI") return "emerald";
  if (type === "CI") return "blue";
  if (type === "PL") return "amber";
  return "neutral";
}

function FieldGrid({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <PanelSection title={title}>
      <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </PanelSection>
  );
}

export default function DocumentsPage() {
  const { apiUrl, projectId } = useProject();
  const [formData, setFormData] = useState<TradeDocumentData>(createDefaultTradeData());
  const [docTypes, setDocTypes] = useState<DocType[]>(["ALL"]);
  const [generating, setGenerating] = useState(false);
  const [generatedDocs, setGeneratedDocs] = useState<GeneratedDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("form");
  const [historyDocs, setHistoryDocs] = useState<HistoryDoc[]>([]);

  const updateField = useCallback(<T extends keyof TradeDocumentData>(section: T, field: string, value: string | number) => {
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

  const addProduct = useCallback(() => {
    setFormData((prev) => ({
      ...prev,
      products: [
        ...prev.products,
        {
          description: "",
          specification: "",
          hs_code: "",
          quantity: 0,
          unit_price: 0,
          net_weight_kg: 0,
          gross_weight_kg: 0,
          dimensions_cm: "",
          package_type: "Carton",
          packages: 0,
        },
      ],
    }));
  }, []);

  const removeProduct = useCallback((index: number) => {
    setFormData((prev) => ({
      ...prev,
      products: prev.products.filter((_, i) => i !== index),
    }));
  }, []);

  const autoNumber = useCallback(() => {
    const nums = autoNumberDocs("ALL");
    setFormData((prev) => ({
      ...prev,
      pi_info: { ...prev.pi_info, pi_no: nums.pi_no },
      ci_info: { ...prev.ci_info, ci_no: nums.ci_no },
      pl_info: { ...prev.pl_info, pl_no: nums.pl_no },
    }));
  }, []);

  const toggleDocType = useCallback((type: DocType) => {
    setDocTypes((prev) => {
      if (type === "ALL") return ["ALL"];
      const filtered = prev.filter((item) => item !== "ALL");
      if (filtered.includes(type)) {
        const next = filtered.filter((item) => item !== type);
        return next.length === 0 ? ["ALL"] : next;
      }
      return [...filtered, type];
    });
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/documents/generate"));
      const result = await res.json();
      if (result.success) setHistoryDocs(result.documents || []);
    } catch {
      // History failure is non-critical.
    }
  }, [apiUrl]);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setGeneratedDocs([]);
    try {
      const res = await fetch(apiUrl("/api/documents/generate"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: formData, docTypes }),
      });
      const result = await res.json();
      if (!result.success) {
        setError(result.error || "Generation failed");
      } else {
        setGeneratedDocs(result.documents || []);
        setActiveTab("preview");
        fetchHistory();
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  }, [apiUrl, docTypes, fetchHistory, formData]);

  const totalAmount = formData.products.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const totalNetWeight = formData.products.reduce((sum, item) => sum + item.net_weight_kg * item.quantity, 0);
  const totalGrossWeight = formData.products.reduce((sum, item) => sum + item.gross_weight_kg * item.quantity, 0);
  const totalPackages = formData.products.reduce((sum, item) => sum + item.packages, 0);

  const renderFields = (
    fields: { label: string; key: string; type?: string; placeholder?: string; mono?: boolean }[],
    sectionKey: keyof TradeDocumentData
  ) => fields.map((field) => {
    const sectionData = formData[sectionKey] as Record<string, string>;
    return (
      <InputField
        key={field.key}
        label={field.label}
        type={field.type || "text"}
        mono={field.mono}
        value={sectionData[field.key] || ""}
        placeholder={field.placeholder || ""}
        onChange={(e) => updateField(sectionKey, field.key, e.target.value)}
      />
    );
  });

  const tabs: Array<{ key: Tab; label: string; count?: number; tone: Tone }> = [
    { key: "form", label: "Document Builder", tone: "blue" },
    { key: "preview", label: "Generated", count: generatedDocs.length, tone: generatedDocs.length ? "emerald" : "neutral" },
    { key: "history", label: "History", count: historyDocs.length, tone: "purple" },
  ];

  return (
    <PageShell>
      <PageHeader title="Documents Workbench" meta={`${projectId} / PI-CI-PL / local generation`}>
        <CommandButton variant="ghost" size="xs" onClick={autoNumber}>Auto Number</CommandButton>
        <CommandButton size="xs" onClick={handleGenerate} disabled={generating || !formData.customer.company_name || formData.products.length === 0}>
          {generating ? "Generating" : "Generate"}
        </CommandButton>
      </PageHeader>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-3 overflow-y-auto border-r border-slate-800 bg-slate-900/35 p-3">
          <PanelSection title="Generation Scope">
            <div className="space-y-2 p-3">
              {(["ALL", "PI", "CI", "PL"] as DocType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => toggleDocType(type)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left ${docTypes.includes(type) ? "border-emerald-500/40 bg-emerald-500/10" : "border-slate-800 bg-slate-950/60 hover:border-slate-700"}`}
                >
                  <span className="font-mono text-xs font-semibold text-slate-200">{type}</span>
                  <Badge tone={type === "ALL" ? "emerald" : docTone(type)}>{type === "ALL" ? "all docs" : "selected"}</Badge>
                </button>
              ))}
            </div>
          </PanelSection>

          <PanelSection title="Totals">
            <div className="divide-y divide-slate-800">
              {[
                ["Amount", `${formData.currency} ${totalAmount.toFixed(2)}`],
                ["Net Weight", `${totalNetWeight.toFixed(1)} kg`],
                ["Gross Weight", `${totalGrossWeight.toFixed(1)} kg`],
                ["Packages", String(totalPackages)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between px-3 py-2">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className="font-mono text-xs text-slate-200">{value}</span>
                </div>
              ))}
            </div>
          </PanelSection>

          {error && (
            <div className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</div>
          )}
        </aside>

        <main className="min-h-0 overflow-y-auto p-3">
          <div className="mb-3 grid grid-cols-3 gap-1 rounded-md border border-slate-800 bg-slate-900/75 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  if (tab.key === "history") fetchHistory();
                }}
                className={`flex h-8 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold ${activeTab === tab.key ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-800 hover:text-slate-200"}`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && <Badge tone={tab.tone}>{tab.count}</Badge>}
              </button>
            ))}
          </div>

          {activeTab === "form" && (
            <div className="space-y-3">
              <FieldGrid title="Company">
                {renderFields([
                  { label: "Company Name", key: "name" },
                  { label: "Address", key: "address" },
                  { label: "Phone", key: "phone", mono: true },
                  { label: "Email", key: "email", type: "email", mono: true },
                ], "company")}
              </FieldGrid>

              <FieldGrid title="Customer">
                {renderFields([
                  { label: "Company Name", key: "company_name" },
                  { label: "Contact", key: "contact" },
                  { label: "Email", key: "email", type: "email", mono: true },
                  { label: "Phone", key: "phone", mono: true },
                  { label: "Address", key: "address" },
                  { label: "Country", key: "country" },
                ], "customer")}
              </FieldGrid>

              <FieldGrid title="Shipment">
                {renderFields([
                  { label: "Ship Date", key: "date", type: "date", mono: true },
                  { label: "Vessel / Flight", key: "vessel" },
                  { label: "Departure Port", key: "departure_port" },
                  { label: "Destination Port", key: "destination_port" },
                  { label: "Incoterms", key: "incoterms", mono: true },
                  { label: "Origin", key: "country_of_origin" },
                  { label: "Marks", key: "marks" },
                ], "shipment")}
              </FieldGrid>

              <PanelSection title="Product Lines" action={<CommandButton size="xs" onClick={addProduct}>Add Line</CommandButton>}>
                <div className="divide-y divide-slate-800">
                  {formData.products.map((product, index) => (
                    <div key={index} className="space-y-3 p-3">
                      <div className="flex items-center justify-between">
                        <Badge tone="blue">LINE {index + 1}</Badge>
                        {formData.products.length > 1 && (
                          <button onClick={() => removeProduct(index)} className="font-mono text-[10px] uppercase text-red-400 hover:text-red-300">Remove</button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                        <InputField label="Description" value={product.description} onChange={(e) => updateProduct(index, "description", e.target.value)} placeholder="HDMI 2.1 Cable" />
                        <InputField label="Specification" value={product.specification} onChange={(e) => updateProduct(index, "specification", e.target.value)} placeholder="8K@60Hz, 2m" />
                        <InputField label="HS Code" mono value={product.hs_code} onChange={(e) => updateProduct(index, "hs_code", e.target.value)} placeholder="8544.42" />
                        <InputField label="Quantity" type="number" mono value={product.quantity || ""} onChange={(e) => updateProduct(index, "quantity", Number(e.target.value))} />
                        <InputField label={`Unit Price ${formData.currency}`} type="number" step="0.01" mono value={product.unit_price || ""} onChange={(e) => updateProduct(index, "unit_price", Number(e.target.value))} />
                        <InputField label="Net kg" type="number" step="0.1" mono value={product.net_weight_kg || ""} onChange={(e) => updateProduct(index, "net_weight_kg", Number(e.target.value))} />
                        <InputField label="Gross kg" type="number" step="0.1" mono value={product.gross_weight_kg || ""} onChange={(e) => updateProduct(index, "gross_weight_kg", Number(e.target.value))} />
                        <InputField label="Dimensions cm" mono value={product.dimensions_cm} onChange={(e) => updateProduct(index, "dimensions_cm", e.target.value)} placeholder="50x30x25" />
                        <InputField label="Package Type" value={product.package_type} onChange={(e) => updateProduct(index, "package_type", e.target.value)} />
                        <InputField label="Packages" type="number" mono value={product.packages || ""} onChange={(e) => updateProduct(index, "packages", Number(e.target.value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </PanelSection>

              <FieldGrid title="Document Numbers">
                <InputField label="PI Number" mono value={formData.pi_info.pi_no} onChange={(e) => updateField("pi_info", "pi_no", e.target.value)} />
                <InputField label="PI Valid Until" type="date" mono value={formData.pi_info.valid_until} onChange={(e) => updateField("pi_info", "valid_until", e.target.value)} />
                <InputField label="CI Number" mono value={formData.ci_info.ci_no} onChange={(e) => updateField("ci_info", "ci_no", e.target.value)} />
                <InputField label="CI Date" type="date" mono value={formData.ci_info.ci_date} onChange={(e) => updateField("ci_info", "ci_date", e.target.value)} />
                <InputField label="Payment Terms" value={formData.ci_info.payment_terms} onChange={(e) => updateField("ci_info", "payment_terms", e.target.value)} />
                <InputField label="PL Number" mono value={formData.pl_info.pl_no} onChange={(e) => updateField("pl_info", "pl_no", e.target.value)} />
              </FieldGrid>

              <PanelSection title="Commercial Settings">
                <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-3">
                  <SelectField label="Currency" value={formData.currency} onChange={(e) => setFormData((prev) => ({ ...prev, currency: e.target.value }))}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="CNY">CNY</option>
                    <option value="GBP">GBP</option>
                  </SelectField>
                  <InputField label="Freight" type="number" step="0.01" mono value={formData.freight || ""} onChange={(e) => setFormData((prev) => ({ ...prev, freight: Number(e.target.value) }))} />
                  <InputField label="Insurance" type="number" step="0.01" mono value={formData.insurance || ""} onChange={(e) => setFormData((prev) => ({ ...prev, insurance: Number(e.target.value) }))} />
                </div>
              </PanelSection>
            </div>
          )}

          {activeTab === "preview" && (
            <PanelSection title="Generated Documents" action={<Badge tone={generatedDocs.length ? "emerald" : "neutral"}>{generatedDocs.length}</Badge>}>
              {generatedDocs.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">
                  No generated documents in this session.
                  <div className="mt-3"><CommandButton size="xs" onClick={() => setActiveTab("form")}>Open Builder</CommandButton></div>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {generatedDocs.map((doc) => (
                    <div key={doc.path} className="grid grid-cols-1 gap-2 px-3 py-2 md:grid-cols-[100px_1fr_110px] md:items-center">
                      <Badge tone={docTone(doc.type)}>{doc.type}</Badge>
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-slate-200">{doc.filename}</p>
                        <p className="truncate font-mono text-[10px] text-slate-600">{doc.path}</p>
                      </div>
                      <p className="font-mono text-[11px] text-slate-500">{(doc.size / 1024).toFixed(1)} KB</p>
                    </div>
                  ))}
                </div>
              )}
            </PanelSection>
          )}

          {activeTab === "history" && (
            <PanelSection title="Document History" action={<CommandButton variant="ghost" size="xs" onClick={fetchHistory}>Refresh</CommandButton>}>
              {historyDocs.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">No historical documents found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="border-b border-slate-800 bg-slate-950/50 text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Filename</th>
                        <th className="px-3 py-2 font-semibold">Size</th>
                        <th className="px-3 py-2 font-semibold">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {historyDocs.map((doc) => (
                        <tr key={doc.path} className="hover:bg-slate-800/30">
                          <td className="px-3 py-2"><Badge tone={docTone(doc.type)}>{doc.type}</Badge></td>
                          <td className="max-w-[420px] truncate px-3 py-2 font-mono text-[11px] text-slate-300">{doc.filename}</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{(doc.size / 1024).toFixed(1)} KB</td>
                          <td className="px-3 py-2 font-mono text-[11px] text-slate-500">{new Date(doc.created).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </PanelSection>
          )}
        </main>
      </div>
    </PageShell>
  );
}
