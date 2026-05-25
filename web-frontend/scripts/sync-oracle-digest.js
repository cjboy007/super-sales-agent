#!/usr/bin/env node
/**
 * Oracle Digest → Website News 同步脚本
 *
 * 读取 Oracle 最新 digest JSON，转换为 web-frontend/data/intelligence/news.json 格式。
 *
 * 用法: node scripts/sync-oracle-digest.js [digest文件路径]
 * 默认: 读取 ~/.openclaw/workspace/intelligence/digest-{today}.json
 */

const fs = require('fs');
const path = require('path');

const INTEL_DIR = path.join(process.env.HOME, '.openclaw', 'workspace', 'intelligence');
const DATA_DIR = path.join(__dirname, '..', 'data', 'intelligence');
const MAX_NEWS = 50;

// Section 标题 → 新闻 tag 映射
const SECTION_TAG_MAP = {
  '🌍 国际形势': '宏观经济',
  '💰 投资金融': '出口数据',
  '🤖 AI 与科技': '技术标准',
  '🇦🇺 澳洲移民': '法规政策',
  '🇦🇺 澳洲科技与移民': '澳洲动态',
  '🔌 线缆暖通行业': '行业趋势',
  '🔌 线缆行业': '行业趋势',
  '⚡ 能源': '市场预测',
  '📦 贸易与关税': '贸易政策',
  '📈 原材料与价格': '原材料',
};

// ============================================================
// 新闻告警分级 — 按对 Farreach 业务的影响程度
// ============================================================

// 🔴 高危关键词（直接影响成本、订单、供应链）
const DANGER_KEYWORDS = [
  // 关税/贸易
  'tariff', '关税', 'trade war', '贸易战', 'embargo', '禁运',
  'sanction', '制裁', 'export control', '出口管制', 'ban', '禁令',
  'quota', '配额', 'anti-dumping', '反倾销', 'countervailing', '反补贴',
  // 原材料
  'copper price surge', '铜价暴涨', 'copper shortage', '铜短缺',
  'supply chain disruption', '供应链中断', 'commodity spike',
  // 汇率
  'currency crash', '汇率暴跌', 'exchange rate plunge',
  // 地缘政治
  'conflict', '冲突', 'war', '战争', 'invasion', '入侵', 'blockade', '封锁',
];

// 🟡 预警关键词（中期需要关注）
const WARNING_KEYWORDS = [
  // 关税/谈判
  'tariff negotiation', '关税谈判', 'trade deal', '贸易协议', 'trade talks',
  // 经济数据
  'PMI', 'recession', '衰退', 'inflation', '通胀', 'interest rate', '利率',
  // 竞品
  'new product', '新品', 'expansion', '扩产', 'plant', '工厂',
  'price cut', '降价', 'capacity', '产能',
  // 行业标准
  'standard', '标准', 'certification', '认证', 'compliance', '合规',
  'HDMI', 'USB4', 'DisplayPort', 'DP',
  // 原材料
  'copper', '铜价', 'copper price', 'LME', 'raw material', '原材料',
  // 移民/签证
  'visa', '签证', 'immigration', '移民', 'PR', 'permanent resident',
  // 其他
  'negotiation', '谈判', 'tension', '紧张', 'dispute', '争端',
];

// 板块权重加成（某些板块天然更重要）
const SECTION_WEIGHT = {
  '📦 贸易与关税': 1,     // 关税板块默认 +1 级
  '📈 原材料与价格': 0.5, // 原材料板块 +0.5 级
  '💰 投资金融': 0.5,
  '🇦🇺 澳洲科技与移民': 0,
  '🔌 线缆行业': 0,
};

/**
 * 对新闻条目评分，返回 alert type
 * 分数规则：danger keyword = 3 分，warning keyword = 1 分
 * 3+ 分 = danger（命中至少 1 个高危关键词），1-2 分 = warning，0 分 = info
 * 板块权重只加 0.5 分，不会单独把一个 warning 词推到 danger
 */
function classifyAlert(title, snippet, sectionTitle) {
  const text = `${title} ${snippet || ''}`.toLowerCase();
  let score = 0;

  for (const kw of DANGER_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      score += 3;
    }
  }
  for (const kw of WARNING_KEYWORDS) {
    if (text.includes(kw.toLowerCase())) {
      score += 1;
    }
  }

  // 板块加成（0.5 分，不足以单独推高到 danger）
  const sectionAdd = SECTION_WEIGHT[sectionTitle] || 0;
  score += sectionAdd;

  if (score >= 3) return 'danger';
  if (score >= 1) return 'warning';
  return 'info';
}

function digestToNews(digest) {
  const news = [];

  for (const section of digest.sections || []) {
    const tag = SECTION_TAG_MAP[section.title] || '行业趋势';

    for (const item of section.items || []) {
      if (!item.title) continue;

      // 提取 source 域名
      let source = '';
      if (item.url) {
        try {
          source = new URL(item.url).hostname.replace('www.', '');
        } catch {
          source = '';
        }
      }
      if (item.source) source = item.source;

      news.push({
        id: `oracle-${digest.generated_at || digest.date}-${item.title.slice(0, 20).replace(/[^a-zA-Z0-9]/g, '')}`,
        title: item.title,
        source,
        time: digest.date || new Date().toISOString().split('T')[0],
        publishTime: item.publishTime || '',
        summary: (item.snippet || '').slice(0, 300),
        tag,
        url: item.url || '',
      });
    }
  }

  return news;
}

// ============================================================
// 重大事件 → alerts.json 同步
// ============================================================

// 哪些板块的内容算"重大事件"
const MAJOR_EVENT_SECTIONS = [
  '📦 贸易与关税',
  '📈 原材料与价格',
  '💰 投资金融',
  '🌍 国际形势',
  '⚡ 能源',
  '🇦🇺 澳洲科技与移民',
  '🇦🇺 澳洲移民',
];

function extractMajorEvents(digest) {
  const events = [];
  for (const section of digest.sections || []) {
    if (!MAJOR_EVENT_SECTIONS.includes(section.title)) continue;
    for (const item of section.items || []) {
      if (!item.title) continue;
      const alertType = classifyAlert(item.title, item.snippet, section.title);
      events.push({
        keyword: section.title.replace(/[\s\u{1F300}-\u{1FAD6}\u{2600}-\u{27BF}]/gu, '').trim() || '重大事件',
        type: alertType,
        message: item.title + (item.snippet ? ` — ${item.snippet.slice(0, 100)}` : ''),
        time: digest.date || new Date().toISOString().split('T')[0],
        url: item.url || '',
      });
    }
  }
  return events;
}

function syncMajorEvents(digest) {
  const alertsPath = path.join(DATA_DIR, 'alerts.json');
  let alerts = { alerts: [], updatedAt: '' };
  if (fs.existsSync(alertsPath)) {
    alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  }

  // 保留铜价和汇率告警（id 1 和 2），其余替换为重大事件
  const systemAlerts = alerts.alerts.filter(a => a.keyword === '铜价' || a.keyword === '汇率');
  const majorEvents = extractMajorEvents(digest);

  // 按严重程度排序（danger 优先），最多保留 8 条
  const severityOrder = { danger: 0, warning: 1, info: 2 };
  majorEvents.sort((a, b) => (severityOrder[a.type] || 2) - (severityOrder[b.type] || 2));
  const eventAlerts = majorEvents.slice(0, 8).map((ev, i) => ({
    id: `major-${i + 1}`,
    ...ev,
  }));

  alerts.alerts = [...systemAlerts, ...eventAlerts];
  alerts.updatedAt = new Date().toISOString();

  fs.writeFileSync(alertsPath, JSON.stringify(alerts, null, 2) + '\n');
  console.log(`🚨 重大事件已同步: ${eventAlerts.length} 条`);
}

function main() {
  // 1. 找 digest 文件
  let digestPath = process.argv[2];
  if (!digestPath) {
    const today = new Date().toISOString().split('T')[0];
    digestPath = path.join(INTEL_DIR, `digest-${today}.json`);
  }

  if (!fs.existsSync(digestPath)) {
    console.error(`❌ digest 文件不存在: ${digestPath}`);
    process.exit(1);
  }

  const digest = JSON.parse(fs.readFileSync(digestPath, 'utf8'));
  console.log(`📥 读取 digest: ${digestPath}`);
  console.log(`   日期: ${digest.date}, 生成时间: ${digest.generated_at}`);
  console.log(`   共 ${digest.total_items} 条, ${digest.sections?.length || 0} 个板块`);

  // 2. 转换新闻
  const news = digestToNews(digest);
  console.log(`🔄 转换完成: ${news.length} 条新闻`);

  // 3. 读取现有 news.json（保留去重）
  const newsPath = path.join(DATA_DIR, 'news.json');
  let existing = { news: [], updatedAt: '' };
  if (fs.existsSync(newsPath)) {
    existing = JSON.parse(fs.readFileSync(newsPath, 'utf8'));
  }

  // 合并（新数据在前，去重：标题前 60 字符匹配即视为重复）
  // ⭐ 保留已有条目的 reported 字段（按标题匹配）
  const reportedMap = new Map();
  for (const n of existing.news) {
    if (n.reported === true) {
      reportedMap.set(n.title.toLowerCase().slice(0, 60), true);
    }
  }

  const existingTitles = new Set(existing.news.map(n => n.title.toLowerCase().slice(0, 60)));
  const merged = [
    ...news.map(n => {
      const key = n.title.toLowerCase().slice(0, 60);
      if (reportedMap.has(key)) {
        return { ...n, reported: true }; // 恢复已推送标记
      }
      return n;
    }),
    ...existing.news.filter(n => !existingTitles.has(n.title.toLowerCase().slice(0, 60))),
  ].slice(0, MAX_NEWS);

  // 4. 写入 news.json
  const output = {
    updatedAt: new Date().toISOString(),
    news: merged,
  };

  fs.writeFileSync(newsPath, JSON.stringify(output, null, 2) + '\n');
  console.log(`✅ 写入 ${newsPath}`);
  console.log(`   共 ${merged.length} 条`);

  // 打印标签分布
  const byTag = {};
  for (const n of merged) {
    byTag[n.tag] = (byTag[n.tag] || 0) + 1;
  }
  console.log('   标签分布:', JSON.stringify(byTag));

  // 5. 同步重大事件到 alerts.json
  syncMajorEvents(digest);
}

main();
