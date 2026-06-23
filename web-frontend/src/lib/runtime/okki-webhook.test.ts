import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSalesRuntime } from "./sales-runtime";
import {
  decryptOkkiWebhookData,
  handleOkkiWebhook,
  verifyOkkiWebhookSignature,
} from "./okki-webhook";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

function aesKey(): string {
  return Buffer.alloc(32, 7).toString("base64");
}

function sign(timestamp: string, rawBody: string, key: string): string {
  return crypto
    .createHmac("sha256", key)
    .update(timestamp + rawBody.replace(/\\\//g, "/"))
    .digest("hex");
}

function encryptOkkiData(data: unknown, key: string): string {
  const iv = Buffer.alloc(12, 3);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

beforeEach(() => {
  vi.restoreAllMocks();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-okki-webhook-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  createSalesRuntime().memory.invalidate();
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("OKKI webhook helpers", () => {
  it("verifies signatures with OKKI's raw-body slash normalization and base64-string HMAC key", () => {
    const key = aesKey();
    const timestamp = "1782200000";
    const rawBody = '{"message_id":"msg_1","data":"https:\\/\\/buyer.example\\/quote"}';
    const signature = sign(timestamp, rawBody, key);

    expect(verifyOkkiWebhookSignature({ timestamp, rawBody, signature, aesKeyBase64: key })).toBe(true);
    expect(verifyOkkiWebhookSignature({ timestamp, rawBody, signature: "bad", aesKeyBase64: key })).toBe(false);
  });

  it("decrypts OKKI AES-256-GCM payloads where the auth tag sits between IV and ciphertext", () => {
    const key = aesKey();
    const encrypted = encryptOkkiData({
      biz: [{
        biz_type: "xiaoman.crm.company.update",
        biz_data: { company_id: 4603005833 },
      }],
    }, key);

    expect(decryptOkkiWebhookData(encrypted, key)).toEqual({
      biz: [{
        biz_type: "xiaoman.crm.company.update",
        biz_data: { company_id: 4603005833 },
      }],
    });
  });
});

describe("handleOkkiWebhook", () => {
  it("returns OKKI's required test-callback response and records a local runtime event", async () => {
    const key = aesKey();
    const timestamp = "1782200001";
    const rawBody = JSON.stringify({
      message_id: "msg_test",
      data: encryptOkkiData({
        biz: [{
          biz_type: "xiaoman.open.callback.test",
          biz_data: "success",
        }],
      }, key),
    });
    const runtime = createSalesRuntime();

    const result = await handleOkkiWebhook({
      rawBody,
      timestamp,
      signature: sign(timestamp, rawBody, key),
      aesKeyBase64: key,
      runtime,
      workspaceId: "farreach",
      now: "2026-06-23T01:00:00.000Z",
    });

    expect(result).toMatchObject({
      status: 200,
      body: {
        code: 200,
        data: {
          message_id: "msg_test",
          data: "success",
        },
      },
      eventCount: 1,
      testCallback: true,
    });
    expect(runtime.listEvents(5, "farreach")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "okki.webhook.received",
        payload: expect.objectContaining({
          messageId: "msg_test",
          eventCount: 1,
          testCallback: true,
          sideEffects: "local-only",
        }),
      }),
    ]));
  });

  it("keeps OKKI delete events as audit records instead of physically deleting local data", async () => {
    const key = aesKey();
    const timestamp = "1782200002";
    const rawBody = JSON.stringify({
      message_id: "msg_delete",
      data: encryptOkkiData({
        biz: [{
          biz_type: "xiaoman.crm.company.delete",
          biz_data: { company_id: 12345 },
        }],
      }, key),
    });
    const runtime = createSalesRuntime();

    const result = await handleOkkiWebhook({
      rawBody,
      timestamp,
      signature: sign(timestamp, rawBody, key),
      aesKeyBase64: key,
      runtime,
      workspaceId: "farreach",
      now: "2026-06-23T01:01:00.000Z",
    });

    expect(result).toMatchObject({
      status: 200,
      body: { code: 200, data: { message_id: "msg_delete" } },
      eventCount: 1,
      testCallback: false,
    });

    const auditPath = path.join(tempRoot, "integrations", "okki", "webhook-events.jsonl");
    const auditLines = fs.readFileSync(auditPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
    expect(auditLines).toEqual([
      expect.objectContaining({
        messageId: "msg_delete",
        bizType: "xiaoman.crm.company.delete",
        entityType: "company",
        action: "delete",
        entityId: "12345",
        workspaceId: "farreach",
      }),
    ]);
    expect(runtime.listEvents(10, "farreach")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "okki.webhook.delete_audited",
        payload: expect.objectContaining({
          bizType: "xiaoman.crm.company.delete",
          entityId: "12345",
          sideEffects: "local-only",
        }),
      }),
    ]));
  });

  it("can hand create and update events to an injected processor without delaying OKKI acknowledgement failures", async () => {
    const key = aesKey();
    const timestamp = "1782200003";
    const rawBody = JSON.stringify({
      message_id: "msg_update",
      data: encryptOkkiData({
        biz: [{
          biz_type: "xiaoman.crm.company.update",
          biz_data: { company_id: 67890 },
        }],
      }, key),
    });
    const runtime = createSalesRuntime();
    const processBizEvent = vi.fn(async () => {
      throw new Error("index unavailable");
    });

    const result = await handleOkkiWebhook({
      rawBody,
      timestamp,
      signature: sign(timestamp, rawBody, key),
      aesKeyBase64: key,
      runtime,
      workspaceId: "farreach",
      now: "2026-06-23T01:02:00.000Z",
      processBizEvent,
    });

    expect(result).toMatchObject({
      status: 200,
      body: { code: 200, data: { message_id: "msg_update" } },
      eventCount: 1,
    });
    expect(processBizEvent).toHaveBeenCalledWith(expect.objectContaining({
      messageId: "msg_update",
      bizType: "xiaoman.crm.company.update",
      entityType: "company",
      action: "update",
      entityId: "67890",
      bizData: { company_id: 67890 },
      workspaceId: "farreach",
    }));
    expect(runtime.listEvents(10, "farreach")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "okki.webhook.process_failed",
        payload: expect.objectContaining({
          bizType: "xiaoman.crm.company.update",
          entityId: "67890",
          error: "index unavailable",
          sideEffects: "local-only",
        }),
      }),
    ]));
  });
});
