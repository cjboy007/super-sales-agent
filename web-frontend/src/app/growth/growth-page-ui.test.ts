import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(join(process.cwd(), "src/app/growth/page.tsx"), "utf8");
const navSource = readFileSync(join(process.cwd(), "src/components/ui/app-nav.ts"), "utf8");

describe("lead development page reform UI", () => {
  it("renders business-facing operation panels instead of an internal control center", () => {
    for (const label of [
      "Lead Development",
      "线索开发",
      "Development Mode",
      "开发模式",
      "Review Items",
      "待确认事项",
      "Action Boundaries",
      "动作边界",
      "Lead Development Runs",
      "线索开发记录",
      "Candidate Customers",
      "候选客户",
      "Risk Notes",
      "风险提醒",
      "Development Plan",
      "自动开发计划",
      "Development Metrics",
      "开发指标",
      "Development Flow",
      "开发流程",
      "Decision Notes",
      "决策记录",
    ]) {
      expect(pageSource).toContain(label);
    }

    for (const oldLabel of [
      "Autonomous Growth",
      "Automation Mode",
      "HITL Policy Matrix",
      "Autonomous Prospecting Preview",
      "Autonomous Scheduler",
      "Outbound Approval Pipeline",
    ]) {
      expect(pageSource).not.toContain(oldLabel);
    }
  });

  it("keeps auto-send visible as unavailable without presenting it as autopilot", () => {
    expect(pageSource).toContain("Auto-send off");
    expect(pageSource).toContain("自动外发未开放");
    expect(pageSource).toContain("allowed={false}");
    expect(pageSource).toContain("Not open");
    expect(pageSource).toContain("未开放");
  });

  it("surfaces high-risk action boundaries directly in the UI", () => {
    expect(pageSource).toContain("payment.bank");
    expect(pageSource).toContain("Blocked");
    expect(pageSource).toContain("已拦截");
    expect(pageSource).toContain("email.send");
    expect(pageSource).toContain("Review before action");
    expect(pageSource).toContain("确认后执行");
  });

  it("renders lead preview operations without implying real outbound", () => {
    for (const label of [
      "Create preview",
      "生成开发预览",
      "Preview only",
      "仅预览",
      "Draft only",
      "只生成草稿",
      "No customer send",
      "未外发",
      "Fit score",
      "匹配度",
      "Opening Angle",
      "切入角度",
      "Next Step",
      "下一步",
    ]) {
      expect(pageSource).toContain(label);
    }

    expect(pageSource).not.toContain("real outbound enabled");
    expect(pageSource).not.toContain("email sent");
  });

  it("lets candidate cards shrink inside narrow mobile grids", () => {
    expect(pageSource).toContain('className="min-w-0 rounded-md border border-slate-800 bg-slate-950/45 px-3 py-3"');
    expect(pageSource).toContain('className="mt-3 grid min-w-0 gap-2 lg:grid-cols-2"');
    expect(pageSource).toContain('className="grid min-w-0 gap-2 p-3 md:grid-cols-[minmax(240px,0.8fr)_minmax(320px,1.2fr)]"');
    expect(pageSource).toContain('className="flex min-w-0 items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900/50 px-2 py-1.5"');
  });

  it("renders quotation draft operations as draft-only", () => {
    for (const label of [
      "Quotation Drafts",
      "报价草稿",
      "Product Fit Recommendations",
      "产品匹配建议",
      "Draft Lines",
      "报价明细草稿",
      "Cost / Price / Margin References",
      "成本 / 价格 / 毛利参考",
      "Assumptions",
      "关键假设",
      "Missing Info",
      "缺失信息",
      "Evidence References",
      "证据参考",
      "Recommended Edits",
      "建议人工修改",
      "No official quotation",
      "未生成正式报价",
      "No PI",
      "未生成 PI",
      "No document",
      "未生成文件",
    ]) {
      expect(pageSource).toContain(label);
    }

    expect(pageSource).not.toContain("formal quote generated");
    expect(pageSource).not.toContain("PI generated");
    expect(pageSource).not.toContain("document generated successfully");
  });

  it("renders outbound review without implying execution", () => {
    for (const label of [
      "Outbound Review",
      "外联确认",
      "Submit for review",
      "提交外联确认",
      "Review required",
      "需要确认",
      "Not executed",
      "未执行",
      "Not sent",
      "未发送",
      "Customer record not updated",
      "未写入客户记录",
      "Reference ID",
      "记录号",
      "Failure / Retry Strategy",
      "失败处理",
    ]) {
      expect(pageSource).toContain(label);
    }

    expect(pageSource).not.toContain("email sent");
    expect(pageSource).not.toContain("CRM updated");
    expect(pageSource).not.toContain("formal quote generated");
  });

  it("uses the beta-aware API client and does not expose implementation data", () => {
    expect(pageSource).toContain("useProject");
    expect(pageSource).toContain("apiFetch(\"/api/growth/control-center\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/prospecting\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/prospecting/dry-run\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/quotation-drafts\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/quotation-drafts/draft\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/outbound-approvals\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/outbound-approvals/request\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/decision-learning\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/decision-learning/record\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/scheduler\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/scheduler/run\"");
    expect(pageSource).toContain("apiFetch(\"/api/growth/metrics\"");
    expect(pageSource).not.toContain("fetch(\"/api/growth/control-center");
    expect(pageSource).not.toContain("fetch(\"/api/growth/prospecting");
    expect(pageSource).not.toContain("SSA_DATA_ROOT");
    expect(pageSource).not.toContain("/Users/");
    expect(pageSource).not.toContain("payload");
    expect(pageSource).not.toContain("secret");
  });

  it("renders decision notes as auditable memory without automatic approval", () => {
    for (const label of [
      "Decision Notes",
      "决策记录",
      "Manual Decision",
      "人工决策",
      "Manual Edits",
      "人工修改",
      "Rejection Reason",
      "拒绝原因",
      "Policy Suggestion",
      "规则建议",
      "Scope",
      "适用范围",
      "Rollback Note",
      "撤回说明",
      "High-risk Boundary",
      "高风险边界",
      "Read-only until reviewed",
      "复核前只读",
      "No automatic send",
      "不自动外发",
      "High-risk still needs review",
      "高风险仍需确认",
    ]) {
      expect(pageSource).toContain(label);
    }

    expect(pageSource).not.toContain("policy auto-approved");
    expect(pageSource).not.toContain("autopilot enabled");
  });

  it("renders plan and metrics without implying a real outbound pilot", () => {
    for (const label of [
      "Development Plan",
      "自动开发计划",
      "Plan Runs",
      "计划记录",
      "Failed / Retryable Work",
      "失败/可重试任务",
      "Development Metrics",
      "开发指标",
      "Candidates",
      "候选客户",
      "Evidence Coverage",
      "证据覆盖",
      "Fit Distribution",
      "匹配度分布",
      "Manual Edit Rate",
      "人工修改率",
      "Review Decision Rate",
      "确认 / 拒绝比例",
      "Failure Reasons",
      "失败原因",
      "Misjudgment Reasons",
      "误判原因",
      "Reply Rate",
      "回复率",
      "Review still required",
      "仍需确认",
    ]) {
      expect(pageSource).toContain(label);
    }

    expect(pageSource).not.toContain("real outbound pilot started");
    expect(pageSource).not.toContain("email sent");
    expect(pageSource).not.toContain("CRM updated");
    expect(pageSource).not.toContain("autopilot enabled");
  });

  it("adds a compact global navigation entry for lead development", () => {
    expect(navSource).toContain("Lead Development");
    expect(navSource).toContain("线索开发");
    expect(navSource).toContain("/growth");
  });

  it("routes page-level Jaden commands through the shared growth envelope", () => {
    expect(pageSource).toContain("PageCommandPanel");
    expect(pageSource).toContain('surface="growth"');
    expect(pageSource).toContain('mode="review"');
    expect(pageSource).toContain('type: "workflow"');
    expect(pageSource).toContain("Ask Jaden to review growth risks");
  });
});
