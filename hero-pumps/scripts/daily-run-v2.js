#!/usr/bin/env node
/**
 * Daily Run v2 — 发送前即时写，每天批量生成开发信
 *
 * 流程：
 * 1. 从 CSV 读取下一批未发送的联系人
 * 2. 按 round-robin 打散（避免同一天轰炸同一家公司）
 * 3. 生成 IRON prompt
 * 4. WILSON spawn IRON 写邮件
 * 5. IRON 写完后保存草稿 → 发送邮件 → 记录已发送
 *
 * 用法:
 *   node daily-run-v2.js              # 默认 20 封
 *   node daily-run-v2.js --count 10   # 指定数量
 *   node daily-run-v2.js --dry-run    # 预览不生成
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { SalesState } = require("../../shared/sales-state-db");

// ─── 常量配置 ───────────────────────────────────────────────

/** 默认每批发送数量 */
const DEFAULT_BATCH_SIZE = 20;

/** 邮箱地址最小长度阈值（低于此值视为无效） */
const MIN_EMAIL_LENGTH = 5;

/** 已发送日志文件名 */
const SENT_LOG_FILENAME = "sent-log.json";

/** CSV 字段分隔符 */
const CSV_DELIMITER = ",";

// ─── 竞品名单（完全不发）───────────────────────────────────

/**
 * 竞品公司关键词（不区分大小写匹配）。
 * 匹配到任一的联系人不会进入发送批次。
 * 来源：email-rules.md §1.4
 */
const COMPETITORS = [
  "grundfos", "wilo", "danfoss", "vaillant", "viessmann",
  "bosch", "nibe", "purmo", "xylem", "lowara", "belimo", "halton",
];

// ─── 禁止发送的邮箱前缀 ───────────────────────────────────

/**
 * 禁止发送的邮箱前缀（不区分大小写）。
 * 来源：email-rules.md §1.2
 */
const BLOCKED_EMAIL_PREFIXES = [
  // 招聘
  "rekrutacja", "hr", "career",
  // 财务
  "racunovodstvo", "finance", "accounting",
  // 售后/技术支持（不发）
  "serwis", "service", "support", "kundendienst", "servis",
  // 其他
  "newsletter", "datarequests", "resurse",
];

// ─── P4 职位关键词（不发，除非是唯一联系人） ─────────────
/**
 * 低优先级职位关键词。这些联系人会被过滤掉，
 * 除非他们在 round-robin 后成为某公司唯一剩余人选（由 isCompanySoleSurvivor 判断）。
 * 来源：email-rules.md §1.1
 */
const P4_POSITION_KEYWORDS = [
  "marketing", "human resource", "hr", "admin", "finance", "it", "training",
];

// ─── 目录常量（全部相对于脚本所在目录） ─────────────────────

const BASE_DIR = path.join(__dirname, "..");
const LEADS_DIR = path.join(BASE_DIR, "leads");
const SENT_LOG = path.join(BASE_DIR, SENT_LOG_FILENAME);
const RESEARCH_DIR = path.join(BASE_DIR, "research", "companies");
const DRAFTS_DIR = path.join(BASE_DIR, "campaign-tracker", "templates");
const PROMPTS_DIR = path.join(BASE_DIR, "iron-prompts");

// ─── CSV 解析 ───────────────────────────────────────────────

/**
 * 简易 RFC 4180 兼容 CSV 行解析器。
 * 能处理字段内含逗号、双引号转义的情况。
 * 例如: "Smith, John","CEO","j@acme""corp.com"
 *
 * 注意：当前数据源大概率不含复杂字段，此函数为防御性实现。
 * 如需完整 RFC 4180 支持（换行符嵌入字段等），建议引入 papaparse。
 *
 * @param {string} line - 单行 CSV 文本
 * @param {string} delimiter - 分隔符，默认逗号
 * @returns {string[]} 解析后的字段数组
 */
function parseCsvLine(line, delimiter = CSV_DELIMITER) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // 双引号转义: "" → "
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          // 结束引号
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

/**
 * 从多行 CSV 文本解析为对象数组。
 * 第一行视为表头，后续每行作为一条记录。
 *
 * @param {string} content - CSV 完整文本
 * @returns {Array<Record<string, string>>} 记录数组，无效行自动跳过
 */
function parseCsvContent(content) {
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) =>
    h.trim().replace(/^["']|["']$/g, "")
  );

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < headers.length) continue; // 字段不足，跳过

    const record = {};
    headers.forEach((h, idx) => {
      record[h] = (values[idx] || "").trim();
    });
    records.push(record);
  }

  return records;
}

// ─── 邮箱验证 ───────────────────────────────────────────────

/**
 * 验证邮箱地址是否有效。
 * 规则：包含 @、不含常见爬虫噪音、长度不低于阈值。
 *
 * @param {string} email - 邮箱地址
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (!email) return false;
  if (email.length < MIN_EMAIL_LENGTH) return false;
  if (!email.includes("@")) return false;
  if (email.includes("IncompleteRead")) return false;
  return true;
}

/**
 * 检查联系人是否属于竞品公司。
 * 对公司名做不区分大小写的关键词匹配。
 *
 * @param {Record<string, string>} contact - 联系人记录（需含 company 字段）
 * @returns {boolean} true = 是竞品，应过滤掉
 */
function isCompetitor(contact) {
  const company = (contact.company || "").toLowerCase();
  return COMPETITORS.some((kw) => company.includes(kw));
}

/**
 * 检查邮箱地址前缀是否在禁止列表中。
 * 不区分大小写。
 *
 * @param {string} email - 邮箱地址
 * @returns {boolean} true = 禁止发送的前缀，应过滤掉
 */
function hasBlockedPrefix(email) {
  if (!email) return false;
  const prefix = email.split("@")[0].toLowerCase();
  return BLOCKED_EMAIL_PREFIXES.some((bp) => prefix === bp || prefix.startsWith(bp + "+"));
}

/**
 * 检查职位是否属于 P4 低优先级（HR/财务/行政/IT 等）。
 *
 * @param {Record<string, string>} contact - 联系人记录（需含 position 字段）
 * @returns {boolean} true = P4 职位，应过滤
 */
function isP4Position(contact) {
  const position = (contact.position || "").toLowerCase();
  return P4_POSITION_KEYWORDS.some((kw) => position.includes(kw));
}

/**
 * 检查该联系人在批次中是否是其公司的唯一剩余人选。
 * 如果是，则即使职位低也放行。
 *
 * @param {Record<string, string>} contact - 联系人记录（需含 company 字段）
 * @param {Array<Record<string, string>>} batch - 整个批次（需含 company 字段）
 * @returns {boolean} true = 唯一剩余人选，可放行
 */
function isCompanySoleSurvivor(contact, batch) {
  const companyKey = (contact.company || "__unknown__").toLowerCase();
  const sameCompany = batch.filter(
    (c) => (c.company || "__unknown__").toLowerCase() === companyKey
  );
  return sameCompany.length === 1;
}

/**
 * 综合过滤：排除竞品、禁止前缀、P4 职位。
 *
 * @param {Array<Record<string, string>>} contacts - 待过滤联系人列表（需含 company, email, position）
 * @returns {{ kept: Array<Record<string, string>>, filtered: Array<{contact: Record<string, string>, reason: string}> }}
 */
function filterContacts(contacts) {
  const kept = [];
  const filtered = [];

  for (const contact of contacts) {
    // 1. 竞品过滤（最高优先级）
    if (isCompetitor(contact)) {
      filtered.push({ contact, reason: `竞品公司: ${contact.company}` });
      continue;
    }

    // 2. 邮箱前缀过滤（禁止前缀）
    if (hasBlockedPrefix(contact.email)) {
      filtered.push({ contact, reason: `禁止邮箱前缀: ${contact.email}` });
      continue;
    }

    // 3. P4 职位过滤（允许唯一人选例外）
    if (isP4Position(contact)) {
      filtered.push({ contact, reason: `P4 职位: ${contact.position} (${contact.company})` });
      continue;
    }

    kept.push(contact);
  }

  return { kept, filtered };
}

// ─── 文件 I/O ───────────────────────────────────────────────

/**
 * 确保目录存在，不存在则递归创建。
 *
 * @param {string} dirPath - 目录路径
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 安全地读取 JSON 文件。
 * 文件不存在或解析失败时返回 null。
 *
 * @param {string} filePath - JSON 文件路径
 * @returns {*} 解析后的数据，或 null
 */
function safeReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`⚠️  读取 JSON 失败 [${filePath}]:`, err.message);
    return null;
  }
}

/**
 * 安全地写入 JSON 文件。
 *
 * @param {string} filePath - 目标路径
 * @param {*} data - 可序列化数据
 */
function safeWriteJson(filePath, data) {
  try {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(`❌ 写入 JSON 失败 [${filePath}]:`, err.message);
  }
}

/**
 * 读取目录下所有匹配指定扩展名的文件，返回文件信息数组。
 * 目录不存在时返回空数组（不报错）。
 *
 * @param {string} dirPath - 目录路径
 * @param {string} extension - 文件扩展名（如 '.csv'）
 * @returns {string[]} 文件名数组
 */
function listFilesByExtension(dirPath, extension) {
  try {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter((f) => f.endsWith(extension));
  } catch (err) {
    console.warn(`⚠️  读取目录失败 [${dirPath}]:`, err.message);
    return [];
  }
}

/**
 * 安全读取文件内容，失败返回 null。
 *
 * @param {string} filePath - 文件路径
 * @param {string} encoding - 编码，默认 'utf8'
 * @returns {string|null}
 */
function safeReadFile(filePath, encoding = "utf8") {
  try {
    return fs.readFileSync(filePath, encoding);
  } catch (err) {
    console.warn(`⚠️  读取文件失败 [${filePath}]:`, err.message);
    return null;
  }
}

// ─── 核心业务逻辑 ───────────────────────────────────────────

/**
 * 从 leads/ 目录加载所有 CSV 文件中的联系人。
 * 自动过滤无效邮箱。
 *
 * @returns {Array<Record<string, string>>} 有效联系人列表
 */
function loadLeads() {
  const allLeads = [];
  const csvFiles = listFilesByExtension(LEADS_DIR, ".csv");

  if (csvFiles.length === 0) {
    console.warn(`⚠️  leads 目录中未找到 CSV 文件: ${LEADS_DIR}`);
    return allLeads;
  }

  for (const file of csvFiles) {
    const filePath = path.join(LEADS_DIR, file);
    const content = safeReadFile(filePath);
    if (!content) continue;

    const records = parseCsvContent(content);
    const validRecords = records.filter((lead) => isValidEmail(lead.email));
    allLeads.push(...validRecords);
  }

  return allLeads;
}

/**
 * 加载已发送日志。
 *
 * @returns {Array<{email: string, date?: string, [key: string]: *}>} 已发送记录
 */
function loadSentLog() {
  const log = safeReadJson(SENT_LOG);
  return Array.isArray(log) ? log : [];
}

/**
 * 从全部联系人中过滤出尚未发送的联系人。
 *
 * @param {Array<Record<string, string>>} leads - 全部联系人
 * @param {Array<{email: string}>} sentLog - 已发送日志
 * @returns {Array<Record<string, string>>} 未发送的联系人
 */
function getRemaining(leads, sentLog) {
  const sentEmails = new Set(
    sentLog.map((s) => (s.email || "").toLowerCase())
  );
  return leads.filter(
    (l) => !sentEmails.has((l.email || "").toLowerCase())
  );
}

/**
 * Round-robin 批次选择。
 * 按公司分组后，每轮从每家公司取 1 个联系人，直到达到目标数量。
 * 相比原始实现，修正了越界风险并去除死代码。
 *
 * @param {Array<Record<string, string>>} remaining - 未发送联系人
 * @param {number} count - 目标批次大小
 * @returns {Array<Record<string, string>>} 选中的联系人批次
 */
function selectBatchRoundRobin(remaining, count) {
  // 按公司分组
  const byCompany = {};
  for (const contact of remaining) {
    const companyKey = contact.company || "__unknown__";
    if (!byCompany[companyKey]) byCompany[companyKey] = [];
    byCompany[companyKey].push(contact);
  }

  const companyNames = Object.keys(byCompany);
  const batch = [];
  let round = 0;

  // 每轮遍历所有公司，从当前轮次索引取一个联系人
  // 当某公司联系人取完时自动跳过（通过索引检查防止越界）
  while (batch.length < count) {
    let addedThisRound = false;

    for (const company of companyNames) {
      if (batch.length >= count) break;

      const companyContacts = byCompany[company];
      // 安全索引检查：只在当前轮次该联系人存在时才取
      if (round < companyContacts.length) {
        batch.push(companyContacts[round]);
        addedThisRound = true;
      }
    }

    // 如果本轮没有添加任何联系人，说明所有公司都已取完
    if (!addedThisRound) break;
    round++;
  }

  return batch;
}

/**
 * 统计批次中各公司的联系人分布。
 *
 * @param {Array<Record<string, string>>} batch - 选中的批次
 * @returns {Record<string, number>} 公司 → 联系人数量
 */
function countByCompany(batch) {
  const counts = {};
  for (const c of batch) {
    const company = c.company || "unknown";
    counts[company] = (counts[company] || 0) + 1;
  }
  return counts;
}

/**
 * 加载公司调研数据。
 * 从 research/companies/ 目录读取 JSON 文件，提取摘要。
 *
 * @returns {Record<string, string>} 公司名 → 调研摘要
 */
function loadResearchMap() {
  const researchMap = {};
  const jsonFiles = listFilesByExtension(RESEARCH_DIR, ".json");

  for (const file of jsonFiles) {
    const filePath = path.join(RESEARCH_DIR, file);
    const data = safeReadJson(filePath);
    if (!data || !data.company) continue;

    const summary = (data.research?.summary || "")
      .replace(/https?:\/\/[^\s]+/g, "") // 去除 URL
      .substring(0, 150);

    if (summary) {
      researchMap[data.company] = summary;
    }
  }

  return researchMap;
}

/**
 * 生成 IRON 的邮件撰写 prompt。
 * 格式保持不变（IRON 依赖此格式）。
 *
 * @param {Array<Record<string, string>>} batch - 联系人批次
 * @param {Record<string, string>} researchMap - 公司调研映射
 * @returns {string} IRON prompt 文本
 */
function generateIronPrompt(batch, researchMap) {
  const lines = [];

  lines.push(
    `你是 IRON，Hero Pump（浙江慧若泵业）的贸易操作员。请为以下 ${batch.length} 个联系人写开发信。\n`
  );

  lines.push("## ⚠️ 品牌约束（最高优先级）");
  lines.push(
    "你是 Hero Pump / Zhejiang Hero Pump Co., Ltd. 的销售，卖的是 **变频循环泵**。"
  );
  lines.push(
    "🚫 **绝对禁止**：在邮件中提到 Farreach、线材、cable、wire、electronic、electronics、HDMI、USB、DP、LAN 等任何与电缆/线材相关的内容。"
  );
  lines.push(
    "🚫 **绝对禁止**：使用 Farreach 的公司介绍（如 'dual manufacturing bases in Zhuhai and Vietnam'、'18 years experience in cable' 等）。"
  );
  lines.push(
    "✅ 你卖的是泵（pumps），不是电缆。所有公司介绍必须围绕 Hero Pump / 浙江慧若泵业。"
  );
  lines.push("");

  lines.push("## 产品信息");
  lines.push(
    "- 产品：变频循环泵（variable frequency circulating pumps）"
  );
  lines.push("- 认证：ErP EEI ≤ 0.23, TÜV SÜD, CE, RoHS");
  lines.push("- 价格：比 Grundfos/Wilo 低 30-40%");
  lines.push("- 工厂：浙江桐乡（Zhejiang Hero Pump Co., Ltd.）");
  lines.push("- OEM：支持贴牌定制\n");

  lines.push("## 签名（每封末尾必须加上）");
  lines.push("Jaden Yeung");
  lines.push(
    "Sales Manager | Zhejiang Hero Pump Co., Ltd."
  );
  lines.push("sales@heropumps.com");
  lines.push("WhatsApp: +86 136 8034 2402");
  lines.push("www.heropumps.com\n");

  lines.push("## 要求");
  lines.push(
    "1. 根据职位定制：Sales→价格，Product→技术，CEO→战略，通用→转交负责人"
  );
  lines.push("2. 正文 80-120 词，开头个性化（提到公司、国家）");
  lines.push(
    "3. 严禁：hope this email finds you well、破折号、空洞恭维"
  );
  lines.push("4. 结尾只推进一个动作：同意接收产品单页和报价");
  lines.push("5. 每人 3 个主题行\n");

  lines.push("## 联系人\n");

  batch.forEach((contact, index) => {
    const name = contact.contact_name || contact.email;
    lines.push(
      `${index + 1}. ${name} | ${contact.email} | ${contact.position || "N/A"}`
    );
    lines.push(
      `   公司：${contact.company} | ${contact.country} | ${contact.website}`
    );
    if (researchMap[contact.company]) {
      lines.push(`   调研：${researchMap[contact.company]}`);
    }
    lines.push("");
  });

  lines.push("\n请为以上每个联系人写一封个性化开发信。");
  lines.push(`保存到目录: ${DRAFTS_DIR}/`);
  lines.push(`文件命名: iron-YYYY-MM-DD-{序号}-{邮箱前缀}.md`);
  lines.push(`每个文件格式:`);
  lines.push("# Cold Email — [公司名] — [联系人]\n");
  lines.push("- **Email:** [邮箱]");
  lines.push("- **Position:** [职位]");
  lines.push("- **Recommended:** [推荐主题]");
  lines.push("- **Subject Alt 1:** [备选1]");
  lines.push("- **Subject Alt 2:** [备选2]\n");
  lines.push("## Email Body\n");
  lines.push("[正文含签名]\n");
  lines.push("## Design Notes");
  lines.push("- **切入角度:** [角色] 定制");
  lines.push("- **联系人来源:** csv");

  return lines.join("\n");
}

/**
 * 生成 IRON 的跟进邮件 prompt。
 * 包含之前的邮件历史，让 IRON 写个性化跟进。
 *
 * @param {Array} followUps - 到期跟进的客户列表（来自 SalesState.getDueFollowUps）
 * @param {Record<string, string>} researchMap - 公司调研映射（可选）
 * @returns {string} IRON follow-up prompt 文本
 */
function generateFollowUpPrompt(followUps, researchMap = {}) {
  if (!followUps || followUps.length === 0) return '';

  const lines = [];

  lines.push(
    `你是 IRON，Hero Pump（浙江慧若泵业）的销售跟进专员。请为以下 ${followUps.length} 个到期客户写跟进邮件。\n`
  );

  lines.push("## ⚠️ 品牌约束（最高优先级）");
  lines.push(
    "你是 Hero Pump / Zhejiang Hero Pump Co., Ltd. 的销售，卖的是 **变频循环泵**。"
  );
  lines.push(
    "🚫 **绝对禁止**：在邮件中提到 Farreach、线材、cable、wire、electronic、electronics、HDMI、USB、DP、LAN 等任何与电缆/线材相关的内容。"
  );
  lines.push(
    "🚫 **绝对禁止**：使用 Farreach 的公司介绍（如 'dual manufacturing bases in Zhuhai and Vietnam'、'18 years experience in cable' 等）。"
  );
  lines.push("");

  lines.push("## 产品信息");
  lines.push(
    "- 产品：变频循环泵（variable frequency circulating pumps）"
  );
  lines.push("- 认证：ErP EEI ≤ 0.23, TÜV SÜD, CE, RoHS");
  lines.push("- 价格：比 Grundfos/Wilo 低 30-40%");
  lines.push("- 工厂：浙江桐乡（Zhejiang Hero Pump Co., Ltd.）");
  lines.push("- OEM：支持贴牌定制\n");

  lines.push("## 签名（每封末尾必须加上）");
  lines.push("Jaden Yeung");
  lines.push(
    "Sales Manager | Zhejiang Hero Pump Co., Ltd."
  );
  lines.push("sales@heropumps.com");
  lines.push("WhatsApp: +86 136 8034 2402");
  lines.push("www.heropumps.com\n");

  lines.push("## 跟进策略");
  lines.push("- follow_up_1（第1次跟进）：简短提醒 + 强调 ErP EEI ≤ 0.23 技术参数");
  lines.push("- follow_up_2（第2次跟进）：案例/社会证明（欧洲分销商已切换）");
  lines.push("- follow_up_3（第3次跟进）：产品单页 + 报价引导");
  lines.push("- follow_up_4（第4次跟进/最后跟进）：礼貌收尾，留下联系方式\n");

  lines.push("## 要求");
  lines.push("1. 根据跟进阶段选择合适的切入角度");
  lines.push("2. 正文 80-120 词，开头个性化（提到公司、国家、之前的邮件主题）");
  lines.push("3. 严禁：hope this email finds you well、破折号、空洞恭维");
  lines.push("4. 结尾推进一个动作：接收产品单页和报价 / 安排通话");
  lines.push("5. 每人 3 个主题行\n");

  lines.push("## 待跟进客户\n");

  followUps.forEach((customer, index) => {
    const name = customer.contact_name || customer.email;
    const stage = customer.current_stage || 'cold_email_sent';
    const followUpNum = customer.follow_up_count || 1;
    const strategyKey = `follow_up_${followUpNum}`;

    lines.push(
      `${index + 1}. ${name} | ${customer.email} | ${customer.company} | ${customer.country || 'N/A'}`
    );
    lines.push(
      `   当前阶段: ${stage} | 第 ${followUpNum} 次跟进 | 策略: ${strategyKey}`
    );
    if (researchMap[customer.company]) {
      lines.push(`   调研: ${researchMap[customer.company]}`);
    }
    lines.push("");
  });

  lines.push("\n请为以上每个客户写一封个性化跟进邮件。");
  lines.push(`保存到目录: ${DRAFTS_DIR}/`);
  lines.push(`文件命名: followup-YYYY-MM-DD-{序号}-{邮箱前缀}.md`);
  lines.push(`每个文件格式:`);
  lines.push("# Follow-up Email — [公司名] — [联系人] — [第N次跟进]\n");
  lines.push("- **Email:** [邮箱]");
  lines.push("- **Stage:** [当前阶段]");
  lines.push("- **Follow-up #:** [第几次]");
  lines.push("- **Subject:** [推荐主题]");
  lines.push("- **Subject Alt 1:** [备选1]");
  lines.push("- **Subject Alt 2:** [备选2]\n");
  lines.push("## Email Body\n");
  lines.push("[正文含签名]\n");
  lines.push("## Design Notes");
  lines.push("- **切入角度:** [阶段] 定制");
  lines.push("- **类型:** followup");

  return lines.join("\n");
}

// ─── 主流程 ─────────────────────────────────────────────────

/**
 * 主入口。
 */
function main() {
  const startTime = Date.now();

  // 解析参数
  const args = process.argv.slice(2);
  const countIdx = args.indexOf("--count");
  const count =
    countIdx >= 0 ? Math.max(1, parseInt(args[countIdx + 1]) || DEFAULT_BATCH_SIZE) : DEFAULT_BATCH_SIZE;
  const dryRun = args.includes("--dry-run");

  console.log("========================================");
  console.log("Daily Run v2 — 发送前即时写");
  console.log(`日期: ${new Date().toISOString().split("T")[0]}`);
  console.log(`模式: ${dryRun ? "DRY RUN" : "PRODUCTION"}`);
  console.log(`目标: ${count} 封`);
  console.log("========================================\n");

  // 确保必要目录存在
  ensureDir(LEADS_DIR);
  ensureDir(RESEARCH_DIR);
  ensureDir(DRAFTS_DIR);
  ensureDir(PROMPTS_DIR);

  // ── 步骤 1: 加载数据 ──
  const leads = loadLeads();
  const sentLog = loadSentLog();
  const remaining = getRemaining(leads, sentLog);

  if (leads.length === 0) {
    console.error("❌ 未找到任何有效联系人。请检查 leads/ 目录中的 CSV 文件。");
    process.exit(1);
  }

  if (remaining.length === 0) {
    console.log("✅ 所有联系人都已发送完毕，无需处理。");
    return;
  }

  // ── 步骤 1.5: 过滤竞品和禁止前缀 ──
  const { kept: filteredRemaining, filtered: blockedList } = filterContacts(remaining);

  if (blockedList.length > 0) {
    console.log(`🚫 已过滤 ${blockedList.length} 个联系人:`);
    for (const { contact, reason } of blockedList.slice(0, 15)) {
      console.log(`   - ${contact.email.padEnd(35)} | ${reason}`);
    }
    if (blockedList.length > 15) {
      console.log(`   ... 还有 ${blockedList.length - 15} 条`);
    }
    console.log("");
  }

  if (filteredRemaining.length === 0) {
    console.log("✅ 所有剩余联系人均为竞品或禁止发送类型，无需处理。");
    return;
  }

  // ── 步骤 2: Round-robin 选择批次 ──
  const batch = selectBatchRoundRobin(filteredRemaining, count);

  if (batch.length === 0) {
    console.error("❌ 批次选择失败：未选出任何联系人。");
    process.exit(1);
  }

  const companyCounts = countByCompany(batch);
  const sortedCompanies = Object.entries(companyCounts).sort(
    ([, a], [, b]) => b - a
  );

  // ── 输出统计 ──
  console.log(`总联系人: ${leads.length}`);
  console.log(`已发送:   ${sentLog.length}`);
  console.log(`剩余:     ${remaining.length}`);
  console.log(`选中:     ${batch.length} 封（涉及 ${sortedCompanies.length} 家公司）\n`);

  // 按公司分组显示
  console.log("📊 批次分布:");
  for (const [company, cnt] of sortedCompanies) {
    const displayName = company === "__unknown__" ? "(未知公司)" : company;
    console.log(`   ${displayName}: ${cnt} 封`);
  }
  console.log("");

  // 列出选中联系人（dry-run 时也显示）
  console.log(
    `📋 今日批次 (${batch.length} 封):`
  );
  batch.forEach((c, i) => {
    const name = c.contact_name || c.email;
    console.log(
      `   ${i + 1}. ${name.padEnd(25)} | ${c.email.padEnd(35)} | ${c.position || "N/A"} | ${c.company} (${c.country})`
    );
  });
  console.log("");

  // ── 步骤 3: 加载调研数据 ──
  const researchMap = loadResearchMap();

  // ── 步骤 4: 生成 IRON prompt ──
  const prompt = generateIronPrompt(batch, researchMap);
  const today = new Date().toISOString().split("T")[0];

  if (!dryRun) {
    const promptFile = path.join(PROMPTS_DIR, `${today}.md`);
    try {
      ensureDir(path.dirname(promptFile));
      fs.writeFileSync(promptFile, prompt, "utf8");
      console.log(`📝 IRON Prompt 已保存: ${promptFile}`);
    } catch (err) {
      console.error(`❌ 保存 prompt 失败: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log(`📝 [DRY RUN] IRON Prompt 已生成（未保存）`);
  }

  console.log(
    `📋 WILSON 将 spawn IRON 写这 ${batch.length} 封邮件`
  );

  // ── 步骤 5: ⭐ 生成 follow-up prompt ──
  try {
    const dueFollowUps = SalesState.getDueFollowUps('hero-pumps');
    if (dueFollowUps.length > 0) {
      console.log(`\n📬 待跟进客户: ${dueFollowUps.length} 个`);
      dueFollowUps.forEach((c, i) => {
        const name = c.contact_name || c.email;
        console.log(
          `   ${i + 1}. ${name.padEnd(25)} | ${c.email.padEnd(35)} | ${c.company} | 第${c.follow_up_count || 1}次跟进`
        );
      });

      if (!dryRun) {
        const followUpPrompt = generateFollowUpPrompt(dueFollowUps, researchMap);
        const followUpPromptFile = path.join(PROMPTS_DIR, `followup-${today}.md`);

        try {
          ensureDir(path.dirname(followUpPromptFile));
          fs.writeFileSync(followUpPromptFile, followUpPrompt, 'utf8');
          console.log(`📝 Follow-up Prompt 已保存: ${followUpPromptFile}`);
        } catch (err) {
          console.warn(`⚠️  保存 follow-up prompt 失败: ${err.message}`);
        }

        console.log(
          `📋 WILSON 将 spawn IRON 写这 ${dueFollowUps.length} 封跟进邮件`
        );
      } else {
        console.log(`📝 [DRY RUN] Follow-up Prompt 已生成（未保存）`);
      }
    } else {
      console.log('\n📬 暂无到期跟进客户');
    }
  } catch(e) {
    console.warn(`⚠️  读取跟进数据失败: ${e.message}`);
  }

  // ── Dry-run exit ──
  if (dryRun) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n[DRY RUN] 到此为止。耗时 ${elapsed}s`);
    return;
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`⏱️  执行时间: ${elapsed}s`);
}

main();
