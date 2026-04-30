#!/usr/bin/env node
/**
 * Regenerate Email Templates v2 — 背调驱动 + 序列化跟进 + CTA 多样化
 *
 * 重构目标：
 * 1. 用 Tavily 搜索背调每个公司
 * 2. 生成冷邮件 + follow-up #1/#2/#3/#4 完整序列
 * 3. 每个阶段 CTA 不同（发资料/寄样品/电话/对比表）
 * 4. 通用邮箱用"请转交"措辞
 * 5. 跟进#2 引用 #1，#3 换角度
 *
 * 用法:
 *   node regenerate-templates.js              # 默认处理前 5 个联系人
 *   node regenerate-templates.js --count 10   # 指定数量
 *   node regenerate-templates.js --company "Defro"  # 只处理指定公司
 *   node regenerate-templates.js --all        # 处理所有联系人
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// ─── 常量配置 ───────────────────────────────────────────────

const BASE_DIR = path.join(__dirname, "..");
const LEADS_DIR = path.join(BASE_DIR, "leads");
const OUTPUT_DIR = path.join(BASE_DIR, "campaign-tracker", "templates-v2");
const TAVILY_SCRIPT = "/Users/wilson/.openclaw/workspace/skills/openclaw-tavily-search/scripts/tavily_search.py";

/** 默认处理联系人数量（样本验证） */
const DEFAULT_SAMPLE_SIZE = 5;

/** 通用邮箱前缀 */
const GENERIC_PREFIXES = [
  "info", "office", "obchod", "contact", "sales", "hello",
  "admin", "order", "export", "import", "mail",
];

// ─── CTA 策略 ───────────────────────────────────────────────

const CTA_STRATEGIES = {
  1: {
    label: "发资料",
    cta: "Would you be open to receiving a spec sheet and pricing?",
    angle: "技术参数 + 价值主张",
    subject_patterns: [
      "Variable frequency pump specs for {company}",
      "Reducing pump energy costs for {company}",
      "ErP EEI ≤ 0.23 circulating pumps — quick info",
    ],
  },
  2: {
    label: "寄样品",
    cta: "Can I send you a free sample unit for your engineering team to test?",
    angle: "免费样品 + 案例参考",
    subject_patterns: [
      "Re: pump specs — free sample for {company}?",
      "Test a Hero Pump at no cost — {company}",
      "Following up: hands-on evaluation for {company}",
    ],
    reference_prev: true, // 需要引用上一封邮件
  },
  3: {
    label: "电话沟通",
    cta: "Would you have 15 minutes for a quick call next week to discuss your pump requirements?",
    angle: "案例研究 + 深度交流",
    subject_patterns: [
      "15-min call about {company}'s pump sourcing?",
      "Quick chat — pump integration for {company}",
      "Following up — case study relevant to {company}",
    ],
    reference_prev: false, // 换角度
  },
  4: {
    label: "对比表",
    cta: "I've put together a supplier comparison sheet — want to take a look?",
    angle: "竞品对比 + 最后跟进",
    subject_patterns: [
      "Last note: Hero Pump vs. your current supplier",
      "Comparison sheet for {company} (before I close this out)",
      "Final follow-up from Hero Pump",
    ],
    reference_prev: false,
    is_final: true,
  },
};

// ─── CSV 解析 ───────────────────────────────────────────────

function parseCsvLine(line, delimiter = ",") {
  const fields = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        fields.push(current);
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().replace(/^["']|["']$/g, ""));
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < headers.length) continue;
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] || "").trim();
    });
    records.push(record);
  }
  return records;
}

function loadAllLeads() {
  const allLeads = [];
  const csvFiles = fs.readdirSync(LEADS_DIR).filter((f) => f.endsWith(".csv") && !f.includes("-original"));

  for (const file of csvFiles) {
    const content = fs.readFileSync(path.join(LEADS_DIR, file), "utf8");
    const records = parseCsv(content);
    allLeads.push(...records.filter((r) => r.email && r.email.includes("@") && r.email.length > 5));
  }

  return allLeads;
}

// ─── 通用邮箱检测 ───────────────────────────────────────────

function isGenericEmail(email) {
  if (!email) return false;
  const prefix = email.split("@")[0].toLowerCase();
  return GENERIC_PREFIXES.some((gp) => prefix === gp || prefix.startsWith(gp + "+"));
}

// ─── Tavily 搜索 ─────────────────────────────────────────────

function searchCompany(company, country, industry) {
  const query = `${company} ${industry || "HVAC"} ${country || "Europe"} pumps heating`;
  try {
    const result = execSync(
      `python3 "${TAVILY_SCRIPT}" --query "${query.replace(/"/g, '\\"')}" --max-results 3`,
      { encoding: "utf8", timeout: 20000 }
    );
    const parsed = JSON.parse(result);
    if (parsed.results && parsed.results.length > 0) {
      const snippets = parsed.results.slice(0, 3).map((r) => r.content).filter(Boolean);
      const cleaned = snippets.join(" ")
      .replace(/\*\*/g, "")             // remove bold markers
      .replace(/(?<![\w])\*+(?![\w])/g, "") // remove italic markers (standalone)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // remove markdown links
      .replace(/#{1,6}\s*/g, "")       // remove markdown headers (# ## ### etc)
      .replace(/={2,}\s*/g, "")        // remove underline headers (===)
      .replace(/\s+/g, " ")            // collapse whitespace
      .trim();
      return {
        summary: cleaned.substring(0, 250),
        raw: parsed.results,
      };
    }
    return null;
  } catch (err) {
    console.warn(`  ⚠️ 搜索失败: ${company} — ${err.message.substring(0, 80)}`);
    return null;
  }
}

// ─── 邮件模板生成 ───────────────────────────────────────────

function generateColdEmail(contact, research) {
  const { company, contact_name, email, position, country } = contact;
  const generic = isGenericEmail(email);
  const researchText = research?.summary || "";

  // 构建个性化开头
  let personalizedOpening = "";
  if (researchText) {
    // 从背调中提取关键信息
    const countryName = (country === "波兰") ? "Poland"
      : (country === "捷克") ? "Czech Republic"
      : (country === "斯洛伐克") ? "Slovakia"
      : (country === "匈牙利") ? "Hungary"
      : (country === "罗马尼亚") ? "Romania"
      : (country || "Europe");

    if (researchText.includes("heat pump")) {
      personalizedOpening = `I noticed ${company} manufactures heat pumps for the ${countryName} market. As regulations tighten around pump efficiency, having an ErP-compliant circulating pump supplier directly impacts your product competitiveness.`;
    } else if (researchText.includes("boiler")) {
      personalizedOpening = `I noticed ${company} produces heating boilers in ${countryName}. Your systems depend on reliable circulating pumps — Hero Pump delivers ErP EEI ≤ 0.23 efficiency at 30-40% below Grundfos and Wilo pricing.`;
    } else if (researchText.includes("distributor") || researchText.includes("wholesale")) {
      personalizedOpening = `As a heating equipment distributor in ${countryName}, ${company} likely gets frequent questions about pump alternatives from your customers. Hero Pump fills that gap.`;
    } else if (researchText.includes("install") || researchText.includes("HVAC")) {
      personalizedOpening = `Given ${company}'s focus on HVAC solutions in ${countryName}, I thought you'd find our variable frequency circulating pumps relevant — ErP EEI ≤ 0.23, TÜV SÜD certified, priced 30-40% below the big brands.`;
    } else {
      personalizedOpening = `I came across ${company} while researching heating equipment suppliers in ${countryName}. Given your market position, I thought Hero Pump's variable frequency circulating pumps could be worth a look.`;
    }
  } else {
    const countryName = (country === "波兰") ? "Poland"
      : (country === "捷克") ? "the Czech Republic"
      : (country === "斯洛伐克") ? "Slovakia"
      : (country === "匈牙利") ? "Hungary"
      : (country === "罗马尼亚") ? "Romania"
      : (country || "Europe");
    personalizedOpening = `I'm reaching out because ${company} operates in the ${industry || "heating equipment"} space in ${countryName}, and our variable frequency circulating pumps are designed as direct replacements for Grundfos and Wilo at 30-40% lower cost.`;
  }

  // CTA
  const cta = CTA_STRATEGIES[1].cta;

  // 主题行
  const subjects = CTA_STRATEGIES[1].subject_patterns.map((p) =>
    p.replace("{company}", company)
  );

  let body = "";
  if (generic) {
    body = `Hello ${company} team,

Could you forward this to whoever handles pump procurement or supplier evaluation?

${personalizedOpening}

We're Zhejiang Hero Pump Co., Ltd. — a manufacturer of variable frequency circulating pumps based in Zhejiang, China. Our pumps carry TÜV SÜD, CE, and RoHS certifications, with ErP EEI ≤ 0.23 ratings. We also support OEM/private labeling.

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
  } else {
    const greeting = contact_name ? `Hi ${contact_name.split(" ")[0]},` : "Hi there,";
    body = `${greeting}

${personalizedOpening}

We're Zhejiang Hero Pump Co., Ltd. — a manufacturer of variable frequency circulating pumps based in Zhejiang, China. Our pumps carry TÜV SÜD, CE, and RoHS certifications, with ErP EEI ≤ 0.23 ratings. We also support OEM/private labeling.

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
  }

  return {
    subjects,
    body,
    cta,
    angle: CTA_STRATEGIES[1].angle,
    research: researchText,
    generic,
  };
}

function generateFollowUp(contact, followUpNum, research, prevEmail) {
  const { company, contact_name, email, position, country } = contact;
  const generic = isGenericEmail(email);
  const strategy = CTA_STRATEGIES[followUpNum];
  if (!strategy) return null;

  const researchText = research?.summary || "";
  const cta = strategy.cta;

  // 个性化内容 - 每个阶段角度不同
  let bodyContent = "";

  if (followUpNum === 2) {
    // 跟进#2: 引用 #1 + 样品引导
    if (generic) {
      bodyContent = `Hello ${company} team,

Following up on my previous note about Hero Pump's variable frequency circulating pumps (ErP EEI ≤ 0.23, TÜV SÜD certified). I know evaluating a new supplier is a significant decision, and I believe a hands-on test is the fastest way to assess the fit.

I'd like to send a free sample unit to your team — no strings attached. You can run it through your own testing protocols and compare directly with your current supplier.

Could you forward this to your engineering or procurement team?

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
    } else {
      const name = contact_name ? contact_name.split(" ")[0] : "there";
      bodyContent = `Hi ${name},

Following up on my previous email about Hero Pump's variable frequency circulating pumps. I know evaluating a new pump supplier is a significant decision, and I believe a hands-on test is the fastest way to assess the fit.

I'd like to send you a free sample unit — no strings attached. You can run it through your own testing protocols and compare directly with your current pump supplier.

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
    }
  } else if (followUpNum === 3) {
    // 跟进#3: 换角度 - 案例研究 + 电话
    if (generic) {
      bodyContent = `Hello ${company} team,

I've sent a couple of notes about Hero Pump's variable frequency circulating pumps, but I realize specs and samples only tell part of the story.

We've helped several European HVAC companies switch from Grundfos/Wilo to Hero Pump — achieving the same ErP compliance at significantly lower component costs. The real value becomes clear in a conversation about your specific requirements.

Could you forward this to the person who handles pump sourcing decisions?

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
    } else {
      const name = contact_name ? contact_name.split(" ")[0] : "there";
      bodyContent = `Hi ${name},

I've mentioned our EEI ratings and pricing before, but numbers on a page only tell part of the story.

We've helped several European HVAC manufacturers switch from Grundfos/Wilo to Hero Pump — achieving the same ErP compliance at significantly lower component costs. The real value becomes clear when we understand your specific integration requirements.

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
    }
  } else if (followUpNum === 4) {
    // 跟进#4: 对比表 + 最后跟进
    const countryAdj = (country === "波兰") ? "Polish"
      : (country === "捷克") ? "Czech"
      : (country === "斯洛伐克") ? "Slovak"
      : (country === "匈牙利") ? "Hungarian"
      : (country === "罗马尼亚") ? "Romanian"
      : "European";
    if (generic) {
      bodyContent = `Hello ${company} team,

This will be my last note so I don't clutter your inbox.

I've put together a side-by-side comparison sheet of Hero Pump vs. Grundfos and Wilo — covering EEI ratings, pricing, certifications, and lead times. Given ${company}'s position in the ${countryAdj} market, I thought this could be a useful reference for your procurement team.

Could you forward this comparison to whoever handles pump sourcing?

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
    } else {
      const name = contact_name ? contact_name.split(" ")[0] : "there";
      const countryName4 = (country === "波兰") ? "Polish"
        : (country === "捷克") ? "Czech"
        : (country === "斯洛伐克") ? "Slovak"
        : (country === "匈牙利") ? "Hungarian"
        : (country === "罗马尼亚") ? "Romanian"
        : "European";
      bodyContent = `Hi ${name},

This will be my last note so I don't clutter your inbox.

I've put together a side-by-side comparison sheet of Hero Pump vs. Grundfos and Wilo — covering EEI ratings, pricing, certifications, and lead times. Given ${company}'s position in the ${countryName4} market, I thought this could be a useful reference for your procurement decisions.

${cta}

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2402
www.heropumps.com`;
    }
  }

  const subjects = strategy.subject_patterns.map((p) =>
    p.replace("{company}", company)
  );

  return {
    subjects,
    body: bodyContent,
    cta,
    angle: strategy.angle,
    research: researchText,
    generic,
    reference_prev: strategy.reference_prev,
    is_final: strategy.is_final,
  };
}

// ─── 文件输出 ───────────────────────────────────────────────

function saveTemplate(filename, contact, emailData, type) {
  const { company, contact_name, email, position, country } = contact;
  const { subjects, body, cta, angle, research, generic, reference_prev, is_final } = emailData;

  const typeLabel = type === "cold" ? "Cold Email" : `Follow-up Email`;
  const titleSuffix = type === "cold"
    ? `${company} — ${contact_name || email}`
    : `${company} — ${contact_name || email}`;

  const content = `# ${typeLabel} — ${titleSuffix}

- **Email:** ${email}
${position ? `- **Position:** ${position}` : ""}
${country ? `- **Country:** ${country}` : ""}
- **Subject:** ${subjects[0]}
- **Subject Alt 1:** ${subjects[1]}
- **Subject Alt 2:** ${subjects[2]}

## Email Body

${body}

## Design Notes
- **切入角度:** ${angle}
${research ? `- **背调事实:** ${research.substring(0, 150)}...` : ""}
- **通用邮箱:** ${generic ? "是" : "否"}
${type !== "cold" ? `- **阶段:** 第 ${type} 次跟进` : ""}
${reference_prev ? "- **引用上一封:** 是" : ""}
${is_final ? "- **最后跟进:** 是" : ""}
- **CTA:** "${cta}"
- **模板版本:** v2 (背调驱动 + 序列化跟进 + CTA 多样化)
`;

  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

// ─── 主流程 ───────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const countIdx = args.indexOf("--count");
  const companyFilter = args.includes("--company") ? args[args.indexOf("--company") + 1] : null;
  const processAll = args.includes("--all");

  const sampleSize = processAll ? Infinity : (countIdx >= 0 ? parseInt(args[countIdx + 1]) || DEFAULT_SAMPLE_SIZE : DEFAULT_SAMPLE_SIZE);

  console.log("========================================");
  console.log("Email Template Regeneration v2");
  console.log(`模式: ${processAll ? "ALL" : `SAMPLE (${sampleSize})`}`);
  if (companyFilter) console.log(`公司过滤: ${companyFilter}`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
  console.log("========================================\n");

  // 加载所有联系人
  const allLeads = loadAllLeads();
  console.log(`📋 共加载 ${allLeads.length} 个联系人`);

  // 按公司去重，每家公司只处理第一个联系人
  const uniqueCompanies = [];
  const seenCompanies = new Set();
  for (const lead of allLeads) {
    const companyKey = (lead.company || "").toLowerCase();
    if (!seenCompanies.has(companyKey)) {
      seenCompanies.add(companyKey);
      uniqueCompanies.push(lead);
    }
  }

  let targets = uniqueCompanies;
  if (companyFilter) {
    targets = targets.filter((c) =>
      c.company.toLowerCase().includes(companyFilter.toLowerCase())
    );
  }
  targets = targets.slice(0, sampleSize);

  console.log(`🎯 将处理 ${targets.length} 家公司（每家公司生成冷邮件 + 4封跟进）`);
  console.log("");

  // 确保输出目录存在
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 处理每个公司
  let processed = 0;
  let errors = 0;
  const results = [];

  for (const contact of targets) {
    const { company, contact_name, email, country, position } = contact;
    const emailPrefix = email.split("@")[0];
    processed++;

    console.log(`[${processed}/${targets.length}] 处理: ${company} (${email})`);

    // 1. Tavily 背调
    console.log(`  🔍 搜索背调信息...`);
    const research = searchCompany(company, country, "HVAC");
    if (research) {
      console.log(`  ✅ 找到背调: ${research.summary.substring(0, 80)}...`);
    } else {
      console.log(`  ⚠️ 未找到背调信息`);
    }

    // 2. 生成冷邮件
    const coldEmail = generateColdEmail(contact, research);
    const coldFilename = `cold-${String(processed).padStart(2, "0")}-${emailPrefix}-${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.md`;
    saveTemplate(coldFilename, contact, coldEmail, "cold");
    console.log(`  📧 冷邮件 → ${coldFilename}`);

    // 3. 生成跟进 #1-#4
    for (let i = 1; i <= 4; i++) {
      const followUp = generateFollowUp(contact, i, research, null);
      if (!followUp) continue;

      const followUpFilename = `followup-${i}-${String(processed).padStart(2, "0")}-${emailPrefix}-${company.toLowerCase().replace(/[^a-z0-9]/g, "")}.md`;
      saveTemplate(followUpFilename, contact, followUp, i);
      console.log(`  📬 跟进 #${i} → ${followUpFilename}`);
    }

    results.push({
      company,
      email,
      contact_name,
      research: !!research,
    });

    console.log("");
  }

  // ─── 输出统计 ───
  console.log("========================================");
  console.log("✅ 生成完成");
  console.log(`处理公司: ${processed} 家`);
  console.log(`生成模板: ${processed * 5} 个（每家公司 1 封冷邮件 + 4 封跟进）`);
  console.log(`输出目录: ${OUTPUT_DIR}`);
  console.log("========================================\n");

  // 输出统计摘要
  const genericCount = results.filter((r) => isGenericEmail(r.email)).length;
  const researchedCount = results.filter((r) => r.research).length;
  console.log("📊 统计:");
  console.log(`  通用邮箱: ${genericCount}/${processed}`);
  console.log(`  有背调: ${researchedCount}/${processed}`);
  console.log("");

  // 列出所有生成的文件
  const files = fs.readdirSync(OUTPUT_DIR);
  console.log(`📁 生成的 ${files.length} 个文件:`);
  files.forEach((f) => console.log(`   ${f}`));
}

main();
