import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "../../app/api/dashboard/overview/route";

vi.mock("@/lib/leads", () => ({
  getLeadStats: vi.fn(() => ({ data: { total: 12, hot: 4 } })),
  loadLeadsRaw: vi.fn(() => [
    { company_name: "Acme Industrial", email: "buyer@example.com", category: "A", confidence: "high" },
  ]),
}));

vi.mock("@/lib/emails", () => ({
  getEmailStats: vi.fn(() => ({
    totalSent: 5,
    totalReceived: 2,
    totalReplied: 1,
    replyRate: 20,
    totalDrafts: 3,
  })),
}));

vi.mock("@/lib/quotations", () => ({
  getQuotations: vi.fn(() => ({ quotations: [{ status: "Draft" }] })),
}));

vi.mock("@/lib/db", () => ({
  getAgentState: vi.fn(() => ({
    tasks: [
      {
        id: "task-001",
        agent: "shadow",
        status: "running",
        title: "Research Acme Industrial",
        started_at: "2026-05-23T08:00:00.000Z",
        updated_at: "2026-05-23T08:05:00.000Z",
        progress: 40,
      },
    ],
    agents: [],
  })),
}));

describe("dashboard overview agent tasks", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reads agent rail data from SSA-owned agent state", async () => {
    const response = await GET(new Request("http://localhost/api/dashboard/overview?project=farreach"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.data.agentTasks).toHaveLength(1);
    expect(payload.data.agentTasks[0].task).toContain("shadow");
    expect(payload.data.agentTasks[0].status).toBe("processing");
    expect(payload.data.agentTasks[0].progress).toBe(40);
  });
});
