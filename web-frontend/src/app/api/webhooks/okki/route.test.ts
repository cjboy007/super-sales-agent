import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
const originalWebhookKey = process.env.OKKI_WEBHOOK_AES_KEY;
let tempRoot = "";

function aesKey(): string {
  return Buffer.alloc(32, 11).toString("base64");
}

function sign(timestamp: string, rawBody: string, key: string): string {
  return crypto
    .createHmac("sha256", key)
    .update(timestamp + rawBody.replace(/\\\//g, "/"))
    .digest("hex");
}

function encryptOkkiData(data: unknown, key: string): string {
  const iv = Buffer.alloc(12, 5);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

function postRequest(rawBody: string, key: string, timestamp = "1782200100"): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/okki?workspaceId=farreach", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Timestamp": timestamp,
      "X-Signature": sign(timestamp, rawBody, key),
    },
    body: rawBody,
  });
}

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-okki-webhook-route-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
  process.env.OKKI_WEBHOOK_AES_KEY = aesKey();
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  if (originalWebhookKey === undefined) delete process.env.OKKI_WEBHOOK_AES_KEY;
  else process.env.OKKI_WEBHOOK_AES_KEY = originalWebhookKey;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("/api/webhooks/okki route", () => {
  it("rejects unsigned OKKI webhook requests", async () => {
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/webhooks/okki", {
      method: "POST",
      body: JSON.stringify({ message_id: "msg_unsigned", data: "noop" }),
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "Missing OKKI signature headers",
    });
  });

  it("accepts a signed encrypted OKKI test callback", async () => {
    const key = process.env.OKKI_WEBHOOK_AES_KEY || "";
    const rawBody = JSON.stringify({
      message_id: "msg_route_test",
      data: encryptOkkiData({
        biz: [{
          biz_type: "xiaoman.open.callback.test",
          biz_data: "success",
        }],
      }, key),
    });

    const { POST } = await import("./route");
    const response = await POST(postRequest(rawBody, key));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      code: 200,
      data: {
        message_id: "msg_route_test",
        data: "success",
      },
    });
  });
});
