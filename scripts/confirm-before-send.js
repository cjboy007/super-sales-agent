#!/usr/bin/env node
/**
 * 发送前确认脚本
 * 
 * 在发送邮件/文档前，强制人工确认关键信息
 * 
 * 使用方式：
 * node scripts/confirm-before-send.js \
 *   --type pi \
 *   --data data/customer.json \
 *   --output PI-20260327-001
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      params[key] = value;
    }
  }
  
  return params;
}

// 创建 readline 接口
function createReadlineInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// 询问是/否
function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(question + ' (y/N): ', (answer) => {
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// 显示确认信息
function showConfirmation(params, data) {
  const type = params.type;
  const customer = data.customer || {};
  const payment = data.payment || {};
  const pi = data.pi || data.quotation || {};
  
  console.log();
  console.log('═'.repeat(60));
  console.log('📧 发送前确认');
  console.log('═'.repeat(60));
  console.log();
  console.log(`文档类型：${type.toUpperCase()}`);
  console.log(`输出文件：${params.output}`);
  console.log();
  console.log('客户信息:');
  console.log(`  公司：${customer.company_name || customer.name || 'N/A'}`);
  console.log(`  联系人：${customer.contact || customer.contact_name || 'N/A'}`);
  console.log(`  邮箱：${customer.email || customer.contact_email || 'N/A'}`);
  console.log(`  电话：${customer.phone || 'N/A'}`);
  console.log();
  
  // 显示金额信息（如果有）
  if (payment.total_amount) {
    console.log('付款信息:');
    console.log(`  总额：${payment.currency || 'USD'} ${payment.total_amount.toLocaleString()}`);
    if (payment.deposit_amount) {
      console.log(`  定金：${payment.currency || 'USD'} ${payment.deposit_amount.toLocaleString()} (${payment.deposit_date || 'N/A'})`);
    }
    console.log(`  余款：${payment.currency || 'USD'} ${payment.balance_due.toLocaleString()}`);
    console.log(`  到期日：${params['due-date'] || 'N/A'}`);
    console.log();
  }
  
  // 显示 PI/报价单号
  if (pi.pi_no || pi.quotation_no) {
    console.log('参考信息:');
    if (pi.pi_no) console.log(`  PI 号：${pi.pi_no}`);
    if (pi.quotation_no) console.log(`  报价单号：${pi.quotation_no}`);
    console.log();
  }
  
  // 显示银行信息
  const bankInfo = data.bank_info || {};
  if (bankInfo.bank_name) {
    console.log('银行账户:');
    console.log(`  银行：${bankInfo.bank_name}`);
    console.log(`  账号：${bankInfo.account_no}`);
    console.log(`  SWIFT: ${bankInfo.swift_code}`);
    console.log();
  }
  
  console.log('═'.repeat(60));
}

// 主函数
async function main() {
  const params = parseArgs();
  
  // 验证必填参数
  if (!params.type || !params.data || !params.output) {
    console.error('❌ 错误：缺少必填参数');
    console.error('用法：node confirm-before-send.js --type <类型> --data <数据文件> --output <输出文件>');
    process.exit(1);
  }
  
  // 加载数据
  let data;
  try {
    const dataPath = path.isAbsolute(params.data) ? params.data : path.join(__dirname, '..', params.data);
    data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  } catch (error) {
    console.error('❌ 错误：无法加载数据文件');
    console.error(error.message);
    process.exit(1);
  }
  
  // 显示确认信息
  showConfirmation(params, data);
  
  // 询问确认
  const rl = createReadlineInterface();
  const confirmed = await askYesNo(rl, '确认发送以上文档？');
  rl.close();
  
  console.log();
  
  if (confirmed) {
    console.log('✅ 确认发送');
    console.log('💡 下一步：使用 generate-document.js 生成文档');
    console.log();
    console.log(`命令：node scripts/generate-document.js --type ${params.type} --data ${params.data} --output ${params.output}`);
    process.exit(0);
  } else {
    console.log('❌ 已取消发送');
    console.log('💡 请检查数据文件，确认信息正确后重试');
    process.exit(1);
  }
}

// 运行
main();
