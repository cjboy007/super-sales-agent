#!/usr/bin/env node
/**
 * SMTP Send Batch v2 — 间隔发送，防封号
 * 
 * 策略：
 * - 每封间隔 3-8 分钟（随机）
 * - 冷启动 5 封/天，稳定期 10 封/天
 * - 跟进 3 次后打入冷宫（cooling 90 天）
 * - 发送窗口：欧洲时间 7:00-17:00
 * 
 * 用法:
 *   node smtp-send-batch-v2.js              # 默认 5 封
 *   node smtp-send-batch-v2.js --limit 10   # 指定数量
 *   node smtp-send-batch-v2.js --dry-run    # 预览
 */

const fs = require('fs');
const path = require('path');
const { SalesState } = require('../../shared/sales-state-db');
const nodemailer = require('/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/node_modules/nodemailer');
const dotenv = require('/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/node_modules/dotenv');

// 读取项目自己的 .env（Hero Pump SMTP 配置）
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const PROJECT = 'hero-pumps';
const SIGNATURE_PATH = '/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/signatures/signature-hero-jordan.html';
const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');
const SENT_LOG = path.join(__dirname, '../sent-log.json');

// 从 CSV 加载联系人信息
function loadLeadsMap() {
  const leadsDir = path.join(__dirname, '../leads');
  const map = {};
  if (!fs.existsSync(leadsDir)) return map;
  for (const file of fs.readdirSync(leadsDir).filter(f => f.endsWith('.csv'))) {
    const content = fs.readFileSync(path.join(leadsDir, file), 'utf8').trim();
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
      if (values.length < headers.length) continue;
      const lead = {};
      headers.forEach((h, idx) => { lead[h] = values[idx] || ''; });
      if (lead.email && lead.email.includes('@')) {
        map[lead.email.toLowerCase()] = lead;
      }
    }
  }
  return map;
}

function loadSentLog() {
  if (fs.existsSync(SENT_LOG)) {
    try { return JSON.parse(fs.readFileSync(SENT_LOG, 'utf8')); } catch(e) {}
  }
  return [];
}

function saveSentLog(log) {
  fs.writeFileSync(SENT_LOG, JSON.stringify(log, null, 2));
}

function parseDraft(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Support IRON format: **To:** Name <email>  OR  **To:** plain@email  OR  legacy **Email:** email
  let emailMatch = content.match(/\*\*To:\*\*\s*[^<]*<([^>]+)>/);
  if (!emailMatch) {
    emailMatch = content.match(/\*\*To:\*\*\s*(\S+@\S+)/);
  }
  if (!emailMatch) {
    emailMatch = content.match(/\*\*Email:\*\*\s*(.+)/);
  }
  
  // Support IRON format: **Subject:** ...  OR  legacy **Recommended:** ...
  let subjectMatch = content.match(/\*\*Subject:\*\*\s*(.+)/);
  if (!subjectMatch) {
    subjectMatch = content.match(/\*\*Recommended:\*\*\s*(.+)/);
  }
  
  // Extract email body:
  // Priority 1: ## Email Body ... ## Design Notes (preferred format)
  let bodyMatch = content.match(/## Email Body\s*\n([\s\S]*?)\n## Design Notes/);
  // Priority 2: Between 2nd and 3rd --- separator (body is after subject, before personalization)
  // The content has 3 blocks separated by ---: metadata | subject | body | personalization
  if (!bodyMatch) {
    const separatorPositions = [];
    let searchIdx = 0;
    while ((searchIdx = content.indexOf('\n---\n', searchIdx)) !== -1) {
      separatorPositions.push(searchIdx);
      searchIdx += 5;
    }
    if (separatorPositions.length >= 3) {
      // Body is between 2nd and 3rd separator
      bodyMatch = [
        null,
        content.substring(separatorPositions[1] + 5, separatorPositions[2]).trim()
      ];
    } else if (separatorPositions.length === 2) {
      // Only 2 separators: body is between them
      bodyMatch = [
        null,
        content.substring(separatorPositions[0] + 5, separatorPositions[1]).trim()
      ];
    }
  }
  
  // Company: from filename or header
  // Support: Cold Email, Follow-up Email, Email Draft
  const companyMatch = content.match(/^# (?:Cold Email|Follow-up Email|Email Draft) - (.+?)(?: — | \()/m);
  const nameMatch = content.match(/\*\*To:\*\*\s*([^<]+)/) || content.match(/\*\*Name:\*\*\s*(.+)/);
  const positionMatch = content.match(/\*\*Position:\*\*\s*(.+)/);
  const countryMatch = content.match(/\*\*Country:\*\*\s*(.+)/);
  
  if (!emailMatch || !subjectMatch || !bodyMatch) return null;
  
  let email = emailMatch[1] ? emailMatch[1].trim() : '';
  if (!email.includes('@') || email.includes('IncompleteRead')) return null;
  
  // Extract clean contact name from **To:** field
  let contactName = '';
  if (nameMatch && nameMatch[1]) {
    contactName = nameMatch[1].trim().replace(/<.*>$/, '').trim();
  }
  
  // Extract follow-up specific fields
  const stageMatch = content.match(/\*\*Stage:\*\*\s*(.+)/);
  const followUpNumMatch = content.match(/\*\*Follow-up #:\*\*\s*(.+)/);

  return {
    email,
    subject: subjectMatch[1].trim(),
    body: bodyMatch[1].trim(),
    filePath,
    company: companyMatch?.[1]?.trim() || '',
    contact_name: contactName,
    position: positionMatch?.[1]?.trim() || '',
    country: countryMatch?.[1]?.trim() || '',
    // Follow-up specific
    stage: stageMatch?.[1]?.trim() || '',
    followUpNum: followUpNumMatch?.[1]?.trim() || ''
  };
}

/**
 * 将 Markdown 风格的正文转为 HTML。
 * - **bold** → <strong>bold</strong>
 * - *italic* → <em>italic</em>
 * - \n → <br>
 */
function markdownToHtml(text) {
  // 用占位符保护 HTML 标签，避免后续转义破坏它们
  const tags = [];
  const placeholder = (tag) => {
    tags.push(tag);
    return `\x00TAG${tags.length - 1}\x00`;
  };

  let result = text
    // 1. Markdown 加粗 → 占位符
    .replace(/\*\*(.+?)\*\*/g, (_, m) => placeholder(`<strong>${m}</strong>`))
    // 2. Markdown 斜体 → 占位符
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, (_, m) => placeholder(`<em>${m}</em>`))
    // 3. 行内代码 → 占位符
    .replace(/`(.+?)`/g, (_, m) => placeholder(`<code>${m}</code>`))
    // 4. HTML 安全转义
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 5. 换行 → <br>
    .replace(/\n/g, '<br>');

  // 6. 恢复 HTML 标签
  tags.forEach((tag, i) => {
    result = result.replace(`\x00TAG${i}\x00`, tag);
  });

  return result;
}

/**
 * 构建 HTML 邮件正文。
 * 签名由邮件客户端自动附加，正文不再拼接。
 */
function buildHtmlBody(body, signatureHtml) {
  const htmlBody = markdownToHtml(body);
  return htmlBody;
}

/**
 * 创建 Hero Pump 专属 nodemailer transporter。
 * 读取项目 .env 中的 SMTP 配置，不依赖 Farreach 的 CLI。
 */
function createTransporter() {
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

/**
 * 速率限制：检查 1 小时内已发送数量。
 * @returns {{ ok: boolean, count: number, limit: number }}
 */
function checkRateLimit() {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const sentLog = loadSentLog();
  const recentCount = sentLog.filter(
    (entry) => new Date(entry.sent_at) >= oneHourAgo
  ).length;
  // 默认 50 封/小时，从 .env 中读取 SMTP_RATE_LIMIT
  const limit = parseInt(process.env.SMTP_RATE_LIMIT || '50', 10);
  return { ok: recentCount < limit, count: recentCount, limit };
}

/**
 * Hero Pump 专属 nodemailer transporter 复用。
 * 避免每封邮件重新创建连接。
 */
let _transporter = null;
function getTransporter() {
  if (!_transporter) {
    _transporter = createTransporter();
  }
  return _transporter;
}

async function sendEmail(draft, dryRun = false) {
  if (dryRun) {
    console.log(`  📤 [DRY RUN] → ${draft.email}`);
    return { success: true, dryRun: true };
  }

  try {
    // 发送前验证速率限制（防御性检查，虽然 main() 已控制数量）
    const rl = checkRateLimit();
    if (!rl.ok) {
      return { success: false, error: `速率限制：${rl.count}/${rl.limit} 封/小时，已超限` };
    }

    // 发送前验证 SMTP 连接
    const transporter = getTransporter();
    await transporter.verify();

    const signature = fs.readFileSync(SIGNATURE_PATH, 'utf8');
    const htmlBody = buildHtmlBody(draft.body, signature);

    await transporter.sendMail({
      from: `"Hero Pump" <${process.env.SMTP_FROM || 'sales@heropumps.com'}>`,
      to: draft.email,
      subject: draft.subject,
      html: htmlBody,
    });

    return { success: true };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 10;  // 默认 10 封/天
  const dryRun = args.includes('--dry-run');
  
  // 加载联系人信息（用于 DB 记录）
  const leadsMap = loadLeadsMap();
  
  // 速率限制检查（启动时）
  const rateCheck = checkRateLimit();
  console.log('========================================');
  console.log('SMTP Batch Sender v2 — 间隔发送');
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`限制: ${limit} 封`);
  console.log(`间隔: 3-8 分钟随机`);
  console.log(`速率: ${rateCheck.count}/${rateCheck.limit} 封/小时`);
  if (!rateCheck.ok) {
    console.log(`⚠️  速率限制已触发，需等待后再发送`);
  }
  console.log('========================================\n');
  
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('❌ 草稿目录不存在');
    return;
  }
  
  const sentLog = loadSentLog();
  const sentEmails = new Set(sentLog.map(s => s.email.toLowerCase()));
  
  const drafts = [];
  for (const file of fs.readdirSync(DRAFTS_DIR).filter(f => f.endsWith('.md'))) {
    // 扫描所有 IRON 生成的草稿（冷启动 + follow-up）
    if (!file.startsWith('iron-') && !file.startsWith('followup-')) continue;
    const draft = parseDraft(path.join(DRAFTS_DIR, file));
    if (draft && !sentEmails.has(draft.email.toLowerCase())) {
      drafts.push(draft);
    }
  }
  
  console.log(`找到 ${drafts.length} 封未发送草稿\n`);
  
  if (drafts.length === 0) {
    console.log('没有未发送的草稿');
    return;
  }
  
  // 按公司打散：同一家公司每批最多 1 封，避免单日轰炸同一家
  const shuffled = [...drafts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  const selected = [];
  const companyCount = {};
  for (const d of shuffled) {
    if (selected.length >= limit) break;
    const comp = d.company || 'unknown';
    if ((companyCount[comp] || 0) < 1) {
      selected.push(d);
      companyCount[comp] = (companyCount[comp] || 0) + 1;
    }
  }
  // 如果打散后数量不够（公司太少），补足剩余
  if (selected.length < Math.min(drafts.length, limit)) {
    for (const d of shuffled) {
      if (selected.length >= limit) break;
      if (!selected.includes(d)) {
        selected.push(d);
      }
    }
  }
  
  console.log(`本次发送 ${selected.length} 封（按公司打散，每家最多 ${Math.ceil(limit / new Set(drafts.map(d => d.company).filter(Boolean)).size)} 封）\n`);
  
  let sent = 0;
  let failed = 0;
  const newLog = [...sentLog];
  
  for (let i = 0; i < selected.length; i++) {
    const draft = selected[i];
    console.log(`[${i + 1}/${Math.min(drafts.length, limit)}] → ${draft.email}`);
    console.log(`   📝 ${draft.subject}`);
    
    // 发送前再次检查速率限制（防止批次内超限）
    if (!dryRun) {
      const rl = checkRateLimit();
      if (!rl.ok) {
        console.log(`   ⚠️  速率限制: ${rl.count}/${rl.limit}，停止发送`);
        break;
      }
    }
    
    const result = await sendEmail(draft, dryRun);
    
    if (result.success) {
      sent++;
      if (!dryRun) {
        newLog.push({
          email: draft.email,
          sent_at: new Date().toISOString(),
          subject: draft.subject
        });

        // ⭐ 写入 DB：记录发送 + 设置跟进时间
        try {
          const leadInfo = leadsMap[draft.email.toLowerCase()] || {};
          const company = draft.company || leadInfo.company || '';
          const contactName = draft.contact_name || leadInfo.contact_name || '';
          const country = draft.country || leadInfo.country || '';

          const isFollowup = draft.stage && draft.stage !== '';

          if (isFollowup) {
            // 跟进邮件：更新现有客户记录，推进跟进计数和下次跟进时间
            const followUpNum = parseInt(draft.followUpNum) || 1;
            const currentCustomer = SalesState.getCustomer(PROJECT, draft.email);
            const currentStage = currentCustomer?.current_stage || 'cold_email_sent';

            // 计算下次跟进时间（根据当前阶段和跟进次数）
            const followUpIntervals = {
              cold_email_sent: [2, 5, 10, 20],
              quoted: [3, 7, 14, 28],
              sample_sent: [1, 3, 7, 14],
            };
            const intervals = followUpIntervals[currentStage] || [3, 7, 14, 28];
            const nextDays = intervals[followUpNum] || 30;
            const nextFollowUp = followUpNum >= 4
              ? null  // 第4次跟进后不再自动跟进（进入冷宫由引擎处理）
              : new Date(Date.now() + nextDays * 86400000).toISOString();

            SalesState.updateStage(PROJECT, draft.email, {
              follow_up_count: followUpNum + 1,
              next_follow_up_at: nextFollowUp,
              last_contact_at: new Date().toISOString(),
            });

            SalesState.logEmail(PROJECT, draft.email, company, `follow_up_${followUpNum}`, draft.subject, currentStage, followUpNum + 1);

            console.log(`   📊 已更新 DB: ${currentStage} → follow_up_${followUpNum + 1}, next = ${nextFollowUp || 'none(冷宫)'}`);
          } else {
            // 冷启动邮件：添加线索 + 创建客户记录 + 设置首次跟进时间
            SalesState.addLead(PROJECT, {
              email: draft.email,
              company,
              contact_name: contactName,
              country,
              industry: leadInfo.industry || 'HVAC',
              website: leadInfo.website || '',
              source: 'cold_email'
            });

            const nextFollowUp = new Date(Date.now() + 3 * 86400000).toISOString();
            SalesState.upsertCustomer(PROJECT, draft.email, {
              company,
              contact_name: contactName,
              country,
              stage: 'cold_email_sent',
              follow_up_count: 0,
              next_follow_up_at: nextFollowUp
            });

            SalesState.logEmail(PROJECT, draft.email, company, 'cold_email_1', draft.subject, 'cold_email_sent', 0);

            console.log(`   📊 已写入 DB: next_follow_up = ${nextFollowUp}`);
          }
        } catch(e) {
          console.log(`   ⚠️  DB 写入失败: ${e.message}`);
        }
      }
      console.log(`   ✅ 已发送`);
    } else {
      failed++;
      console.log(`   ❌ 失败: ${result.error}`);
    }
    
    // 随机间隔 3-8 分钟
    if (i < Math.min(drafts.length, limit) - 1 && !dryRun) {
      const interval = 180 + Math.floor(Math.random() * 300);
      const mins = Math.floor(interval / 60);
      const secs = interval % 60;
      console.log(`   ⏳ 等待 ${mins}分${secs}秒...\n`);
      await new Promise(r => setTimeout(r, interval * 1000));
    } else {
      console.log('');
    }
  }
  
  if (!dryRun) {
    saveSentLog(newLog);
    // 关闭 transporter 释放连接
    if (_transporter) {
      _transporter.close();
      _transporter = null;
    }
  }
  
  console.log('========================================');
  console.log(`完成: 发送 ${sent} 封, 失败 ${failed} 封`);
  console.log('========================================');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
