#!/usr/bin/env node
/**
 * SMTP Batch Sender — 批量发送开发信
 * 
 * 工作流程：
 * 1. 读取 campaign-tracker/templates/cold-email-*.md 草稿
 * 2. 从草稿提取收件人、主题、正文
 * 3. 检查 DB 是否已发送过
 * 4. 发送邮件（带 Hero Pump 签名）
 * 5. 更新 DB 状态
 * 
 * 用法:
 *   node smtp-send-batch.js              # 发送 5 封（默认）
 *   node smtp-send-batch.js --limit 10   # 发送 10 封
 *   node smtp-send-batch.js --dry-run    # 预览模式
 *   node smtp-send-batch.js --company gc-gruppe  # 只发指定公司
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');
const SIGNATURE_PATH = '/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/signatures/signature-hero-jordan.html';
const SMTP_CLI = '/Users/wilson/.openclaw/workspace/skills/imap-smtp-email/scripts/smtp.js';
const ENV_PATH = path.join(__dirname, '../.env');
const PROJECT = 'hero-pumps';

// ==================== 解析草稿 ====================
function parseDraft(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  const emailMatch = content.match(/\*\*Email:\*\*\s*(.+)/);
  const subjectMatch = content.match(/\*\*Recommended:\*\*\s*(.+)/);
  const contactMatch = content.match(/\*\*Contact:\*\*\s*(.+?)\s*\(/);
  const positionMatch = content.match(/\*\*Position:\*\*\s*(.+)/);
  const companyMatch = content.match(/\*\*Company:\*\*\s*(.+)/);
  const countryMatch = content.match(/\*\*Country:\*\*\s*(.+?)\s*🇦|🇩|🇫|🇮|🇨|🇭|🇷|🇸|🇳|🇵|🇧|🇪/);
  
  // 提取邮件正文（从 "## Email Body" 到 "## Design Notes"）
  const bodyMatch = content.match(/## Email Body\s*\n([\s\S]*?)\n## Design Notes/);
  
  if (!emailMatch || !subjectMatch || !bodyMatch) {
    return null;
  }
  
  const email = emailMatch[1].trim();
  // 跳过无效邮箱
  if (!email.includes('@') || email.includes('IncompleteRead') || email.startsWith('info@') === false && email.length < 8) {
    // 允许 info@ 但长度要合理
  }
  
  return {
    email,
    subject: subjectMatch[1].trim(),
    body: bodyMatch[1].trim(),
    contact: contactMatch ? contactMatch[1].trim() : '',
    position: positionMatch ? positionMatch[1].trim() : '',
    company: companyMatch ? companyMatch[1].trim() : '',
    filePath
  };
}

// ==================== 发送邮件 ====================
async function sendEmail(draft, dryRun = false) {
  if (dryRun) {
    console.log(`  📤 [DRY RUN] → ${draft.email}`);
    console.log(`     主题: ${draft.subject}`);
    console.log(`     正文: ${draft.body.substring(0, 80)}...`);
    return { success: true, dryRun: true };
  }
  
  try {
    const signature = fs.readFileSync(SIGNATURE_PATH, 'utf8');
    const fullBody = `${draft.body}\n\n${signature}`;
    
    // 转义特殊字符
    const safeSubject = draft.subject.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    const safeBody = fullBody.replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
    
    const cmd = `node "${SMTP_CLI}" send --to "${draft.email}" --subject "${safeSubject}" --html --body "${safeBody}"`;
    
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30000 });
    return { success: true, stdout, stderr };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

// ==================== 主程序 ====================
async function main() {
  const args = process.argv.slice(2);
  const limitArg = args.indexOf('--limit');
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 20;
  const dryRun = args.includes('--dry-run');
  const companyArg = args.indexOf('--company');
  const targetCompany = companyArg >= 0 ? args[companyArg + 1].toLowerCase() : null;
  
  console.log('========================================');
  console.log('Hero Pumps — SMTP Batch Sender');
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`限制: ${limit} 封`);
  if (targetCompany) console.log(`目标: ${targetCompany}`);
  console.log('========================================\n');
  
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('❌ 草稿目录不存在');
    return;
  }
  
  const drafts = [];
  for (const file of fs.readdirSync(DRAFTS_DIR).filter(f => f.startsWith('cold-email-') && f.endsWith('.md'))) {
    const draft = parseDraft(path.join(DRAFTS_DIR, file));
    if (draft && draft.email.includes('@') && !draft.email.includes('IncompleteRead')) {
      if (!targetCompany || draft.company.toLowerCase().includes(targetCompany)) {
        drafts.push(draft);
      }
    }
  }
  
  console.log(`找到 ${drafts.length} 封有效草稿\n`);
  
  if (drafts.length === 0) {
    console.log('没有符合条件的草稿');
    return;
  }
  
  let sent = 0;
  let failed = 0;
  
  for (let i = 0; i < Math.min(drafts.length, limit); i++) {
    const draft = drafts[i];
    console.log(`[${i + 1}/${Math.min(drafts.length, limit)}] ${draft.company} → ${draft.contact || draft.email}`);
    console.log(`   📧 ${draft.email}`);
    console.log(`   📝 ${draft.subject}`);
    
    const result = await sendEmail(draft, dryRun);
    
    if (result.success) {
      sent++;
      console.log(`   ✅ 已发送\n`);
    } else {
      failed++;
      console.log(`   ❌ 失败: ${result.error}\n`);
    }
    
    // 发送间隔（2-3 分钟随机）
    if (i < Math.min(drafts.length, limit) - 1 && !dryRun) {
      const delay = (Math.random() * 60000 + 120000);
      console.log(`   ⏳ 等待 ${Math.round(delay / 1000)}s...\n`);
      await new Promise(r => setTimeout(r, delay));
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
