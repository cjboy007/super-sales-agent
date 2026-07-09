import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const apiClientPages = [
  "src/app/page.tsx",
  "src/app/growth/page.tsx",
  "src/app/emails/page.tsx",
  "src/app/inbox/[emailId]/page.tsx",
  "src/app/inbox/page.tsx",
  "src/app/intake/page.tsx",
  "src/app/quotations/page.tsx",
  "src/app/documents/page.tsx",
  "src/app/intelligence/page.tsx",
  "src/app/agent-status/page.tsx",
  "src/app/health/page.tsx",
  "src/app/settings/page.tsx",
  "src/app/leads/page.tsx",
  "src/app/onboarding/JadenosOnboarding.tsx",
  "src/components/quick-quote/QuickQuotePage.tsx",
  "src/components/ui/PageCommandPanel.tsx",
];

describe("project API client usage on product pages", () => {
  it.each(apiClientPages)("routes workspace API requests through useProject apiFetch in %s", (filePath) => {
    const source = readFileSync(join(process.cwd(), filePath), "utf8");
    expect(source).toContain("useProject");
    expect(source).toContain("apiFetch");
    expect(source).not.toMatch(/fetch\([`'"]\/api\/(?!health)/);
    expect(source).not.toContain("fetch(apiUrl(");
  });
});
