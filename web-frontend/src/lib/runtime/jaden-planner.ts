import type { RuntimeWorkflowType, WorkspaceId } from "./types";

export interface JadenPlannerInput {
  workspaceId: WorkspaceId;
  commandId: string;
  page: string;
  url?: string;
  message: string;
  context: Record<string, unknown>;
}

export interface JadenPlannedJob {
  workspaceId: WorkspaceId;
  workflow: RuntimeWorkflowType;
  input: Record<string, unknown>;
}

export interface JadenPlan {
  source: "jaden-planner";
  workspaceId: WorkspaceId;
  commandId: string;
  jobs: JadenPlannedJob[];
}

interface PlannerOptions {
  maxJobs?: number;
}

const DEFAULT_MAX_JOBS = 5;

function normalizedText(input: JadenPlannerInput): string {
  return [
    input.page,
    input.url,
    input.message,
  ].join("\n").toLowerCase();
}

function addWorkflow(workflows: RuntimeWorkflowType[], workflow: RuntimeWorkflowType) {
  if (!workflows.includes(workflow)) workflows.push(workflow);
}

function workflowsForCommand(input: JadenPlannerInput): RuntimeWorkflowType[] {
  const text = normalizedText(input);
  const workflows: RuntimeWorkflowType[] = [];

  if (/(quotation|quote|rfq|pricing|price|offer|pi\b|invoice|packing list|document|doc|报价|询价|单证|形式发票|装箱单)/i.test(text)) {
    addWorkflow(workflows, "quotation.prepare");
  }

  if (/(email|mail|inbox|reply|draft|outreach|cold mail|follow-up email|开发信|邮件|收件箱|回复|草稿)/i.test(text)) {
    addWorkflow(workflows, "email.reply");
  }

  if (/(lead|prospect|import|research lead|research prospect|contact list|crm|线索|联系人列表|导入|寻找客户|客户资料)/i.test(text)) {
    addWorkflow(workflows, "lead.import");
  }

  if (/(plan follow[ -]?up|follow[ -]?up plan|next step|remind|sequence|cadence|跟进计划|待办|下一步|提醒|节奏)/i.test(text)) {
    addWorkflow(workflows, "follow_up.plan");
  }

  if (workflows.length === 0) {
    addWorkflow(workflows, "operator.command");
  }

  return workflows;
}

function clampMaxJobs(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_JOBS;
  return Math.min(DEFAULT_MAX_JOBS, Math.max(1, Math.floor(value as number)));
}

function plannedInput(input: JadenPlannerInput, workflow: RuntimeWorkflowType): Record<string, unknown> {
  return {
    commandId: input.commandId,
    planner: "jaden-planner",
    originWorkflow: "operator.command",
    workflow,
    page: input.page,
    url: input.url || "",
    message: input.message,
    context: input.context,
  };
}

export function createJadenPlan(input: JadenPlannerInput, options: PlannerOptions = {}): JadenPlan {
  const maxJobs = clampMaxJobs(options.maxJobs);
  const workflows = workflowsForCommand(input).slice(0, maxJobs);

  return {
    source: "jaden-planner",
    workspaceId: input.workspaceId,
    commandId: input.commandId,
    jobs: workflows.map((workflow) => ({
      workspaceId: input.workspaceId,
      workflow,
      input: plannedInput(input, workflow),
    })),
  };
}
