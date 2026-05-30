import { repoPath } from "../ssa-data-paths";
import type { SalesRuntime } from "./sales-runtime";
import type { SideEffectDecision, WorkspaceId } from "./types";

const IMAP_SCRIPT = repoPath("skills", "imap-smtp-email", "scripts", "imap.js");
const SMTP_SCRIPT = repoPath("skills", "imap-smtp-email", "scripts", "smtp.js");

export type EmailConnectionKind = "imap" | "smtp";

export interface EmailConnectionTestInput {
  workspaceId: WorkspaceId;
  kind: EmailConnectionKind;
}

export interface EmailConnectionTestResult {
  success: boolean;
  kind: EmailConnectionKind;
  blocked?: true;
  sideEffect?: SideEffectDecision;
  detail: string;
  raw?: string;
}

function isImapEnabled() {
  return process.env.SSA_ENABLE_REAL_IMAP === "true";
}

function isSmtpEnabled() {
  return process.env.SSA_ENABLE_REAL_EMAIL_SEND === "true";
}

async function runMailScript(script: string, args: string[]) {
  const [{ execFile }, { promisify }] = await Promise.all([
    import("child_process"),
    import("util"),
  ]);
  return promisify(execFile)("node", [script, ...args], {
    timeout: 20_000,
    maxBuffer: 1024 * 1024,
  });
}

function outputText(output: string | { stdout?: string; stderr?: string }) {
  if (typeof output === "string") return output;
  return [output.stdout || "", output.stderr || ""].filter(Boolean).join("\n").trim();
}

export async function testEmailConnection(runtime: SalesRuntime, input: EmailConnectionTestInput): Promise<EmailConnectionTestResult> {
  const workspace = runtime.getWorkspace(input.workspaceId);

  if (input.kind === "imap") {
    const sideEffect = runtime.requestSideEffect({
      kind: "imap.fetch",
      workspaceId: workspace.id,
      summary: "Test IMAP inbox connection",
      payload: { source: "onboarding.connection-test" },
      idempotencyKey: `${workspace.id}:connection-test:imap`,
    });

    if (!isImapEnabled() || sideEffect.status !== "allowed") {
      return {
        success: true,
        kind: "imap",
        blocked: true,
        sideEffect,
        detail: "IMAP test captured locally. Real IMAP is disabled for this runtime.",
      };
    }

    try {
      const output = await runMailScript(IMAP_SCRIPT, ["health-check"]);
      return {
        success: true,
        kind: "imap",
        sideEffect,
        detail: "IMAP connection test passed.",
        raw: outputText(output),
      };
    } catch (error) {
      return {
        success: false,
        kind: "imap",
        sideEffect,
        detail: `IMAP connection test failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  const sideEffect = runtime.requestSideEffect({
    kind: "email.send",
    workspaceId: workspace.id,
    summary: "Test SMTP connection without sending customer mail",
    payload: { source: "onboarding.connection-test", verifyOnly: true },
    idempotencyKey: `${workspace.id}:connection-test:smtp`,
  });

  if (!isSmtpEnabled() || sideEffect.status !== "allowed") {
    return {
      success: true,
      kind: "smtp",
      blocked: true,
      sideEffect,
      detail: "SMTP test captured locally. Real SMTP is disabled for this runtime.",
    };
  }

  try {
    const output = await runMailScript(SMTP_SCRIPT, ["test-connection"]);
    return {
      success: true,
      kind: "smtp",
      sideEffect,
      detail: "SMTP connection test passed.",
      raw: outputText(output),
    };
  } catch (error) {
    return {
      success: false,
      kind: "smtp",
      sideEffect,
      detail: `SMTP connection test failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
