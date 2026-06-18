import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-events-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("event bus sent-log seeding", () => {
  it("tags seeded sent-log events with the workspace so scoped beta streams can filter them", async () => {
    fs.mkdirSync(path.join(tempRoot, "companies", "farreach", "mail"), { recursive: true });
    fs.writeFileSync(
      path.join(tempRoot, "companies", "farreach", "mail", "sent-log.json"),
      JSON.stringify([
        {
          email: "buyer@example.com",
          company: "Buyer Co",
          sent_at: "2026-05-26T00:00:00.000Z",
          subject: "Quote follow-up",
          tracking_id: "trk-internal-123",
        },
      ]),
      "utf-8"
    );

    const { seedSentLogEvents } = await import("./events");
    const events = seedSentLogEvents("farreach");

    expect(events[0]).toMatchObject({
      type: "email-sent",
      data: {
        workspaceId: "farreach",
        company: "Buyer Co",
        email: "buyer@example.com",
        subject: "Quote follow-up",
      },
    });
    expect(events[0].id).not.toContain("trk-internal-123");
  });
});
