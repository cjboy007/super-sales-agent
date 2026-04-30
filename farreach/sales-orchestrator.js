#!/usr/bin/env node
/**
 * Farreach Orchestrator — 自动开发信发送系统
 * 
 * 流程：
 * 1. 从 OKKI 拉客户 → 筛选 → 匹配模板 → 发邮件
 * 2. 发送记录写入本地 SQLite 数据库
 * 3. Follow-up Engine 定期读取 DB 触发自动跟进
 * 4. Reply Processor 读取 DB 匹配回复
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { SalesState } = require('../shared/sales-state-db');

const execAsync = promisify(exec);
const PROJECT = 'farreach';

// ==================== 配置 ====================
const CONFIG = {
  OKKI_CLI: '/Users/wilson/.openclaw/workspace/xiaoman-okki/api/okki_cli.py',
  SMTP_CLI: '/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/smtp.js',
  TEMPLATES_DIR: path.join(__dirname, 'config/templates'),
  COUNTRIES_FILE: path.join(__dirname, 'config/okki-countries.json'),
  LOG_DIR: path.join(__dirname, 'logs'),
  SEND_INTERVAL_MIN: 2 * 60 * 1000, // 2 分钟
  SEND_INTERVAL_MAX: 3 * 60 * 1000, // 3 分钟
  COOLDOWN_DAYS: 90,
  MAX_FOLLOW_UPS: 4,
  DEFAULT_LIMIT: 20,
  DETAIL_BATCH: 5
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

// ==================== 客户筛选 ====================
class CustomerFilter {
  constructor() {
    try {
      this.targetCountries = JSON.parse(fs.readFileSync(CONFIG.COUNTRIES_FILE, 'utf8')).target_countries || [];
    } catch(e) {
      this.targetCountries = [];
    }
  }

  isTargetCountry(customer) {
    const text = `${customer.country || ''} ${customer.country_name || ''}`.toLowerCase();
    return this.targetCountries.some(tc => text.includes(tc.toLowerCase()));
  }

  hasValidEmail(customer) {
    const email = customer.email || '';
    return email && email.includes('@') && !email.includes('test') && !email.includes('demo');
  }

  shouldContact(customer) {
    const email = customer.email || '';
    if (!this.hasValidEmail(customer)) return { pass: false, reason: 'no_valid_email' };
    if (!this.isTargetCountry(customer)) return { pass: false, reason: 'not_target_country' };

    // 检查本地 DB
    if (SalesState.isEmailSent(PROJECT, email)) {
      const record = SalesState.getCustomer(PROJECT, email);
      if (record && record.is_cold) return { pass: false, reason: 'in_cooldown' };
      if (record && record.follow_up_count >= CONFIG.MAX_FOLLOW_UPS) return { pass: false, reason: 'max_follow_ups' };
    }
    if (customer.follow_up_count >= CONFIG.MAX_FOLLOW_UPS) return { pass: false, reason: 'max_follow_ups_okki' };
    return { pass: true };
  }
}

// ==================== 模板管理 ====================
class TemplateManager {
  constructor() {
    this.templates = this.loadTemplates();
  }

  loadTemplates() {
    const templates = [];
    if (!fs.existsSync(CONFIG.TEMPLATES_DIR)) return templates;
    for (const file of fs.readdirSync(CONFIG.TEMPLATES_DIR).filter(f => f.endsWith('.json'))) {
      try { templates.push(JSON.parse(fs.readFileSync(path.join(CONFIG.TEMPLATES_DIR, file), 'utf8'))); }
      catch(e) { logger.error(`模板加载失败: ${file}`); }
    }
    logger.info(`已加载 ${templates.length} 个模板`);
    return templates;
  }

  matchTemplate(customer) {
    const text = customer._search_text || `${customer.name || ''} ${customer.industry || ''} ${customer.remark || ''}`.toLowerCase();
    for (const t of this.templates) {
      for (const kw of (t.industry_keywords || [])) {
        if (text.includes(kw.toLowerCase())) return t;
      }
    }
    return this.templates.find(t => t.id === 'template-d-general') || this.templates[0];
  }

  generateEmail(template, customer) {
    let contactName = customer.contact_name || '';
    if (!contactName || /contact|info|admin/i.test(contactName)) contactName = 'there';
    const companyName = customer.name || 'your company';
    const country = customer.country_name || customer.country || '';
    const industry = customer.industry || 'your industry';

    const subject = template.subject.replace(/{contact_name}/g, contactName).replace(/{company_name}/g, companyName).replace(/{country}/g, country).replace(/{industry}/g, industry);
    const body = template.body.replace(/{contact_name}/g, contactName).replace(/{company_name}/g, companyName).replace(/{country}/g, country).replace(/{industry}/g, industry);
    return { subject, body };
  }
}

// ==================== 邮件发送 ====================
class EmailSender {
  async sendEmail(to, subject, body, dryRun = false) {
    if (dryRun) {
      logger.info('DRY RUN', { to, subject, body: body.substring(0, 100) + '...' });
      return { success: true, dryRun: true };
    }
    try {
      const cmd = `node "${CONFIG.SMTP_CLI}" send --to "${to}" --subject "${subject}" --body "${body.replace(/"/g, '\\"')}" --signature jordan --confirm-send`;
      const { stdout, stderr } = await execAsync(cmd);
      logger.success(`已发送: ${to}`);
      return { success: true, stdout, stderr };
    } catch(e) {
      logger.error(`发送失败: ${to}`, { error: e.message });
      return { success: false, error: e.message };
    }
  }
}

// ==================== OKKI 数据获取 ====================
class OkkiFetcher {
  async fetchCustomers() {
    logger.info('正在从 OKKI 拉取客户列表...');
    try {
      const { stdout } = await execAsync(`python3 "${CONFIG.OKKI_CLI}" query_companies`);
      const result = JSON.parse(stdout);
      let companies = result.data || result.companies || [];
      if (!Array.isArray(companies)) return [];
      logger.info(`拉取 ${companies.length} 个客户，正在获取详情...`);

      const enriched = [];
      for (let i = 0; i < companies.length; i++) {
        try {
          const { stdout: detailOut } = await execAsync(`python3 "${CONFIG.OKKI_CLI}" query_company ${companies[i].company_id}`);
          const d = JSON.parse(detailOut);
          if (d.code === 200 && d.data) enriched.push(this.enrich(d.data, companies[i]));
          if ((i + 1) % CONFIG.DETAIL_BATCH === 0) await new Promise(r => setTimeout(r, 1000));
        } catch(e) {
          logger.warn(`获取 ${companies[i].name} 详情失败`, { error: e.message });
        }
      }
      logger.info(`成功获取 ${enriched.length} 个客户详情`);
      return enriched;
    } catch(e) {
      logger.error('拉取失败', { error: e.message });
      return [];
    }
  }

  enrich(detail, basic) {
    const d = detail;
    let email = '', contactName = '';
    if (d.customers && d.customers.length > 0) {
      const main = d.customers.find(c => c.main_customer_flag === 1) || d.customers[0];
      email = main.email || '';
      contactName = main.name || '';
    }
    return {
      company_id: d.company_id,
      name: d.name || basic.name || '',
      short_name: d.short_name || '',
      country: d.country || '',
      country_name: d.country_name || '',
      province: d.province || '', city: d.city || '',
      email, contact_name: contactName,
      homepage: d.homepage || '', remark: d.remark || '',
      origin_name: d.origin_name || '',
      tag_names: (d.tag || []).map(t => t.tag_name || ''),
      industry: (d.category_ids || []).join(', ') || '',
      follow_up_count: parseInt(d.trail_status?.info_value || '0', 10) || 0,
      _search_text: `${d.name || ''} ${d.remark || ''} ${(d.category_ids || []).join(' ')} ${d.homepage || ''}`.toLowerCase()
    };
  }
}

// ==================== 主调度器 ====================
class FarreachOrchestrator {
  constructor() {
    this.filter = new CustomerFilter();
    this.templateMgr = new TemplateManager();
    this.emailSender = new EmailSender();
    this.okkiFetcher = new OkkiFetcher();
  }

  // 计算下次跟进时间（基于阶段策略）
  calcNextFollowUp(stage, followUpCount) {
    const strategies = {
      cold_email_sent: [2, 5, 10, 20],    // 第 2/5/10/20 天跟进
      quoted: [3, 7, 14, 28],
      sample_sent: [1, 3, 7, 14],
      negotiating: [3, 7, 14],
    };
    const schedule = strategies[stage] || strategies.cold_email_sent;
    const dayIndex = Math.min(followUpCount, schedule.length) - 1;
    if (dayIndex < 0 || dayIndex >= schedule.length) return null; // 超过最大跟进次数
    
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + schedule[dayIndex]);
    return nextDate.toISOString();
  }

  async processCustomers(customers, limit, dryRun) {
    const results = { total: 0, success: 0, failed: 0, skipped: 0 };

    for (let i = 0; i < Math.min(customers.length, limit); i++) {
      const customer = customers[i];
      results.total++;

      try {
        const template = this.templateMgr.matchTemplate(customer);
        const { subject, body } = this.templateMgr.generateEmail(template, customer);
        const email = customer.email;

        const sendResult = await this.emailSender.sendEmail(email, subject, body, dryRun);

        if (sendResult.success) {
          results.success++;

          if (!dryRun) {
            const followUpCount = 1;
            const nextFollowUp = this.calcNextFollowUp('cold_email_sent', followUpCount);

            // 写入本地数据库
            SalesState.logEmail(PROJECT, email, customer.name, template.id, subject, 'cold_email_sent', followUpCount);
            SalesState.upsertCustomer(PROJECT, email, {
              company: customer.name,
              contact_name: customer.contact_name,
              country: customer.country_name || customer.country,
              stage: 'cold_email_sent',
              follow_up_count: followUpCount,
              next_follow_up_at: nextFollowUp
            });

            // 添加线索到 DB
            SalesState.addLead(PROJECT, {
              email, company: customer.name, contact_name: customer.contact_name,
              country: customer.country_name || customer.country,
              industry: customer.industry, website: customer.homepage, source: 'okki_aireach'
            });

            logger.info(`已记录到 DB: ${email}`, { stage: 'cold_email_sent', next_follow_up: nextFollowUp });
          }
        } else {
          results.failed++;
        }

        // 间隔发送
        if (i < Math.min(customers.length, limit) - 1) {
          const delay = Math.random() * (CONFIG.SEND_INTERVAL_MAX - CONFIG.SEND_INTERVAL_MIN) + CONFIG.SEND_INTERVAL_MIN;
          logger.info(`等待 ${Math.round(delay / 1000)}s`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch(e) {
        logger.error(`处理失败: ${customer.name}`, { error: e.message });
        results.failed++;
      }
    }
    return results;
  }

  async run(options = {}) {
    const limit = options.limit || CONFIG.DEFAULT_LIMIT;
    const dryRun = options.dryRun || false;

    logger.info('========================================');
    logger.info('Farreach Orchestrator 启动');
    logger.info(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
    logger.info(`限制: ${limit} 封`);
    logger.info('========================================');

    const customers = await this.okkiFetcher.fetchCustomers();
    if (customers.length === 0) { logger.warn('无客户数据'); return; }

    const filtered = [];
    const stats = { total: customers.length, no_email: 0, not_target_country: 0, in_cooldown: 0, max_follow_ups: 0, passed: 0 };
    for (const c of customers) {
      const result = this.filter.shouldContact(c);
      if (result.pass) { filtered.push(c); stats.passed++; }
      else { stats[result.reason] = (stats[result.reason] || 0) + 1; }
    }
    logger.info('筛选完成', stats);

    if (filtered.length === 0) { logger.warn('无符合条件客户'); return; }

    const results = await this.processCustomers(filtered, limit, dryRun);
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
      console.log(`Farreach Orchestrator
用法: node sales-orchestrator.js [选项]
选项:
  --limit N       发送量上限 (默认: ${CONFIG.DEFAULT_LIMIT})
  --dry-run       预览模式
  --help, -h      帮助

示例:
  node sales-orchestrator.js --limit 10 --dry-run
  node sales-orchestrator.js --limit 20`);
      process.exit(0);
    }
  }

  const orchestrator = new FarreachOrchestrator();
  await orchestrator.run(options);
}

if (require.main === module) {
  main().catch(e => { logger.error('程序异常', { error: e.message }); process.exit(1); });
}

module.exports = { FarreachOrchestrator };
