#!/usr/bin/env node
/**
 * 情报中心数据采集脚本 v3.0
 *
 * 数据源：SearXNG 本地搜索 + Frankfurter API（汇率）
 *
 * - 汇率：Frankfurter API（ECB 数据，免费）+ SearXNG fallback
 * - 铜价：SearXNG 本地搜索 LME 铜价 + 随机波动 fallback
 * - 新闻：SearXNG 搜索行业关键词
 * - 竞品：SearXNG 搜索竞品关键词
 *
 * 运行：node scripts/update-intelligence-data.js
 * 或：npm run intelligence:update
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 配置
// ============================================================

const SEARXNG_URL = 'http://localhost:8080';
const DATA_DIR = path.join(__dirname, '..', 'data', 'intelligence');
const now = new Date().toISOString();
const nowLocal = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const today = new Date().toISOString().split('T')[0];

// ============================================================
// 信号质量过滤 — 域名黑名单 + 来源评分
// ============================================================

/**
 * 黑名单域名（SEO 垃圾站、厂家软文站、内容农场）
 * 发现一个加一个，长期维护
 */
const DOMAIN_BLACKLIST = [
  // 社媒 / 内容平台
  'instagram.com', 'facebook.com', 'tiktok.com', 'twitter.com', 'x.com',
  'youtube.com', 'douyin.com', 'weibo.com', 'linkedin.com',
  // 展会页面
  'mapyourshow.com', 'a2zinc.net', '10times.com',
  // 内容农场 / SEO 垃圾站（非竞品）
];

/**
 * 可信域名白名单（行业权威来源）
 * 命中白名单直接放行，不在黑名单中但也不在名单中的按质量分过滤
 */
const TRUSTED_DOMAINS = [
  'reuters.com',
  'bloomberg.com',
  'ft.com',
  'theguardian.com',
  'aljazeera.com',
  'forbes.com',
  'wsj.com',
  'techcrunch.com',
  'theverge.com',
  'yahoo.com',         // finance.yahoo.com
  'coindesk.com',
  'investing.com',
  'globenewswire.com',
  'businesswire.com',
  'prnewswire.com',
  // B2B 平台
  'alibaba.com',
  'made-in-china.com',
  'globalsources.com',
  'globaltrade.net',
  // 行业
  'hdmi.org',
  'cablefax.com',
];

/**
 * 判断域名是否在黑名单中
 */
function isBlacklisted(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return DOMAIN_BLACKLIST.some(d => host.endsWith(d));
  } catch {
    return true; // 解析失败的 URL 直接丢弃
  }
}

/**
 * 来源质量评分（1-5）
 * 5 = 白名单权威来源
 * 3 = 一般行业站（不在黑名单也不在白名单）
 * 1 = 黑名单垃圾站（应该在 isBlacklisted 阶段就过滤掉）
 */
function sourceQualityScore(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (TRUSTED_DOMAINS.some(d => host.endsWith(d))) return 5;
    if (DOMAIN_BLACKLIST.some(d => host.endsWith(d))) return 1;
    // 降权特征：URL 中包含 blog/news 但域名不知名
    if (host.includes('blog.') || host.includes('news.')) return 2;
    return 3; // 默认中性
  } catch {
    return 1;
  }
}

// ============================================================
// 工具函数
// ============================================================

function readJSON(file) {
  const fullPath = path.join(DATA_DIR, file);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJSON(file, data) {
  const fullPath = path.join(DATA_DIR, file);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  ✅ 写入 ${file}`);
}

async function fetchJSON(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * SearXNG 本地搜索
 * @param {string} query - 搜索关键词
 * @param {number} maxResults - 最大结果数
 * @returns {Promise<{answer?: string, results: Array<{title: string, content: string, url: string, publishedDate?: string}>}>}
 */
async function searxSearch(query, maxResults = 5) {
  const url = `${SEARXNG_URL}/search?q=${encodeURIComponent(query)}&format=json&categories=general`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const data = await res.json();
  const results = (data.results || []).slice(0, maxResults);
  const answer = data.infoboxes?.[0]?.content || results[0]?.content || '';
  return { answer, results };
}

/**
 * 从日期字符串中提取日期（支持多种格式）
 */
function parseDate(str) {
  if (!str) return today;
  const iso = str.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  const daysAgo = str.match(/(\d+)\s*days?\s*ago/i);
  if (daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - parseInt(daysAgo[1]));
    return d.toISOString().split('T')[0];
  }
  return today;
}

// ============================================================
// 1. 汇率 — Frankfurter API + SearXNG fallback
// ============================================================

async function updateExchangeRates() {
  console.log('\n📈 更新汇率...');

  const trends = readJSON('trends.json') || { trends: [] };

  let usdCny = null;
  let usdCnyHistory = [];
  let source = 'unknown';

  try {
    const data = await fetchJSON('https://api.frankfurter.dev/v1/latest?from=USD&to=CNY');
    usdCny = data.rates.CNY;
    source = 'Frankfurter API (ECB)';
    console.log(`  USD/CNY: ${usdCny}`);

    // 拉取 6 个月历史数据
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 6);
    const fmt = (d) => d.toISOString().split('T')[0];

    const hist = await fetchJSON(
      `https://api.frankfurter.dev/v1/${fmt(startDate)}..${fmt(endDate)}?from=USD&to=CNY`
    );
    for (const [date, rates] of Object.entries(hist.rates)) {
      usdCnyHistory.push({ date, rate: rates.CNY });
    }
    console.log(`  历史数据: ${usdCnyHistory.length} 个交易日`);
  } catch (e) {
    console.log(`  ⚠️ Frankfurter 不可用: ${e.message}，尝试 SearXNG...`);

    try {
      const sx = await searxSearch('USD to CNY exchange rate today', 3);
      const content = [sx.answer, ...sx.results.map(r => r.content)].join(' ');
      const rateMatch = content.match(/(\d\.\d{4})/);
      if (rateMatch) {
        usdCny = parseFloat(rateMatch[1]);
        source = 'SearXNG';
        console.log(`  USD/CNY: ${usdCny} (SearXNG)`);
      }
    } catch (e2) {
      console.log(`  ❌ 汇率全部失败: ${e2.message}`);
    }
  }

  if (usdCny && usdCnyHistory.length > 0) {
    const usdCnyTrend = trends.trends.find(t => t.id === 'usd-cny');
    if (usdCnyTrend) {
      // 按月份聚合：取每月最后一个交易日的汇率
      const monthNames = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
      const monthlyMap = {};
      for (const r of usdCnyHistory) {
        const d = new Date(r.date);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyMap[key] = { label: monthNames[d.getMonth()], rate: r.rate, date: r.date };
      }
      // 添加今日数据
      const today_ = new Date();
      const todayKey = `${today_.getFullYear()}-${String(today_.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[todayKey] = { label: monthNames[today_.getMonth()], rate: usdCny, date: today_.toISOString().split('T')[0] };

      const sortedKeys = Object.keys(monthlyMap).sort();
      // 最多保留 6 个月
      const recentKeys = sortedKeys.slice(-6);
      usdCnyTrend.months = recentKeys.map(k => monthlyMap[k].label);
      usdCnyTrend.values = recentKeys.map(k => Math.round(monthlyMap[k].rate * 10000) / 10000);
      console.log(`  汇率月度数据: ${usdCnyTrend.months.join(', ')} | ${usdCnyTrend.values.join(', ')}`);
    }
  }

  trends.updatedAt = now;
  writeJSON('trends.json', trends);

  // Update alerts.json: preserve existing alerts (e.g. major events), update only rate
  const alertsPath = path.join(DATA_DIR, 'alerts.json');
  let alerts = { alerts: [], updatedAt: '' };
  if (fs.existsSync(alertsPath)) {
    alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  }
  let rateAlert = alerts.alerts.find(a => a.keyword === '汇率');
  if (!rateAlert) {
    rateAlert = { id: '2', keyword: '汇率', type: 'warning' };
    alerts.alerts.push(rateAlert);
  }
  rateAlert.message = `USD/CNY 实时汇率: ${usdCny}（${source}）`;
  rateAlert.change = usdCny.toString();
  rateAlert.time = '刚刚';
  rateAlert.source = source;
  alerts.updatedAt = now;
  writeJSON('alerts.json', alerts);
}

// ============================================================
// 2. 铜价 — SearXNG 搜索 LME + fallback
// ============================================================

async function updateCopperPrice() {
  console.log('\n🔶 更新铜价...');

  const trends = readJSON('trends.json') || { trends: [] };

  // 读取现有 alerts（保留重大事件等非系统告警）
  const alertsPath = path.join(DATA_DIR, 'alerts.json');
  let alerts = { alerts: [], updatedAt: '' };
  if (fs.existsSync(alertsPath)) {
    alerts = JSON.parse(fs.readFileSync(alertsPath, 'utf8'));
  }

  let copperPrice = null;
  let source = 'fallback';

  // ===== 改进的铜价采集：收集所有候选值，按时效性排序 =====
  // 问题：旧版取第一个匹配值，可能命中过时数据（如 4 月的 $12,434）
  // 解决：收集所有候选值 + 日期，选离今天最近的

  /**
   * 从文本中提取最近的日期，返回 Date 对象或 null
   */
  function extractNearestDate(text) {
    // ISO: 2026-05-12
    const isoMatch = text.match(/(\d{4}-\d{2}-\d{2})/g);
    if (isoMatch && isoMatch.length > 0) return new Date(isoMatch[isoMatch.length - 1]);
    // "12. May 2026" or "May 12, 2026" or "12 May 2026"
    const dmyMatch = text.match(/(\d{1,2})\.?\s+([A-Za-z]+)\s+(\d{4})/);
    if (dmyMatch) return new Date(`${dmyMatch[2]} ${dmyMatch[1]}, ${dmyMatch[3]}`);
    const mdyMatch = text.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (mdyMatch) return new Date(`${mdyMatch[1]} ${mdyMatch[2]}, ${mdyMatch[3]}`);
    return null;
  }

  /**
   * 判断域名是否可信来源
   */
  function isTrustedSource(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      const trusted = [
        'lme.com', 'westmetall.com', 'macromicro.me',
        'tradingeconomics.com', 'kme.com', 'gindre.com',
        'metalcharts.org', 'topcable.com', 'insee.fr',
        'fred.stlouisfed.org', 'cbonds.com', 'carboncredits.com',
      ];
      return trusted.some(d => host.endsWith(d) || host.includes(d));
    } catch { return false; }
  }

  /**
   * 从文本中提取所有合理范围内的铜价数值（美元/吨）
   */
  function extractPriceCandidates(text) {
    const prices = [];
    // 模式1: "$12,895" 或 "$12895"
    for (const m of text.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val > 5000 && val < 20000) prices.push(val);
    }
    // 模式2: "12,895.00"（无 $ 符号）
    for (const m of text.matchAll(/([\d]{2,3},[\d]{3}(?:\.\d+)?)/g)) {
      const val = parseFloat(m[1].replace(/,/g, ''));
      if (val > 5000 && val < 20000) prices.push(val);
    }
    // 模式3: "5.93 USD/Lbs" → 换算为 /吨
    const usdPerLb = text.match(/([\d.]+)\s*USD\s*\/\s*Lbs?/i);
    if (usdPerLb) {
      const converted = Math.round(parseFloat(usdPerLb[1]) * 2204.62);
      if (converted > 5000 && converted < 20000) prices.push(converted);
    }
    return [...new Set(prices)]; // 去重
  }

  try {
    const sx = await searxSearch('LME copper price today USD per ton 2026', 10);

    // 收集所有候选值：{ price, date, daysAgo, source, url, trusted }
    const candidates = [];
    const now = new Date();

    for (const r of sx.results) {
      const content = r.content || '';
      const title = r.title || '';
      const text = title + ' ' + content;
      const url = r.url || '';
      const prices = extractPriceCandidates(text);
      const date = extractNearestDate(text);
      const daysAgo = date ? Math.round((now - date) / (1000 * 60 * 60 * 24)) : 999;
      const trusted = isTrustedSource(url);

      for (const p of prices) {
        candidates.push({ price: Math.round(p), date, daysAgo, url, trusted });
      }

      console.log(`  📋 ${url.split('/').slice(0, 3).join('/').replace('https://', '')} | prices=[${prices}] | date=${date ? date.toISOString().split('T')[0] : 'N/A'} | ${daysAgo}d ago | ${trusted ? '✅ trusted' : '—'}`);
    }

    // 过滤掉明显过时的数据（>30 天），然后按：日期最近 > 可信来源 > 数值合理性 排序
    const recent = candidates.filter(c => c.daysAgo <= 30);
    if (recent.length > 0) {
      // 取日期最近的（如有多个同日期，取可信来源优先）
      const minDaysAgo = Math.min(...recent.map(c => c.daysAgo));
      const newest = recent.filter(c => c.daysAgo === minDaysAgo);
      newest.sort((a, b) => (b.trusted ? 1 : 0) - (a.trusted ? 1 : 0));

      copperPrice = newest[0].price;
      source = `SearXNG (${newest[0].url.split('/')[2]})`;
      console.log(`  ✅ LME 铜价: $${copperPrice}/吨（${minDaysAgo}d ago, ${newest[0].trusted ? 'trusted' : 'untrusted'}）`);
    } else if (candidates.length > 0) {
      // 所有结果都 >30 天，降级使用最新的一个
      candidates.sort((a, b) => a.daysAgo - b.daysAgo);
      copperPrice = candidates[0].price;
      source = 'SearXNG (stale data)';
      console.log(`  ⚠️ LME 铜价: $${copperPrice}/吨（数据陈旧，${candidates[0].daysAgo}d ago）`);
    }

    if (!copperPrice) {
      console.log(`  ⚠️ SearXNG 未找到合理铜价数值`);
    }
  } catch (e) {
    console.log(`  ⚠️ SearXNG 铜价搜索失败: ${e.message}`);
  }

  // Fallback: 使用最近值 + 小幅随机波动
  if (!copperPrice) {
    const copperTrend = trends.trends.find(t => t.id === 'copper-price');
    const lastValue = copperTrend?.values?.[copperTrend.values.length - 1] || 9800;
    const change = (Math.random() - 0.5) * 0.02;
    copperPrice = Math.round(lastValue * (1 + change));
    source = '模拟增量（基于上次数据）';
    console.log(`  🔄 使用模拟增量: $${copperPrice}/吨`);
  }

  // 更新 trends — 同周内更新现有值，不追加重复标签
  const copperTrend = trends.trends.find(t => t.id === 'copper-price');
  const weeks = ['W1', 'W2', 'W3', 'W4'];
  const today_ = new Date();
  const monthName = `${today_.getMonth() + 1}月`;
  const weekIdx = Math.floor((today_.getDate() - 1) / 7);
  const currentLabel = `${monthName}${weeks[Math.min(weekIdx, 3)]}`;

  if (copperTrend) {
    const lastLabel = copperTrend.months[copperTrend.months.length - 1];
    if (lastLabel === currentLabel) {
      // 同周期，更新最后一个值
      copperTrend.values[copperTrend.values.length - 1] = copperPrice;
    } else {
      // 新周期，追加
      copperTrend.months.push(currentLabel);
      copperTrend.values.push(copperPrice);
      // 保持数组长度不超过 13
      if (copperTrend.months.length > 13) {
        copperTrend.months = copperTrend.months.slice(-13);
        copperTrend.values = copperTrend.values.slice(-13);
      }
    }
  }

  // 更新 alerts（保留已有非铜价告警）
  let copperAlert = alerts.alerts.find(a => a.keyword === '铜价');
  if (!copperAlert) {
    copperAlert = { id: '1', keyword: '铜价', type: 'info' };
    alerts.alerts.push(copperAlert);
  }
  const prev = copperTrend?.values?.[copperTrend.values.length - 2] || copperPrice;
  const diff = copperPrice - prev;
  copperAlert.message = `LME 铜价: $${copperPrice}/吨（${source}）`;
  copperAlert.change = diff >= 0 ? `+$${diff.toFixed(0)}` : `-$${Math.abs(diff).toFixed(0)}`;
  copperAlert.time = '刚刚';
  copperAlert.source = source;
  if (Math.abs(diff) > 200) copperAlert.type = 'danger';
  else if (Math.abs(diff) > 50) copperAlert.type = 'warning';
  else copperAlert.type = 'info';

  trends.updatedAt = now;
  alerts.updatedAt = now;
  writeJSON('trends.json', trends);
  writeJSON('alerts.json', alerts);
}

// ============================================================
// 3. 行业新闻 — 已由 Oracle digest 接管（daily-news-digest.py）
// ============================================================
// 不再从此脚本写 news.json，避免覆盖 Oracle 的高质量数据。
// Oracle digest 通过 sync_to_website() 自动同步到 news.json。

// ============================================================
// 4. 竞品追踪 — SearXNG 搜索 OEM 工厂/B2B 平台动态
// ============================================================

/**
 * 判断搜索结果是否是有效的竞品页面
 * 排除：社媒帖、展会页、规格说明书、B2B 平台聚合目录
 */
function isValidCompetitorPage(result) {
  const url = (result.url || '').toLowerCase();
  const title = (result.title || '').toLowerCase();
  const content = (result.content || '').toLowerCase();

  // 社媒 / 内容平台
  if (url.includes('instagram.com/') || url.includes('facebook.com/') ||
      url.includes('tiktok.com/') || url.includes('youtube.com/') ||
      url.includes('twitter.com/') || url.includes('x.com/') ||
      url.includes('linkedin.com/')) return false;

  // 展会页面
  if (url.includes('mapyourshow') || url.includes('a2zinc.net') || url.includes('10times')) return false;

  // 新闻稿/PR 通发平台（不是公司页面）
  if (url.includes('openpr.com/') || url.includes('prnewswire.com/') || url.includes('globenewswire.com/')) return false;

  // B2B Guide / 行业报告类文章（不是公司页面）
  const lowerTitle = (result.title || '').toLowerCase();
  if (lowerTitle.includes(' b2b guide') || lowerTitle.includes('industry 2026') || lowerTitle.includes('market size') || lowerTitle.includes('dpr ') || lowerTitle.includes('investment cost')) return false;

  // B2B 平台聚合目录（不是具体公司页）
  if (url.includes('/showroom/') || url.includes('/company_profile') || url.includes('/company-profile')) {
    // 允许：具体公司 showroom 页面
  } else {
    // 聚合目录一律排除
    if (url.includes('alibaba.com/') && (url.includes('-suppliers') || url.includes('/search') || url.includes('/product-detail') || url.includes('/showroom/'))) return false;
    if (url.includes('made-in-china.com/') && (url.includes('/manufacturers/') || url.includes('/suppliers/') || url.includes('/products-search') || url.includes('/search/'))) return false;
    if (url.includes('globalsources.com/') && (url.includes('/china-suppliers') || url.includes('/product-list') || url.includes('/manufacturer-list') || url.includes('/p/'))) return false;
  }

  // HDMI 官网规格页、非商业站
  if (url.includes('hdmi.org/spec/')) return false;
  if (url.includes('amazon.com/')) return false;
  if (url.includes('wolontek.com/') && url.includes('top-')) return false;  // Top N 列表文
  if (url.includes('displayport.org/')) return false;  // 官网产品库，不是厂商

  // 子域名为城市名（shenzhen.made-in-china.com 等）
  try {
    const host = new URL(result.url).hostname.replace('www.', '').split('.')[0];
    const cityNames = ['shenzhen', 'dongguan', 'guangzhou', 'xiamen', 'shanghai', 'beijing', 'ningbo', 'foshan'];
    if (cityNames.includes(host) && (result.url.includes('made-in-china.com') || result.url.includes('globalsources.com'))) return false;
    // m. 子域名的聚合页
    if (host === 'm' && result.url.includes('globalsources.com/') && !result.url.includes('/company-profile')) return false;
    if (host === 'm' && result.url.includes('made-in-china.com/') && !result.url.includes('/product/')) return false;
  } catch {}

  return true;
}

/**
 * 从搜索结果中提取公司/工厂名
 * 优先级：标题解析 > URL 路径 > 域名
 */
function extractCompanyName(result) {
  const url = result.url || '';
  const title = result.title || '';
  const urlHost = new URL(url).hostname.replace('www.', '');

  // B2B 平台：从 URL 路径或标题提取
  if (urlHost.includes('alibaba.com')) {
    // URL 格式: xxx.en.alibaba.com 或 alibaba.com/product-detail/xxx-123.html
    const match = url.match(/([a-z0-9-]+)\.en\.alibaba\.com/i);
    if (match) return match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    // 从标题提取
    const tMatch = title.match(/^([^-|]+)/);
    if (tMatch) {
      const name = tMatch[1].trim();
      if (name.length > 3 && !name.toLowerCase().includes('alibaba')) return name;
    }
    return 'Alibaba';
  }

  if (urlHost.includes('made-in-china.com')) {
    // URL 格式: companyname.en.made-in-china.com
    const match = url.match(/([a-z0-9-]+)\.en\.made-in-china\.com/i);
    if (match) {
      let name = match[1].replace(/-/g, ' ');
      return name.replace(/\b\w/g, c => c.toUpperCase());
    }
    // www.made-in-china.com/showroom/xxx/ — 优先从标题提取
    const showroomMatch = url.match(/made-in-china\.com\/showroom\/([^/]+)/);
    if (showroomMatch) {
      // 标题通常就是公司名（如 "Bona Sources Industry Co. Ltd"）
      const tMatch = title.match(/^(.+?)\s*-\s*Made-in-China/i);
      if (tMatch && tMatch[1].trim().length > 3) return tMatch[1].trim();
      // 如果标题本身没带 Made-in-China 后缀，直接用完整标题
      if (!title.toLowerCase().includes('made-in-china') && !title.toLowerCase().includes('manufacturer') && !title.toLowerCase().includes('supplier')) {
        const clean = title.trim();
        if (clean.length > 3 && clean.length < 60) return clean;
      }
      return showroomMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    // m.made-in-china.com/product/COMPANYNAME-xxx
    const mMatch = url.match(/made-in-china\.com\/product\/([A-Za-z0-9-]+)/);
    if (mMatch) {
      const name = mMatch[1].replace(/-/g, ' ');
      return name.replace(/\b\w/g, c => c.toUpperCase());
    }
    return 'Made-in-China';
  }

  if (urlHost.includes('globalsources.com')) {
    const match = url.match(/([a-z0-9-]+)\.manufacturer\.globalsources\.com/i);
    if (match) return match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    // m.globalsources.com/xxx-company/company-profile_xxx — 从 URL 路径提取
    const mMatch = url.match(/globalsources\.com\/([a-z0-9-]+)\/company-profile/i);
    if (mMatch) return mMatch[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return 'GlobalSources';
  }

  // 其他来源：尝试从标题提取公司名
  // 标题格式: "Company Name - Product Description"
  // 排除 Top N 列表文
  if (/^top\s*\d+/i.test(title)) return '';
  if (/^best\s*\d+/i.test(title)) return '';
  const dashMatch = title.match(/^([^-|–—]+)/);
  if (dashMatch) {
    const name = dashMatch[1].trim();
    // 排除 About Us / Company Profile / Milestones 等非公司名
    const skip = ['about us', 'company profile', 'company overview', 'home', 'welcome',
                  'milestones', 'our history', 'history', 'products', 'services', 'solutions'];
    // 排除纯描述性标题（含 cable/hdmi/usb/manufacturer 但没有具体公司名）
    const isGenericDesc = /^(top\s*\d+|best\s*\d+|\w+\s+)?(cable|hdmi|usb|dp|displayport|wire|connector|manufacturer|supplier|factory|products?|china)\s+(cable|hdmi|usb|dp|displayport|wire|connector|manufacturer|supplier|factory|products?|china|custom|oem)/i.test(name);
    if (name.length > 3 && !skip.includes(name.toLowerCase()) && !name.match(/^\d{4}$/) && !isGenericDesc) {
      return name;
    }
  }

  // 降级：从 URL 提取
  const pathParts = urlHost.split('.');
  if (pathParts.length >= 2) {
    const first = pathParts[0].replace('www.', '').replace('m.', '');
    if (first.length > 3 && !first.match(/^\d+$/)) {
      return first.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  return '';
}

async function updateCompetitors() {
  console.log('\n🏢 更新竞品追踪...');

  const competitors = readJSON('competitors.json') || { competitors: [] };

  const queries = [
    // HDMI/DP/USB 线缆制造商官网
    { q: 'HDMI cable manufacturer OEM factory China 2026', source: 'HDMI 制造商' },
    { q: 'DisplayPort USB cable OEM manufacturer Dongguan Shenzhen', source: 'DP/USB 制造商' },
    // B2B 平台具体公司页面（不用 site: 避免返回聚合目录）
    { q: 'alibaba.com HDMI cable manufacturer "company profile" OR "about us"', source: 'Alibaba 公司' },
    { q: 'made-in-china.com cable manufacturer "company profile" OR "about"', source: 'MIC 公司' },
    { q: 'globalsources.com cable manufacturer "company profile" OR "about"', source: 'GS 公司' },
    // 工厂扩产/认证动态
    { q: 'cable factory expansion new production line HDMI USB 2026', source: '工厂扩产' },
    { q: 'HDMI 2.1 certified cable manufacturer UL ETL', source: '认证动态' },
  ];

  const newItems = [];
  const seenUrls = new Set();  // 批次内 URL 去重

  for (const { q, source } of queries) {
    try {
      console.log(`  搜索: ${source}`);
      const sx = await searxSearch(q, 3);

      for (const r of sx.results) {
        // 第一道过滤：黑名单域名直接跳过
        if (isBlacklisted(r.url)) {
          console.log(`    ⛔ 黑名单过滤: ${r.title} (${r.url})`);
          continue;
        }

        // 第二道过滤：质量分低于 3 的丢弃
        const quality = sourceQualityScore(r.url);
        if (quality < 3) {
          console.log(`    ⛔ 低质量过滤(score=${quality}): ${r.title} (${r.url})`);
          continue;
        }

        // 第三道过滤：非有效页面类型（聚合页、目录页、规格页）
        if (!isValidCompetitorPage(r)) {
          console.log(`    ⛔ 页面类型过滤: ${r.title} (${r.url})`);
          continue;
        }

        // 提取公司/工厂名（改进版）
        const company = extractCompanyName(r);
        if (!company || company.length < 3) {
          console.log(`    ⛔ 无法提取公司名: ${r.title}`);
          continue;
        }

        // URL 去重：同一批次内不重复
        if (seenUrls.has(r.url)) {
          console.log(`    🔄 批次内重复: ${company} (${r.url.slice(0, 60)})`);
          continue;
        }
        seenUrls.add(r.url);

        newItems.push({
          id: `searx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          company,
          type: 'factory',
          title: r.title,
          detail: r.content.slice(0, 200),
          time: parseDate(r.publishedDate),
          publishTime: r.publishedDate || '',
          url: r.url,
          quality, // 记录质量分，便于后续分析
        });
      }
    } catch (e) {
      console.log(`  ⚠️ 搜索 "${source}" 失败: ${e.message}`);
    }
  }

  if (newItems.length > 0) {
    console.log(`  获取到 ${newItems.length} 条竞品动态（过黑名单和质量过滤后）`);
    const existingTitles = competitors.competitors.map(c => c.title.toLowerCase());
    const unique = newItems.filter(n =>
      !existingTitles.some(t => t.includes(n.title.toLowerCase().slice(0, 40)) ||
                                 n.title.toLowerCase().slice(0, 40).includes(t))
    );
    // 按质量分排序，优先保留高质量来源
    unique.sort((a, b) => (b.quality || 3) - (a.quality || 3));
    competitors.competitors = [...unique, ...competitors.competitors].slice(0, 15);
  }

  competitors.updatedAt = now;
  writeJSON('competitors.json', competitors);
}

// ============================================================
// 主流程
// ============================================================

// ============================================================
// 5. 关键洞察 — 基于 trends.json 本地启发式生成（不再调用 Phoenix agent）
// ============================================================

function generateInsights() {
  console.log('\n💡 生成关键洞察...');

  const trendsData = readJSON('trends.json');
  if (!trendsData || !trendsData.trends) {
    console.log('  ⚠️ trends.json 不可用，跳过洞察生成');
    return;
  }

  const trends = trendsData.trends;
  const insights = [];

  // 辅助：查找趋势
  const findTrend = (label) => trends.find(t => t.label.includes(label));
  const calcChange = (trend) => {
    if (!trend || !trend.values || trend.values.length < 2) return null;
    const first = trend.values[0];
    const last = trend.values[trend.values.length - 1];
    const pct = (((last - first) / Math.abs(first)) * 100).toFixed(1);
    return { first, last, pct: parseFloat(pct), dir: last > first ? 'up' : last < first ? 'down' : 'flat' };
  };

  // 铜价洞察
  const copper = calcChange(findTrend('铜价'));
  if (copper) {
    const impact = copper.pct > 10 ? 'high' : copper.pct > 5 ? 'medium' : 'low';
    if (copper.dir === 'up') {
      insights.push({
        title: '铜价急涨压缩利润',
        detail: `LME铜价涨${copper.pct}%，线材原料成本大幅上升，若未锁价则毛利率面临严重压缩，需立即评估长单定价策略。`,
        impact
      });
      if (copper.pct > 15) {
        insights.push({
          title: '成本转嫁刻不容缓',
          detail: `铜价涨幅远超正常波动，建议对新订单上调报价${Math.min(copper.pct * 0.3, 10).toFixed(0)}-${Math.min(copper.pct * 0.5, 15).toFixed(0)}%，同时与供应商谈季度锁价协议。`,
          impact: 'high'
        });
      }
    } else if (copper.dir === 'down') {
      insights.push({
        title: '铜价回落利好成本',
        detail: `LME铜价降${Math.abs(copper.pct)}%，原料成本压力缓解，可适当让利抢占市场份额或维持报价增厚毛利。`,
        impact
      });
    }
  }

  // 汇率洞察
  const usdCny = calcChange(findTrend('USD/CNY'));
  if (usdCny) {
    const impact = Math.abs(usdCny.pct) > 3 ? 'high' : Math.abs(usdCny.pct) > 1 ? 'medium' : 'low';
    if (usdCny.dir === 'down') {
      insights.push({
        title: '人民币升值削弱竞争力',
        detail: `USD/CNY从${usdCny.first}降至${usdCny.last}，同等美元报价折合人民币收入减少${Math.abs(usdCny.pct)}%，叠加铜价上涨，双重挤压出口利润。`,
        impact
      });
    } else if (usdCny.dir === 'up') {
      insights.push({
        title: '人民币贬值利好出口',
        detail: `USD/CNY升至${usdCny.last}，同等美元报价折合人民币收入增加${usdCny.pct}%，出口利润空间扩大。`,
        impact
      });
    }
  }

  // 出口额洞察
  const export_ = calcChange(findTrend('出口'));
  if (export_) {
    const impact = export_.pct > 30 ? 'medium' : export_.pct > 10 ? 'low' : 'low';
    if (export_.dir === 'up') {
      insights.push({
        title: '出口额强劲增长',
        detail: `月度出口额从${export_.first}M升至${export_.last}M USD，增幅${export_.pct}%，行业需求旺盛，市场份额扩张窗口期，应加快产能与客户开发。`,
        impact
      });
    } else if (export_.dir === 'down') {
      insights.push({
        title: '出口额下滑需警惕',
        detail: `月度出口额降至${export_.last}M USD，降幅${Math.abs(export_.pct)}%，需排查原因：订单流失、竞争加剧或行业周期下行。`,
        impact: 'medium'
      });
    }
  }

  if (insights.length === 0) {
    console.log('  ⚠️ 无可识别趋势，跳过洞察生成');
    return;
  }

  const result = {
    insights: insights.slice(0, 5),
    generatedAt: new Date().toISOString()
  };
  writeJSON('insights.json', result);
  console.log(`  ✅ 生成 ${result.insights.length} 条洞察（本地启发式）`);
}

// ============================================================
// 主流程
// ============================================================

async function main() {
  console.log('🧠 情报中心数据采集 v3.0 (SearXNG)');
  console.log(`⏰ ${nowLocal}`);
  console.log('─'.repeat(40));

  await updateExchangeRates();
  await updateCopperPrice();
  // updateNews() 已由 Oracle digest 接管，不再从此脚本调用
  await updateCompetitors();
  generateInsights();

  console.log('\n' + '─'.repeat(40));
  console.log('✅ 全部更新完成！');
  console.log(`📂 数据目录: ${DATA_DIR}`);
}

main().catch(err => {
  console.error('❌ 采集失败:', err.message);
  process.exit(1);
});
