#!/usr/bin/env node
/**
 * ⚠️ DEPRECATED — 此文件已被 daily-run-v2.js + smtp-send-batch-v2.js 取代
 *
 * Hero Pumps Orchestrator (已废弃)
 * 
 * 废弃原因：
 * - 使用 Farreach smtp.js CLI 发件，导致发件人错误（sale-9@farreach-electronic.com）
 * - HTML 邮件中 \n 不渲染为换行
 * - 冷启动和 follow-up 邮件全部用错配置
 * 
 * 新流程：
 * 1. daily-run-v2.js  → 生成 IRON cold email + follow-up prompts
 * 2. WILSON spawn IRON → 写邮件草稿到 campaign-tracker/templates/
 * 3. smtp-send-batch-v2.js → 扫描 templates/ 发送所有未发送草稿（nodemailer 直发）
 * 
 * 保留此文件仅供历史参考。请勿继续使用。
 * 
 * 旧数据流：CSV 线索 → 筛选 → 发邮件 → 写入共享 SQLite DB
 * DB 路径: ../shared/state/sales-state.db
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { SalesState } = require('../../shared/sales-state-db');

const execAsync = promisify(exec);
const PROJECT = 'hero-pumps';

// ==================== 配置 ====================
const CONFIG = {
  SMTP_CLI: '/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/smtp.js',
  LEADS_DIR: path.join(__dirname, '../leads'),
  SIGNATURE: 'hero-jordan',
  TEMPLATES_DIR: path.join(__dirname, '../config/templates'),
  LOG_DIR: path.join(__dirname, 'logs'),
  // 发送间隔 3-8 分钟（随机）
  SEND_INTERVAL_MIN: 3 * 60 * 1000,
  SEND_INTERVAL_MAX: 8 * 60 * 1000,
  COOLDOWN_DAYS: 90,
  // 跟进 3 次后打入冷宫
  MAX_FOLLOW_UPS: 3,
  // 稳定期 10 封/天
  DEFAULT_LIMIT: 10,
  STABLE_LIMIT: 10,
  // 发送窗口：欧洲当地时间 7:00-17:00
  // 中欧 CET (UTC+1/UTC+2): 北京时间 14:00-00:00 (冬令时) / 13:00-01:00 (夏令时)
  // 东欧 EET (UTC+2/UTC+3): 北京时间 13:00-23:00 (冬令时) / 12:00-00:00 (夏令时)
  SEND_WINDOW_EU_START: 7,   // 欧洲当地开始时间
  SEND_WINDOW_EU_END: 17,    // 欧洲当地结束时间
};

// 阶段策略：跟进间隔天数
const FOLLOW_UP_SCHEDULE = {
  cold_email_sent: [3, 7, 14],  // +3天 / +7天 / +14天后打入冷宫
  quoted: [3, 7, 14],
  sample_sent: [1, 3, 7],
};

// ==================== 日志 ====================
class Logger {
  constructor() {
    if (!fs.existsSync(CONFIG.LOG_DIR)) fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
    this.logFile = path.join(CONFIG.LOG_DIR, `orchestrator-${new Date().toISOString().split('T')[0]}.log`);
  }
  log(level, msg, data) {
    const ts = new Date().toISOString();
    const entry = `[${ts}] [${level}] ${msg}`;
    console.log(entry);
    if (data) console.log(JSON.stringify(data, null, 2));
    fs.appendFileSync(this.logFile, entry + '\n');
    if (data) fs.appendFileSync(this.logFile, JSON.stringify(data, null, 2) + '\n');
  }
  info(m, d) { this.log('INFO', m, d); }
  warn(m, d) { this.log('WARN', m, d); }
  error(m, d) { this.log('ERROR', m, d); }
  success(m, d) { this.log('SUCCESS', m, d); }
}
const logger = new Logger();

// ==================== CSV 解析 ====================
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').trim();
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const leads = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length < headers.length) continue;
    const lead = {};
    headers.forEach((h, idx) => { lead[h] = (values[idx] || '').replace(/^["']|["']$/g, '').trim(); });
    leads.push(lead);
  }
  return leads;
}

function parseCSVLine(line) {
  const values = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { values.push(current); current = ''; }
    else current += ch;
  }
  values.push(current);
  return values;
}

// ==================== 模板管理 ====================
class TemplateManager {
  constructor() { this.templates = this.loadTemplates(); }

  loadTemplates() {
    const templates = [];
    if (!fs.existsSync(CONFIG.TEMPLATES_DIR)) return templates;
    for (const file of fs.readdirSync(CONFIG.TEMPLATES_DIR).filter(f => f.endsWith('.json'))) {
      try { templates.push(JSON.parse(fs.readFileSync(path.join(CONFIG.TEMPLATES_DIR, file), 'utf8'))); }
      catch(e) { logger.error(`模板加载失败: ${file}`); }
    }
    return templates;
  }

  matchTemplate(lead) {
    const text = `${lead.industry || ''} ${lead.company || ''}`.toLowerCase();
    for (const t of this.templates) {
      for (const kw of (t.industry_keywords || [])) {
        if (text.includes(kw.toLowerCase())) return t;
      }
    }
    return this.templates.find(t => t.id === 'template-general') || this.templates[0];
  }

  generateEmail(template, lead) {
    const contactName = lead.contact_name || 'there';
    const company = lead.company || 'your company';
    const countryMap = {
      '波兰': 'Poland', '德国': 'Germany', '法国': 'France', '意大利': 'Italy',
      '西班牙': 'Spain', '荷兰': 'Netherlands', '比利时': 'Belgium', '瑞典': 'Sweden',
      '挪威': 'Norway', '丹麦': 'Denmark', '芬兰': 'Finland', '捷克': 'Czech Republic',
      '奥地利': 'Austria', '瑞士': 'Switzerland', '英国': 'United Kingdom',
      '爱尔兰': 'Ireland', '葡萄牙': 'Portugal', '匈牙利': 'Hungary',
      '罗马尼亚': 'Romania', '希腊': 'Greece', '斯洛伐克': 'Slovakia',
      '斯洛文尼亚': 'Slovenia', '克罗地亚': 'Croatia', '保加利亚': 'Bulgaria',
      '爱沙尼亚': 'Estonia', '拉脱维亚': 'Latvia', '立陶宛': 'Lithuania'
    };
    const country = countryMap[lead.country] || lead.country || '';
    const subject = template.subject.replace(/{contact_name}/g, contactName).replace(/{company_name}/g, company).replace(/{country}/g, country);
    const body = template.body.replace(/{contact_name}/g, contactName).replace(/{company_name}/g, company).replace(/{country}/g, country);
    return { subject, body };
  }
}

// ==================== 邮件发送（已修复：nodemailer 直发） ====================
const nodemailer = require('/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/node_modules/nodemailer');
const dotenv = require('/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/node_modules/dotenv');

// 读取项目 .env 配置
const heroEnvPath = path.join(__dirname, '../.env');
if (fs.existsSync(heroEnvPath)) {
  dotenv.config({ path: heroEnvPath });
}

function createHeroTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qiye.aliyun.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true' || true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

class EmailSender {
  async sendEmail(to, subject, body, dryRun = false) {
    if (dryRun) {
      logger.info('DRY RUN', { to, subject, body: body.substring(0, 100) + '...' });
      return { success: true, dryRun: true };
    }
    try {
      // ⭐ 修复：用 nodemailer 直发，不再调用 Farreach smtp.js CLI
      const htmlBody = body
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br>');

      const transporter = createHeroTransporter();
      await transporter.sendMail({
        from: '"Hero Pump" <' + (process.env.SMTP_FROM || 'sales@heropumps.com') + '>',
        to: to,
        subject: subject,
        html: htmlBody,
      });
      transporter.close();

      logger.success(`已发送: ${to}`);
      return { success: true };
    } catch(e) {
      logger.error(`发送失败: ${to}`, { error: e.message });
      return { success: false, error: e.message };
    }
  }
}

// ==================== 主调度器 ====================
class HeroOrchestrator {
  constructor() {
    this.templateManager = new TemplateManager();
    this.emailSender = new EmailSender();
  }

  loadLeads() {
    if (!fs.existsSync(CONFIG.LEADS_DIR)) { logger.warn('线索目录不存在'); return []; }
    const csvFiles = fs.readdirSync(CONFIG.LEADS_DIR).filter(f => f.endsWith('.csv'));
    if (csvFiles.length === 0) { logger.warn('没有 CSV 文件'); return []; }
    const allLeads = [];
    for (const file of csvFiles) {
      const leads = parseCSV(path.join(CONFIG.LEADS_DIR, file));
      logger.info(`加载 ${file}: ${leads.length} 条`);
      allLeads.push(...leads);
    }
    return allLeads;
  }

  filterLeads(leads) {
    const filtered = [];
    const stats = { total: leads.length, no_email: 0, sent: 0, cold: 0, passed: 0 };
    for (const lead of leads) {
      const email = (lead.email || '').toLowerCase().trim();
      if (!email || !email.includes('@')) { stats.no_email++; continue; }
      // 检查 DB
      const record = SalesState.getCustomer(PROJECT, email);
      if (record) {
        if (record.is_cold) { stats.cold++; continue; }
        if (record.follow_up_count >= CONFIG.MAX_FOLLOW_UPS) { stats.cold++; continue; }
      }
      filtered.push(lead);
      stats.passed++;
    }
    logger.info('筛选完成', stats);
    return filtered;
  }

  calcNextFollowUp(stage, followUpCount) {
    const schedule = FOLLOW_UP_SCHEDULE[stage] || FOLLOW_UP_SCHEDULE.cold_email_sent;
    const idx = Math.min(followUpCount, schedule.length) - 1;
    if (idx < 0 || idx >= schedule.length) return null;
    const next = new Date();
    next.setDate(next.getDate() + schedule[idx]);
    return next.toISOString();
  }

  async processLeads(leads, limit, dryRun) {
    const results = { total: 0, success: 0, failed: 0 };
    for (let i = 0; i < Math.min(leads.length, limit); i++) {
      const lead = leads[i];
      results.total++;
      try {
        const email = (lead.email || '').toLowerCase().trim();
        const template = this.templateManager.matchTemplate(lead);
        const { subject, body } = this.templateManager.generateEmail(template, lead);
        const sendResult = await this.emailSender.sendEmail(email, subject, body, dryRun);

        if (sendResult.success) {
          results.success++;
          if (!dryRun) {
            const followUpCount = 1;
            const nextFollowUp = this.calcNextFollowUp('cold_email_sent', followUpCount);
            SalesState.logEmail(PROJECT, email, lead.company, template.id, subject, 'cold_email_sent', followUpCount);
            SalesState.upsertCustomer(PROJECT, email, {
              company: lead.company, contact_name: lead.contact_name,
              country: lead.country, stage: 'cold_email_sent',
              follow_up_count: followUpCount, next_follow_up_at: nextFollowUp
            });
            SalesState.addLead(PROJECT, {
              email, company: lead.company, contact_name: lead.contact_name,
              country: lead.country, industry: lead.industry,
              website: lead.website, source: lead.source || 'hunter.io'
            });
            logger.info(`已记录到 DB: ${email}`, { stage: 'cold_email_sent', next: nextFollowUp });
          }
        } else {
          results.failed++;
        }

        if (i < Math.min(leads.length, limit) - 1) {
          const delay = Math.random() * (CONFIG.SEND_INTERVAL_MAX - CONFIG.SEND_INTERVAL_MIN) + CONFIG.SEND_INTERVAL_MIN;
          logger.info(`等待 ${Math.round(delay / 1000)}s`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch(e) {
        logger.error(`处理失败: ${lead.company}`, { error: e.message });
        results.failed++;
      }
    }
    return results;
  }

  async run(options = {}) {
    const limit = options.limit || CONFIG.DEFAULT_LIMIT;
    const dryRun = options.dryRun || false;

    logger.info('========================================');
    logger.info('Hero Pumps Orchestrator 启动');
    logger.info(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
    logger.info(`限制: ${limit} 封`);
    logger.info('========================================');

    const leads = this.loadLeads();
    if (leads.length === 0) { logger.warn('无线索'); return; }

    const filtered = this.filterLeads(leads);
    if (filtered.length === 0) { logger.warn('无符合条件线索'); return; }

    const results = await this.processLeads(filtered, limit, dryRun);
    logger.info('执行完成', results);
  }
}

// ==================== CLI ====================
async function main() {
  const args = process.argv.slice(2);
  const options = { limit: CONFIG.DEFAULT_LIMIT, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) { options.limit = parseInt(args[i + 1]); i++; }
    else if (args[i] === '--dry-run') { options.dryRun = true; }
    else if (['--help', '-h'].includes(args[i])) {
      console.log(`Hero Pumps Orchestrator\n用法: node hero-orchestrator.js [选项]\n选项:\n  --limit N       发送量上限 (默认: ${CONFIG.DEFAULT_LIMIT})\n  --dry-run       预览模式\n  --help, -h      帮助\n\n示例:\n  node hero-orchestrator.js --limit 10 --dry-run\n  node hero-orchestrator.js --limit 20`);
      process.exit(0);
    }
  }
  const orchestrator = new HeroOrchestrator();
  await orchestrator.run(options);
}

if (require.main === module) {
  main().catch(e => { logger.error('程序异常', { error: e.message }); process.exit(1); });
}

module.exports = { HeroOrchestrator };
