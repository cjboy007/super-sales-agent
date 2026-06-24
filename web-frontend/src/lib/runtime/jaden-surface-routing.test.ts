import { describe, expect, it } from "vitest";
import { JADEN_SURFACE_ROUTING, getJadenSurfaceRouting } from "./jaden-surface-routing";

describe("Jaden surface routing decisions", () => {
  it("declares a routing decision for every named Jaden input surface", () => {
    expect(JADEN_SURFACE_ROUTING.map((item) => item.surface).sort()).toEqual([
      "approvals",
      "battle-station",
      "customers",
      "documents",
      "growth",
      "inbox",
      "intake",
      "leads",
      "quick-quote",
    ]);
  });

  it("documents specialized editors and mixed workflow surfaces instead of leaving them as disconnected chats", () => {
    expect(getJadenSurfaceRouting("intake")).toMatchObject({
      kind: "specialized-local-editor",
      modes: ["file_intake"],
    });
    expect(getJadenSurfaceRouting("quick-quote")).toMatchObject({
      kind: "specialized-local-editor",
      modes: ["object_edit"],
    });
    expect(getJadenSurfaceRouting("inbox")).toMatchObject({
      kind: "shared-command-plus-workflow",
      modes: ["reply_draft", "review"],
    });
    expect(getJadenSurfaceRouting("approvals")).toMatchObject({
      kind: "shared-command-plus-workflow",
      modes: ["review"],
    });
    expect(getJadenSurfaceRouting("growth")).toMatchObject({
      kind: "shared-command-plus-workflow",
    });
  });
});
