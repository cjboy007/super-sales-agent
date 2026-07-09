"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  InputField,
  SelectField,
  StatCell,
  type BattleTone,
  useBattleLanguage,
} from "@/components/ui/BattlePage";
import PageCommandPanel from "@/components/ui/PageCommandPanel";

type CustomerStatus = "Prospect" | "Active Customer" | "Dormant" | "Risk" | "Archived";
type CustomerIntelStatus = "not_started" | "queued" | "running" | "ready" | "failed" | "partial";
type CustomerIntelRating = "Hot" | "Warm" | "Cold" | "Unknown";
type CustomerDetailTab = "overview" | "orders" | "activity";
type CustomerAccessIssue = "none" | "beta_required" | "workspace_denied";

interface CustomerContact {
  name: string;
  role: string;
  email: string;
  emailStatus: string;
  sourceNote: string;
}

interface CustomerOrder {
  type: "PI" | "QT" | "SPL" | "Order";
  date: string;
  productType: string;
  amount: string;
  currency: string;
  status: string;
  lifecycle: {
    stage: "quote" | "payment" | "production" | "shipment" | "after_sales" | "refund" | "exception";
    paymentStatus?: "not_started" | "pending" | "partial" | "paid" | "overdue" | "refunded";
    fulfillmentStatus?: "not_started" | "preparing" | "shipped" | "delivered" | "exception";
    nextStep: string;
  };
}

interface CustomerInteraction {
  date: string;
  type: "Lead" | "Intel" | "Quote" | "Order" | "Email" | "Follow-up" | "Lifecycle" | "Payment" | "Shipment" | "After-sales" | "Refund" | "Exception";
  summary: string;
}

interface CustomerStatusExplanation {
  status: CustomerStatus;
  reason: string;
  signals: string[];
  updatedAt: string;
  manualOverride: boolean;
  ruleId: string;
  priority: number;
  enteredWhen: string;
  exitsWhen: string;
}

interface CustomerIntelligence {
  status: CustomerIntelStatus;
  score: number | null;
  rating: CustomerIntelRating;
  completenessLabel: string;
  companySummary: string;
  productFit: string;
  salesAngle: string;
  riskSummary: string;
  generatedAt: string;
}

interface Customer {
  id: string;
  companyName: string;
  country: string;
  website: string;
  domain: string;
  industry: string;
  status: CustomerStatus;
  statusExplanation: CustomerStatusExplanation;
  sourceCount: number;
  sourceSummary: string;
  intelligence: CustomerIntelligence;
  contacts: CustomerContact[];
  orders: CustomerOrder[];
  interactions: CustomerInteraction[];
  nextActions: string[];
  recentSummary: string;
  updatedAt: string;
}

interface CustomerStats {
  total: number;
  prospect: number;
  active: number;
  dormant: number;
  risk: number;
  archived: number;
  countries: number;
}

interface CustomerDirectory {
  customers: Customer[];
  stats: CustomerStats;
  countries: string[];
  statuses: CustomerStatus[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  updatedAt: string;
}

const PAGE_SIZE = 20;
const EMPTY_CUSTOMERS: Customer[] = [];
const DETAIL_TABS: CustomerDetailTab[] = ["overview", "orders", "activity"];
const ACCESS_PROMPT_HREF = "/settings";

function statusTone(status: CustomerStatus): BattleTone {
  if (status === "Active Customer") return "emerald";
  if (status === "Prospect") return "blue";
  if (status === "Risk") return "red";
  if (status === "Dormant") return "amber";
  return "neutral";
}

function ratingTone(rating: CustomerIntelRating): BattleTone {
  if (rating === "Hot") return "red";
  if (rating === "Warm") return "amber";
  if (rating === "Cold") return "neutral";
  return "blue";
}

function intelStatusTone(status: CustomerIntelStatus): BattleTone {
  if (status === "ready") return "emerald";
  if (status === "running" || status === "queued") return "blue";
  if (status === "failed") return "red";
  if (status === "partial") return "amber";
  return "neutral";
}

function statusLabel(status: CustomerStatus, language: "en" | "zh") {
  if (language === "en") return status;
  const labels: Record<CustomerStatus, string> = {
    Prospect: "潜在客户",
    "Active Customer": "活跃客户",
    Dormant: "休眠客户",
    Risk: "风险客户",
    Archived: "已归档",
  };
  return labels[status];
}

function statusModeLabel(customer: Customer, language: "en" | "zh") {
  if (customer.statusExplanation?.manualOverride) return language === "zh" ? "人工锁定" : "Manual lock";
  return language === "zh" ? "系统判断" : "Automatic";
}

function intelStatusLabel(customer: Customer, language: "en" | "zh") {
  if (customer.intelligence.status === "ready") {
    if (language === "zh") {
      return customer.intelligence.completenessLabel.toLowerCase().includes("partial") ? "背调待补全" : "背调已完成";
    }
    return customer.intelligence.completenessLabel || "Background ready";
  }
  if (customer.intelligence.status === "queued" || customer.intelligence.status === "running") {
    return language === "zh" ? "背调进行中" : "Background in progress";
  }
  if (customer.intelligence.status === "failed") return language === "zh" ? "背调待复核" : "Needs review";
  return language === "zh" ? "背调待补全" : "Background pending";
}

function emailStatusLabel(status: string, language: "en" | "zh") {
  const normalized = status || "unknown";
  if (language === "en") return normalized.replace(/_/g, " ");
  const labels: Record<string, string> = {
    verified: "已验证",
    invalid: "无效",
    catch_all: "统收",
    unknown: "未知",
    not_checked: "未验证",
  };
  return labels[normalized] || normalized.replace(/_/g, " ");
}

function displayDate(value: string) {
  if (!value) return "-";
  return value.replace("T", " ").slice(0, 10);
}

function displayValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

function detailTabLabel(tab: CustomerDetailTab, language: "en" | "zh") {
  const labels: Record<CustomerDetailTab, { en: string; zh: string }> = {
    overview: { en: "Overview", zh: "概览" },
    orders: { en: "Orders", zh: "订单" },
    activity: { en: "Activity", zh: "互动" },
  };
  return labels[tab][language];
}

function interactionTypeLabel(type: CustomerInteraction["type"], language: "en" | "zh") {
  if (language === "en") return type;
  const labels: Record<CustomerInteraction["type"], string> = {
    Lead: "来源",
    Intel: "背调",
    Quote: "报价",
    Order: "订单",
    Email: "邮件",
    "Follow-up": "跟进",
    Lifecycle: "状态",
    Payment: "付款",
    Shipment: "发货",
    "After-sales": "售后",
    Refund: "退款",
    Exception: "异常",
  };
  return labels[type];
}

function truncateText(value: string, max = 180) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max).trim()}...` : value;
}

function primaryContact(customer: Customer): CustomerContact | null {
  return customer.contacts[0] || null;
}

function latestBusinessInteraction(customer: Customer): CustomerInteraction | null {
  return customer.interactions.find((item) => item.type !== "Intel" && item.type !== "Lead") || customer.interactions[0] || null;
}

function orderStageLabel(order: CustomerOrder | undefined, language: "en" | "zh") {
  if (!order) return "-";
  const stage = order.lifecycle?.stage || "quote";
  if (language === "en") return stage.replace(/_/g, " ");
  const labels: Record<CustomerOrder["lifecycle"]["stage"], string> = {
    quote: "报价",
    payment: "付款",
    production: "生产",
    shipment: "发货",
    after_sales: "售后",
    refund: "退款",
    exception: "异常",
  };
  return labels[stage] || stage;
}

function orderPaymentLabel(order: CustomerOrder | undefined, language: "en" | "zh") {
  if (!order) return "-";
  const status = order.lifecycle?.paymentStatus || "not_started";
  if (language === "en") return status.replace(/_/g, " ");
  const labels: Record<NonNullable<CustomerOrder["lifecycle"]["paymentStatus"]>, string> = {
    not_started: "未开始",
    pending: "待付款",
    partial: "部分付款",
    paid: "已付款",
    overdue: "逾期",
    refunded: "已退款",
  };
  return labels[status] || status;
}

function orderFulfillmentLabel(order: CustomerOrder | undefined, language: "en" | "zh") {
  if (!order) return "-";
  const status = order.lifecycle?.fulfillmentStatus || "not_started";
  if (language === "en") return status.replace(/_/g, " ");
  const labels: Record<NonNullable<CustomerOrder["lifecycle"]["fulfillmentStatus"]>, string> = {
    not_started: "未开始",
    preparing: "准备中",
    shipped: "已发货",
    delivered: "已送达",
    exception: "异常",
  };
  return labels[status] || status;
}

function MetricTile({ label, value, hint, tone = "neutral" }: { label: string; value: string | number; hint?: string; tone?: BattleTone }) {
  const toneClass: Record<BattleTone, string> = {
    emerald: "text-emerald-200",
    blue: "text-sky-200",
    amber: "text-amber-200",
    red: "text-rose-200",
    purple: "text-violet-200",
    neutral: "text-slate-100",
  };
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-2 truncate text-2xl font-semibold tracking-normal ${toneClass[tone]}`}>{displayValue(value)}</p>
      {hint ? <p className="mt-1 truncate text-[11px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DetailPanel({ title, meta, children }: { title: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 border-t border-slate-800 px-5 py-5">
      <div className="mb-3 flex min-w-0 items-baseline justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-slate-100">{title}</h3>
        {meta ? <span className="shrink-0 text-[10px] text-slate-500">{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

function EmptyDetail({ label }: { label: string }) {
  return <p className="rounded-md border border-slate-800 bg-slate-950/70 px-3 py-3 text-xs leading-5 text-slate-500">{label}</p>;
}

function AccessPrompt({ issue, language, nextHref = ACCESS_PROMPT_HREF }: { issue: CustomerAccessIssue; language: "en" | "zh"; nextHref?: string }) {
  const denied = issue === "workspace_denied";
  return (
    <div className="px-4 py-10">
      <div className="mx-auto max-w-xl rounded-md border border-amber-500/30 bg-amber-500/10 px-5 py-6 text-center">
        <BattleBadge tone="amber">
          {denied ? <BattleText en="Workspace Access" zh="工作区权限" /> : <BattleText en="Workspace Unavailable" zh="工作区暂不可用" />}
        </BattleBadge>
        <p className="mt-4 text-sm font-semibold text-amber-50">
          {denied
            ? (language === "zh" ? "当前工作区无法打开这个客户视图。" : "The current workspace cannot open this customer view.")
            : (language === "zh" ? "客户、订单和时间线暂时无法加载。" : "Customers, orders, and timelines could not load.")}
        </p>
        <p className="mt-2 text-xs leading-5 text-amber-100/80">
          {language === "zh"
            ? "页面会保持客户数据、订单节点和后台运行信息分离，不会展示底层系统细节。"
            : "The page keeps customer data, order milestones, and operations status separated from system setup details."}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={nextHref}
            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300/40 bg-amber-300 px-4 text-xs font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            {language === "zh" ? "打开设置" : "Open Settings"}
          </Link>
          <Link
            href="/user-guide"
            className="inline-flex h-9 items-center justify-center rounded-md border border-amber-300/30 bg-slate-950/40 px-4 text-xs font-semibold text-amber-100 transition hover:border-amber-200/50"
          >
            {language === "zh" ? "使用指南" : "User guide"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function CustomerDetail({
  customer,
  language,
  detailTab,
  onDetailTabChange,
  onStatusOverride,
  onClearStatusOverride,
  statusSaving,
}: {
  customer: Customer;
  language: "en" | "zh";
  detailTab: CustomerDetailTab;
  onDetailTabChange: (tab: CustomerDetailTab) => void;
  onStatusOverride: (status: CustomerStatus, reason: string) => Promise<void>;
  onClearStatusOverride: (reason: string) => Promise<void>;
  statusSaving: boolean;
}) {
  const contact = primaryContact(customer);
  const latestOrder = customer.orders[0] || null;
  const latestInteraction = latestBusinessInteraction(customer);
  const scoreTone = ratingTone(customer.intelligence.rating);
  const [overrideStatus, setOverrideStatus] = useState<CustomerStatus>(customer.status);
  const [overrideReason, setOverrideReason] = useState("");

  useEffect(() => {
    setOverrideStatus(customer.status);
    setOverrideReason("");
  }, [customer.id, customer.status]);

  return (
    <div className="min-w-0">
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] text-slate-500">
              {[customer.country || "-", customer.domain || customer.website || ""].filter(Boolean).join(" / ")}
            </p>
            <h2 className="mt-2 break-words text-2xl font-semibold tracking-normal text-slate-50">{customer.companyName || "-"}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{truncateText(customer.recentSummary || customer.intelligence.salesAngle, 220)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <BattleBadge tone={statusTone(customer.status)}>{statusLabel(customer.status, language)}</BattleBadge>
            <BattleBadge tone={intelStatusTone(customer.intelligence.status)}>{intelStatusLabel(customer, language)}</BattleBadge>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricTile
            label={language === "zh" ? "背调分" : "Score"}
            value={customer.intelligence.score ?? "-"}
            hint={customer.intelligence.rating}
            tone={scoreTone}
          />
          <MetricTile
            label={language === "zh" ? "订单/报价" : "Orders"}
            value={customer.orders.length}
            hint={latestOrder ? latestOrder.type : language === "zh" ? "暂无记录" : "No record"}
            tone="blue"
          />
          <MetricTile
            label={language === "zh" ? "主要联系人" : "Contact"}
            value={contact?.name || "-"}
            hint={contact?.email || ""}
            tone="neutral"
          />
        </div>
      </div>

      <div className="border-b border-slate-800 px-5 py-3">
        <div className="grid max-w-md grid-cols-3 rounded-md border border-slate-800 bg-slate-950 p-1">
          {DETAIL_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onDetailTabChange(tab)}
              className={`h-8 rounded text-xs font-medium transition ${detailTab === tab ? "bg-slate-100 text-slate-950" : "text-slate-500 hover:text-slate-200"}`}
            >
              {detailTabLabel(tab, language)}
            </button>
          ))}
        </div>
      </div>

      {detailTab === "overview" ? (
        <>
          <DetailPanel
            title={language === "zh" ? "判断摘要" : "Decision Summary"}
            meta={displayDate(customer.updatedAt)}
          >
            <div className="space-y-3 text-sm leading-6 text-slate-300">
              <p className="text-slate-200">{truncateText(customer.statusExplanation?.reason || "", 220)}</p>
              {customer.statusExplanation?.ruleId ? (
                <div className="flex flex-wrap gap-2 text-[11px] leading-5 text-slate-500">
                  <span>{statusModeLabel(customer, language)}</span>
                  <span>{language === "zh" ? "进入条件" : "Entered"}: {truncateText(customer.statusExplanation.enteredWhen, 120)}</span>
                  <span>{language === "zh" ? "退出条件" : "Exits"}: {truncateText(customer.statusExplanation.exitsWhen, 120)}</span>
                </div>
              ) : null}
              <p>{truncateText(customer.intelligence.companySummary, 240)}</p>
              <p className="text-slate-400">{truncateText(customer.intelligence.productFit, 220)}</p>
              <p className="text-amber-100/90">{truncateText(customer.intelligence.riskSummary, 180)}</p>
            </div>
          </DetailPanel>

          <DetailPanel title={language === "zh" ? "状态管理" : "Status Management"}>
            <div className="grid gap-3 text-sm sm:grid-cols-[150px_minmax(0,1fr)]">
              <SelectField
                value={overrideStatus}
                disabled={statusSaving}
                onChange={(event) => setOverrideStatus(event.target.value as CustomerStatus)}
                aria-label={language === "zh" ? "客户状态" : "Customer status"}
              >
                {(["Prospect", "Active Customer", "Dormant", "Risk", "Archived"] as CustomerStatus[]).map((item) => (
                  <option key={item} value={item}>{statusLabel(item, language)}</option>
                ))}
              </SelectField>
              <InputField
                value={overrideReason}
                disabled={statusSaving}
                onChange={(event) => setOverrideReason(event.target.value)}
                placeholder={language === "zh" ? "填写人工调整原因" : "Reason for manual status change"}
                className="w-full"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <CommandButton
                variant="secondary"
                disabled={statusSaving}
                onClick={() => onStatusOverride(overrideStatus, overrideReason)}
              >
                {statusSaving ? <BattleText en="Saving" zh="保存中" /> : <BattleText en="Lock Status" zh="锁定状态" />}
              </CommandButton>
              <CommandButton
                variant="ghost"
                disabled={statusSaving || !customer.statusExplanation?.manualOverride}
                onClick={() => onClearStatusOverride(overrideReason)}
              >
                <BattleText en="Return To Auto" zh="恢复系统判断" />
              </CommandButton>
            </div>
          </DetailPanel>

          <div className="grid border-t border-slate-800 lg:grid-cols-2">
            <section className="min-w-0 border-slate-800 px-5 py-5 lg:border-r">
              <h3 className="text-sm font-semibold text-slate-100">{language === "zh" ? "主要联系人" : "Primary Contact"}</h3>
              {contact ? (
                <div className="mt-4 space-y-2">
                  <p className="truncate text-base font-medium text-slate-100">{contact.name || "-"}</p>
                  <p className="truncate text-xs text-slate-500">{contact.role || "-"}</p>
                  <p className="truncate font-mono text-xs text-slate-300">{contact.email || "-"}</p>
                  <BattleBadge tone={contact.emailStatus === "verified" ? "emerald" : "neutral"}>{emailStatusLabel(contact.emailStatus, language)}</BattleBadge>
                </div>
              ) : (
                <EmptyDetail label={language === "zh" ? "暂无主要联系人。" : "No primary contact yet."} />
              )}
            </section>

            <section className="min-w-0 px-5 py-5">
              <h3 className="text-sm font-semibold text-slate-100">{language === "zh" ? "下一步" : "Next Step"}</h3>
              <p className="mt-4 text-sm leading-6 text-slate-300">
                {truncateText(customer.nextActions[0] || customer.intelligence.salesAngle || (language === "zh" ? "等待下一步建议。" : "No next step yet."), 220)}
              </p>
            </section>
          </div>

          <DetailPanel title={language === "zh" ? "最近业务动态" : "Latest Business Signal"}>
            {latestInteraction ? (
              <div className="grid gap-3 text-sm sm:grid-cols-[96px_96px_minmax(0,1fr)]">
                <span className="font-mono text-xs text-slate-500">{displayDate(latestInteraction.date)}</span>
                <span className="text-xs text-slate-400">{interactionTypeLabel(latestInteraction.type, language)}</span>
                <span className="min-w-0 text-slate-300">{truncateText(latestInteraction.summary, 260)}</span>
              </div>
            ) : (
              <EmptyDetail label={language === "zh" ? "暂无互动。" : "No recent activity."} />
            )}
          </DetailPanel>
        </>
      ) : null}

      {detailTab === "orders" ? (
        <DetailPanel title={language === "zh" ? "订单与报价" : "Orders And Quotes"} meta={`${customer.orders.length}`}>
          {customer.orders.length ? (
            <div className="overflow-hidden rounded-md border border-slate-800">
              <div className="hidden grid-cols-[82px_78px_minmax(0,1.1fr)_92px_88px_96px_minmax(0,1fr)] gap-2 border-b border-slate-800 bg-slate-900/70 px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 md:grid">
                <span>{language === "zh" ? "日期" : "Date"}</span>
                <span>{language === "zh" ? "类型" : "Type"}</span>
                <span>{language === "zh" ? "产品" : "Product"}</span>
                <span>{language === "zh" ? "金额" : "Amount"}</span>
                <span>{language === "zh" ? "付款" : "Payment"}</span>
                <span>{language === "zh" ? "发货" : "Fulfillment"}</span>
                <span>{language === "zh" ? "下一步" : "Next Step"}</span>
              </div>
              {customer.orders.map((order, index) => (
                <div key={`${order.date}-${order.type}-${order.productType}-${index}`} className="grid gap-2 border-b border-slate-800 px-3 py-3 text-xs text-slate-300 last:border-b-0 md:grid-cols-[82px_78px_minmax(0,1.1fr)_92px_88px_96px_minmax(0,1fr)]">
                  <span className="font-mono text-[10px] text-slate-500">{displayDate(order.date)}</span>
                  <span className="truncate text-slate-400">{order.type} / {order.status || "-"}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{order.productType || "-"}</span>
                    <span className="mt-1 block truncate text-[10px] text-slate-500">
                      {language === "zh" ? "节点" : "Stage"}: {orderStageLabel(order, language)}
                    </span>
                  </span>
                  <span className="truncate font-mono text-[10px]">{order.amount || "-"}</span>
                  <span className="truncate text-[10px] text-slate-400">
                    <span className="md:hidden">{language === "zh" ? "付款" : "Payment"}: </span>
                    {orderPaymentLabel(order, language)}
                  </span>
                  <span className="truncate text-[10px] text-slate-400">
                    <span className="md:hidden">{language === "zh" ? "发货" : "Fulfillment"}: </span>
                    {orderFulfillmentLabel(order, language)}
                  </span>
                  <span className="min-w-0 text-[10px] leading-4 text-slate-500">
                    <span className="font-semibold text-slate-400 md:hidden">{language === "zh" ? "下一步" : "Next Step"}: </span>
                    {order.lifecycle?.nextStep || "-"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDetail label={language === "zh" ? "暂无订单或报价记录。" : "No orders or quotations yet."} />
          )}
        </DetailPanel>
      ) : null}

      {detailTab === "activity" ? (
        <DetailPanel title={language === "zh" ? "互动时间线" : "Activity Timeline"} meta={`${customer.interactions.length}`}>
          {customer.interactions.length ? (
            <div className="space-y-3">
              {customer.interactions.slice(0, 10).map((item, index) => (
                <div key={`${item.date}-${item.type}-${index}`} className="grid gap-3 border-b border-slate-800 pb-3 text-sm last:border-b-0 last:pb-0 sm:grid-cols-[92px_84px_minmax(0,1fr)]">
                  <span className="font-mono text-[10px] text-slate-500">{displayDate(item.date)}</span>
                  <span className="text-xs text-slate-400">{interactionTypeLabel(item.type, language)}</span>
                  <span className="min-w-0 leading-6 text-slate-300">{truncateText(item.summary, 300)}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyDetail label={language === "zh" ? "暂无可展示互动。" : "No recent interactions yet."} />
          )}
        </DetailPanel>
      ) : null}
    </div>
  );
}

function CustomerWorkspacePage() {
  const { apiFetch, project, projectId } = useProject();
  const language = useBattleLanguage();
  const [directory, setDirectory] = useState<CustomerDirectory | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerStatus | "All">("All");
  const [country, setCountry] = useState("All");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accessIssue, setAccessIssue] = useState<CustomerAccessIssue>("none");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [detailTab, setDetailTab] = useState<CustomerDetailTab>("overview");
  const [statusSaving, setStatusSaving] = useState(false);
  const [demoSeeding, setDemoSeeding] = useState(false);

  const customers = directory?.customers || EMPTY_CUSTOMERS;
  const stats = directory?.stats || { total: 0, prospect: 0, active: 0, dormant: 0, risk: 0, archived: 0, countries: 0 };
  const totalPages = directory?.totalPages || 1;
  const metricValue = (value: string | number) => accessIssue !== "none" ? "--" : value;
  const accessPromptHref = "/settings";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAccessIssue("none");
    try {
      const params = new URLSearchParams({
        search,
        status,
        country,
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const res = await apiFetch(`/api/customers?${params.toString()}`);
      if (res.status === 401 || res.status === 403) {
        setAccessIssue(res.status === 401 ? "beta_required" : "workspace_denied");
        setDirectory(null);
        return;
      }
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error || "Failed to load customers");
      setDirectory(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load customers");
      setDirectory(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, country, page, search, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (customers.length === 0) {
      setSelectedCustomerId("");
      return;
    }
    if (!selectedCustomerId || !customers.some((customer) => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId) || customers[0] || null;

  const seedDemoCustomers = useCallback(async () => {
    setDemoSeeding(true);
    setError(null);
    try {
      const res = await apiFetch("/api/demo/seed", { method: "POST" });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error || "Demo setup failed");
      setSearch("");
      setStatus("All");
      setCountry("All");
      setPage(1);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo setup failed");
    } finally {
      setDemoSeeding(false);
    }
  }, [apiFetch, load]);

  const updateCustomerStatus = useCallback(async (action: "set-status-override" | "clear-status-override", status?: CustomerStatus, reason?: string) => {
    if (!selectedCustomer) return;
    setStatusSaving(true);
    setError(null);
    try {
      const res = await apiFetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          customerId: selectedCustomer.id,
          status,
          reason,
        }),
      });
      const payload = await res.json();
      if (!payload.success) throw new Error(payload.error || "Failed to update customer status");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update customer status");
    } finally {
      setStatusSaving(false);
    }
  }, [apiFetch, load, selectedCustomer]);

  const visibleCustomerSummary = useMemo(() => customers.slice(0, 12).map((customer) => ({
    company: customer.companyName,
    country: customer.country,
    status: customer.status,
    rating: customer.intelligence.rating,
    score: customer.intelligence.score,
    recent: customer.recentSummary,
    contacts: customer.contacts.map((contact) => ({
      name: contact.name,
      role: contact.role,
      email: contact.email,
      emailStatus: contact.emailStatus,
    })),
    orders: customer.orders.map((order) => ({
      type: order.type,
      date: order.date,
      productType: order.productType,
      amount: order.amount,
      status: order.status,
    })),
  })), [customers]);

  const commandContext = {
    filters: { search, status, country, page, pageSize: PAGE_SIZE },
    stats,
    visibleCount: customers.length,
    totalPages,
    visibleCustomers: visibleCustomerSummary,
    selectedCustomer: selectedCustomer
      ? {
        company: selectedCustomer.companyName,
        country: selectedCustomer.country,
        status: selectedCustomer.status,
        rating: selectedCustomer.intelligence.rating,
        score: selectedCustomer.intelligence.score,
        contacts: selectedCustomer.contacts,
        orders: selectedCustomer.orders.map((order) => ({
          type: order.type,
          date: order.date,
          productType: order.productType,
          amount: order.amount,
          status: order.status,
          stage: order.lifecycle?.stage,
          paymentStatus: order.lifecycle?.paymentStatus,
          fulfillmentStatus: order.lifecycle?.fulfillmentStatus,
          nextStep: order.lifecycle?.nextStep,
        })),
        nextActions: selectedCustomer.nextActions,
      }
      : null,
    dataState: error ? "error" : accessIssue !== "none" ? "access_required" : loading ? "loading" : "ready",
    error,
  };
  const commandSummary = [
    language === "zh" ? "客户" : "Customers",
    `${language === "zh" ? "筛选" : "Filter"} ${status} / ${country}`,
    `${language === "zh" ? "当前显示" : "Visible"} ${customers.length}`,
    `${language === "zh" ? "活跃客户" : "Active"} ${stats.active}`,
    `${language === "zh" ? "搜索" : "Search"} ${search || (language === "zh" ? "无" : "none")}`,
  ].join(" / ");

  return (
    <BattlePageShell>
      <BattlePageHeader
        title="Customers"
        zhTitle="客户"
        meta={`${project.name.toUpperCase()} / CUSTOMERS / PAGE ${page}`}
        zhMeta={`${project.name.toUpperCase()} / 客户 / 第 ${page} 页`}
        active="/leads"
      >
        <BattleBadge tone={loading ? "blue" : "emerald"} pulse={loading}>
          {loading ? <BattleText en="SYNC" zh="同步" /> : <BattleText en="LIVE" zh="实时" />}
        </BattleBadge>
        <CommandButton onClick={() => load()} variant="ghost"><BattleText en="Refresh" zh="刷新" /></CommandButton>
      </BattlePageHeader>

      <BattlePageBody className="space-y-3">
        <div className="grid gap-3 md:grid-cols-4">
          <StatCell label={language === "zh" ? "全部客户" : "Total Customers"} value={metricValue(stats.total)} tone="emerald" />
          <StatCell label={language === "zh" ? "活跃客户" : "Active Customers"} value={metricValue(stats.active)} tone="blue" />
          <StatCell label={language === "zh" ? "风险客户" : "Risk Customers"} value={metricValue(stats.risk)} tone="red" />
          <StatCell label={language === "zh" ? "国家/地区" : "Countries"} value={metricValue(stats.countries)} tone="amber" />
        </div>

        <BattlePanel
          title={language === "zh" ? "客户列表 / 客户详情" : "Customer List / Customer Detail"}
          meta={language === "zh" ? `${customers.length} 个可见客户 / 每页 ${PAGE_SIZE} 个` : `${customers.length} visible customers / ${PAGE_SIZE} per page`}
        >
          <div className="border-b border-slate-800 bg-slate-950/30 p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_170px_150px]">
              <InputField
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder={language === "zh" ? "搜索公司、联系人、邮箱、国家、行业" : "Search company, contact, email, country, industry"}
                className="w-full"
              />
              <SelectField
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as CustomerStatus | "All");
                  setPage(1);
                }}
              >
                <option>All</option>
                {(directory?.statuses || ["Prospect", "Active Customer", "Dormant", "Risk", "Archived"]).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectField>
              <SelectField
                value={country}
                onChange={(event) => {
                  setCountry(event.target.value);
                  setPage(1);
                }}
              >
                <option>All</option>
                {(directory?.countries || []).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </SelectField>
            </div>
          </div>

          {accessIssue !== "none" ? (
            <AccessPrompt issue={accessIssue} language={language} nextHref={accessPromptHref} />
          ) : error ? (
            <EmptyState label={error} />
          ) : customers.length === 0 ? (
            loading ? (
              <EmptyState label={language === "zh" ? "正在加载客户" : "loading customers"} />
            ) : (
              <div className="px-4 py-10">
                <div className="mx-auto max-w-xl rounded-md border border-slate-800 bg-slate-950 px-5 py-6 text-center">
                  <p className="text-sm font-semibold text-slate-100">
                    {language === "zh" ? "还没有客户数据" : "No customer records yet"}
                  </p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">
                    {language === "zh"
                      ? "可以先创建演示客户体验订单和时间线，也可以导入真实客户或连接邮箱。"
                      : "Create demo customers to explore orders and timeline, or import real customers and connect a mailbox."}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                    <CommandButton type="button" variant="primary" onClick={seedDemoCustomers} disabled={demoSeeding}>
                      {demoSeeding ? <BattleText en="Creating demo customers" zh="正在创建演示客户" /> : <BattleText en="Create demo customers" zh="创建演示客户" />}
                    </CommandButton>
                    <Link
                      href="/intake"
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                    >
                      <BattleText en="Import customers" zh="导入客户" />
                    </Link>
                    <Link
                      href="/settings"
                      className="inline-flex h-9 items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                    >
                      <BattleText en="Connect mailbox" zh="连接邮箱" />
                    </Link>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="grid min-h-[620px] lg:grid-cols-[minmax(320px,0.9fr)_minmax(460px,1.1fr)]">
              <div className="min-h-0 divide-y divide-slate-800/80 border-slate-800 lg:max-h-[760px] lg:overflow-y-auto lg:border-r">
                {customers.map((customer) => {
                  const active = selectedCustomer?.id === customer.id;
                  return (
                    <button
                      key={customer.id}
                      type="button"
                      onClick={() => setSelectedCustomerId(customer.id)}
                      className={`grid min-h-[112px] w-full grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-left transition ${active ? "bg-emerald-500/10" : "hover:bg-slate-800/35"}`}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-100">{customer.companyName || "-"}</span>
                        <span className="mt-1 block truncate text-xs text-slate-400">{customer.country || "-"}{customer.industry ? ` / ${customer.industry}` : ""}</span>
                        <span className="mt-2 block truncate text-xs text-slate-500">{customer.recentSummary || "-"}</span>
                        <span className="mt-2 flex flex-wrap gap-2">
                          <BattleBadge tone={statusTone(customer.status)}>{statusLabel(customer.status, language)}</BattleBadge>
                          <BattleBadge tone={ratingTone(customer.intelligence.rating)}>{customer.intelligence.rating}</BattleBadge>
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-2">
                        <span className="font-mono text-lg font-semibold text-slate-100">{customer.intelligence.score ?? "-"}</span>
                        <span className="max-w-[120px] truncate text-right text-[10px] text-slate-500">{customer.contacts[0]?.name || "-"}</span>
                        <span className="max-w-[120px] truncate text-right text-[10px] text-slate-500">{customer.orders[0] ? orderStageLabel(customer.orders[0], language) : customer.domain || "-"}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="min-w-0 bg-slate-950/20">
                {!selectedCustomer ? (
                  <EmptyState label={language === "zh" ? "选择一个客户查看详情" : "Select a customer to view details"} />
                ) : (
                  <CustomerDetail
                    customer={selectedCustomer}
                    language={language}
                    detailTab={detailTab}
                    onDetailTabChange={setDetailTab}
                    onStatusOverride={(nextStatus, reason) => updateCustomerStatus("set-status-override", nextStatus, reason)}
                    onClearStatusOverride={(reason) => updateCustomerStatus("clear-status-override", undefined, reason)}
                    statusSaving={statusSaving}
                  />
                )}
              </div>
            </div>
          )}
        </BattlePanel>

        <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
          <span>{language === "zh" ? "第" : "PAGE"} {page} / {totalPages}</span>
          <div className="flex gap-2">
            <CommandButton variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <BattleText en="Prev" zh="上一页" />
            </CommandButton>
            <CommandButton variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              <BattleText en="Next" zh="下一页" />
            </CommandButton>
          </div>
        </div>

        <PageCommandPanel
          page="customers"
          surface="customers"
          mode="page_assist"
          target={selectedCustomer
            ? {
              type: "customer",
              id: selectedCustomer.id,
              label: selectedCustomer.companyName,
            }
            : { type: "none" }}
          summary={commandSummary}
          context={commandContext}
          placeholder="Ask Jaden to summarize a customer, timeline, orders, or next action"
          zhPlaceholder="让 Jaden 总结客户、时间线、订单或下一步动作"
        />
      </BattlePageBody>
    </BattlePageShell>
  );
}

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomerWorkspacePage />
    </Suspense>
  );
}
