#!/usr/bin/env node

/**
 * Smart Email Sender
 * 智能邮件发送 - 自动处理配置、附件、引用等
 * 
 * 用法：
 * node scripts/smart-send.js --to "customer@example.com" --subject "报价单" --quotation "QT-20260329-001"
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SMTP_SCRIPT = path.join(__dirname, 'smtp.js');
const QUOTATION_DIR = path.join(__dirname, '../../quotation-workflow/data');
const CATALOGUE_PATH = '/Users/wilson/.openclaw/workspace/obsidian-vault/Farreach 知识库/02-产品目录/SKW 2026 catalogue-15M.pdf';

// 解析命令行参数
const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    options[key] = value;
    if (value !== true) i++;
  }
}

// 智能构建附件列表
function buildAttachments() {
  const attachments = [];
  
  // 自动添加产品目录
  if (fs.existsSync(CATALOGUE_PATH)) {
    attachments.push(CATALOGUE_PATH);
    console.log('✅ 自动添加产品目录');
  }
  
  // 自动添加报价单
  if (options.quotation) {
    const quotationFiles = [
      path.join(QUOTATION_DIR, `${options.quotation}-Final.pdf`),
      path.join(QUOTATION_DIR, `${options.quotation}-HTML.pdf`),
      path.join(QUOTATION_DIR, `${options.quotation}.pdf`),
    ];
    
    for (const file of quotationFiles) {
      if (fs.existsSync(file)) {
        attachments.push(file);
        console.log(`✅ 自动添加报价单：${path.basename(file)}`);
        break;
      }
    }
  }
  
  // 手动添加的附件
  if (options.attach) {
    const manualAttachments = options.attach.split(',').map(f => f.trim());
    attachments.push(...manualAttachments);
    console.log(`✅ 添加附件：${manualAttachments.join(', ')}`);
  }
  
  return attachments;
}

// 智能构建命令
function buildCommand() {
  const attachments = buildAttachments();
  
  let cmd = `node "${SMTP_SCRIPT}" send`;
  cmd += ` --to "${options.to}"`;
  cmd += ` --subject "${options.subject}"`;
  
  // 正文
  if (options.body) {
    cmd += ` --body "${options.body}"`;
  } else if (options['body-file']) {
    cmd += ` --body-file "${options['body-file']}"`;
  } else {
    cmd += ` --body-file "${path.join(__dirname, '../templates/default-email.html')}"`;
  }
  
  // 附件
  if (attachments.length > 0) {
    cmd += ` --attach "${attachments.join(',')}"`;
  }
  
  // 签名
  if (options.signature) {
    cmd += ` --signature "${options.signature}"`;
  } else {
    cmd += ` --signature "en-sales"`;
  }
  
  // 语言
  if (options.language) {
    cmd += ` --language "${options.language}"`;
  }
  
  // 回复邮件
  if (options['reply-to']) {
    cmd += ` --reply-to "${options['reply-to']}"`;
    console.log('✅ 自动引用原邮件');
  }
  
  // 智能模式：自动确认发送（除非指定 --draft）
  if (!options.draft) {
    cmd += ` --confirm-send`;
    console.log('✅ 自动确认发送');
  } else {
    console.log('⏸️  保存为草稿');
  }
  
  // 预览模式
  if (options['dry-run']) {
    cmd += ` --dry-run`;
    console.log('👀 预览模式');
  }
  
  return cmd;
}

// 主函数
async function main() {
  console.log('🚀 智能邮件发送\n');
  
  // 验证必填参数
  if (!options.to) {
    console.error('❌ 错误：缺少必填参数 --to');
    console.error('用法：node smart-send.js --to "customer@example.com" --subject "主题" [--quotation "报价单号"]');
    process.exit(1);
  }
  
  if (!options.subject) {
    console.error('❌ 错误：缺少必填参数 --subject');
    console.error('用法：node smart-send.js --to "customer@example.com" --subject "主题"');
    process.exit(1);
  }
  
  // 构建并执行命令
  const cmd = buildCommand();
  console.log(`\n📤 执行命令：${cmd}\n`);
  
  try {
    const output = execSync(cmd, { stdio: 'inherit', encoding: 'utf8' });
    console.log('\n✅ 发送完成！');
  } catch (err) {
    console.error('\n❌ 发送失败:', err.message);
    process.exit(1);
  }
}

main();
