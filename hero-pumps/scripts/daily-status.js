#!/usr/bin/env node
/**
 * Daily Status Report — 每日销售状态报告
 * 
 * 输出：
 * - 草稿总数 / 已发送 / 待发送
 * - 今日发送记录
 * - 需要跟进的客户
 * - 客户回复状态
 */

const fs = require('fs');
const path = require('path');

const DRAFTS_DIR = path.join(__dirname, '../campaign-tracker/templates');
const RESEARCH_DIR = path.join(__dirname, '../research/companies');
const LEADS_DIR = path.join(__dirname, '../leads');

function main() {
  // 统计草稿
  const drafts = fs.existsSync(DRAFTS_DIR)
    ? fs.readdirSync(DRAFTS_DIR).filter(f => f.startsWith('cold-email-') && f.endsWith('.md'))
    : [];
  
  // 统计联系人
  let totalContacts = 0;
  if (fs.existsSync(LEADS_DIR)) {
    for (const file of fs.readdirSync(LEADS_DIR).filter(f => f.endsWith('.csv'))) {
      const content = fs.readFileSync(path.join(LEADS_DIR, file), 'utf8').trim();
      const lines = content.split('\n').filter(l => l.includes('@'));
      totalContacts += Math.max(0, lines.length - 1);
    }
  }
  
  // 统计公司
  const companies = fs.existsSync(RESEARCH_DIR)
    ? fs.readdirSync(RESEARCH_DIR).filter(f => f.endsWith('.json'))
    : [];
  
  // 按 tier 统计
  const tierCounts = {};
  for (const file of companies) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(RESEARCH_DIR, file), 'utf8'));
      const tier = data.tier || 'Unknown';
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    } catch(e) {}
  }
  
  console.log('🧠 Super Sales Agent — Daily Status');
  console.log('');
  console.log('📊 数据概览');
  console.log(`• 调研公司: ${companies.length} 家`);
  console.log(`• 联系人: ${totalContacts} 个`);
  console.log(`• 草稿: ${drafts.length} 封`);
  console.log('');
  console.log('📈 Tier 分布');
  for (const [tier, count] of Object.entries(tierCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`• ${tier}: ${count} 家`);
  }
  console.log('');
  console.log('⚡ 操作命令');
  console.log('• 生成草稿: node scripts/batch-draft-generator-v2.js');
  console.log('• 发送邮件: node scripts/smtp-send-batch.js --limit 5');
  console.log('• 预览模式: node scripts/smtp-send-batch.js --dry-run --limit 3');
}

main();
