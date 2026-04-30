#!/usr/bin/env node
/**
 * Follow-up Engine — 自动跟进引擎 (v2 — Hero Pump 修复版)
 *
 * 功能：
 * 1. 从本地 DB 读取需要跟进的客户（next_follow_up_at <= now）
 * 2. 根据客户当前阶段匹配跟进模板
 * 3. 自动生成跟进邮件并发送
 * 4. 更新 DB 状态（阶段、下次跟进时间、跟进次数）
 *
 * ⭐⭐ 修复（2026-04-25）：
 * - Hero Pumps 不再依赖 Farreach 的 smtp.js CLI
 * - 直接用 nodemailer 发送，读取 hero-pumps/.env
 * - 纯文本正文正确转为 HTML（\n → <br>）
 * - 发件人固定为 "Hero Pump" <sales@heropumps.com.cn>
 * - 跟进模板增强：每个阶段有不同切入角度，支持客户个性化信息
 *
 * 阶段流转：
 * cold_email_sent → (第2/5/10/20天跟进) → closed_won / lost
 * quoted → (第3/7/14/28天跟进) → closed_won / lost
 * sample_sent → (第1/3/7/14天跟进) → negotiating / lost
 */

const fs = require('fs');
const path = require('path');
const { SalesState } = require('../shared/sales-state-db');
const nodemailer = require('/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/imap-smtp-email/node_modules/nodemailer');
const dotenv = require('/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/imap-smtp-email/node_modules/dotenv');

// ==================== 配置 ====================
const SIGNATURE_PATH = '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/hero-pumps/config/signatures/signature-jordan.html';

const PROJECTS = {
  farreach: {
    SMTP_CLI: '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/imap-smtp-email/scripts/smtp.js',
    SIGNATURE: 'jordan',
    FOLLOW_UP_INTERVAL_MIN: 2 * 60 * 1000,
    FOLLOW_UP_INTERVAL_MAX: 3 * 60 * 1000,
    MAX_FOLLOW_UPS: 4,
    COOLDOWN_DAYS: 90,
    STRATEGIES: {
      cold_email_sent: {
        stages: ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'],
        intervals: [2, 5, 10, 20],
      },
      quoted: {
        stages: ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'],
        intervals: [3, 7, 14, 28],
      },
      sample_sent: {
        stages: ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'],
        intervals: [1, 3, 7, 14],
      }
    }
  },
  'hero-pumps': {
    // ⭐ 2026-04-25 修复：不再使用 Farreach smtp.js CLI
    // 直接用 nodemailer 发送，读取 hero-pumps/.env
    SMTP_CLI: null,  // deprecated
    ENV_PATH: path.join(__dirname, '../hero-pumps/.env'),
    SIGNATURE_PATH: SIGNATURE_PATH,
    SMTP_FROM: '"Hero Pump" <sales@heropumps.com.cn>',
    FOLLOW_UP_INTERVAL_MIN: 2 * 60 * 1000,
    FOLLOW_UP_INTERVAL_MAX: 3 * 60 * 1000,
    MAX_FOLLOW_UPS: 4,
    COOLDOWN_DAYS: 90,
    STRATEGIES: {
      cold_email_sent: {
        stages: ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'],
        intervals: [2, 5, 10, 20],
      },
      quoted: {
        stages: ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'],
        intervals: [3, 7, 14, 28],
      },
      sample_sent: {
        stages: ['follow_up_1', 'follow_up_2', 'follow_up_3', 'follow_up_4'],
        intervals: [1, 3, 7, 14],
      }
    }
  }
};

// ==================== 日志 ====================
class Logger {
  constructor() {
    const logDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    this.logFile = path.join(logDir, `followup-${new Date().toISOString().split('T')[0]}.log`);
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

// ==================== Hero Pump 跟进模板（增强版） ====================
// 每个阶段有不同切入角度，支持客户个性化信息

const HERO_PUMP_TEMPLATES = {
  follow_up_1: (customer) => {
    const name = customer.contact_name || 'there';
    const company = customer.company || 'your company';
    const country = customer.country || '';
    const countryStr = country ? ` in ${country}` : '';
    return {
      subject: `Quick follow-up — Circulator pumps for ${company}`,
      body: `Hi ${name},\n\nJust checking in on my email from earlier this week about variable frequency circulator pumps for ${company}${countryStr}.\n\nQuick refresher: our pumps are ErP compliant (EEI ≤ 0.23), TÜV SÜD certified, and priced 30-40% below Grundfos and Wilo. Direct from our factory in Zhejiang.\n\nWould you be open to receiving a product sheet and sample quote?\n\nBest regards,`
    };
  },
  follow_up_2: (customer) => {
    const name = customer.contact_name || 'there';
    const company = customer.company || 'your company';
    return {
      subject: `Distributor savings — Hero Pump for ${company}`,
      body: `Hi ${name},\n\nI know things get busy. I wanted to share something that might be relevant for ${company}.\n\nSeveral European distributors in the HVAC space have switched to our variable frequency circulator pumps and reported:\n- 30-40% cost savings vs. local brands\n- Same ErP EEI ≤ 0.23 compliance\n- TÜV SÜD and CE certified\n- OEM support for private labeling\n\nNo pressure — just thought it's worth a quick conversation. Interested in seeing specs and pricing?\n\nBest regards,`
    };
  },
  follow_up_3: (customer) => {
    const name = customer.contact_name || 'there';
    const company = customer.company || 'your company';
    return {
      subject: `Product sheet & pricing — Hero Pump`,
      body: `Hi ${name},\n\nI've prepared a brief product overview for ${company} covering:\n\n- Model range: 25W to 250W variable frequency circulator pumps\n- ErP EEI ≤ 0.23 (top tier energy efficiency)\n- TÜV SÜD, CE, RoHS certified\n- OEM/private label support\n- Factory-direct pricing: 30-40% below Grundfos/Wilo\n\nWould you like me to send over the product sheet along with a sample quote for your reference? No commitment needed.\n\nBest regards,`
    };
  },
  follow_up_4: (customer) => {
    const name = customer.contact_name || 'there';
    const company = customer.company || 'your company';
    return {
      subject: `Last check-in — Hero Pump`,
      body: `Hi ${name},\n\nLast email from me — I don't want to clutter your inbox.\n\nIf ${company} ever needs a reliable circulator pump supplier with competitive factory pricing and full European compliance (ErP, TÜV, CE), feel free to reach out anytime.\n\nWishing you all the best.\n\nBest regards,`
    };
  }
};

// Farreach 模板保持不变
const FARREACH_TEMPLATES = {
  follow_up_1: (customer) => ({
    subject: `Quick follow-up — Cable supply for ${customer.company}`,
    body: `Hi ${customer.contact_name || 'there'},\n\nJust checking in on my previous email about cable supply for ${customer.company}.\n\nWe're an HDMI-certified factory with 18 years experience, dual plants in China + Vietnam. Happy to send a sample quote if you'd like to compare pricing.\n\n`
  }),
  follow_up_2: (customer) => ({
    subject: `Following up — ${customer.company}`,
    body: `Hi ${customer.contact_name || 'there'},\n\nI know things get busy. Quick reminder — we supply HDMI, DP, USB, and LAN cables at factory-direct prices.\n\nMost of our clients saved 25-35% going direct. Want me to send our catalog for your reference?\n\n`
  }),
  follow_up_3: (customer) => ({
    subject: `Catalog for ${customer.company}`,
    body: `Hi ${customer.contact_name || 'there'},\n\nI've attached our 2026 product catalog — no strings attached, just for your reference.\n\nIf any products catch your eye, I can prepare a quick quote. Sample lead time: 7-15 days, bulk orders: 30-45 days.\n\n`
  }),
  follow_up_4: (customer) => ({
    subject: `Last check-in — Farreach Electronic`,
    body: `Hi ${customer.contact_name || 'there'},\n\nLast email from me — I don't want to clutter your inbox.\n\nIf you ever need a reliable cable supplier with competitive factory pricing, feel free to reach out. Our catalog is always available.\n\nWishing you all the best.\n\n`
  })
};

// ==================== Hero Pump SMTP Transporter ====================

let heroTransporter = null;

function getHeroTransporter() {
  if (heroTransporter) return heroTransporter;

  const envPath = PROJECTS['hero-pumps'].ENV_PATH;
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  heroTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.qiye.aliyun.com',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return heroTransporter;
}

/**
 * 纯文本 → HTML 转换。
 * 保留段落间距，\n → <br>。
 */
function textToHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ==================== 邮件发送 ====================
class FollowUpSender {
  async send(project, email, subject, body, dryRun = false) {
    if (dryRun) {
      logger.info('DRY RUN', { project, to: email, subject, body: body.substring(0, 100) + '...' });
      return { success: true, dryRun: true };
    }

    const config = PROJECTS[project];
    if (!config) { logger.error(`Unknown project: ${project}`); return { success: false }; }

    // ⭐ Hero Pumps: 直接用 nodemailer 发送，不再调用 Farreach smtp.js
    if (project === 'hero-pumps') {
      return this._sendHeroPumps(email, subject, body);
    }

    // Farreach: 保持原有 CLI 调用
    try {
      let cmd = `node "${config.SMTP_CLI}" send --to "${email}" --subject "${subject}" --body "${body.replace(/"/g, '\\"')}" --signature ${config.SIGNATURE} --confirm-send`;
      
      let execOptions = {};
      if (config.ENV_PATH && fs.existsSync(config.ENV_PATH)) {
        const envContent = fs.readFileSync(config.ENV_PATH, 'utf8');
        const envVars = {};
        envContent.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split('=');
            envVars[key.trim()] = valueParts.join('=').trim();
          }
        });
        execOptions.env = { ...process.env, ...envVars };
      }

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      const { stdout, stderr } = await execAsync(cmd, execOptions);
      logger.success(`已发送跟进: ${email}`, { subject });
      return { success: true, stdout, stderr };
    } catch(e) {
      logger.error(`发送失败: ${email}`, { error: e.message });
      return { success: false, error: e.message };
    }
  }

  async _sendHeroPumps(email, subject, body) {
    try {
      let signatureHtml = '';
      try {
        signatureHtml = fs.readFileSync(SIGNATURE_PATH, 'utf8');
      } catch(e) {
        logger.warn('签名文件未找到，使用默认签名', { error: e.message });
        signatureHtml = '<br><br>Jaden Yeung<br>Sales Manager | Hero Pump — Zhejiang Huiruo Pump Industry<br>sales@heropumps.com.cn<br>WhatsApp: +86 136 8034 2402<br>www.heropumps.com.cn';
      }

      const htmlBody = textToHtml(body) + '<br><br>' + signatureHtml;
      const transporter = getHeroTransporter();

      await transporter.sendMail({
        from: PROJECTS['hero-pumps'].SMTP_FROM,
        to: email,
        subject: subject,
        html: htmlBody,
      });

      logger.success(`已发送跟进: ${email}`, { subject });
      return { success: true };
    } catch(e) {
      logger.error(`Hero Pump 发送失败: ${email}`, { error: e.message });
      return { success: false, error: e.message };
    }
  }
}

// ==================== 主引擎 ====================
class FollowUpEngine {
  constructor() {
    this.sender = new FollowUpSender();
  }

  getTemplates(project) {
    if (project === 'hero-pumps') return HERO_PUMP_TEMPLATES;
    if (project === 'farreach') return FARREACH_TEMPLATES;
    return null;
  }

  async processProject(project, dryRun = false) {
    const config = PROJECTS[project];
    const templates = this.getTemplates(project);

    if (!config || !templates) {
      logger.error(`项目配置缺失: ${project}`);
      return { total: 0, success: 0, failed: 0 };
    }

    // 获取需要跟进的客户
    const dueCustomers = SalesState.getDueFollowUps(project);
    logger.info(`[${project}] 需要跟进: ${dueCustomers.length} 个客户`);

    if (dueCustomers.length === 0) return { total: 0, success: 0, failed: 0 };

    const results = { total: 0, success: 0, failed: 0 };

    for (let i = 0; i < dueCustomers.length; i++) {
      const customer = dueCustomers[i];
      results.total++;

      try {
        const followUpIdx = customer.follow_up_count; // 1-indexed
        const stageKey = `follow_up_${followUpIdx}`;
        const template = templates[stageKey];

        if (!template) {
          // 超过最大跟进次数 → 标记为冷宫
          SalesState.updateStage(project, customer.email, {
            is_cold: 1,
            cold_until: new Date(Date.now() + config.COOLDOWN_DAYS * 86400000).toISOString(),
            reply_status: 'no_reply_max_followups'
          });
          logger.info(`[${project}] ${customer.email} 已进入冷宫`, { follow_up_count: followUpIdx });
          results.success++;
          continue;
        }

        // 生成跟进邮件
        const { subject, body } = template(customer);

        // 发送
        const sendResult = await this.sender.send(project, customer.email, subject, body, dryRun);

        if (sendResult.success) {
          results.success++;
          if (!dryRun) {
            const nextInterval = config.STRATEGIES[customer.current_stage]?.intervals?.[followUpIdx];
            const nextFollowUp = nextInterval
              ? new Date(Date.now() + nextInterval * 86400000).toISOString()
              : null;

            SalesState.logEmail(project, customer.email, customer.company, null, subject, stageKey, followUpIdx + 1);
            SalesState.updateStage(project, customer.email, {
              follow_up_count: followUpIdx + 1,
              next_follow_up_at: nextFollowUp,
              last_contact_at: new Date().toISOString()
            });

            logger.info(`[${project}] 已记录跟进`, { email: customer.email, stage: stageKey, next: nextFollowUp });
          }
        } else {
          results.failed++;
        }

        // 间隔发送
        if (i < dueCustomers.length - 1) {
          const delay = Math.random() * (config.FOLLOW_UP_INTERVAL_MAX - config.FOLLOW_UP_INTERVAL_MIN) + config.FOLLOW_UP_INTERVAL_MIN;
          logger.info(`等待 ${Math.round(delay / 1000)}s`);
          await new Promise(r => setTimeout(r, delay));
        }
      } catch(e) {
        logger.error(`处理失败: ${customer.email}`, { error: e.message });
        results.failed++;
      }
    }

    return results;
  }

  async run(options = {}) {
    const dryRun = options.dryRun || false;
    const projects = options.projects || Object.keys(PROJECTS);

    logger.info('========================================');
    logger.info('Follow-up Engine 启动');
    logger.info(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
    logger.info(`项目: ${projects.join(', ')}`);
    logger.info('========================================');

    const allResults = {};
    for (const project of projects) {
      allResults[project] = await this.processProject(project, dryRun);
    }

    logger.info('执行完成', allResults);
  }
}

// ==================== CLI ====================
async function main() {
  const args = process.argv.slice(2);
  const options = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') options.dryRun = true;
    else if (args[i] === '--project' && args[i + 1]) { options.projects = [args[i + 1]]; i++; }
    else if (['--help', '-h'].includes(args[i])) {
      console.log(`Follow-up Engine v2
用法: node follow-up-engine.js [选项]
选项:
  --dry-run             预览模式
  --project <name>      指定项目 (farreach / hero-pumps)
  --help, -h            帮助

示例:
  node follow-up-engine.js --dry-run
  node follow-up-engine.js --project hero-pumps`);
      process.exit(0);
    }
  }

  const engine = new FollowUpEngine();
  await engine.run(options);
}

if (require.main === module) {
  main().catch(e => { logger.error('程序异常', { error: e.message }); process.exit(1); });
}

module.exports = { FollowUpEngine, HERO_PUMP_TEMPLATES };
