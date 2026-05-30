import { describe, expect, it } from "vitest";
import { localizeMarketNewsText, localizeNewsItem, localizeNewsTag } from "./intelligence-news-i18n";

describe("intelligence news localization", () => {
  it("uses Chinese fields from the feed when they are present", () => {
    const localized = localizeNewsItem(
      {
        title: "Rail update",
        titleZh: "铁路更新",
        summary: "English summary",
        summaryZh: "中文摘要",
      },
      "zh"
    );

    expect(localized.title).toBe("铁路更新");
    expect(localized.summary).toBe("中文摘要");
  });

  it("renders known English market news in Chinese when the cache is English-only", () => {
    const localized = localizeNewsItem(
      {
        title: "New rail data requirement a ‘win’ for shippers, expert says",
        summary: "Class I railroads will soon need to report two additional metrics, which a former BNSF director said could boost service transparency.",
      },
      "zh"
    );

    expect(localized.title).toBe("美国新增铁路数据披露要求，货主透明度有望提升");
    expect(localized.summary).toBe("美国一级铁路公司将新增两项服务指标披露要求，前 BNSF 负责人认为这会提高运输服务透明度。");
  });

  it("translates common market news tags for Chinese mode", () => {
    expect(localizeNewsTag("supply_chain", "zh")).toBe("供应链");
    expect(localizeNewsTag("trade_macro", "zh")).toBe("贸易宏观");
    expect(localizeNewsTag("tech_industry", "zh")).toBe("科技产业");
  });

  it("localizes known English headlines embedded in market alert text", () => {
    expect(
      localizeMarketNewsText(
        "检测到 49 条标准/认证相关动态：New rail data requirement a ‘win’ for shippers, expert says...",
        "zh"
      )
    ).toBe("检测到 49 条标准/认证相关动态：美国新增铁路数据披露要求，货主透明度有望提升...");
  });

  it("does not expose raw English headlines when Chinese fallback is needed", () => {
    const localized = localizeNewsItem(
      {
        title: "Target touts improved inventory turns in Q1",
        summary: "The retailer aims to leverage artificial intelligence tools alongside its two new facilities to reduce volatility and in-stock issues.",
        tag: "supply_chain",
        source: "Supply Chain Dive",
      },
      "zh"
    );

    expect(localized.title).toBe("供应链市场信号");
    expect(localized.summary).toBe("来自 Supply Chain Dive 的英文新闻源，当前暂无中文摘要；已记录为供应链相关外部信号。");
    expect(localized.title).not.toContain("Target");
    expect(localized.summary).not.toContain("retailer");
  });
});
