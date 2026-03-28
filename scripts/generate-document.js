#!/usr/bin/env node
/**
 * 统一文档生成入口
 * 
 * 支持生成：报价单 (quotation) / PI (pi) / 样品单 (sample) / 收款通知 (payment-notice)
 * 
 * 使用方式：
 * node generate-document.js \
 *   --type quotation \
 *   --customer-json data/customer.json \
 *   --output QT-20260327-001
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

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

// 验证必填参数
function validateParams(params) {
  const required = ['type', 'output'];
  const missing = required.filter(key => !params[key]);
  
  if (missing.length > 0) {
    console.error('❌ 错误：缺少必填参数');
    console.error(`缺失：${missing.map(k => `--${k}`).join(', ')}`);
    console.error();
    console.error('用法：node generate-document.js --type <类型> --output <文件名> [选项]');
    console.error();
    console.error('必需参数:');
    console.error('  --type          文档类型：quotation, pi, sample, payment-notice');
    console.error('  --output        输出文件名（不含扩展名）');
    console.error();
    console.error('可选参数:');
    console.error('  --customer-json 客户数据 JSON 文件路径');
    console.error('  --data          完整数据 JSON 文件路径（覆盖 customer-json）');
    console.error('  --products      产品数据 JSON 文件路径');
    console.error('  --format        输出格式：html, pdf, all（默认：all）');
    console.error('  --dry-run       仅验证，不生成文件');
    process.exit(1);
  }
  
  const validTypes = ['quotation', 'pi', 'sample', 'payment-notice'];
  if (!validTypes.includes(params.type)) {
    console.error(`❌ 错误：无效的文档类型 "${params.type}"`);
    console.error(`有效类型：${validTypes.join(', ')}`);
    process.exit(1);
  }
}

// 获取脚本路径
function getScriptPath(type) {
  const scriptDir = path.join(__dirname, '..', 'skills');
  
  const scripts = {
    'quotation': path.join(scriptDir, 'quotation-workflow', 'scripts', 'generate-all.sh'),
    'pi': path.join(scriptDir, 'pi-workflow', 'scripts', 'generate_pi.py'),
    'sample': path.join(scriptDir, 'sample-workflow', 'scripts', 'generate_sample.py'),
    'payment-notice': path.join(scriptDir, 'payment-notice-workflow', 'scripts', 'generate_payment_notice.py')
  };
  
  return scripts[type];
}

// 获取文件前缀
function getFilePrefix(type) {
  const prefixes = {
    'quotation': 'QT',
    'pi': 'PI',
    'sample': 'SPL',
    'payment-notice': 'PN'
  };
  
  return prefixes[type];
}

// 生成数据文件
function createDataFile(params, type) {
  const data = {};
  
  // 如果有完整数据文件，直接使用（转换为绝对路径）
  if (params.data) {
    const dataPath = path.isAbsolute(params.data) ? params.data : path.join(__dirname, '..', params.data);
    return dataPath;
  }
  
  // 否则组合客户数据 + 产品数据
  if (params['customer-json']) {
    const customerData = JSON.parse(fs.readFileSync(params['customer-json'], 'utf-8'));
    Object.assign(data, customerData);
  }
  
  if (params.products) {
    const productsData = JSON.parse(fs.readFileSync(params.products, 'utf-8'));
    data.products = productsData;
  }
  
  // 保存临时数据文件
  const tempDataFile = path.join(__dirname, 'temp', `${params.output}_data.json`);
  if (!fs.existsSync(path.dirname(tempDataFile))) {
    fs.mkdirSync(path.dirname(tempDataFile), { recursive: true });
  }
  fs.writeFileSync(tempDataFile, JSON.stringify(data, null, 2));
  
  return tempDataFile;
}

// 执行生成
function generate(params) {
  const type = params.type;
  const scriptPath = getScriptPath(type);
  const dataFile = createDataFile(params, type);
  const outputName = params.output;
  const outputDir = path.join(__dirname, 'output');
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  console.log(`📄 生成文档：${type}`);
  console.log(`📂 数据文件：${dataFile}`);
  console.log(`📁 输出目录：${outputDir}`);
  console.log();
  
  // dry-run 模式
  if (params['dry-run']) {
    console.log('✅ 数据验证通过（dry-run 模式）');
    return;
  }
  
  try {
    logger.info(`开始生成文档：${type}`, { output: outputName, dataFile });
    
    if (type === 'quotation') {
      // 报价单使用 bash 脚本
      const cmd = `bash "${scriptPath}" "${dataFile}" "${outputName}"`;
      execSync(cmd, { stdio: 'inherit', cwd: __dirname });
    } else {
      // 其他类型使用 Python 脚本
      const outputFile = path.join(outputDir, `${outputName}.html`);
      const cmd = `python3 "${scriptPath}" --data "${dataFile}" --output "${outputFile}"`;
      execSync(cmd, { stdio: 'pipe', cwd: __dirname });
    }
    
    logger.logGeneration(type, `${outputName}.*`, 'success');
    console.log();
    console.log(`✅ 文档生成完成！`);
    console.log(`📁 输出文件：${outputDir}/${outputName}.*`);
    
  } catch (error) {
    logger.logGeneration(type, outputName, 'failed', { error: error.message });
    console.error('❌ 文档生成失败');
    process.exit(1);
  }
}

// 主函数
function main() {
  console.log('📋 统一文档生成系统 v1.0');
  console.log('=' .repeat(60));
  console.log();
  
  const params = parseArgs();
  validateParams(params);
  
  generate(params);
}

// 运行
main();
