import path from "path";
import { describe, expect, it } from "vitest";
import { ssaCompanyDataPath, ssaDataPath, ssaWorkspaceDataPath } from "./ssa-data-paths";

describe("SSA data paths", () => {
  it("keeps company runtime files under companies/<workspace>", () => {
    expect(ssaCompanyDataPath("farreach", "documents", "quote.pdf")).toBe(
      ssaDataPath("companies", "farreach", "documents", "quote.pdf")
    );
    expect(ssaWorkspaceDataPath("hero-pumps", "inbox", "state.json")).toBe(
      ssaDataPath("companies", "hero-pumps", "inbox", "state.json")
    );
  });

  it("sanitizes workspace ids before building paths", () => {
    expect(ssaCompanyDataPath("../bad workspace", "mail")).toBe(
      path.join(ssaDataPath(), "companies", ".._bad_workspace", "mail")
    );
  });
});
