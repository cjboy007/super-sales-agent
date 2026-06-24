import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveSkillProposal,
  approveSkillPatchProposal,
  createSkillLearnProposal,
  createSkillLearnProposalFromSource,
  createSkillPatchProposal,
  gatherSkillLearnSource,
  indexSkillMarkdown,
  enforceSkillSideEffect,
  listIndexedSkills,
  loadSkillBody,
  matchSkills,
  parseSkillMarkdown,
  reindexSkillsFromDirectory,
  salesToolsForSkill,
  skillIndexDbPath,
  validateSkillFrontmatter,
} from "./skill-kernel";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

function validSkillMarkdown(overrides = ""): string {
  return `---
name: quotation-workflow
description: Generate quotation drafts and gated quotation documents
version: 1.0.0
tags: [quotation, pricing, rfq, document]
category: sales-document
inputs: [customer, items, terms]
outputs: [quotation_draft, document_request]
side_effects: [document.generate]
permissions: [workspace.read, document.generate.request]
entrypoints:
  cli: scripts/generate-all.sh
tests:
  unit: npm test
status: beta
${overrides}---
# Quotation Workflow

Use this skill to prepare quotation drafts and request gated document generation.
`;
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-skill-kernel-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("skill-kernel parsing and validation", () => {
  it("parses Hermes-compatible frontmatter and keeps the Markdown body separate", () => {
    const parsed = parseSkillMarkdown(validSkillMarkdown(), "/repo/skills/quotation-workflow/SKILL.md");

    expect(parsed.metadata).toMatchObject({
      name: "quotation-workflow",
      description: "Generate quotation drafts and gated quotation documents",
      version: "1.0.0",
      tags: ["quotation", "pricing", "rfq", "document"],
      category: "sales-document",
      sideEffects: ["document.generate"],
      permissions: ["workspace.read", "document.generate.request"],
      status: "beta",
      sourcePath: "/repo/skills/quotation-workflow/SKILL.md",
    });
    expect(parsed.metadata.entrypoints).toEqual({ cli: "scripts/generate-all.sh" });
    expect(parsed.metadata.tests).toEqual({ unit: "npm test" });
    expect(parsed.body).toContain("# Quotation Workflow");
    expect(parsed.body).not.toContain("side_effects:");
  });

  it("reports missing SSA-required frontmatter fields", () => {
    const parsed = parseSkillMarkdown(`---
name: tiny-skill
description: Too small
---
# Tiny
`, "/repo/skills/tiny/SKILL.md");

    const validation = validateSkillFrontmatter(parsed.frontmatter);

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      "version is required",
      "tags must contain at least one item",
      "category is required",
      "inputs must contain at least one item",
      "outputs must contain at least one item",
      "side_effects must be an array",
      "permissions must be an array",
      "entrypoints must define at least one entry",
      "tests must define at least one entry",
      "status is required",
    ]));
  });
});

describe("skill-kernel SQLite index and matching", () => {
  it("indexes metadata into SQLite and lists skills without loading full bodies", () => {
    const sourcePath = path.join(tempRoot, "skills", "quotation-workflow", "SKILL.md");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, validSkillMarkdown(), "utf-8");

    const result = indexSkillMarkdown({
      markdown: fs.readFileSync(sourcePath, "utf-8"),
      sourcePath,
    });

    expect(result.indexed).toBe(true);
    expect(fs.existsSync(skillIndexDbPath())).toBe(true);
    expect(listIndexedSkills()).toEqual([
      expect.objectContaining({
        name: "quotation-workflow",
        description: "Generate quotation drafts and gated quotation documents",
        tags: ["quotation", "pricing", "rfq", "document"],
        status: "beta",
        sourcePath,
      }),
    ]);
    expect(JSON.stringify(listIndexedSkills()[0])).not.toContain("# Quotation Workflow");
  });

  it("matches executable skills deterministically by tag and side effect", () => {
    const quotePath = path.join(tempRoot, "skills", "quotation-workflow", "SKILL.md");
    const emailPath = path.join(tempRoot, "skills", "email-smart-reply", "SKILL.md");
    fs.mkdirSync(path.dirname(quotePath), { recursive: true });
    fs.mkdirSync(path.dirname(emailPath), { recursive: true });

    indexSkillMarkdown({ markdown: validSkillMarkdown(), sourcePath: quotePath });
    indexSkillMarkdown({
      markdown: validSkillMarkdown(`
name: email-smart-reply
description: Draft grounded email replies without sending
version: 1.0.0
tags: [email, reply, inbox]
category: sales-email
inputs: [email, customer_context]
outputs: [reply_draft]
side_effects: []
permissions: [workspace.read, inbox.read, llm.use]
entrypoints:
  cli: scripts/reply.js
tests:
  unit: npm test
status: beta
`),
      sourcePath: emailPath,
    });

    const matches = matchSkills({
      query: "prepare an RFQ quotation document",
      tags: ["quotation"],
      sideEffects: ["document.generate"],
      limit: 5,
    });

    expect(matches[0]).toMatchObject({
      name: "quotation-workflow",
      score: expect.any(Number),
      matchedBy: expect.arrayContaining(["tag:quotation", "side_effect:document.generate"]),
    });
    expect(matches.map((item) => item.name)).not.toContain("email-smart-reply");
  });

  it("loads the full Markdown body only after a selected skill is requested", () => {
    const sourcePath = path.join(tempRoot, "skills", "quotation-workflow", "SKILL.md");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, validSkillMarkdown(), "utf-8");
    indexSkillMarkdown({ markdown: fs.readFileSync(sourcePath, "utf-8"), sourcePath });

    const listed = listIndexedSkills()[0];
    const loaded = loadSkillBody("quotation-workflow");

    expect(JSON.stringify(listed)).not.toContain("Use this skill to prepare quotation drafts");
    expect(loaded).toMatchObject({
      name: "quotation-workflow",
      sourcePath,
      body: expect.stringContaining("Use this skill to prepare quotation drafts"),
    });
  });
});

describe("skill-kernel sales-tool bridge and learn proposals", () => {
  it("maps skill side effects to registered sales tools without executing them", () => {
    const sourcePath = path.join(tempRoot, "skills", "quotation-workflow", "SKILL.md");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, validSkillMarkdown(), "utf-8");
    indexSkillMarkdown({ markdown: fs.readFileSync(sourcePath, "utf-8"), sourcePath });

    const tools = salesToolsForSkill("quotation-workflow");

    expect(tools.map((tool) => tool.id)).toEqual(expect.arrayContaining([
      "document.generate_quotation_pi",
      "document.request_generation",
    ]));
    expect(tools.every((tool) => tool.approvalRequired)).toBe(true);
  });

  it("enforces skill side effects through the sales tool registry gate", () => {
    const sourcePath = path.join(tempRoot, "skills", "quotation-workflow", "SKILL.md");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, validSkillMarkdown(), "utf-8");
    indexSkillMarkdown({ markdown: fs.readFileSync(sourcePath, "utf-8"), sourcePath });

    expect(() => enforceSkillSideEffect({
      skillName: "quotation-workflow",
      sideEffectKind: "document.generate",
      workspaceId: "farreach",
      input: { documentType: "QT", customer: "Cable House", items: [] },
    })).toThrow(/idempotency key is required/);

    const result = enforceSkillSideEffect({
      skillName: "quotation-workflow",
      sideEffectKind: "document.generate",
      workspaceId: "farreach",
      input: { documentType: "QT", customer: "Cable House", items: [] },
      idempotencyKey: "farreach:qt:cable-house",
    });

    expect(result.audit).toMatchObject({
      toolId: "document.generate_quotation_pi",
      sideEffectKind: "document.generate",
      approvalRequired: true,
      approvalRequirement: "operator_approval_required",
    });
  });

  it("creates /learn-style proposals as pending and non-executable", () => {
    const proposal = createSkillLearnProposal({
      name: "rfq-triage",
      description: "Triage inbound RFQs and prepare missing-info questions",
      sourceKind: "workflow_summary",
      sourceText: "When an RFQ arrives, extract product lines, missing specs, and draft clarifying questions. Do not send email.",
      tags: ["rfq", "triage", "email"],
      category: "sales-email",
      inputs: ["email", "customer_context"],
      outputs: ["rfq_summary", "clarifying_questions"],
      sideEffects: ["email.send"],
      permissions: ["workspace.read", "inbox.read", "email.send.request"],
      suggestedEntryPoint: "scripts/rfq-triage.js",
      suggestedTest: "npx vitest run src/lib/runtime/skill-kernel.test.ts",
    });

    expect(proposal.validation.valid).toBe(true);
    expect(proposal.review.status).toBe("pending");
    expect(proposal.review.enabled).toBe(false);
    expect(proposal.markdown).toContain("status: pending");
    expect(proposal.markdown).toContain("## Verification");
    expect(listIndexedSkills()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "rfq-triage" }),
    ]));
    expect(listIndexedSkills({ includePending: true, includeDisabled: true })).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "rfq-triage",
        status: "pending",
        enabled: false,
        generated: true,
      }),
    ]));
    expect(matchSkills({
      query: "send RFQ clarifying email",
      tags: ["rfq"],
      sideEffects: ["email.send"],
    }).map((item) => item.name)).not.toContain("rfq-triage");
    expect(salesToolsForSkill("rfq-triage").every((tool) => tool.approvalRequired)).toBe(true);
  });

  it("requires explicit approval before a learned skill becomes executable", () => {
    const proposal = createSkillLearnProposal({
      name: "payment-followup",
      description: "Prepare payment follow-up drafts from overdue order context",
      sourceKind: "workflow_summary",
      sourceText: "Summarize overdue payment context and draft a follow-up for human review. Never confirm payment.",
      tags: ["payment", "follow-up", "email"],
      category: "sales-email",
      inputs: ["order", "customer_context"],
      outputs: ["followup_draft"],
      sideEffects: ["email.send"],
      permissions: ["workspace.read", "email.send.request"],
      suggestedEntryPoint: "scripts/payment-followup.js",
      suggestedTest: "npx vitest run src/lib/runtime/skill-kernel.test.ts",
    });

    expect(matchSkills({
      query: "payment follow-up",
      tags: ["payment"],
      sideEffects: ["email.send"],
    }).map((item) => item.name)).not.toContain("payment-followup");

    const approval = approveSkillProposal({
      proposalId: proposal.review.id,
      approvedBy: "wilson",
      approvalNote: "Reviewed source, side effects, and verification command.",
    });

    expect(approval.approved).toBe(true);
    expect(approval.skill).toMatchObject({
      name: "payment-followup",
      status: "beta",
      enabled: true,
      generated: true,
    });
    expect(matchSkills({
      query: "payment follow-up",
      tags: ["payment"],
      sideEffects: ["email.send"],
    }).map((item) => item.name)).toContain("payment-followup");
  });

  it("creates gated patch proposals for existing skills without mutating them before approval", () => {
    const sourcePath = path.join(tempRoot, "skills", "quotation-workflow", "SKILL.md");
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, validSkillMarkdown(), "utf-8");
    indexSkillMarkdown({ markdown: fs.readFileSync(sourcePath, "utf-8"), sourcePath });

    const patch = createSkillPatchProposal({
      skillName: "quotation-workflow",
      sourceKind: "workflow_summary",
      sourceText: "Add a safety reminder that formal quotation documents require approval.",
      appendMarkdown: "\n## Approval Reminder\n\nFormal quotation files require side-effect approval before generation.\n",
      proposedBy: "ssa-learn",
      suggestedTest: "npx vitest run src/lib/runtime/skill-kernel.test.ts",
    });

    expect(patch.review.status).toBe("pending");
    expect(loadSkillBody("quotation-workflow")?.body).not.toContain("Approval Reminder");
    expect(fs.readFileSync(sourcePath, "utf-8")).not.toContain("Approval Reminder");

    const approval = approveSkillPatchProposal({
      proposalId: patch.review.id,
      approvedBy: "wilson",
      approvalNote: "Reviewed patch and verification command.",
    });

    expect(approval.approved).toBe(true);
    expect(fs.readFileSync(sourcePath, "utf-8")).toContain("Approval Reminder");
    expect(loadSkillBody("quotation-workflow")?.body).toContain("Formal quotation files require side-effect approval");
  });

  it("gathers /learn source material from local paths and URLs before creating pending skills", async () => {
    const procedurePath = path.join(tempRoot, "procedures", "rfq-triage.md");
    fs.mkdirSync(path.dirname(procedurePath), { recursive: true });
    fs.writeFileSync(procedurePath, "Extract RFQ products, missing specs, and buyer deadlines.", "utf-8");

    await expect(gatherSkillLearnSource({
      kind: "local_path",
      path: procedurePath,
    })).resolves.toMatchObject({
      sourceKind: "local_path",
      sourceText: "Extract RFQ products, missing specs, and buyer deadlines.",
      sourceRef: procedurePath,
    });

    const proposal = await createSkillLearnProposalFromSource({
      name: "rfq-url-learn",
      description: "Learn RFQ triage from a URL source",
      source: {
        kind: "url",
        url: "https://example.test/rfq",
      },
      tags: ["rfq", "triage"],
      category: "sales-email",
      inputs: ["email"],
      outputs: ["rfq_summary"],
      sideEffects: [],
      permissions: ["workspace.read"],
      suggestedEntryPoint: "scripts/rfq-url-learn.js",
      suggestedTest: "npx vitest run src/lib/runtime/skill-kernel.test.ts",
    }, {
      fetchText: async (url) => `Fetched procedure from ${url}: never send without approval.`,
    });

    expect(proposal.review.sourceKind).toBe("url");
    expect(proposal.markdown).toContain("Fetched procedure from https://example.test/rfq");
    expect(listIndexedSkills()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "rfq-url-learn" }),
    ]));
  });
});

describe("skill-kernel explicit reindexing", () => {
  it("scans skill folders only when reindex is explicitly requested and reports invalid skills", () => {
    const skillsRoot = path.join(tempRoot, "skills");
    const validPath = path.join(skillsRoot, "quotation-workflow", "SKILL.md");
    const invalidPath = path.join(skillsRoot, "legacy-skill", "SKILL.md");
    fs.mkdirSync(path.dirname(validPath), { recursive: true });
    fs.mkdirSync(path.dirname(invalidPath), { recursive: true });
    fs.writeFileSync(validPath, validSkillMarkdown(), "utf-8");
    fs.writeFileSync(invalidPath, "# Legacy skill without frontmatter", "utf-8");

    expect(listIndexedSkills({ includeDisabled: true, includePending: true })).toEqual([]);

    const result = reindexSkillsFromDirectory(skillsRoot);

    expect(result.scanned).toBe(2);
    expect(result.indexed).toBe(1);
    expect(result.invalid).toEqual([
      expect.objectContaining({
        sourcePath: invalidPath,
        errors: expect.arrayContaining(["name is required"]),
      }),
    ]);
    expect(listIndexedSkills()).toEqual([
      expect.objectContaining({ name: "quotation-workflow" }),
    ]);
  });
});
