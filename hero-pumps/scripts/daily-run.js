#!/usr/bin/env node
/**
 * Daily Run — Super Sales Agent 每日自动运行
 * 
 * 流程：
 * 1. 发送今日配额的开发信（5 封）
 * 2. 检查客户回复
 * 3. 执行自动跟进
 * 4. 发送状态报告到飞书
 * 
 * 用法:
 *   node daily-run.js              # 正常执行
 *   node daily-run.js --dry-run    # 预览模式
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const PROJECT_DIR = path.join(__dirname, '..');
const SMTP_SEND = path.join(__dirname, 'smtp-send-batch.js');
const FOLLOW_UP = path.join(PROJECT_DIR, '../../shared/follow-up-engine.js');
const REPLY_PROC = path.join(PROJECT_DIR, '../../shared/reply-processor.js');

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log('========================================');
  console.log('🧠 Super Sales Agent — Daily Run');
  console.log(`日期: ${new Date().toISOString().split('T')[0]}`);
  console.log(`模式: ${dryRun ? 'DRY RUN' : 'PRODUCTION'}`);
  console.log('========================================\n');
  
  // Step 1: 发送今日配额
  console.log('📤 Step 1: 发送开发信（5 封/天）');
  try {
    const { stdout } = await execAsync(
      `node "${SMTP_SEND}" --limit 5 ${dryRun ? '--dry-run' : ''}`,
      { timeout: 600000 } // 10 分钟超时
    );
    console.log(stdout);
  } catch(e) {
    console.log(`⚠️ 发送完成或超时: ${e.message}\n`);
  }
  
  // Step 2: 检查回复
  console.log('📬 Step 2: 检查客户回复');
  try {
    const { stdout } = await execAsync(
      `node "${REPLY_PROC}" --limit 10 ${dryRun ? '--dry-run' : ''}`,
      { timeout: 120000 }
    );
    console.log(stdout);
  } catch(e) {
    console.log(`⚠️ 回复检查: ${e.message}\n`);
  }
  
  // Step 3: 自动跟进
  console.log('🔄 Step 3: 执行自动跟进');
  try {
    const { stdout } = await execAsync(
      `node "${FOLLOW_UP}" ${dryRun ? '--dry-run' : ''}`,
      { timeout: 300000 }
    );
    console.log(stdout);
  } catch(e) {
    console.log(`⚠️ 跟进完成或超时: ${e.message}\n`);
  }
  
  // Step 4: 状态报告
  console.log('📊 Step 4: 生成状态报告');
  try {
    const { stdout } = await execAsync(
      `node "${path.join(__dirname, 'daily-status.js')}"`,
      { timeout: 30000 }
    );
    console.log(stdout);
  } catch(e) {
    console.log(`⚠️ 状态报告: ${e.message}\n`);
  }
  
  console.log('========================================');
  console.log('✅ Daily Run 完成');
  console.log('========================================');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
