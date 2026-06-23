import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureSsaDataPath } from "../ssa-data-paths";
import type { SalesRuntime } from "./sales-runtime";
import { createSalesRuntime } from "./sales-runtime";
import type { WorkspaceId } from "./types";

export interface VerifyOkkiWebhookSignatureInput {
  timestamp: string;
  rawBody: string;
  signature: string;
  aesKeyBase64: string;
}

export interface OkkiWebhookHandlerInput {
  rawBody: string;
  timestamp?: string | null;
  signature?: string | null;
  aesKeyBase64?: string | null;
  workspaceId?: WorkspaceId;
  runtime?: SalesRuntime;
  now?: string;
  processBizEvent?: OkkiWebhookEventProcessor;
}

export interface OkkiWebhookHandlerResult {
  status: number;
  body: Record<string, unknown>;
  eventCount: number;
  testCallback: boolean;
}

export interface OkkiWebhookEventContext {
  timestamp: string;
  workspaceId: WorkspaceId;
  messageId: string;
  bizType: string;
  bizData: unknown;
  entityType: string;
  action: string;
  entityId: string;
}

export type OkkiWebhookEventProcessor = (event: OkkiWebhookEventContext) => Promise<void> | void;

interface OkkiWebhookPayload {
  message_id?: unknown;
  data?: unknown;
  biz?: unknown;
}

interface OkkiBizEvent {
  biz_type: string;
  biz_data: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function timingSafeHexEqual(left: string, right: string): boolean {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function verifyOkkiWebhookSignature(input: VerifyOkkiWebhookSignatureInput): boolean {
  if (!input.timestamp || !input.signature || !input.aesKeyBase64) return false;
  const normalizedBody = input.rawBody.replace(/\\\//g, "/");
  const expected = crypto
    .createHmac("sha256", input.aesKeyBase64)
    .update(input.timestamp + normalizedBody)
    .digest("hex");
  return timingSafeHexEqual(input.signature, expected);
}

export function decryptOkkiWebhookData(encryptedBase64: string, aesKeyBase64: string): unknown {
  const key = Buffer.from(aesKeyBase64, "base64");
  if (key.length !== 32) {
    throw new Error("OKKI webhook AES key must decode to 32 bytes.");
  }

  const raw = Buffer.from(encryptedBase64, "base64");
  if (raw.length < 29) {
    throw new Error("OKKI webhook encrypted payload is too short.");
  }

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

function messageIdFromPayload(payload: OkkiWebhookPayload): string {
  return cleanText(payload.message_id, `msg_${Date.now()}`);
}

function bizEventsFromPayload(payload: unknown): OkkiBizEvent[] {
  const biz = isRecord(payload) ? payload.biz : null;
  if (!Array.isArray(biz)) return [];
  return biz
    .filter(isRecord)
    .map((item) => ({
      biz_type: cleanText(item.biz_type),
      biz_data: item.biz_data,
    }))
    .filter((item) => item.biz_type);
}

function entityInfo(bizType: string, bizData: unknown): {
  entityType: string;
  action: string;
  entityId: string;
} {
  if (bizType === "xiaoman.open.callback.test") {
    return { entityType: "callback", action: "test", entityId: "" };
  }

  const parts = bizType.split(".");
  const entityType = parts[2] || "unknown";
  const action = parts[3] || "unknown";
  const idKeys = [
    `${entityType}_id`,
    "company_id",
    "lead_id",
    "opportunity_id",
    "id",
  ];
  let entityId = "";
  if (isRecord(bizData)) {
    for (const key of idKeys) {
      entityId = cleanText(bizData[key]);
      if (entityId) break;
    }
  } else {
    entityId = cleanText(bizData);
  }
  return { entityType, action, entityId };
}

function appendAuditEntry(entry: Record<string, unknown>) {
  const auditPath = ensureSsaDataPath("integrations", "okki", "webhook-events.jsonl");
  fs.appendFileSync(auditPath, JSON.stringify(entry) + "\n", "utf-8");
}

function auditFilePathForPayload(): string {
  return path.relative(process.cwd(), ensureSsaDataPath("integrations", "okki", "webhook-events.jsonl"));
}

function recordOkkiBizEvent(
  runtime: SalesRuntime,
  workspaceId: WorkspaceId,
  input: {
    messageId: string;
    biz: OkkiBizEvent;
    now: string;
  }
): OkkiWebhookEventContext {
  const info = entityInfo(input.biz.biz_type, input.biz.biz_data);
  const auditEntry = {
    timestamp: input.now,
    workspaceId,
    messageId: input.messageId,
    bizType: input.biz.biz_type,
    entityType: info.entityType,
    action: info.action,
    entityId: info.entityId,
    bizData: input.biz.biz_data,
  };
  appendAuditEntry(auditEntry);

  const context: OkkiWebhookEventContext = {
    timestamp: input.now,
    workspaceId,
    messageId: input.messageId,
    bizType: input.biz.biz_type,
    bizData: input.biz.biz_data,
    entityType: info.entityType,
    action: info.action,
    entityId: info.entityId,
  };

  if (info.action === "delete") {
    runtime.recordEvent("okki.webhook.delete_audited", workspaceId, {
      messageId: input.messageId,
      bizType: input.biz.biz_type,
      entityType: info.entityType,
      entityId: info.entityId,
      auditPath: auditFilePathForPayload(),
      sideEffects: "local-only",
    });
    return context;
  }

  if (input.biz.biz_type !== "xiaoman.open.callback.test") {
    runtime.recordEvent("okki.webhook.event_audited", workspaceId, {
      messageId: input.messageId,
      bizType: input.biz.biz_type,
      entityType: info.entityType,
      action: info.action,
      entityId: info.entityId,
      auditPath: auditFilePathForPayload(),
      sideEffects: "local-only",
    });
  }
  return context;
}

export async function handleOkkiWebhook(input: OkkiWebhookHandlerInput): Promise<OkkiWebhookHandlerResult> {
  const runtime = input.runtime || createSalesRuntime();
  const workspaceId = input.workspaceId || "farreach";
  const now = input.now || new Date().toISOString();

  if (!input.timestamp || !input.signature) {
    return {
      status: 401,
      body: { success: false, error: "Missing OKKI signature headers" },
      eventCount: 0,
      testCallback: false,
    };
  }
  if (!input.aesKeyBase64) {
    return {
      status: 500,
      body: { success: false, error: "OKKI webhook AES key is not configured" },
      eventCount: 0,
      testCallback: false,
    };
  }
  if (!verifyOkkiWebhookSignature({
    timestamp: input.timestamp,
    rawBody: input.rawBody,
    signature: input.signature,
    aesKeyBase64: input.aesKeyBase64,
  })) {
    return {
      status: 401,
      body: { success: false, error: "Invalid OKKI signature" },
      eventCount: 0,
      testCallback: false,
    };
  }

  let payload: OkkiWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody) as OkkiWebhookPayload;
  } catch {
    return {
      status: 400,
      body: { success: false, error: "Invalid OKKI webhook JSON" },
      eventCount: 0,
      testCallback: false,
    };
  }

  const messageId = messageIdFromPayload(payload);
  let decrypted: unknown;
  try {
    decrypted = typeof payload.data === "string"
      ? decryptOkkiWebhookData(payload.data, input.aesKeyBase64)
      : payload;
  } catch (error) {
    runtime.recordEvent("okki.webhook.decrypt_failed", workspaceId, {
      messageId,
      error: error instanceof Error ? error.message : String(error),
      sideEffects: "local-only",
    });
    return {
      status: 200,
      body: { code: 200, data: { message_id: messageId } },
      eventCount: 0,
      testCallback: false,
    };
  }

  const bizList = bizEventsFromPayload(decrypted);
  const testBiz = bizList.find((biz) => biz.biz_type === "xiaoman.open.callback.test");
  const testCallback = Boolean(testBiz);

  runtime.recordEvent("okki.webhook.received", workspaceId, {
    messageId,
    eventCount: bizList.length,
    testCallback,
    bizTypes: bizList.map((biz) => biz.biz_type),
    sideEffects: "local-only",
  });

  for (const biz of bizList) {
    const context = recordOkkiBizEvent(runtime, workspaceId, { messageId, biz, now });
    if (
      input.processBizEvent &&
      context.action !== "delete" &&
      context.bizType !== "xiaoman.open.callback.test"
    ) {
      try {
        await input.processBizEvent(context);
        runtime.recordEvent("okki.webhook.processed", workspaceId, {
          messageId,
          bizType: context.bizType,
          entityType: context.entityType,
          action: context.action,
          entityId: context.entityId,
          sideEffects: "local-only",
        });
      } catch (error) {
        runtime.recordEvent("okki.webhook.process_failed", workspaceId, {
          messageId,
          bizType: context.bizType,
          entityType: context.entityType,
          action: context.action,
          entityId: context.entityId,
          error: error instanceof Error ? error.message : String(error),
          sideEffects: "local-only",
        });
      }
    }
  }

  if (testCallback) {
    return {
      status: 200,
      body: {
        code: 200,
        data: {
          message_id: messageId,
          data: testBiz?.biz_data || "",
        },
      },
      eventCount: bizList.length,
      testCallback,
    };
  }

  return {
    status: 200,
    body: {
      code: 200,
      data: { message_id: messageId },
    },
    eventCount: bizList.length,
    testCallback,
  };
}
