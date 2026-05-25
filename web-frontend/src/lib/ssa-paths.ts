/**
 * SSA Path Resolver for web-frontend
 *
 * All paths resolve relative to SSA_PROJECT_ROOT (env) or process.cwd()/..
 * No hardcoded .openclaw paths. Portable across machines.
 */

import path from "path";

const SSA_ROOT: string =
  process.env.SSA_PROJECT_ROOT ||
  process.env.MONOREPO_ROOT ||
  path.resolve(process.cwd(), "..");

export const paths = {
  root: SSA_ROOT,
  data: path.join(SSA_ROOT, "data"),
  shared: path.join(SSA_ROOT, "shared"),
  skills: path.join(SSA_ROOT, "skills"),
  heroPumps: path.join(SSA_ROOT, "hero-pumps"),
  farreach: path.join(SSA_ROOT, "farreach"),
  output: path.join(SSA_ROOT, "output"),
  mailArchive: path.join(SSA_ROOT, "mail-archive"),

  // Databases
  dbAgentState: path.join(SSA_ROOT, "data", "agent_state.db"),
  dbApproval: path.join(SSA_ROOT, "data", "approval_engine.db"),
  dbCrm: path.join(SSA_ROOT, "data", "crm.db"),
  dbRuntime: path.join(SSA_ROOT, "data", "ssa_runtime.db"),

  // Hero pumps specifics
  heroSentLog: path.join(SSA_ROOT, "hero-pumps", "sent-log.json"),
  heroFollowUp: path.join(SSA_ROOT, "hero-pumps", "follow-up-state.json"),
  heroReplies: path.join(SSA_ROOT, "hero-pumps", "tracking", "replies.json"),
  heroTemplates: path.join(SSA_ROOT, "hero-pumps", "campaign-tracker", "templates"),
  heroSignatures: path.join(SSA_ROOT, "hero-pumps", "config", "signatures"),

  // Skills
  imapSmtp: path.join(SSA_ROOT, "skills", "imap-smtp-email"),
  smtpScript: path.join(SSA_ROOT, "skills", "imap-smtp-email", "scripts", "smtp.js"),
  quotationWorkflow: path.join(SSA_ROOT, "skills", "quotation-workflow"),

  // Output
  quotationsOutput: path.join(SSA_ROOT, "output", "quotations"),

  // Documents
  documents: path.join(SSA_ROOT, "data", "documents"),
  tradeDocs: path.join(SSA_ROOT, "skills", "trade-docs"),
};

export function resolvePath(...segments: string[]): string {
  return path.resolve(SSA_ROOT, ...segments);
}

export { SSA_ROOT };
