#!/usr/bin/env node
/**
 * 读取 trends.json，调用 OpenClaw agent 生成市场洞察，缓存结果。
 * 用法：node scripts/generate-insights.js [--force]
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const INSIGHTS_PATH = path.join(__dirname, "../data/intelligence/insights.json");
const TRENDS_PATH = path.join(__dirname, "../data/intelligence/trends.json");
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 小时

const force = process.argv.includes("--force");

// Check cache
if (!force && fs.existsSync(INSIGHTS_PATH)) {
  try {
    const cached = JSON.parse(fs.readFileSync(INSIGHTS_PATH, "utf-8"));
    const age = Date.now() - new Date(cached.generatedAt).getTime();
    if (age < CACHE_TTL_MS) {
      console.log(JSON.stringify({ success: true, insights: cached.insights, cached: true, generatedAt: cached.generatedAt }));
      process.exit(0);
    }
  } catch {}
}

// Read trends data
const trendsData = JSON.parse(fs.readFileSync(TRENDS_PATH, "utf-8"));

// Build a human-readable summary for the prompt
const trendSummaries = trendsData.trends.map(t => {
  const first = t.values[0];
  const last = t.values[t.values.length - 1];
  const change = ((last - first) / first * 100).toFixed(1);
  const direction = last > first ? "上升" : last < first ? "下降" : "持平";
  return `- ${t.label}：${first} → ${last}（${direction} ${change}%），数据点：[${t.values.join(", ")}]，时间：[${t.months.join(", ")}]`;
}).join("\n");

const prompt = `你是一个外贸行业的数据分析师。Farreach Electronic（SKW 品牌）主营 HDMI/DP/USB 等电缆产品。

请分析以下市场趋势数据，给出 4 条关键洞察。每条洞察必须包含：
- title：简短标题（10 字以内）
- detail：详细分析（50 字以内），说明趋势含义
- impact：对 Farreach 业务的影响（50 字以内），用 "high" / "medium" / "low"

数据：
${trendSummaries}

铜价变化对线材产品成本影响最大。汇率影响出口报价竞争力。出口额反映行业景气度。

输出要求：纯 JSON 数组，不要 markdown 代码块，不要其他文字。格式：
[{"title":"...","detail":"...","impact":"high|medium|low"},...]
`;

try {
  console.error("🔍 调用 OpenClaw agent 生成洞察...");
  const result = execSync(
    `openclaw agent --agent phoenix --message ${JSON.stringify(prompt)} --json --timeout 120`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
  );

  const parsed = JSON.parse(result);
  const text = parsed.finalAssistantVisibleText || parsed.finalAssistantRawText || "";

  // Extract JSON array from the text (in case there's markdown code block wrapper)
  let insightsJson = text.trim();
  if (insightsJson.startsWith("```")) {
    insightsJson = insightsJson.replace(/^```json?\s*/, "").replace(/\s*```$/, "").trim();
  }

  const insights = JSON.parse(insightsJson);

  if (!Array.isArray(insights) || insights.length === 0) {
    throw new Error("Invalid insights format: expected non-empty array");
  }

  const output = {
    success: true,
    insights: insights.slice(0, 5), // max 5
    cached: false,
    generatedAt: new Date().toISOString()
  };

  // Cache the insights only (not the wrapper)
  fs.writeFileSync(INSIGHTS_PATH, JSON.stringify({
    insights: output.insights,
    generatedAt: output.generatedAt
  }, null, 2));

  console.log(JSON.stringify(output));
} catch (err) {
  console.error("❌ 洞察生成失败:", err.message);
  // Return cached data if available, even if expired
  if (fs.existsSync(INSIGHTS_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(INSIGHTS_PATH, "utf-8"));
      console.log(JSON.stringify({ success: true, insights: cached.insights, cached: true, generatedAt: cached.generatedAt, fallback: true }));
      process.exit(0);
    } catch {}
  }
  console.log(JSON.stringify({ success: false, error: err.message }));
  process.exit(1);
}
