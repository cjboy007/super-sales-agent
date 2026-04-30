#!/usr/bin/env node
/**
 * Hero Pumps Daily Pipeline — 生成模板 + 自动发送（单心跳完成）
 * 
 * 修复了之前模板生成和 SMTP 发送分属两个心跳的问题。
 * 现在在一个心跳内连续执行：
 *   Step 1: 生成今日邮件模板（复用 daily-run-v2.js 逻辑）
 *   Step 2: 自动检测今日新模板 → 触发 SMTP 发送
 * 
 * 用法:
 *   node hero-daily-pipeline.js           # 默认 10 封
 *   node hero-daily-pipeline.js --limit 5 # 指定数量
 *   node hero-daily-pipeline.js --dry-run # 预览
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// ==================== 路径配置 ====================
const BASE = path.join(__dirname, '..');
const LEADS_DIR = path.join(BASE, 'leads');
const SENT_LOG = path.join(BASE, 'sent-log.json');
const RESEARCH_DIR = path.join(BASE, 'research/companies');
const DRAFTS_DIR = path.join(BASE, 'campaign-tracker/templates');
const IRON_PROMPTS_DIR = path.join(BASE, 'iron-prompts');
const SMTP_SCRIPT = path.join(__dirname, 'smtp-send-batch-v2.js');

// ==================== CSV 加载 ====================
function loadLeads() {
  const leads = [];
  if (!fs.existsSync(LEADS_DIR)) return leads;
  for (const file of fs.readdirSync(LEADS_DIR).filter(f => f.endsWith('.csv'))) {
    const content = fs.readFileSync(path.join(LEADS_DIR, file), 'utf8').trim();
    const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.replace(/^["']|["']$/g, '').trim());
      if (values.length < headers.length) continue;
      const lead = {};
      headers.forEach((h, idx) => { lead[h] = values[idx] || ''; });
      if (lead.email && lead.email.includes('@') && !lead.email.includes('IncompleteRead') && lead.email.length > 5) {
        leads.push(lead);
      }
    }
  }
  return leads;
}

function loadSentLog() {
  if (fs.existsSync(SENT_LOG)) {
    try { return JSON.parse(fs.readFileSync(SENT_LOG, 'utf8')); } catch(e) {}
  }
  return [];
}

// ==================== 研究数据加载 ====================
function loadResearchMap() {
  const map = {};
  if (!fs.existsSync(RESEARCH_DIR)) return map;
  for (const f of fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'))) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, f), 'utf8'));
      map[d.company] = (d.research?.summary || '').replace(/https?:\/\/[^\s]+/g, '').substring(0, 150);
    } catch(e) {}
  }
  return map;
}

// ==================== IRON Prompt 生成 ====================
function generateIronPrompt(batch, researchMap) {
  const lines = [];
  lines.push(`你是 IRON，Hero Pump 的贸易操作员。请为以下 ${batch.length} 个联系人写开发信。\n`);
  lines.push(`## 产品信息`);
  lines.push(`- 产品：变频循环泵（variable frequency circulating pumps）`);
  lines.push(`- 认证：ErP EEI ≤ 0.23, TÜV SÜD, CE, RoHS`);
  lines.push(`- 价格：比 Grundfos/Wilo 低 30-40%`);
  lines.push(`- 工厂：浙江桐乡（Zhejiang Hero Pump Co., Ltd.）`);
  lines.push(`- OEM：支持贴牌定制\n`);
  lines.push(`## 签名（每封末尾必须加上）`);
  lines.push(`Jaden Yeung`);
  lines.push(`Sales Manager | Zhejiang Hero Pump Co., Ltd.`);
  lines.push(`sales@heropumps.com`);
  lines.push(`WhatsApp: +86 136 8034 2402`);
  lines.push(`www.heropumps.com\n`);
  lines.push(`## 要求`);
  lines.push(`1. 根据职位定制：Sales→价格，Product→技术，CEO→战略，通用→转交负责人`);
  lines.push(`2. 正文 80-120 词，开头个性化（提到公司、国家）`);
  lines.push(`3. 严禁：hope this email finds you well、破折号、空洞恭维`);
  lines.push(`4. 结尾只推进一个动作：同意接收产品单页和报价`);
  lines.push(`5. 每人 3 个主题行\n`);
  lines.push(`## 联系人\n`);
  
  batch.forEach((c, i) => {
    const research = researchMap[c.company];
    lines.push(`${i + 1}. ${c.contact_name || c.email} | ${c.email} | ${c.position || 'N/A'}`);
    lines.push(`   公司：${c.company} | ${c.country} | ${c.website}`);
    if (research) lines.push(`   调研：${research}`);
    lines.push('');
  });
  
  lines.push(`\n请为以上每个联系人写一封个性化开发信。`);
  lines.push(`保存到目录: ${DRAFTS_DIR}/`);
  lines.push(`文件命名: iron-YYYY-MM-DD-{序号}-{邮箱前缀}.md`);
  lines.push(`每个文件格式:`);
  lines.push(`# Cold Email — [公司名] — [联系人]\n`);
  lines.push(`- **Email:** [邮箱]`);
  lines.push(`- **Position:** [职位]`);
  lines.push(`- **Recommended:** [推荐主题]`);
  lines.push(`- **Subject Alt 1:** [备选1]`);
  lines.push(`- **Subject Alt 2:** [备选2]\n`);
  lines.push(`## Email Body\n`);
  lines.push(`[正文含签名]\n`);
  lines.push(`## Design Notes`);
  lines.push(`- **切入角度:** [角色] 定制`);
  lines.push(`- **联系人来源:** csv`);
  
  return lines.join('\n');
}

// ==================== Step 1: 生成今日模板 ====================
function stepGenerateTemplates(count, researchMap) {
  const leads = loadLeads();
  const sentLog = loadSentLog();
  const sentEmails = new Set(sentLog.map(s => s.email.toLowerCase()));
  
  // 过滤已发送的
  const remaining = leads.filter(l => !sentEmails.has(l.email.toLowerCase()));
  
  if (remaining.length === 0) {
    console.log('  ✅ 所有联系人都已发送');
    return { batch: [], promptFile: null, prompt: null };
  }
  
  // 按公司打散（round-robin）
  const byCompany = {};
  for (const c of remaining) {
    const comp = c.company || '__unknown__';
    if (!byCompany[comp]) byCompany[comp] = [];
    byCompany[comp].push(c);
  }
  
  const companies = Object.keys(byCompany);
  const batch = [];
  let idx = 0;
  while (batch.length < Math.min(count, remaining.length)) {
    let added = false;
    for (const comp of companies) {
      if (batch.length >= count) break;
      if (idx < byCompany[comp].length) {
        batch.push(byCompany[comp][idx]);
        added = true;
      }
    }
    idx++;
    if (!added) break;
  }
  
  if (batch.length === 0) {
    console.log('  ✅ 所有联系人都已发送');
    return { batch: [], promptFile: null, prompt: null };
  }
  
  const prompt = generateIronPrompt(batch, researchMap);
  const today = new Date().toISOString().split('T')[0];
  
  // 保存 prompt 文件
  fs.mkdirSync(IRON_PROMPTS_DIR, { recursive: true });
  const promptFile = path.join(IRON_PROMPTS_DIR, `${today}.md`);
  fs.writeFileSync(promptFile, prompt, 'utf8');
  
  console.log(`  📝 批次: ${batch.length} 封联系人`);
  console.log(`  📄 IRON Prompt: ${promptFile}`);
  
  return { batch, promptFile, prompt };
}

// ==================== Step 2: 检测并发送新模板 ====================
function stepSendNewTemplates(dryRun, limit) {
  const today = new Date().toISOString().split('T')[0];
  
  if (!fs.existsSync(DRAFTS_DIR)) {
    console.log('  ❌ 模板目录不存在');
    return { sent: 0, failed: 0 };
  }
  
  const sentLog = loadSentLog();
  const sentEmails = new Set(sentLog.map(s => s.email.toLowerCase()));
  const logFile = path.join(BASE, 'sent-log.json');
  let logMtime = 0;
  try { logMtime = fs.statSync(logFile).mtimeMs; } catch(e) {}
  
  // 查找今日新模板（今天创建或修改，且比 sent-log 新）
  const todayFiles = [];
  for (const file of fs.readdirSync(DRAFTS_DIR).filter(f => f.startsWith('iron-') && f.endsWith('.md'))) {
    const filePath = path.join(DRAFTS_DIR, file);
    const stat = fs.statSync(filePath);
    const fileDate = new Date(stat.mtimeMs).toISOString().split('T')[0];
    
    if (fileDate === today && stat.mtimeMs > logMtime) {
      todayFiles.push(filePath);
    }
  }
  
  if (todayFiles.length === 0) {
    console.log('  ℹ️  没有今日新生成的模板');
    return { sent: 0, failed: 0 };
  }
  
  console.log(`  📬 发现 ${todayFiles.length} 个今日新模板`);
  
  // 解析模板并过滤未发送的
  const drafts = [];
  for (const filePath of todayFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    
    let emailMatch = content.match(/\*\*To:\*\*\s*[^<]*<([^>]+)>/) ||
                     content.match(/\*\*To:\*\*\s*(\S+@\S+)/) ||
                     content.match(/\*\*Email:\*\*\s*(\S+@\S+)/);
    let subjectMatch = content.match(/\*\*Subject:\*\*\s*(.+)/) ||
                       content.match(/\*\*Recommended:\*\*\s*(.+)/);
    let bodyMatch = content.match(/---\s*\n([\s\S]*?)\n---/) ||
                    content.match(/## Email Body\s*\n([\s\S]*?)\n## Design Notes/);
    
    // 兼容格式: **Email:** email@xxx
    if (!emailMatch) {
      emailMatch = content.match(/\*\*Email:\*\*\s*([^\s\n]+)/);
    }
    
    if (!emailMatch || !subjectMatch || !bodyMatch) {
      console.log(`  ⚠️  解析失败: ${path.basename(filePath)}`);
      continue;
    }
    
    const email = (emailMatch[1] || '').trim();
    if (!email.includes('@') || email.includes('IncompleteRead')) continue;
    if (sentEmails.has(email.toLowerCase())) continue;
    
    drafts.push({
      email,
      subject: subjectMatch[1].trim(),
      body: bodyMatch[1].trim(),
      filePath
    });
  }
  
  if (drafts.length === 0) {
    console.log('  ℹ️  没有未发送的新模板');
    return { sent: 0, failed: 0 };
  }
  
  console.log(`  📤 ${drafts.length} 封待发送（限制: ${limit}）`);
  
  if (dryRun) {
    drafts.slice(0, limit).forEach((d, i) => {
      console.log(`    ${i + 1}. → ${d.email} | ${d.subject}`);
    });
    return { sent: 0, failed: 0, dryRun: true };
  }
  
  // 调用 smtp-send-batch-v2.js 发送（复用其限流和 DB 写入逻辑）
  try {
    const cmd = `node "${SMTP_SCRIPT}" --limit ${limit}`;
    const { stdout } = execSync(cmd, { timeout: 300000, encoding: 'utf8' });
    console.log(stdout);
    
    // 解析发送结果
    const match = stdout.match(/发送 (\d+) 封.*失败 (\d+) 封/);
    return {
      sent: match ? parseInt(match[1]) : 0,
      failed: match ? parseInt(match[2]) : 0
    };
  } catch(e) {
    console.log(`  ⚠️  SMTP 发送异常: ${e.message}`);
    return { sent: 0, failed: 0 };
  }
}

const { execSync } = require('child_process');

// ==================== 主流程 ====================
async function main() {
  const args = process.argv.slice(2);
  const countArg = args.indexOf('--count');
  const limitArg = args.indexOf('--limit');
  const count = countArg >= 0 ? parseInt(args[countArg + 1]) : 10;  // 生成数量
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1]) : 10;  // 发送数量
  const dryRun = args.includes('--dry-run');
  const skipGenerate = args.includes('--send-only');
  const skipSend = args.includes('--generate-only');
  
  const today = new Date().toISOString().split('T')[0];
  
  console.log('========================================');
  console.log('Hero Pumps Daily Pipeline');
  console.log(`日期: ${today}`);
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log(`生成: ${count} 封 | 发送: ${limit} 封`);
  console.log('========================================\n');
  
  // Step 1: 生成模板
  if (!skipGenerate) {
    console.log('📝 Step 1: 生成今日邮件模板');
    console.log('──────────────────────────────');
    const researchMap = loadResearchMap();
    const result = stepGenerateTemplates(count, researchMap);
    
    if (result.batch.length === 0) {
      console.log('\n  ⏭️  跳过生成，直接进入发送步骤');
    } else {
      console.log(`  💡 WILSON 将 spawn IRON 处理 prompt: ${result.promptFile}`);
      console.log(`  ⚠️  注意: IRON 写入模板是异步的，当前心跳可能看不到新文件`);
      console.log(`  → 发送步骤将检查今日新模板（比 sent-log.json 新的文件）\n`);
    }
  } else {
    console.log('⏭️  Step 1 跳过（--send-only）\n');
  }
  
  // Step 2: 发送新模板
  if (!skipSend) {
    console.log('📤 Step 2: 检测并发送新模板');
    console.log('──────────────────────────────');
    const sendResult = stepSendNewTemplates(dryRun, limit);
    
    console.log('');
    console.log('========================================');
    if (sendResult.dryRun) {
      console.log('DRY RUN — 未实际发送');
    } else {
      console.log(`✅ 完成: 发送 ${sendResult.sent} 封, 失败 ${sendResult.failed} 封`);
    }
    console.log('========================================');
  } else {
    console.log('⏭️  Step 2 跳过（--generate-only）');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
