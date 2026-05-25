/**
 * Smoke tests: SSA standalone runtime
 *
 * Proves that SSA can operate without OpenClaw, Hermes, PHOENIX, or Codex.
 * All tests run with mocked LLM and no external dependencies.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Override env BEFORE importing ssa-runtime modules
process.env.SSA_PROJECT_ROOT = path.resolve(__dirname, "..");
process.env.SSA_MODE = "test";
process.env.SSA_LLM_MOCK = "true";

import {
  loadConfig,
  getConfig,
  resetConfig,
  llmCall,
  requestSideEffect,
  verifyApprovalForSideEffect,
  getSideEffectLog,
  clearSideEffectLog,
  runPipeline,
} from "../ssa-runtime/index";

describe("ssa-runtime standalone operation", () => {
  beforeEach(() => {
    resetConfig();
    clearSideEffectLog();
  });

  describe("config", () => {
    it("loads config from SSA_PROJECT_ROOT without hardcoded paths", () => {
      const config = loadConfig();
      expect(config.projectRoot).toBe(process.env.SSA_PROJECT_ROOT);
      expect(config.paths.data).toContain(config.projectRoot);
      expect(config.paths.shared).toContain(config.projectRoot);
      expect(config.mode).toBe("test");
    });

    it("resolves all paths relative to project root", () => {
      const config = loadConfig();
      const root = config.projectRoot;
      expect(config.paths.data).toBe(path.join(root, "data"));
      expect(config.paths.shared).toBe(path.join(root, "shared"));
      expect(config.db.agentState).toBe(path.join(root, "data/agent_state.db"));
      expect(config.db.approvalEngine).toBe(path.join(root, "data/approval_engine.db"));
    });

    it("sets mock mode in test environment", () => {
      const config = loadConfig();
      expect(config.llm.mockMode).toBe(true);
    });
  });

  describe("LLM provider (mock mode)", () => {
    it("returns mock response for classification", async () => {
      const res = await llmCall({
        messages: [
          { role: "system", content: "You classify email intent." },
          { role: "user", content: "Classify this email intent: I want to buy 500 USB-C cables" },
        ],
      });
      expect(res.mock).toBe(true);
      expect(res.content).toContain("intent");
      expect(res.content).toContain("inquiry");
    });

    it("returns mock response for drafting", async () => {
      const res = await llmCall({
        messages: [
          { role: "user", content: "Draft a reply to this customer inquiry" },
        ],
      });
      expect(res.mock).toBe(true);
      expect(res.content).toContain("quotation");
    });

    it("returns mock response for extraction", async () => {
      const res = await llmCall({
        messages: [
          { role: "user", content: "Extract company and contact from this email" },
        ],
      });
      expect(res.mock).toBe(true);
      const parsed = JSON.parse(res.content);
      expect(parsed.company).toBeDefined();
    });

    it("does not call real API in test mode", async () => {
      const res = await llmCall({
        messages: [{ role: "user", content: "Hello" }],
      });
      expect(res.mock).toBe(true);
      expect(res.usage.promptTokens).toBe(0);
    });
  });

  describe("side-effect gate", () => {
    it("blocks email sends in test mode", () => {
      const result = requestSideEffect({
        type: "email_send",
        target: "customer@example.com",
        payload: { subject: "Quote", body: "..." },
        requestedBy: "iron",
      });
      expect(result.executed).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.reason).toContain("test");
    });

    it("blocks external API calls in test mode", () => {
      const result = requestSideEffect({
        type: "external_api",
        target: "okki.com/api/customers",
        payload: {},
        requestedBy: "shadow",
      });
      expect(result.blocked).toBe(true);
    });

    it("blocks payment actions in test mode", () => {
      const result = requestSideEffect({
        type: "payment",
        target: "bank-transfer",
        payload: { amount: 50000 },
        requestedBy: "warden",
      });
      expect(result.blocked).toBe(true);
    });

    it("logs all blocked side effects", () => {
      clearSideEffectLog();
      requestSideEffect({ type: "email_send", target: "a@b.com", payload: {}, requestedBy: "iron" });
      requestSideEffect({ type: "sms_send", target: "+1234", payload: {}, requestedBy: "iron" });
      const log = getSideEffectLog();
      expect(log).toHaveLength(2);
      expect(log[0].request.type).toBe("email_send");
      expect(log[1].request.type).toBe("sms_send");
    });

    it("requires an approved approval record before production side effects", () => {
      process.env.SSA_MODE = "production";
      resetConfig();
      clearSideEffectLog();

      const missingId = requestSideEffect({
        type: "email_send",
        target: "customer@example.com",
        payload: { subject: "Quote" },
        requestedBy: "iron",
      });
      expect(missingId.blocked).toBe(true);
      expect(missingId.reason).toContain("No approval ID");

      const missingRecord = requestSideEffect({
        type: "email_send",
        target: "customer@example.com",
        payload: { subject: "Quote" },
        approvalId: "APV-NOT-IN-SSA-DB",
        requestedBy: "iron",
      });
      expect(missingRecord.blocked).toBe(true);
      expect(missingRecord.reason).not.toContain("ready for executor");

      process.env.SSA_MODE = "test";
      resetConfig();
    });

    it("rejects approval verification without an approval ID", () => {
      const result = verifyApprovalForSideEffect();
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("No approval ID");
    });
  });

  describe("no OpenClaw/Hermes/PHOENIX runtime dependency", () => {
    it("ssa-runtime imports without openclaw on PATH", () => {
      // If we got here, the import at the top succeeded without openclaw
      expect(loadConfig).toBeDefined();
      expect(llmCall).toBeDefined();
      expect(requestSideEffect).toBeDefined();
    });

    it("config does not reference openclaw.json", () => {
      const config = loadConfig();
      const allValues = JSON.stringify(config);
      expect(allValues).not.toContain("openclaw.json");
      expect(allValues).not.toContain("hermes");
      expect(allValues).not.toContain("PHOENIX");
    });
  });

  describe("LLM pipeline (context-aware, mock mode)", () => {
    it("runs classify_intent pipeline with mock LLM", async () => {
      const output = await runPipeline({
        task: "classify_intent",
        content: "Hi, I'd like to inquire about USB-C cable pricing for 10,000 units.",
        customerEmail: "buyer@example.com",
      });
      expect(output.mock).toBe(true);
      expect(output.task).toBe("classify_intent");
      expect(output.result).toContain("intent");
      expect(output.context).toBeDefined();
    });

    it("runs draft_reply pipeline with mock LLM", async () => {
      const output = await runPipeline({
        task: "draft_reply",
        content: "Please send me a quote for HDMI 2.1 cables, 5000pcs.",
        customerEmail: "procurement@acme.com",
        language: "en",
      });
      expect(output.mock).toBe(true);
      expect(output.result.length).toBeGreaterThan(0);
    });

    it("runs extract_structured pipeline with mock LLM", async () => {
      const output = await runPipeline({
        task: "extract_structured",
        content: "From: John at TechCorp. Need 2000 USB-C to Lightning cables by March.",
        jsonMode: true,
      });
      expect(output.mock).toBe(true);
      expect(output.parsed).not.toBeNull();
      expect(output.parsed?.company).toBeDefined();
    });

    it("includes customer context when email provided", async () => {
      const output = await runPipeline({
        task: "classify_intent",
        content: "Following up on our last conversation.",
        customerEmail: "returning@customer.com",
      });
      expect(output.context).toBeDefined();
      // Context builder returns empty context if no DB exists (which is fine in test)
      expect(output.context.promptFragment).toBeDefined();
    });

    it("passes customer email to context builder as data, not shell text", async () => {
      const originalRoot = process.env.SSA_PROJECT_ROOT;
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-context-"));
      const dataDir = path.join(tmpRoot, "data");
      const sentinel = path.join(tmpRoot, "shell-injected");

      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(path.join(dataDir, "sales-state.db"), "");

      process.env.SSA_PROJECT_ROOT = tmpRoot;
      process.env.SSA_MODE = "test";
      process.env.SSA_LLM_MOCK = "true";
      resetConfig();

      try {
        const output = await runPipeline({
          task: "classify_intent",
          content: "Please quote 5000 USB-C cables.",
          customerEmail: `buyer@example.com'; touch ${sentinel}; echo '`,
        });

        expect(output.mock).toBe(true);
        expect(output.context.promptFragment).toBeDefined();
        expect(fs.existsSync(sentinel)).toBe(false);
      } finally {
        if (originalRoot) {
          process.env.SSA_PROJECT_ROOT = originalRoot;
        } else {
          delete process.env.SSA_PROJECT_ROOT;
        }
        resetConfig();
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });
});
