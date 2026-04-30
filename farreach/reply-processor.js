#!/usr/bin/env node
/**
 * Reply Processor
 * 邮件回复处理器
 * 
 * 功能：
 * 1. 检查 IMAP 收件箱新邮件
 * 2. 意图识别（inquiry/delivery/complaint/positive/negative等）
 * 3. 生成回复草稿
 * 4. 输出 JSON 格式的回复摘要到 stdout（供外部推送飞书用）
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ==================== 配置 ====================
const CONFIG = {
  IMAP_CLI: '/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/imap.js',
  KNOWLEDGE_BASE: '/Users/wilson/obsidian-vault/Farreach 知识库',
  STATE_FILE: path.join(__dirname, 'state/reply-state.json'),
  LOG_DIR: path.join(__dirname, 'logs'),
  CHECK_LIMIT: 20 // 每次检查最新 20 封邮件
};

// ==================== 意图分类 ====================
const INTENT_PATTERNS = {
  inquiry: {
    keywords: ['quote', 'price', 'quotation', 'inquiry', 'interested', 'catalog', 'sample', 'MOQ', 'lead time', '报价', '询价', '价格', '样品'],
    priority: 'high',
    description: '询价/产品咨询'
  },
  technical: {
    keywords: ['specification', 'datasheet', 'technical', 'certification', 'test report', 'compliance', '规格', '技术', '认证', '测试'],
    priority: 'high',
    description: '技术问题'
  },
  order: {
    keywords: ['order', 'purchase', 'PO', 'confirm', 'payment', '订单', '采购', '确认'],
    priority: 'high',
    description: '订单相关'
  },
  delivery: {
    keywords: ['delivery', 'shipping', 'tracking', 'logistics', 'when', 'arrive', '发货', '物流', '快递', '到货'],
    priority: 'medium',
    description: '物流/交付'
  },
  complaint: {
    keywords: ['problem', 'issue', 'defect', 'quality', 'complaint', 'wrong', 'broken', '问题', '质量', '投诉', '坏了'],
    priority: 'urgent',
    description: '投诉/质量问题'
  },
  positive: {
    keywords: ['thank', 'great', 'good', 'excellent', 'satisfied', 'appreciate', '谢谢', '感谢', '很好'],
    priority: 'low',
    description: '正面反馈'
  },
  negative: {
    keywords: ['not interested', 'no need', 'stop', 'unsubscribe', 'remove', '不需要', '不感兴趣'],
    priority: 'low',
    description: '拒绝/退订'
  }
};

// ==================== 日志工具 ====================
class Logger {
  constructor() {
    if (!fs.existsSync(CONFIG.LOG_DIR)) {
      fs.mkdirSync(CONFIG.LOG_DIR, { recursive: true });
    }
    this.logFile = path.join(CONFIG.LOG_DIR, `reply-processor-${new Date().toISOString().split('T')[0]}.log`);
  }

  log(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    
    console.error(logEntry); // 输出到 stderr，保持 stdout 干净
    if (data) {
      console.error(JSON.stringify(data, null, 2));
    }
    
    fs.appendFileSync(this.logFile, logEntry + '\n');
    if (data) {
      fs.appendFileSync(this.logFile, JSON.stringify(data, null, 2) + '\n');
    }
  }

  info(message, data) { this.log('INFO', message, data); }
  warn(message, data) { this.log('WARN', message, data); }
  error(message, data) { this.log('ERROR', message, data); }
  success(message, data) { this.log('SUCCESS', message, data); }
}

const logger = new Logger();

// ==================== 状态管理 ====================
class ReplyStateManager {
  constructor() {
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (fs.existsSync(CONFIG.STATE_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, 'utf8'));
      }
    } catch (error) {
      logger.error('加载状态文件失败', { error: error.message });
    }
    return {
      processed_uids: [],
      last_check_at: null
    };
  }

  saveState() {
    try {
      const dir = path.dirname(CONFIG.STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(this.state, null, 2));
    } catch (error) {
      logger.error('保存状态失败', { error: error.message });
    }
  }

  isProcessed(uid) {
    return this.state.processed_uids.includes(uid);
  }

  markProcessed(uid) {
    if (!this.state.processed_uids.includes(uid)) {
      this.state.processed_uids.push(uid);
      // 只保留最近 1000 条记录
      if (this.state.processed_uids.length > 1000) {
        this.state.processed_uids = this.state.processed_uids.slice(-1000);
      }
      this.saveState();
    }
  }

  updateLastCheck() {
    this.state.last_check_at = new Date().toISOString();
    this.saveState();
  }
}

// ==================== 意图识别器 ====================
class IntentClassifier {
  classify(email) {
    const text = `${email.subject || ''} ${email.body || ''}`.toLowerCase();
    
    let bestMatch = null;
    let maxScore = 0;

    for (const [intent, config] of Object.entries(INTENT_PATTERNS)) {
      let score = 0;
      for (const keyword of config.keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score++;
        }
      }
      
      if (score > maxScore) {
        maxScore = score;
        bestMatch = intent;
      }
    }

    return {
      intent: bestMatch || 'general',
      confidence: maxScore > 0 ? 'high' : 'low',
      priority: bestMatch ? INTENT_PATTERNS[bestMatch].priority : 'medium',
      description: bestMatch ? INTENT_PATTERNS[bestMatch].description : '一般咨询'
    };
  }
}

// ==================== 回复生成器 ====================
class ReplyGenerator {
  generateDraft(email, intent) {
    const templates = {
      inquiry: `Hi ${email.from_name || 'there'},

Thank you for your interest in Farreach Electronic's cable solutions.

I'd be happy to provide you with:
- Product catalog 2026
- Detailed quotation based on your requirements
- Technical specifications and certifications

Could you please share more details about:
1. Product types you're interested in (HDMI/DP/USB/LAN)
2. Quantity requirements
3. Target specifications

Looking forward to supporting your project.

Best regards,
Jaden Yang
Farreach Electronic`,

      technical: `Hi ${email.from_name || 'there'},

Thank you for your technical inquiry.

All our products come with:
- CE/RoHS/UL/FCC certifications
- Full TDR and eye-diagram test reports
- HDMI 2.1/DP 2.1/USB4 compliance documentation

I can provide detailed technical specifications and test reports for the products you're interested in.

Which product line would you like more information about?

Best regards,
Jaden Yang
Farreach Electronic`,

      order: `Hi ${email.from_name || 'there'},

Thank you for your order inquiry.

To proceed, I'll need:
1. Confirmed product specifications
2. Quantity
3. Delivery address
4. Payment terms preference (T/T, L/C, PayPal)

Our standard lead time is 7-15 days for stock items, 15-30 days for customized orders.

I'll prepare a formal quotation and proforma invoice for your review.

Best regards,
Jaden Yang
Farreach Electronic`,

      delivery: `Hi ${email.from_name || 'there'},

Thank you for your inquiry about delivery.

Let me check the status of your order and provide you with tracking information.

Could you please confirm your order number or PO reference?

Best regards,
Jaden Yang
Farreach Electronic`,

      complaint: `Hi ${email.from_name || 'there'},

Thank you for bringing this to our attention. I sincerely apologize for any inconvenience.

Quality is our top priority, and we take all feedback seriously.

To resolve this quickly, could you please provide:
1. Order number/PO reference
2. Photos of the issue
3. Quantity affected

We'll investigate immediately and provide a solution within 24 hours.

Best regards,
Jaden Yang
Farreach Electronic`,

      positive: `Hi ${email.from_name || 'there'},

Thank you so much for your positive feedback! We're delighted to hear you're satisfied with our products/service.

We look forward to continuing our partnership and supporting your future projects.

Please don't hesitate to reach out if you need anything.

Best regards,
Jaden Yang
Farreach Electronic`,

      negative: `Hi ${email.from_name || 'there'},

Thank you for your response. I understand and respect your decision.

If your requirements change in the future, we'd be happy to assist.

Wishing you all the best.

Best regards,
Jaden Yang
Farreach Electronic`,

      general: `Hi ${email.from_name || 'there'},

Thank you for your email.

I'd be happy to help. Could you please provide more details about your inquiry?

Best regards,
Jaden Yang
Farreach Electronic`
    };

    return templates[intent.intent] || templates.general;
  }
}

// ==================== 邮件检查器 ====================
class EmailChecker {
  async fetchNewEmails() {
    logger.info('正在检查新邮件...');
    
    try {
      const command = `node "${CONFIG.IMAP_CLI}" check --limit ${CONFIG.CHECK_LIMIT}`;
      const { stdout } = await execAsync(command);
      
      // 解析 IMAP CLI 输出
      const lines = stdout.split('\n').filter(line => line.trim());
      const emails = [];
      
      for (const line of lines) {
        try {
          if (line.startsWith('{') || line.startsWith('[')) {
            const data = JSON.parse(line);
            if (Array.isArray(data)) {
              emails.push(...data);
            } else if (data.uid) {
              emails.push(data);
            }
          }
        } catch (e) {
          // 跳过非 JSON 行
        }
      }
      
      logger.info(`检查到 ${emails.length} 封邮件`);
      return emails;
    } catch (error) {
      logger.error('检查邮件失败', { error: error.message });
      return [];
    }
  }
}

// ==================== 主处理器 ====================
class ReplyProcessor {
  constructor() {
    this.stateManager = new ReplyStateManager();
    this.intentClassifier = new IntentClassifier();
    this.replyGenerator = new ReplyGenerator();
    this.emailChecker = new EmailChecker();
  }

  async process() {
    logger.info('========================================');
    logger.info('Reply Processor 启动');
    logger.info('========================================');

    try {
      // 1. 检查新邮件
      const emails = await this.emailChecker.fetchNewEmails();
      
      if (emails.length === 0) {
        logger.info('没有新邮件');
        return { processed: 0, results: [] };
      }

      // 2. 处理每封邮件
      const results = [];
      
      for (const email of emails) {
        const uid = email.uid || email.id;
        
        // 跳过已处理的邮件
        if (this.stateManager.isProcessed(uid)) {
          logger.info(`跳过已处理邮件: UID ${uid}`);
          continue;
        }

        // 意图识别
        const intent = this.intentClassifier.classify(email);
        logger.info(`邮件 UID ${uid} 意图: ${intent.description} (${intent.priority})`);

        // 生成回复草稿
        const draft = this.replyGenerator.generateDraft(email, intent);

        // 构建结果
        const result = {
          uid: uid,
          from: email.from || email.from_email,
          from_name: email.from_name,
          subject: email.subject,
          received_at: email.date || email.received_at,
          intent: intent.intent,
          intent_description: intent.description,
          priority: intent.priority,
          confidence: intent.confidence,
          draft_reply: draft,
          body_preview: (email.body || '').substring(0, 200)
        };

        results.push(result);

        // 标记为已处理
        this.stateManager.markProcessed(uid);
      }

      // 3. 更新状态
      this.stateManager.updateLastCheck();

      // 4. 输出结果到 stdout（JSON 格式，供外部推送飞书）
      const output = {
        timestamp: new Date().toISOString(),
        processed: results.length,
        results: results
      };

      console.log(JSON.stringify(output, null, 2));

      logger.info('========================================');
      logger.info(`处理完成: ${results.length} 封新邮件`);
      logger.info('========================================');

      return output;

    } catch (error) {
      logger.error('处理失败', { error: error.message, stack: error.stack });
      throw error;
    }
  }
}

// ==================== CLI 入口 ====================
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Reply Processor
邮件回复处理器

用法:
  node reply-processor.js

功能:
  - 检查 IMAP 收件箱新邮件
  - 意图识别（inquiry/delivery/complaint/positive/negative等）
  - 生成回复草稿
  - 输出 JSON 格式的回复摘要到 stdout

输出格式:
  {
    "timestamp": "2026-04-20T10:00:00Z",
    "processed": 3,
    "results": [
      {
        "uid": "12345",
        "from": "customer@example.com",
        "subject": "Product inquiry",
        "intent": "inquiry",
        "priority": "high",
        "draft_reply": "..."
      }
    ]
  }

示例:
  node reply-processor.js
  node reply-processor.js > replies.json
    `);
    process.exit(0);
  }

  const processor = new ReplyProcessor();
  await processor.process();
}

// 运行
if (require.main === module) {
  main().catch(error => {
    logger.error('程序异常退出', { error: error.message, stack: error.stack });
    process.exit(1);
  });
}

module.exports = { ReplyProcessor };
