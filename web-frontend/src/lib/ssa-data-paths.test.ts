import path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ssaCompanyDataPath, ssaDataPath, ssaWorkspaceDataPath } from "./ssa-data-paths";

const originalAppRoot = process.env.SSA_APP_ROOT;

afterEach(() => {
  if (originalAppRoot === undefined) delete process.env.SSA_APP_ROOT;
  else process.env.SSA_APP_ROOT = originalAppRoot;
});

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

  it("uses an explicit app root for packaged standalone and Docker runtimes", async () => {
    vi.resetModules();
    process.env.SSA_APP_ROOT = path.join(path.sep, "opt", "ssa");
    const { repoPath, ssaAppRoot } = await import("./ssa-data-paths");

    expect(ssaAppRoot()).toBe(path.join(path.sep, "opt", "ssa"));
    expect(repoPath("skills", "product-doc-reader")).toBe(
      path.join(path.sep, "opt", "ssa", "skills", "product-doc-reader")
    );
  });
});
