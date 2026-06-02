import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDataRoot = process.env.SSA_DATA_ROOT;
let tempRoot = "";

beforeEach(() => {
  vi.resetModules();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ssa-intel-collector-test-"));
  process.env.SSA_DATA_ROOT = tempRoot;
});

afterEach(() => {
  if (originalDataRoot === undefined) delete process.env.SSA_DATA_ROOT;
  else process.env.SSA_DATA_ROOT = originalDataRoot;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

function rss(items: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
  <rss><channel>${items.join("")}</channel></rss>`;
}

function item(title: string, link: string, source = "Example News", description?: string) {
  return `<item>
    <title>${title}</title>
    <link>${link}</link>
    <source>${source}</source>
    <pubDate>Sun, 31 May 2026 01:00:00 GMT</pubDate>
    <description>${description || `${title} affects cables, connectors, copper, export pricing, and sales timing.`}</description>
  </item>`;
}

describe("SSA intelligence collector", () => {
  it("collects fixed-source news into the workspace intelligence cache", async () => {
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");
    const fetcher = async (url: string) => {
      if (url.includes("query1.finance.yahoo.com")) {
        return JSON.stringify({
          chart: {
            result: [{
              meta: { regularMarketPrice: 5.1, previousClose: 5 },
              timestamp: [1772326800, 1772413200],
              indicators: { quote: [{ close: [5, 5.1] }] },
            }],
          },
        });
      }
      if (url.includes("frankfurter")) {
        return JSON.stringify({ rates: { CNY: 7.18 } });
      }
      return rss([
        item("USB cable certification update", "https://www.usb.org/news/certification-update", "USB-IF"),
        item("Cable market size forecast report", "https://grandviewresearch.com/report", "GrandViewResearch"),
        item("USB cable certification update", "https://www.usb.org/news/certification-update", "USB-IF"),
      ]);
    };

    const result = await refreshIntelligenceFeeds("farreach", { fetcher, now: new Date("2026-05-31T08:00:00.000Z") });
    const newsPath = path.join(tempRoot, "companies", "farreach", "intelligence", "news.json");
    const alertsPath = path.join(tempRoot, "companies", "farreach", "intelligence", "alerts.json");
    const newsJson = JSON.parse(fs.readFileSync(newsPath, "utf-8"));
    const alertsJson = JSON.parse(fs.readFileSync(alertsPath, "utf-8"));

    expect(result.success).toBe(true);
    expect(newsJson.news).toHaveLength(1);
    expect(newsJson.news[0]).toMatchObject({
      title: "USB cable certification update",
      titleZh: "USB-IF 发布 USB 相关消息",
      tag: "standards",
      source: "USB-IF",
    });
    expect(alertsJson.alerts.some((alert: { id?: string }) => alert.id === "copper-price")).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, "companies", "farreach", "intelligence", "news-dedupe-log.json"))).toBe(true);
  });

  it("keeps the existing cache when every external source fails", async () => {
    const dir = path.join(tempRoot, "companies", "farreach", "intelligence");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "news.json"),
      JSON.stringify({ updatedAt: "old", news: [{ id: "old", title: "Existing cached signal" }] }),
      "utf-8"
    );
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");

    const result = await refreshIntelligenceFeeds("farreach", {
      fetcher: async () => {
        throw new Error("network down");
      },
      now: new Date("2026-05-31T08:00:00.000Z"),
    });
    const newsJson = JSON.parse(fs.readFileSync(path.join(dir, "news.json"), "utf-8"));

    expect(result.success).toBe(false);
    expect(result.error).toContain("No news items");
    expect(newsJson.news).toEqual([{ id: "old", title: "Existing cached signal" }]);
  });

  it("does not overwrite competitor cache when news refresh finds no competitor entries", async () => {
    const dir = path.join(tempRoot, "companies", "farreach", "intelligence");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "competitors.json"),
      JSON.stringify({ updatedAt: "old", competitors: [{ id: "comp-old", company: "Belden" }] }),
      "utf-8"
    );
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");

    await refreshIntelligenceFeeds("farreach", {
      fetcher: async (url) => {
        if (url.includes("query1.finance.yahoo.com")) {
          return JSON.stringify({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
        }
        if (url.includes("frankfurter")) return JSON.stringify({ rates: { CNY: 7.18 } });
        return rss([item("USB cable certification update", "https://www.usb.org/news/certification-update", "USB-IF")]);
      },
      now: new Date("2026-05-31T08:00:00.000Z"),
    });
    const competitorsJson = JSON.parse(fs.readFileSync(path.join(dir, "competitors.json"), "utf-8"));

    expect(competitorsJson).toEqual({ updatedAt: "old", competitors: [{ id: "comp-old", company: "Belden" }] });
  });

  it("filters broad wire-service items that are not relevant to sales intelligence", async () => {
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");

    await refreshIntelligenceFeeds("farreach", {
      fetcher: async (url) => {
        if (url.includes("query1.finance.yahoo.com")) {
          return JSON.stringify({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
        }
        if (url.includes("frankfurter")) return JSON.stringify({ rates: { CNY: 7.18 } });
        if (url.includes("prnewswire.com")) {
          return rss([
            item(
              "Historic property tax sale reform legislation passes",
              "https://www.prnewswire.com/property-tax.html",
              "PR Newswire",
              "Local property tax foreclosure rules changed after a state legislature vote."
            ),
            item("Copper tariff update affects cable exporters", "https://www.prnewswire.com/copper-tariff.html", "PR Newswire"),
          ]);
        }
        return rss([]);
      },
      now: new Date("2026-05-31T08:00:00.000Z"),
    });
    const newsJson = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "companies", "farreach", "intelligence", "news.json"), "utf-8")
    );

    expect(newsJson.news.some((item: { title: string }) => item.title.includes("property tax"))).toBe(false);
    expect(newsJson.news.some((item: { title: string }) => item.title.includes("Copper tariff"))).toBe(true);
  });

  it("refreshes competitor cache from SEC filings instead of broad search noise", async () => {
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");

    await refreshIntelligenceFeeds("farreach", {
      fetcher: async (url) => {
        if (url.includes("query1.finance.yahoo.com")) {
          return JSON.stringify({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
        }
        if (url.includes("frankfurter")) return JSON.stringify({ rates: { CNY: 7.18 } });
        if (url.includes("CIK0000820313.json")) {
          return JSON.stringify({
            filings: {
              recent: {
                form: ["8-K"],
                filingDate: ["2026-05-30"],
                accessionNumber: ["0001104659-26-066666"],
                primaryDocument: ["tm-test-8k.htm"],
              },
            },
          });
        }
        if (url.includes("data.sec.gov")) {
          return JSON.stringify({ filings: { recent: { form: [], filingDate: [], accessionNumber: [], primaryDocument: [] } } });
        }
        return rss([item("USB cable certification update", "https://www.usb.org/news/certification-update", "USB-IF")]);
      },
      now: new Date("2026-05-31T08:00:00.000Z"),
    });
    const competitorsJson = JSON.parse(
      fs.readFileSync(path.join(tempRoot, "companies", "farreach", "intelligence", "competitors.json"), "utf-8")
    );

    expect(competitorsJson.competitors).toEqual([
      expect.objectContaining({
        company: "Amphenol",
        source: "SEC EDGAR submissions API",
        title: "Amphenol SEC 8-K filing (2026-05-30)",
      }),
    ]);
  });

  it("writes concise customer-facing summaries instead of repeated category templates", async () => {
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");

    await refreshIntelligenceFeeds("farreach", {
      fetcher: async (url) => {
        if (url.includes("query1.finance.yahoo.com")) {
          return JSON.stringify({ chart: { result: [{ meta: {}, timestamp: [], indicators: { quote: [{ close: [] }] } }] } });
        }
        if (url.includes("frankfurter")) return JSON.stringify({ rates: { CNY: 7.18 } });
        if (url.includes("CIK0001385157.json")) {
          return JSON.stringify({
            filings: {
              recent: {
                form: ["10-Q"],
                filingDate: ["2026-04-24"],
                accessionNumber: ["0001104659-26-048160"],
                primaryDocument: ["tel-20260327x10q.htm"],
              },
            },
          });
        }
        if (url.includes("data.sec.gov")) {
          return JSON.stringify({ filings: { recent: { form: [], filingDate: [], accessionNumber: [], primaryDocument: [] } } });
        }
        return rss([
          item("HDMI FORUM RELEASES VERSION 2.2 OF THE HDMI SPECIFICATION", "https://hdmiforum.org/hdmi-2-2/", "HDMI Forum News"),
          item("UPS invests $50M in automotive, industrial logistics push", "https://www.supplychaindive.com/ups-industrial/", "Supply Chain Dive"),
        ]);
      },
      now: new Date("2026-05-31T08:00:00.000Z"),
    });

    const newsJson = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "intelligence", "news.json"), "utf-8"));
    const competitorsJson = JSON.parse(fs.readFileSync(path.join(tempRoot, "companies", "farreach", "intelligence", "competitors.json"), "utf-8"));
    const summaries = newsJson.news.map((entry: { summaryZh: string }) => entry.summaryZh);

    expect(summaries).toContain("新规范提升带宽能力，高速 HDMI 线材规格需要同步。");
    expect(summaries).toContain("UPS 加码汽车与工业物流，北美重货交付时效可能改善。");
    expect(new Set(summaries).size).toBe(summaries.length);
    expect(competitorsJson.competitors[0].detail).toBe("季度财报已发布，重点看收入、订单、库存和汽车/工业需求。");
    expect(competitorsJson.competitors[0].detail).not.toContain("该类披露通常");
  });

  it("reuses fresh intelligence cache unless forceRefresh is requested", async () => {
    const { refreshIntelligenceFeeds } = await import("./intelligence-collector");
    const dir = path.join(tempRoot, "companies", "farreach", "intelligence");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "news.json"),
      JSON.stringify({
        updatedAt: "2026-06-01T08:00:00.000Z",
        news: [{ id: "cached", title: "Cached market signal" }],
      }),
      "utf-8"
    );

    const result = await refreshIntelligenceFeeds("farreach", {
      now: new Date("2026-06-01T09:00:00.000Z"),
      fetcher: async () => {
        throw new Error("should not fetch");
      },
    });

    expect(result).toMatchObject({
      success: true,
      cache: { hit: true, feed: "news" },
      newsCount: 1,
      competitorCount: 0,
    });
  });
});
