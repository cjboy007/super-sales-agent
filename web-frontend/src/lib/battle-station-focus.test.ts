import { describe, expect, it } from "vitest";
import { battleStationI18n } from "./battle-station-data";
import { resolveFocusCase } from "./battle-station-focus";

describe("resolveFocusCase", () => {
  it("keeps authored focus cases unchanged", () => {
    const station = battleStationI18n.en;

    const focusCase = resolveFocusCase({
      dealId: "amphenol",
      language: "en",
      accounts: station.domainAccounts,
      approvals: station.approvalRequests,
      events: station.timelineEvents,
      focusCases: station.focusCases,
    });

    expect(focusCase).toBe(station.focusCases.amphenol);
  });

  it("creates an openable focus case for every Chinese approval request", () => {
    const station = battleStationI18n.zh;

    for (const approval of station.approvalRequests) {
      const focusCase = resolveFocusCase({
        dealId: approval.dealId,
        language: "zh",
        accounts: station.domainAccounts,
        approvals: station.approvalRequests,
        events: station.timelineEvents,
        focusCases: station.focusCases,
      });

      expect(focusCase?.dealId).toBe(approval.dealId);
      expect(focusCase?.approvalId).toBe(approval.id);
      expect(focusCase?.messages.length).toBeGreaterThanOrEqual(2);
      expect(focusCase?.analysis.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("builds reviewable fallback details for approvals without authored templates", () => {
    const station = battleStationI18n.en;

    for (const dealId of ["molex", "te-connectivity"]) {
      const approval = station.approvalRequests.find((item) => item.dealId === dealId);
      const focusCase = resolveFocusCase({
        dealId,
        language: "en",
        accounts: station.domainAccounts,
        approvals: station.approvalRequests,
        events: station.timelineEvents,
        focusCases: station.focusCases,
      });

      expect(focusCase).toMatchObject({
        dealId,
        approvalId: approval?.id,
        title: `${approval?.account} - ${approval?.title}`,
      });
      expect(focusCase?.subject).toContain(approval?.title);
      expect(focusCase?.draft).toContain("JadenOS");
      expect(focusCase?.analysis.some((block) => block.title === "Recent Signals")).toBe(true);
    }
  });
});
