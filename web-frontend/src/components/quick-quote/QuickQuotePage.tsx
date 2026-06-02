"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  calculateQuickQuote,
  createQuickQuoteDefaults,
  type QuickQuoteData,
  type QuickQuoteLine,
} from "@/lib/quick-quote";
import type { CustomerSuggestion, PriceReference } from "@/lib/quick-quote-reference";
import {
  BattleBadge,
  BattleText,
  BattlePageBody,
  BattlePageHeader,
  BattlePageShell,
  BattlePanel,
  CommandButton,
  InputField,
  SelectField,
  StatCell,
  TextAreaField,
  useBattleLanguage,
} from "@/components/ui/BattlePage";

const currencies = ["USD", "EUR", "CNY", "GBP"];
const incoterms = ["FOB Shenzhen", "EXW", "CIF", "DAP", "DDP"];

interface ExchangeRateReference {
  status: "available" | "unavailable";
  base: "USD";
  quoteCurrency: string;
  rates: Record<string, number>;
  provider: string;
  updatedAt: string;
  error?: string;
}

interface QuickQuoteReferenceState {
  customerSuggestions: CustomerSuggestion[];
  customerPriceReferences: PriceReference[];
  similarProductReferences: PriceReference[];
  exchangeRate: ExchangeRateReference | null;
}

interface QuickQuoteExportResult {
  piNo: string;
  customer: string;
  packageDir: string;
  git: {
    committed: boolean;
    commitHash: string;
    message: string;
  };
}

interface QuickQuotePageProps {
  active?: "/documents" | "/quotations";
  backHref?: string;
}

interface QuoteChatMessage {
  id: string;
  role: "user" | "jaden";
  text: string;
}

function formatMoney(currency: string, value: number) {
  return `${currency} ${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function numberValue(value: string) {
  if (value.trim() === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function previewCustomer(data: QuickQuoteData) {
  return data.customer || "Customer not set";
}

function formatUnitPrice(reference: PriceReference) {
  return `${reference.currency} ${reference.unitPrice.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

function formatUnitCost(reference: PriceReference, language: "en" | "zh") {
  if (!reference.unitCost) return language === "zh" ? "成本未记录" : "cost not recorded";
  return `${language === "zh" ? "成本" : "Cost"} ${reference.costCurrency || reference.currency} ${reference.unitCost.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
}

function supplierLine(reference: PriceReference, language: "en" | "zh") {
  const suppliers = [reference.supplier, ...(reference.supplierCandidates || [])]
    .map((item) => item.trim())
    .filter(Boolean);
  const uniqueSuppliers = Array.from(new Set(suppliers));
  if (uniqueSuppliers.length === 0) return language === "zh" ? "供应商未记录" : "supplier not recorded";
  return `${language === "zh" ? "供应商" : "Supplier"} ${uniqueSuppliers.slice(0, 2).join(" / ")}`;
}

function rateLine(rate: ExchangeRateReference | null, language: "en" | "zh") {
  if (!rate) return language === "zh" ? "正在读取汇率参考" : "Loading exchange rates";
  if (rate.status === "unavailable") return language === "zh" ? "实时汇率暂不可用" : "Exchange rates unavailable";
  const cnyRate = rate.rates.CNY;
  const parts = ["USD", "EUR", "GBP"]
    .map((currency) => {
      const baseRate = currency === "USD" ? 1 : rate.rates[currency];
      if (!cnyRate || !baseRate) return "";
      return `${currency}/CNY ${(cnyRate / baseRate).toFixed(4)}`;
    })
    .filter(Boolean);
  return parts.join(" · ") || (language === "zh" ? "暂无交叉汇率" : "No cross rates");
}

function referenceDate(value: string) {
  return value ? value.slice(0, 10) : "-";
}

export default function QuickQuotePage({
  active = "/documents",
  backHref = "/documents",
}: QuickQuotePageProps) {
  const language = useBattleLanguage();
  const isQuotationEntry = active === "/quotations";
  const [quote, setQuote] = useState<QuickQuoteData>(() => createQuickQuoteDefaults());
  const [reference, setReference] = useState<QuickQuoteReferenceState>({
    customerSuggestions: [],
    customerPriceReferences: [],
    similarProductReferences: [],
    exchangeRate: null,
  });
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [exportingPi, setExportingPi] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportResult, setExportResult] = useState<QuickQuoteExportResult | null>(null);
  const [quoteChatInput, setQuoteChatInput] = useState("");
  const [quoteChatMessages, setQuoteChatMessages] = useState<QuoteChatMessage[]>([]);
  const [modifyingQuote, setModifyingQuote] = useState(false);
  const [modifyError, setModifyError] = useState("");
  const calculation = useMemo(() => calculateQuickQuote(quote), [quote]);
  const referenceProducts = useMemo(
    () => quote.lines
      .map((line) => [line.description, line.specification].filter(Boolean).join(" "))
      .filter(Boolean),
    [quote.lines]
  );

  function updateQuote<K extends keyof QuickQuoteData>(field: K, value: QuickQuoteData[K]) {
    setQuote((current) => ({ ...current, [field]: value }));
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setReferenceLoading(true);
      setReferenceError("");
      const params = new URLSearchParams({
        project: "farreach",
        scope: "customers",
        customer: quote.customer,
      });

      try {
        const response = await fetch(`/api/documents/quick-quote/reference?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Failed to load quote references");
        const data = json.data as Partial<QuickQuoteReferenceState>;
        setReference((current) => ({
          ...current,
          customerSuggestions: data.customerSuggestions || [],
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setReferenceError(error instanceof Error ? error.message : "Failed to load quote references");
        }
      } finally {
        if (!controller.signal.aborted) setReferenceLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [quote.customer]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        project: "farreach",
        scope: "prices",
        customer: quote.customer,
        products: referenceProducts.join(","),
      });

      try {
        const response = await fetch(`/api/documents/quick-quote/reference?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Failed to load quote references");
        const data = json.data as Partial<QuickQuoteReferenceState>;
        setReference((current) => ({
          ...current,
          customerPriceReferences: data.customerPriceReferences || [],
          similarProductReferences: data.similarProductReferences || [],
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setReferenceError(error instanceof Error ? error.message : "Failed to load quote references");
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [quote.customer, referenceProducts]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        project: "farreach",
        scope: "exchange",
        currency: quote.currency,
      });

      try {
        const response = await fetch(`/api/documents/quick-quote/reference?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok || !json.success) throw new Error(json.error || "Failed to load exchange rates");
        const data = json.data as Partial<QuickQuoteReferenceState>;
        setReference((current) => ({
          ...current,
          exchangeRate: data.exchangeRate || null,
        }));
      } catch (error) {
        if (!controller.signal.aborted) {
          setReferenceError(error instanceof Error ? error.message : "Failed to load exchange rates");
        }
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [quote.currency]);

  function updateCharge(field: keyof QuickQuoteData["charges"], value: number) {
    setQuote((current) => ({
      ...current,
      charges: { ...current.charges, [field]: value },
    }));
  }

  function updateLine(id: string, field: keyof QuickQuoteLine, value: string | number) {
    setQuote((current) => ({
      ...current,
      lines: current.lines.map((line) => line.id === id ? { ...line, [field]: value } : line),
    }));
  }

  function addLine() {
    setQuote((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: `line-${Date.now()}`,
          description: "",
          specification: "",
          quantity: 0,
          unitCost: 0,
          marginPercent: 25,
          supplier: "",
        },
      ],
    }));
  }

  function removeLine(id: string) {
    setQuote((current) => ({
      ...current,
      lines: current.lines.length === 1
        ? current.lines
        : current.lines.filter((line) => line.id !== id),
    }));
  }

  function applyCustomerSuggestion(suggestion: CustomerSuggestion) {
    setQuote((current) => ({
      ...current,
      customer: suggestion.name,
      contact: suggestion.contact || current.contact,
      email: suggestion.email || current.email,
      country: suggestion.country || current.country,
    }));
  }

  async function modifyQuoteFromChat(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = quoteChatInput.trim();
    if (!message || modifyingQuote) return;

    const userMessage: QuoteChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: message,
    };
    setQuoteChatMessages((current) => [...current, userMessage]);
    setQuoteChatInput("");
    setModifyError("");
    setModifyingQuote(true);

    try {
      const response = await fetch("/api/documents/quick-quote/modify?project=farreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote, message }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Failed to modify quote");
      setQuote(json.updatedQuote as QuickQuoteData);
      setQuoteChatMessages((current) => [
        ...current,
        {
          id: `jaden-${Date.now()}`,
          role: "jaden",
          text: json.reply || (language === "zh" ? "已更新当前报价。" : "Updated the current quote."),
        },
      ]);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Failed to modify quote";
      setModifyError(messageText);
      setQuoteChatMessages((current) => [
        ...current,
        {
          id: `jaden-${Date.now()}`,
          role: "jaden",
          text: language === "zh" ? `未能修改：${messageText}` : `Could not modify: ${messageText}`,
        },
      ]);
    } finally {
      setModifyingQuote(false);
    }
  }

  async function exportPiPackage() {
    setExportingPi(true);
    setExportError("");
    setExportResult(null);
    try {
      const response = await fetch("/api/documents/quick-quote/export-pi?project=farreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quote }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.error || "Failed to export PI package");
      setExportResult(json.data as QuickQuoteExportResult);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "Failed to export PI package");
    } finally {
      setExportingPi(false);
    }
  }

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Quick Quote"
        zhTitle="快速报价"
        meta={isQuotationEntry ? "QUOTATIONS / QUOTE PREVIEW / NOT SENT" : "DOCUMENTS / QUOTE PREVIEW / NOT SENT"}
        zhMeta={isQuotationEntry ? "报价 / 报价预览 / 不会外发" : "单证 / 报价预览 / 不会外发"}
        active={active}
      >
        <BattleBadge tone="emerald">
          <BattleText en="PREVIEW" zh="预览" />
        </BattleBadge>
        <Link
          href={backHref}
          className="inline-flex h-7 items-center rounded-md border border-slate-800 bg-transparent px-3 text-xs font-semibold text-slate-400 transition hover:text-slate-200"
        >
          <BattleText en="Back" zh={isQuotationEntry ? "返回报价" : "返回单证"} />
        </Link>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "报价编号" : "Quote No."} value={quote.quoteNo} tone="blue" />
          <StatCell label={language === "zh" ? "客户名称" : "Customer"} value={quote.customer || (language === "zh" ? "未填写" : "Not set")} tone="purple" />
          <StatCell label={language === "zh" ? "毛利预估" : "Profit Estimate"} value={formatMoney(quote.currency, calculation.totalProfit)} tone="emerald" />
          <StatCell label={language === "zh" ? "总金额" : "Grand Total"} value={formatMoney(quote.currency, calculation.grandTotal)} tone="amber" />
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)] xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
          <div className="space-y-3">
            <BattlePanel title={language === "zh" ? "客户与条款" : "Customer And Terms"} meta={quote.quoteNo}>
              <div className="grid gap-2 p-3 md:grid-cols-2">
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "报价编号" : "Quote No."}
                  <InputField value={quote.quoteNo} onChange={(event) => updateQuote("quoteNo", event.target.value)} className="mt-1 w-full" mono />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "报价日期" : "Date"}
                  <InputField type="date" value={quote.date} onChange={(event) => updateQuote("date", event.target.value)} className="mt-1 w-full" mono />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "有效期" : "Valid Until"}
                  <InputField type="date" value={quote.validUntil} onChange={(event) => updateQuote("validUntil", event.target.value)} className="mt-1 w-full" mono />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "币种" : "Currency"}
                  <SelectField value={quote.currency} onChange={(event) => updateQuote("currency", event.target.value)} className="mt-1 w-full">
                    {currencies.map((currency) => <option key={currency}>{currency}</option>)}
                  </SelectField>
                </label>
                <label className="relative text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "客户公司" : "Customer"}
                  <InputField value={quote.customer} onChange={(event) => updateQuote("customer", event.target.value)} className="mt-1 w-full" />
                  {quote.customer.trim() && reference.customerSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-slate-700 bg-slate-950 shadow-xl">
                      {reference.customerSuggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.source}-${suggestion.name}-${suggestion.email}`}
                          type="button"
                          onClick={() => applyCustomerSuggestion(suggestion)}
                          className="block w-full border-b border-slate-800 px-2 py-2 text-left last:border-b-0 hover:bg-slate-900"
                        >
                          <span className="block truncate text-xs font-semibold normal-case tracking-normal text-slate-200">
                            {suggestion.name}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-[10px] normal-case tracking-normal text-slate-500">
                            {[suggestion.contact, suggestion.email, suggestion.country, suggestion.source].filter(Boolean).join(" / ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "联系人" : "Contact"}
                  <InputField value={quote.contact} onChange={(event) => updateQuote("contact", event.target.value)} className="mt-1 w-full" />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "邮箱" : "Email"}
                  <InputField value={quote.email} onChange={(event) => updateQuote("email", event.target.value)} className="mt-1 w-full" mono />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "国家/地区" : "Country"}
                  <InputField value={quote.country} onChange={(event) => updateQuote("country", event.target.value)} className="mt-1 w-full" />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "贸易条款" : "Incoterms"}
                  <SelectField value={quote.incoterms} onChange={(event) => updateQuote("incoterms", event.target.value)} className="mt-1 w-full">
                    {incoterms.map((term) => <option key={term}>{term}</option>)}
                  </SelectField>
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "交期" : "Lead Time"}
                  <InputField value={quote.leadTime} onChange={(event) => updateQuote("leadTime", event.target.value)} className="mt-1 w-full" />
                </label>
                <label className="md:col-span-2 text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "付款条款" : "Payment Terms"}
                  <InputField value={quote.paymentTerms} onChange={(event) => updateQuote("paymentTerms", event.target.value)} className="mt-1 w-full" />
                </label>
              </div>
            </BattlePanel>

            <BattlePanel
              title={language === "zh" ? "产品与价格" : "Products And Pricing"}
              meta={language === "zh" ? "输入成本和利润率，右侧实时预览" : "cost plus margin, preview updates live"}
              action={
                <CommandButton variant="secondary" onClick={addLine}>
                  <BattleText en="Add Line" zh="增加产品" />
                </CommandButton>
              }
            >
              <div className="divide-y divide-slate-800">
                {quote.lines.map((line, index) => {
                  const calculated = calculation.lines.find((item) => item.id === line.id);
                  return (
                    <div key={line.id} className="grid gap-2 p-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_90px_100px_minmax(0,0.9fr)_90px_86px]">
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        {language === "zh" ? `产品 ${index + 1}` : `Item ${index + 1}`}
                        <InputField value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} placeholder={language === "zh" ? "产品名称" : "Product name"} className="mt-1 w-full" />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        {language === "zh" ? "规格" : "Spec"}
                        <InputField value={line.specification} onChange={(event) => updateLine(line.id, "specification", event.target.value)} placeholder={language === "zh" ? "规格/型号" : "Spec/model"} className="mt-1 w-full" />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        {language === "zh" ? "数量" : "Qty"}
                        <InputField type="number" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", numberValue(event.target.value))} className="mt-1 w-full" mono />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        {language === "zh" ? "成本" : "Cost"}
                        <InputField type="number" value={line.unitCost} onChange={(event) => updateLine(line.id, "unitCost", numberValue(event.target.value))} className="mt-1 w-full" mono />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        {language === "zh" ? "供应商" : "Supplier"}
                        <InputField value={line.supplier} onChange={(event) => updateLine(line.id, "supplier", event.target.value)} placeholder={language === "zh" ? "内部记录" : "Internal only"} className="mt-1 w-full" />
                      </label>
                      <label className="text-[10px] uppercase tracking-wide text-slate-500">
                        {language === "zh" ? "利润%" : "Margin %"}
                        <InputField type="number" value={line.marginPercent} onChange={(event) => updateLine(line.id, "marginPercent", numberValue(event.target.value))} className="mt-1 w-full" mono />
                      </label>
                      <div className="flex items-end justify-between gap-2">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-slate-500">
                            {language === "zh" ? "单价" : "Price"}
                          </p>
                          <p className="mt-1 font-mono text-xs text-emerald-300">
                            {calculated ? calculated.unitPrice.toFixed(2) : "0.00"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(line.id)}
                          disabled={quote.lines.length === 1}
                          className="h-8 rounded-md border border-slate-700 px-2 font-mono text-[10px] text-slate-400 transition hover:border-red-500 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          {language === "zh" ? "删" : "Del"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </BattlePanel>

            <BattlePanel
              title={language === "zh" ? "内部参考" : "Internal References"}
              meta={language === "zh" ? "只给销售看，不进入客户报价预览" : "sales-only; not included in customer preview"}
            >
              <div className="grid gap-3 p-3 lg:grid-cols-3">
                <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    {language === "zh" ? "实时汇率参考" : "Exchange Reference"}
                  </p>
                  <p className="mt-2 font-mono text-xs text-slate-200">{rateLine(reference.exchangeRate, language)}</p>
                  <p className="mt-2 text-[10px] text-slate-600">
                    {reference.exchangeRate
                      ? `${reference.exchangeRate.provider} / ${referenceDate(reference.exchangeRate.updatedAt)}`
                      : (language === "zh" ? "等待数据" : "waiting for data")}
                  </p>
                </div>

                <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    {language === "zh" ? "客户历史参考价" : "Customer Price History"}
                  </p>
                  <div className="mt-2 space-y-2">
                    {reference.customerPriceReferences.length === 0 ? (
                      <p className="text-xs text-slate-600">
                        {language === "zh" ? "暂无同客户历史价" : "No same-customer price yet"}
                      </p>
                    ) : reference.customerPriceReferences.map((item) => (
                      <div key={`${item.source}-${item.product}`} className="text-xs">
                        <p className="truncate font-semibold text-slate-200">{item.product}</p>
                        <p className="font-mono text-emerald-300">{formatUnitPrice(item)} · {item.quantity}</p>
                        <p className="font-mono text-[10px] text-slate-400">{formatUnitCost(item, language)}</p>
                        <p className="truncate text-[10px] text-slate-500">{supplierLine(item, language)}</p>
                        <p className="truncate text-[10px] text-slate-600">{item.source} / {referenceDate(item.date)}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-md border border-slate-800 bg-slate-950/70 p-3">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">
                    {language === "zh" ? "同类出货参考价" : "Similar Shipment Prices"}
                  </p>
                  <div className="mt-2 space-y-2">
                    {reference.similarProductReferences.length === 0 ? (
                      <p className="text-xs text-slate-600">
                        {language === "zh" ? "输入产品名后匹配" : "Enter product names to match"}
                      </p>
                    ) : reference.similarProductReferences.map((item) => (
                      <div key={`${item.source}-${item.customer}-${item.product}`} className="text-xs">
                        <p className="truncate font-semibold text-slate-200">{item.product}</p>
                        <p className="font-mono text-amber-300">{formatUnitPrice(item)} · {item.quantity}</p>
                        <p className="font-mono text-[10px] text-slate-400">{formatUnitCost(item, language)}</p>
                        <p className="truncate text-[10px] text-slate-500">{supplierLine(item, language)}</p>
                        <p className="truncate text-[10px] text-slate-600">{item.customer} / {item.source}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {(referenceLoading || referenceError) && (
                <div className="border-t border-slate-800 px-3 py-2 font-mono text-[10px] text-slate-600">
                  {referenceLoading
                    ? (language === "zh" ? "正在更新参考信息" : "refreshing references")
                    : referenceError}
                </div>
              )}
            </BattlePanel>

            <BattlePanel title={language === "zh" ? "费用与备注" : "Charges And Notes"} meta={quote.incoterms}>
              <div className="grid gap-2 p-3 md:grid-cols-3">
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "运费" : "Freight"}
                  <InputField type="number" value={quote.charges.freight} onChange={(event) => updateCharge("freight", numberValue(event.target.value))} className="mt-1 w-full" mono />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "包装/杂费" : "Packing"}
                  <InputField type="number" value={quote.charges.packing} onChange={(event) => updateCharge("packing", numberValue(event.target.value))} className="mt-1 w-full" mono />
                </label>
                <label className="text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "折扣" : "Discount"}
                  <InputField type="number" value={quote.charges.discount} onChange={(event) => updateCharge("discount", numberValue(event.target.value))} className="mt-1 w-full" mono />
                </label>
                <label className="md:col-span-3 text-[10px] uppercase tracking-wide text-slate-500">
                  {language === "zh" ? "备注" : "Notes"}
                  <TextAreaField value={quote.notes} onChange={(event) => updateQuote("notes", event.target.value)} className="mt-1 min-h-20 w-full" />
                </label>
              </div>
            </BattlePanel>
          </div>

          <div className="space-y-3 xl:sticky xl:top-4 xl:self-start">
            <BattlePanel
              title={language === "zh" ? "报价预览" : "Quote Preview"}
              meta={previewCustomer(quote)}
            >
            <div className="bg-slate-50 p-5 text-slate-950">
              <div className="flex items-start justify-between gap-4 border-b border-slate-300 pb-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Quotation</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight">{quote.seller}</h2>
                  <p className="mt-1 font-mono text-xs text-slate-500">{quote.quoteNo}</p>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <p>{quote.date}</p>
                  <p>{quote.validUntil ? `Valid Until ${quote.validUntil}` : ""}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 text-xs md:grid-cols-2">
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-500">Bill To</p>
                  <p className="mt-1 font-semibold text-slate-900">{previewCustomer(quote)}</p>
                  <p className="text-slate-600">{quote.contact || "-"}</p>
                  <p className="text-slate-600">{quote.email || "-"}</p>
                  <p className="text-slate-600">{quote.country || "-"}</p>
                </div>
                <div>
                  <p className="font-semibold uppercase tracking-wide text-slate-500">Terms</p>
                  <p className="mt-1 text-slate-700">{quote.incoterms}</p>
                  <p className="text-slate-700">{quote.paymentTerms}</p>
                  <p className="text-slate-700">{quote.leadTime}</p>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded border border-slate-300">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-white">
                    <tr>
                      <th className="px-2 py-2">Item</th>
                      <th className="px-2 py-2">Specification</th>
                      <th className="px-2 py-2 text-right">Qty</th>
                      <th className="px-2 py-2 text-right">Unit Price</th>
                      <th className="px-2 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {calculation.lines.map((line) => (
                      <tr key={line.id}>
                        <td className="px-2 py-2 font-medium text-slate-900">{line.description || "-"}</td>
                        <td className="px-2 py-2 text-slate-600">{line.specification || "-"}</td>
                        <td className="px-2 py-2 text-right font-mono">{line.quantity}</td>
                        <td className="px-2 py-2 text-right font-mono">{line.unitPrice.toFixed(2)}</td>
                        <td className="px-2 py-2 text-right font-mono">{line.amount.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product Amount</span>
                  <span className="font-mono">{formatMoney(quote.currency, calculation.subtotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Charges</span>
                  <span className="font-mono">{formatMoney(quote.currency, calculation.totalCharges)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold">
                  <span>Grand Total</span>
                  <span className="font-mono">{formatMoney(quote.currency, calculation.grandTotal)}</span>
                </div>
              </div>

              {quote.notes && (
                <div className="mt-5 rounded border border-slate-300 bg-slate-100 p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap">{quote.notes}</p>
                </div>
              )}
            </div>
              <div className="border-t border-slate-800 bg-slate-950/55 p-3">
                <CommandButton variant="primary" className="w-full" disabled={exportingPi} onClick={exportPiPackage}>
                  {exportingPi ? <BattleText en="Exporting PI" zh="导出中" /> : <BattleText en="Export PI" zh="导出 PI" />}
                </CommandButton>
                {(exportResult || exportError) && (
                  <div className="mt-3 rounded-md border border-slate-800 bg-slate-950/75 p-3 text-xs">
                    {exportResult ? (
                      <>
                        <p className="text-slate-300">
                          <BattleText en="Customer folder created with English PI, cost file, and product material index." zh="已创建客户文件夹，包含英文 PI、价格成本文件和产品资料索引。" />
                        </p>
                        <p className="mt-2 break-all font-mono text-[10px] text-slate-500">{exportResult.packageDir}</p>
                        <p className="mt-2 font-mono text-[10px] text-emerald-400">
                          git {exportResult.git.committed ? "commit" : "version"} {exportResult.git.commitHash}
                        </p>
                      </>
                    ) : (
                      <p className="font-mono text-[10px] text-red-300">{exportError}</p>
                    )}
                  </div>
                )}
              </div>
            </BattlePanel>

            <BattlePanel
              title={language === "zh" ? "Jaden 修改报价" : "Jaden Quote Edit"}
              meta={language === "zh" ? "自然语言改当前报价" : "natural-language quote edits"}
              tone="emerald"
            >
              <div className="space-y-3 p-3">
                <div className="max-h-36 space-y-2 overflow-y-auto">
                  {quoteChatMessages.length === 0 ? (
                    <p className="rounded-md border border-slate-800 bg-slate-950/60 px-3 py-3 text-xs text-slate-500">
                      {language === "zh" ? "等待修改指令" : "Waiting for an edit request"}
                    </p>
                  ) : quoteChatMessages.map((message) => (
                    <div
                      key={message.id}
                      className={`rounded-md border px-3 py-2 text-xs ${
                        message.role === "user"
                          ? "ml-8 border-blue-500/30 bg-blue-500/10 text-blue-100"
                          : "mr-8 border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      }`}
                    >
                      <p className="font-mono text-[10px] uppercase text-slate-500">
                        {message.role === "user" ? (language === "zh" ? "你" : "You") : "Jaden"}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{message.text}</p>
                    </div>
                  ))}
                </div>

                <form className="space-y-2" onSubmit={modifyQuoteFromChat}>
                  <TextAreaField
                    value={quoteChatInput}
                    onChange={(event) => setQuoteChatInput(event.target.value)}
                    placeholder={language === "zh" ? "例如：利润率改成35%，运费加120，备注写valid for 7 days" : "Example: change margin to 35%, add freight 120, note valid for 7 days"}
                    className="min-h-20 w-full"
                  />
                  {modifyError && <p className="font-mono text-[10px] text-red-300">{modifyError}</p>}
                  <CommandButton type="submit" variant="primary" className="w-full" disabled={modifyingQuote || !quoteChatInput.trim()}>
                    {modifyingQuote ? <BattleText en="Updating" zh="修改中" /> : <BattleText en="Apply Edit" zh="执行修改" />}
                  </CommandButton>
                </form>
              </div>
            </BattlePanel>
          </div>
        </div>
      </BattlePageBody>
    </BattlePageShell>
  );
}
