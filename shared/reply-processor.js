#!/usr/bin/env node
/**
 * Reply Processor — 邮件回复处理器
 * 
 * 功能：
 * 1. 检查 IMAP 收件箱新邮件
 * 2. 匹配回复到对应客户（通过邮箱地址）
 * 3. 意图识别（询价/技术/订单/投诉/正面/拒绝）
 * 4. 生成回复草稿
 * 5. 更新本地 DB 状态
 * 6. 输出 JSON 摘要（供飞书推送使用）
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const { SalesState } = require('../shared/sales-state-db');

const execAsync = promisify(exec);

// ==================== 配置 ====================
const IMAP_CLI = '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills/imap-smtp-email/scripts/imap.js';
const LOG_DIR = path.join(__dirname, 'logs');
const CHECK_LIMIT = 20;

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ==================== 意图分类 ====================
const INTENT_RULES = {
  inquiry: {
    keywords: ['quote', 'price', 'quotation', 'inquiry', 'interested', 'catalog', 'sample', 'MOQ', 'lead time', 'pricing', 'cost', 'discount'],
    priority: 'high',
    description: '询价/产品咨询',
    next_stage: 'negotiating'
  },
  technical: {
    keywords: ['specification', 'datasheet', 'technical', 'certification', 'test report', 'compliance', 'standard'],
    priority: 'high',
    description: '技术问题',
    next_stage: 'negotiating'
  },
  order: {
    keywords: ['order', 'purchase', 'PO', 'confirm', 'payment', 'invoice', 'proforma'],
    priority: 'high',
    description: '订单相关',
    next_stage: 'quoted'
  },
  delivery: {
    keywords: ['delivery', 'shipping', 'tracking', 'logistics', 'when', 'arrive'],
    priority: 'medium',
    description: '物流/交付',
    next_stage: null
  },
  complaint: {
    keywords: ['problem', 'issue', 'defect', 'quality', 'complaint', 'wrong', 'broken', 'damage'],
    priority: 'urgent',
    description: '投诉/质量问题',
    next_stage: null
  },
  positive: {
    keywords: ['thank', 'great', 'good', 'excellent', 'satisfied', 'appreciate', 'looking forward'],
    priority: 'low',
    description: '正面反馈',
    next_stage: 'negotiating'
  },
  negative: {
    keywords: ['not interested', 'no need', 'stop', 'unsubscribe', 'remove', 'already have'],
    priority: 'low',
    description: '拒绝/退订',
    next_stage: 'lost'
  }
};

// ==================== 回复草稿模板 ====================
const REPLY_TEMPLATES = {
  inquiry: (email) => `Hi ${email.from_name || 'there'},

Thank you for your interest. I'd be happy to help with your inquiry.

To give you the most accurate quote, could you share:
1. Product types and specifications you need
2. Estimated quantity
3. Any specific requirements or standards

I'll prepare a detailed quotation for you right away.

Best regards,
Jaden`,

  technical: (email) => `Hi ${email.from_name || 'there'},

Thank you for your technical inquiry.

All our products come with full certification documents (CE/RoHS/UL) and test reports (TDR, eye-diagram). I can provide detailed specs for the specific products you're interested in.

Which product line would you like more details about?

Best regards,
Jaden`,

  order: (email) => `Hi ${email.from_name || 'there'},

Thank you for your order inquiry. To proceed efficiently, I'll need:
1. Confirmed product specifications
2. Quantity
3. Delivery address
4. Payment terms preference (T/T, L/C)

I'll prepare a formal quotation and proforma invoice for your review.

Best regards,
Jaden`,

  complaint: (email) => `Hi ${email.from_name || 'there'},

I sincerely apologize for the inconvenience. Quality is our top priority.

To resolve this quickly, could you please provide:
1. Order number or reference
2. Photos of the issue
3. Quantity affected

We'll investigate immediately and provide a solution within 24 hours.

Best regards,
Jaden`,

  positive: (email) => `Hi ${email.from_name || 'there'},

Thank you so much for the positive feedback! We're delighted to hear you're satisfied.

Looking forward to continuing our partnership. Please don't hesitate to reach out if you need anything.

Best regards,
Jaden`,

  negative: (email) => `Hi ${email.from_name || 'there'},

Thank you for your response. I understand and respect your decision.

If your requirements change in the future, we'd be happy to assist.

Best regards,
Jaden`,

  general: (email) => `Hi ${email.from_name || 'there'},

Thank you for your email. I'd be happy to help.

Could you please share more details about your inquiry?

Best regards,
Jaden`
};

// ==================== 日志 ====================
function logToFile(level, msg, data) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${level}] ${msg}`;
  const logFile = path.join(LOG_DIR, `reply-processor-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, entry + '\n');
  if (data) fs.appendFileSync(logFile, JSON.stringify(data, null, 2) + '\n');
}

// ==================== 意图识别 ====================
function classifyIntent(email) {
  const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
  let bestMatch = null;
  let maxScore = 0;

  for (const [intent, config] of Object.entries(INTENT_RULES)) {
    let score = 0;
    for (const kw of config.keywords) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    if (score > maxScore) { maxScore = score; bestMatch = intent; }
  }

  return {
    intent: bestMatch || 'general',
    confidence: maxScore > 0 ? 'high' : 'low',
    priority: bestMatch ? INTENT_RULES[bestMatch].priority : 'medium',
    description: bestMatch ? INTENT_RULES[bestMatch].description : '一般咨询',
    next_stage: bestMatch ? INTENT_RULES[bestMatch].next_stage : null
  };
}

// ==================== 回复生成 ====================
function generateDraft(email, intent) {
  const template = REPLY_TEMPLATES[intent.intent] || REPLY_TEMPLATES.general;
  return template(email);
}

// ==================== 邮件检查 ====================
async function fetchNewEmails() {
  try {
    const { stdout } = await execAsync(`node "${IMAP_CLI}" check --limit ${CHECK_LIMIT}`);
    const lines = stdout.split('\n').filter(l => l.trim());
    const emails = [];
    for (const line of lines) {
      try {
        if (line.startsWith('{') || line.startsWith('[')) {
          const data = JSON.parse(line);
          if (Array.isArray(data)) emails.push(...data);
          else if (data.uid) emails.push(data);
        }
      } catch(e) {}
    }
    return emails;
  } catch(e) {
    logToFile('ERROR', '检查邮件失败', { error: e.message });
    return [];
  }
}

// ==================== 主处理器 ====================
class ReplyProcessor {
  constructor() {
    this.processedUids = this.loadProcessedUids();
  }

  loadProcessedUids() {
    try {
      const file = path.join(__dirname, 'state/processed-uids.json');
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch(e) {}
    return [];
  }

  saveProcessedUids() {
    const dir = path.join(__dirname, 'state');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'processed-uids.json'), JSON.stringify(this.processedUids.slice(-1000)));
  }

  async process(options = {}) {
    const dryRun = options.dryRun || false;
    logToFile('INFO', 'Reply Processor 启动');

    // 1. 检查新邮件
    const emails = await fetchNewEmails();
    if (emails.length === 0) {
      logToFile('INFO', '没有新邮件');
      return { processed: 0, results: [] };
    }

    // 2. 处理每封
    const results = [];
    for (const email of emails) {
      const uid = email.uid || email.id;
      if (this.processedUids.includes(uid)) continue;

      const fromEmail = (email.from || email.from_address || '').toLowerCase();
      const intent = classifyIntent(email);
      const draft = generateDraft(email, intent);

      // 3. 匹配客户（通过邮箱）
      const customer = SalesState.getCustomer('farreach', fromEmail) || SalesState.getCustomer('hero-pumps', fromEmail);
      const project = customer ? customer.project : 'unknown';

      // 4. 更新 DB
      if (!dryRun && project !== 'unknown') {
        SalesState.addReply(project, {
          email: fromEmail,
          company: customer?.company || email.from_name,
          subject: email.subject,
          body: (email.text || '').substring(0, 500),
          intent: intent.intent,
          priority: intent.priority,
          draft_reply: draft
        });

        // 更新客户阶段
        if (intent.next_stage) {
          SalesState.updateStage(project, fromEmail, {
            stage: intent.next_stage,
            reply_status: 'replied',
            last_reply_at: new Date().toISOString(),
            intent: intent.intent
          });
        }
      }

      results.push({
        uid, project, from: fromEmail,
        from_name: email.from_name,
        company: customer?.company || '',
        subject: email.subject,
        intent: intent.intent,
        intent_description: intent.description,
        priority: intent.priority,
        next_stage: intent.next_stage,
        draft_reply: draft,
        body_preview: (email.text || '').substring(0, 200)
      });

      this.processedUids.push(uid);
    }

    this.saveProcessedUids();

    // 5. 输出到 stdout（供飞书推送）
    const output = {
      timestamp: new Date().toISOString(),
      processed: results.length,
      results
    };
    console.log(JSON.stringify(output, null, 2));

    logToFile('INFO', `处理完成: ${results.length} 封新邮件`);
    return output;
  }
}

// ==================== CLI ====================
async function main() {
  const args = process.argv.slice(2);
  const options = { dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') options.dryRun = true;
    else if (['--help', '-h'].includes(args[i])) {
      console.log(`Reply Processor\n用法: node reply-processor.js [选项]\n选项:\n  --dry-run       预览模式\n  --help, -h      帮助\n\n输出: JSON 格式的回复摘要到 stdout`);
      process.exit(0);
    }
  }
  const processor = new ReplyProcessor();
  await processor.process(options);
}

if (require.main === module) {
  main().catch(e => { logToFile('ERROR', '程序异常', { error: e.message }); process.exit(1); });
}

module.exports = { ReplyProcessor, classifyIntent, generateDraft };
