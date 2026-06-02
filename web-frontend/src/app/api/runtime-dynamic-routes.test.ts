import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const API_ROUTES_THAT_TOUCH_RUNTIME_STATE = [
  "config/route.ts",
  "documents/generate/route.ts",
  "documents/pi-records/route.ts",
  "documents/quick-quote/export-pi/route.ts",
  "documents/quick-quote/modify/route.ts",
  "documents/templates/route.ts",
  "emails/drafts/route.ts",
  "emails/pending/route.ts",
  "emails/send/route.ts",
  "emails/sent/route.ts",
  "emails/stats/route.ts",
  "files/open/route.ts",
  "files/preview/route.ts",
  "files/route.ts",
  "inbox/[emailId]/reply/route.ts",
  "inbox/[emailId]/route.ts",
  "inbox/[emailId]/send/route.ts",
  "inbox/route.ts",
  "leads/route.ts",
  "quotations/generate/route.ts",
  "quotations/route.ts",
];

describe("runtime API route rendering mode", () => {
  it("marks runtime-backed routes as dynamic so build does not prerender SQLite state", () => {
    for (const route of API_ROUTES_THAT_TOUCH_RUNTIME_STATE) {
      const filePath = path.join(process.cwd(), "src", "app", "api", route);
      const source = fs.readFileSync(filePath, "utf-8");

      expect(source, `${route} should export force-dynamic`).toContain('export const dynamic = "force-dynamic"');
    }
  });
});
