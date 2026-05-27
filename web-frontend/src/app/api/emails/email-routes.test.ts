import fs from "fs";
import { NextRequest } from "next/server";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-email-routes-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;

  fs.mkdirSync(path.join(tempRoot, "mail", "drafts"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "hero-pumps", "tracking"), { recursive: true });

  fs.writeFileSync(
    path.join(tempRoot, "mail", "sent-log.json"),
    JSON.stringify([
      { email: "ada@example.com", sent_at: "2026-05-26T10:00:00.000Z", subject: "Initial pump offer" },
      { email: "nils@example.com", sent_at: "2026-05-25T10:00:00.000Z", subject: "Circulator pump catalog" },
    ]),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(tempRoot, "hero-pumps", "follow-up-state.json"),
    JSON.stringify({
      "ada@example.com": {
        email: "ada@example.com",
        follow_up_stage: 2,
        next_follow_up_at: "2026-05-27T10:00:00.000Z",
        has_reply: false,
        is_due: true,
      },
      "nils@example.com": {
        email: "nils@example.com",
        follow_up_stage: 1,
        has_reply: true,
        is_due: false,
      },
    }),
    "utf-8"
  );
  fs.writeFileSync(
    path.join(tempRoot, "hero-pumps", "tracking", "replies.json"),
    JSON.stringify([{ email: "nils@example.com" }]),
    "utf-8"
  );
  fs.writeFileSync(path.join(tempRoot, "mail", "drafts", "followup-ada.md"), "Draft", "utf-8");
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;

  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function request(url: string): NextRequest {
  return new NextRequest(url);
}

describe("/api/emails routes", () => {
  it("serves Hero email stats through Sales Memory", async () => {
    const { GET } = await import("./stats/route");

    const response = await GET(request("http://localhost/api/emails/stats?project=hero-pumps"));
    const json = await response.json();

    expect(json).toEqual({
      success: true,
      data: {
        totalSent: 2,
        totalReceived: 1,
        totalReplied: 1,
        replyRate: 50,
        totalDrafts: 1,
      },
    });
  });

  it("serves Hero sent, draft, and pending email memory with existing response shapes", async () => {
    const sentRoute = await import("./sent/route");
    const draftsRoute = await import("./drafts/route");
    const pendingRoute = await import("./pending/route");

    const sent = await (await sentRoute.GET(request("http://localhost/api/emails/sent?project=hero-pumps&page=1&limit=1"))).json();
    const drafts = await (await draftsRoute.GET(request("http://localhost/api/emails/drafts?project=hero-pumps"))).json();
    const pending = await (await pendingRoute.GET(request("http://localhost/api/emails/pending?project=hero-pumps"))).json();

    expect(sent).toMatchObject({
      success: true,
      data: {
        total: 2,
        page: 1,
        totalPages: 2,
        items: [{ email: "ada@example.com", subject: "Initial pump offer" }],
      },
    });
    expect(drafts).toEqual({
      success: true,
      data: [
        {
          id: "hero-draft-1",
          subject: "ada",
          template: "followup-ada.md",
        },
      ],
    });
    expect(pending).toEqual({
      success: true,
      data: [
        {
          id: "hero-pending-ada",
          to: "ada@example.com",
          subject: "Follow-up #2: Initial pump offer",
          scheduledAt: "2026-05-27T10:00:00.000Z",
          reason: "第 2 次跟进",
        },
      ],
    });
  });

  it("returns empty email memory for a new local workspace", async () => {
    const statsRoute = await import("./stats/route");
    const sentRoute = await import("./sent/route");
    const draftsRoute = await import("./drafts/route");
    const pendingRoute = await import("./pending/route");

    await expect((await statsRoute.GET(request("http://localhost/api/emails/stats?project=new-salesperson"))).json()).resolves.toEqual({
      success: true,
      data: { totalSent: 0, totalReceived: 0, totalReplied: 0, replyRate: 0, totalDrafts: 0 },
    });
    await expect((await sentRoute.GET(request("http://localhost/api/emails/sent?project=new-salesperson"))).json()).resolves.toEqual({
      success: true,
      data: { items: [], total: 0, page: 1, totalPages: 0 },
    });
    await expect((await draftsRoute.GET(request("http://localhost/api/emails/drafts?project=new-salesperson"))).json()).resolves.toEqual({
      success: true,
      data: [],
    });
    await expect((await pendingRoute.GET(request("http://localhost/api/emails/pending?project=new-salesperson"))).json()).resolves.toEqual({
      success: true,
      data: [],
    });
  });
});
