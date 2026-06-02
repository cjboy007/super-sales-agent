import path from "path";
import fs from "fs";
import type { SalesPackId, WorkspaceAdapter, WorkspaceId, WorkspaceInput } from "./types";
import { ensureSsaDataPath, readJsonFile, ssaCompanyDataPath, ssaDataPath } from "../ssa-data-paths";

const DEFAULT_PACKS: SalesPackId[] = ["email-reply", "follow-up"];

const DEFAULT_WORKSPACES: WorkspaceAdapter[] = [
  {
    id: "farreach",
    name: "Farreach",
    brandName: "Farreach Electronic",
    industry: "Export B2B cables and electronics",
    identity: {
      senderName: "Wilson Chen",
      senderEmail: "",
      companyName: "Farreach Electronic Co Limited",
      signature: "Wilson Chen\nFarreach Electronic",
    },
    capabilities: {
      emailSync: false,
      quotations: true,
      crm: "okki",
      documents: true,
    },
    data: {
      leadsPath: ssaCompanyDataPath("farreach", "leads"),
      productCatalogPath: path.join(process.cwd(), "..", "farreach", "config", "products.json"),
      templatesPath: path.join(process.cwd(), "..", "farreach", "config", "templates"),
      rulesPath: path.join(process.cwd(), "..", "skills", "workflow-engine", "config", "rules"),
    },
    packs: ["email-reply", "follow-up", "quotation", "product-catalog", "export-b2b"],
  },
  {
    id: "hero-pumps",
    name: "Hero Pumps",
    brandName: "Hero Pump",
    industry: "Export B2B circulator pumps",
    identity: {
      senderName: "Jaden Yeung",
      senderEmail: "sales@heropumps.com.cn",
      companyName: "Zhejiang Hero Pump Co., Ltd",
      signature: "Jaden Yeung\nSales Manager | Zhejiang Hero Pump Co., Ltd",
    },
    capabilities: {
      emailSync: true,
      quotations: false,
      crm: "csv",
      documents: true,
    },
    data: {
      leadsPath: ssaCompanyDataPath("hero-pumps", "leads"),
      productCatalogPath: path.join(process.cwd(), "..", "hero-pumps", "product-specs"),
      templatesPath: ssaCompanyDataPath("hero-pumps", "campaign-tracker"),
      rulesPath: path.join(process.cwd(), "..", "hero-pumps", "email-rules.md"),
    },
    packs: ["email-reply", "follow-up", "product-catalog", "export-b2b"],
  },
];

export function listWorkspaceAdapters(): WorkspaceAdapter[] {
  return [...DEFAULT_WORKSPACES, ...readRegisteredWorkspaces()].map(cloneWorkspace);
}

export function getWorkspaceAdapter(id: WorkspaceId | null | undefined): WorkspaceAdapter {
  const normalized = id || "farreach";
  return (
    listWorkspaceAdapters().find((workspace) => workspace.id === normalized) ||
    createLocalWorkspaceAdapter(normalized)
  );
}

function registryPath() {
  return ensureSsaDataPath("runtime", "workspaces.json");
}

function sanitizeWorkspaceId(id: WorkspaceId): WorkspaceId {
  return id.replace(/[^a-zA-Z0-9._-]/g, "_") || "local";
}

function cloneWorkspace(workspace: WorkspaceAdapter): WorkspaceAdapter {
  const data = { ...workspace.data };
  if (workspace.id === "farreach") {
    data.leadsPath = ssaCompanyDataPath("farreach", "leads");
  }
  if (workspace.id === "hero-pumps") {
    data.leadsPath = ssaCompanyDataPath("hero-pumps", "leads");
    data.templatesPath = ssaCompanyDataPath("hero-pumps", "campaign-tracker");
  }
  return {
    ...workspace,
    identity: { ...workspace.identity },
    capabilities: { ...workspace.capabilities },
    data,
    packs: [...workspace.packs],
  };
}

function readRegisteredWorkspaces(): WorkspaceAdapter[] {
  return readJsonFile<WorkspaceAdapter[]>(registryPath(), []);
}

function writeRegisteredWorkspaces(workspaces: WorkspaceAdapter[]) {
  fs.writeFileSync(registryPath(), JSON.stringify(workspaces, null, 2), "utf-8");
}

export function createLocalWorkspaceAdapter(id: WorkspaceId, input: Partial<WorkspaceInput> = {}): WorkspaceAdapter {
  const safeId = sanitizeWorkspaceId(id);
  return {
    id: safeId,
    name: input.name || safeId,
    brandName: input.brandName || input.name || safeId,
    industry: input.industry || "Custom sales workspace",
    identity: {
      senderName: input.identity?.senderName || "",
      senderEmail: input.identity?.senderEmail || "",
      companyName: input.identity?.companyName || input.brandName || input.name || safeId,
      signature: input.identity?.signature || "",
    },
    capabilities: {
      emailSync: input.capabilities?.emailSync ?? false,
      quotations: input.capabilities?.quotations ?? false,
      crm: input.capabilities?.crm || "csv",
      documents: input.capabilities?.documents ?? false,
    },
    data: {
      leadsPath: input.data?.leadsPath || ssaCompanyDataPath(safeId, "leads"),
      productCatalogPath: input.data?.productCatalogPath || ssaCompanyDataPath(safeId, "catalog"),
      templatesPath: input.data?.templatesPath || ssaCompanyDataPath(safeId, "templates"),
      rulesPath: input.data?.rulesPath || ssaCompanyDataPath(safeId, "rules"),
    },
    packs: input.packs?.length ? input.packs : DEFAULT_PACKS,
  };
}

export function registerWorkspaceAdapter(input: WorkspaceInput): WorkspaceAdapter {
  const workspace = createLocalWorkspaceAdapter(input.id, input);
  const protectedIds = new Set(DEFAULT_WORKSPACES.map((item) => item.id));
  if (protectedIds.has(workspace.id)) {
    throw new Error(`Workspace ${workspace.id} is built in and cannot be overwritten.`);
  }

  const current = readRegisteredWorkspaces();
  const next = [workspace, ...current.filter((item) => item.id !== workspace.id)];
  writeRegisteredWorkspaces(next);
  return cloneWorkspace(workspace);
}
