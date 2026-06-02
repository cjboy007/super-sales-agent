import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeAnalyzeProductDocUpload, runProductDocReaderJob } from "./product-doc-reader";
import type { IntakeUpload } from "./intake";
import { writeSettings } from "../config-store";

let tempRoot = "";
const originalDataRoot = process.env.SSA_DATA_ROOT;

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-product-doc-reader-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("product doc reader runtime wrapper", () => {
  it("summarizes extracted product drawing fields without moving the upload", async () => {
    const uploadPath = path.join(tempRoot, "599-028.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");
    const upload: IntakeUpload = {
      id: "file-1",
      name: "599-028 technical drawing.pdf",
      type: "application/pdf",
      size: 9,
      path: uploadPath,
      storedAt: new Date().toISOString(),
    };

    const analysis = await maybeAnalyzeProductDocUpload({
      project: "demo-exporter",
      uploads: [upload],
      itemType: "Product Spec",
      message: "Please read this technical drawing.",
      runCommand: async () => ({
        stdout: JSON.stringify({
          product_name: "HDMI2CABLE4K6030F",
          model_no: "5001-131A",
          drawing_no: "599-028",
          packaging_spec: "BJ0599-0053",
          bom: [{ no: "1" }, { no: "2" }],
          confidence: 92,
          warnings: [],
        }),
        stderr: "",
        status: 0,
      }),
    });

    expect(analysis).toMatchObject({
      productName: "HDMI2CABLE4K6030F",
      modelNo: "5001-131A",
      drawingNo: "599-028",
      packagingSpec: "BJ0599-0053",
      bomRows: 2,
      confidence: 92,
      needsReview: false,
      uploadPath,
    });
    expect(fs.existsSync(uploadPath)).toBe(true);
  });

  it("does not run for unrelated uploads", async () => {
    const calls: string[] = [];
    const analysis = await maybeAnalyzeProductDocUpload({
      project: "demo-exporter",
      uploads: [{ id: "file-1", name: "lead-list.csv", type: "text/csv", size: 12, path: "/tmp/lead-list.csv", storedAt: "" }],
      itemType: "Lead List",
      message: "Import leads",
      runCommand: async () => {
        calls.push("called");
        return { stdout: "{}", stderr: "", status: 0 };
      },
    });

    expect(analysis).toBeNull();
    expect(calls).toEqual([]);
  });

  it("keeps intake safe when the extractor returns invalid JSON", async () => {
    const uploadPath = path.join(tempRoot, "599-028.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");

    const analysis = await maybeAnalyzeProductDocUpload({
      project: "demo-exporter",
      uploads: [{ id: "file-1", name: "599-028.pdf", type: "application/pdf", size: 9, path: uploadPath, storedAt: "" }],
      itemType: "Product Spec",
      message: "Read drawing",
      runCommand: async () => ({ stdout: "not json", stderr: "", status: 0 }),
    });

    expect(analysis).toMatchObject({
      confidence: 0,
      needsReview: true,
      uploadPath,
    });
    expect(analysis?.warnings[0]).toContain("JSON");
  });

  it("passes configured vision keys to the extractor process environment", async () => {
    const uploadPath = path.join(tempRoot, "599-028.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");
    writeSettings({
      deepseekApiKey: "",
      openaiApiKey: "openai-vision-secret",
      openrouterApiKey: "openrouter-vision-secret",
      geminiApiKey: "gemini-vision-secret",
      tavilyApiKey: "",
      hunterApiKey: "",
      apolloApiKey: "",
      crmProvider: "none",
      crmApiKey: "",
      notificationProvider: "none",
      notificationWebhookUrl: "",
      defaultModel: "google/gemini-2.5-flash",
      smtpHost: "",
      smtpPort: "465",
      smtpEncryption: "ssl",
      imapHost: "",
      imapPort: "993",
      imapEncryption: "ssl",
      email: "",
      emailPassword: "",
      autoCapture: true,
      searchEngine: "tavily",
      searchRegion: "global",
      maxResults: 10,
      searchDepth: "standard",
      autoResearch: {
        leadResearch: true,
        priceMonitor: true,
        trendTracking: false,
        emailVerify: true,
      },
    });

    let envSeen: NodeJS.ProcessEnv | undefined;
    await maybeAnalyzeProductDocUpload({
      project: "demo-exporter",
      uploads: [{ id: "file-1", name: "599-028.pdf", type: "application/pdf", size: 9, path: uploadPath, storedAt: "" }],
      itemType: "Product Spec",
      message: "Read drawing",
      runCommand: async (_command, _args, options) => {
        envSeen = options?.env;
        return {
          stdout: JSON.stringify({
            product_name: "HDMI2CABLE4K6030F",
            model_no: "5001-131A",
            drawing_no: "599-028",
            packaging_spec: "BJ0599-0053",
            bom: [],
            confidence: 88,
            warnings: [],
          }),
          stderr: "",
          status: 0,
        };
      },
    });

    expect(envSeen).toMatchObject({
      OPENROUTER_API_KEY: "openrouter-vision-secret",
      OPENAI_API_KEY: "openai-vision-secret",
      GEMINI_API_KEY: "gemini-vision-secret",
      GOOGLE_API_KEY: "gemini-vision-secret",
    });
  });

  it("writes queued product doc results back to the intake record", async () => {
    const sessionDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "sessions");
    const uploadDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "uploads", "intake-1");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, "599-028.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");
    const recordPath = path.join(sessionDir, "intake-1.json");
    fs.writeFileSync(recordPath, JSON.stringify({
      id: "intake-1",
      project: "demo-exporter",
      status: "pending_review",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pastedText: "",
      uploads: [{
        id: "file-1",
        name: "599-028.pdf",
        type: "application/pdf",
        size: 9,
        path: uploadPath,
        storedAt: new Date().toISOString(),
        processing: {
          status: "queued",
          kind: "product_doc",
          updatedAt: new Date().toISOString(),
        },
      }],
      messages: [],
      analysis: {
        source: "local",
        itemType: "Product Spec",
        destination: "documents/product-specs",
        confidence: 74,
        relatedParty: "Unknown",
        summary: "",
        evidence: [],
        matches: [],
        actions: [],
      },
    }, null, 2), "utf-8");

    const result = await runProductDocReaderJob({
      project: "demo-exporter",
      intakeId: "intake-1",
      uploadId: "file-1",
      uploadPath,
      runCommand: async () => ({
        stdout: JSON.stringify({
          product_name: "HDMI2CABLE4K6030F",
          model_no: "5001-131A",
          drawing_no: "599-028",
          packaging_spec: "BJ0599-0053",
          bom: [{ no: "1" }, { no: "2" }],
          confidence: 92,
          warnings: [],
          needs_review: false,
        }),
        stderr: "",
        status: 0,
      }),
    });

    const updated = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
    expect(result.needsReview).toBe(false);
    expect(updated.analysis.productDoc).toMatchObject({
      productName: "HDMI2CABLE4K6030F",
      drawingNo: "599-028",
      bomRows: 2,
    });
    expect(updated.uploads[0].processing).toMatchObject({
      status: "completed",
      kind: "product_doc",
    });
    expect(updated.uploads[0].processing.resultRef).toContain("file-1.product-doc.json");
    expect(fs.existsSync(updated.uploads[0].processing.resultRef)).toBe(true);
  });

  it("marks low confidence product doc jobs as needs_review", async () => {
    const sessionDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "sessions");
    const uploadDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "uploads", "intake-low");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, "599-030.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");
    const recordPath = path.join(sessionDir, "intake-low.json");
    fs.writeFileSync(recordPath, JSON.stringify({
      id: "intake-low",
      project: "demo-exporter",
      status: "pending_review",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pastedText: "",
      uploads: [{
        id: "file-low",
        name: "599-030.pdf",
        type: "application/pdf",
        size: 9,
        path: uploadPath,
        storedAt: new Date().toISOString(),
        processing: { status: "queued", kind: "product_doc" },
      }],
      messages: [],
      analysis: {
        source: "local",
        itemType: "Product Spec",
        destination: "documents/product-specs",
        confidence: 74,
        relatedParty: "Unknown",
        summary: "",
        evidence: [],
        matches: [],
        actions: [],
      },
    }, null, 2), "utf-8");

    await runProductDocReaderJob({
      project: "demo-exporter",
      intakeId: "intake-low",
      uploadId: "file-low",
      runCommand: async () => ({
        stdout: JSON.stringify({
          product_name: "HDMI cable",
          model_no: "5001-130A",
          drawing_no: "599-030",
          packaging_spec: "",
          bom: [],
          confidence: 62,
          warnings: [],
        }),
        stderr: "",
        status: 0,
      }),
    });

    const updated = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
    expect(updated.uploads[0].processing).toMatchObject({
      status: "needs_review",
      kind: "product_doc",
    });
    expect(updated.analysis.productDoc).toMatchObject({
      drawingNo: "599-030",
      confidence: 62,
      needsReview: true,
    });
  });

  it("marks failed product doc jobs without deleting the upload", async () => {
    const sessionDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "sessions");
    const uploadDir = path.join(tempRoot, "companies", "demo-exporter", "intake", "uploads", "intake-fail");
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.mkdirSync(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, "599-031.pdf");
    fs.writeFileSync(uploadPath, "%PDF test", "utf-8");
    const recordPath = path.join(sessionDir, "intake-fail.json");
    fs.writeFileSync(recordPath, JSON.stringify({
      id: "intake-fail",
      project: "demo-exporter",
      status: "pending_review",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pastedText: "",
      uploads: [{
        id: "file-fail",
        name: "599-031.pdf",
        type: "application/pdf",
        size: 9,
        path: uploadPath,
        storedAt: new Date().toISOString(),
        processing: { status: "queued", kind: "product_doc" },
      }],
      messages: [],
      analysis: {
        source: "local",
        itemType: "Product Spec",
        destination: "documents/product-specs",
        confidence: 74,
        relatedParty: "Unknown",
        summary: "",
        evidence: [],
        matches: [],
        actions: [],
      },
    }, null, 2), "utf-8");

    await expect(runProductDocReaderJob({
      project: "demo-exporter",
      intakeId: "intake-fail",
      uploadId: "file-fail",
      runCommand: async () => ({ stdout: "", stderr: "extractor unavailable", status: 1 }),
    })).rejects.toThrow("extractor unavailable");

    const updated = JSON.parse(fs.readFileSync(recordPath, "utf-8"));
    expect(updated.uploads[0].processing).toMatchObject({
      status: "failed",
      kind: "product_doc",
      error: "extractor unavailable",
    });
    expect(fs.existsSync(uploadPath)).toBe(true);
  });
});
