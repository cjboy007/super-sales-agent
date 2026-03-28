#!/usr/bin/env node
/**
 * test-runner.js - TDR 测试执行器
 * 
 * 测试 super-sales-agent monorepo 的 24 个 skill
 * 配置：test-config.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 加载配置
const CONFIG_FILE = path.join(__dirname, '..', 'test-config.json');
let config;

try {
  const rawData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  // 兼容两种格式
  config = rawData.test_config || rawData;
  config.test_plan = rawData.test_plan || config.test_plan;
} catch (error) {
  console.error('❌ 无法加载 test-config.json');
  console.error('错误:', error.message);
  process.exit(1);
}

const SKILLS_DIR = config.skills_dir || '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills';
const REPORTS_DIR = path.join(__dirname, 'test-reports');
const LOGS_DIR = path.join(__dirname, 'logs');

// 确保目录存在
[REPORTS_DIR, LOGS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log('🚀 TDR 测试执行器启动');
console.log('='.repeat(60));
console.log(`总计：${config.total_skills} 个 skill`);
console.log(`批次：${config.test_plan.batches.length} 批`);
console.log(`测试邮件：${config.test_email}`);
console.log(`Discord: ${config.discord_channel}`);
console.log('='.repeat(60));
console.log('');

// 测试结果
const testResults = {
  started_at: new Date().toISOString(),
  config,
  batches: [],
  total_passed: 0,
  total_failed: 0,
  total_skipped: 0,
  status: 'running'
};

// 执行单个 skill 测试
function testSkill(skillName, timeoutMinutes = 15) {
  console.log(`\n🧪 测试技能：${skillName}`);
  console.log('-'.repeat(60));
  
  const skillDir = path.join(SKILLS_DIR, skillName);
  const skillFile = path.join(skillDir, 'SKILL.md');
  const testDir = path.join(skillDir, 'test');
  
  const result = {
    name: skillName,
    started_at: new Date().toISOString(),
    status: 'running',
    tests_run: 0,
    tests_passed: 0,
    tests_failed: 0,
    errors: [],
    output: ''
  };
  
  try {
    // 1. 读取 SKILL.md
    if (fs.existsSync(skillFile)) {
      const skillContent = fs.readFileSync(skillFile, 'utf8');
      console.log(`📄 SKILL.md 存在`);
      result.skill_documented = true;
    } else {
      console.log(`⚠️ SKILL.md 不存在`);
      result.skill_documented = false;
    }
    
    // 2. 检查现有测试
    if (fs.existsSync(testDir)) {
      const testFiles = fs.readdirSync(testDir).filter(f => 
        f.endsWith('.js') || f.endsWith('.sh') || f.endsWith('.py')
      );
      console.log(`✅ 发现 ${testFiles.length} 个测试文件`);
      
      // 3. 运行现有测试
      for (const testFile of testFiles) {
        console.log(`   运行测试：${testFile}`);
        
        try {
          const testPath = path.join(testDir, testFile);
          const timeout = timeoutMinutes * 60 * 1000;
          
          let command;
          if (testFile.endsWith('.js')) {
            command = `node ${testPath}`;
          } else if (testFile.endsWith('.sh')) {
            command = `bash ${testPath}`;
          } else if (testFile.endsWith('.py')) {
            command = `python3 ${testPath}`;
          }
          
          const output = execSync(command, {
            cwd: skillDir,
            encoding: 'utf8',
            timeout,
            stdio: ['pipe', 'pipe', 'pipe']
          });
          
          result.tests_run++;
          result.tests_passed++;
          result.output += `${testFile}: PASSED\n${output}\n`;
          console.log(`   ✅ ${testFile}: PASSED`);
          
        } catch (error) {
          result.tests_run++;
          result.tests_failed++;
          result.errors.push({
            test: testFile,
            error: error.message,
            stderr: error.stderr?.substring(0, 1000),
            timeout: error.code === 'ETIMEDOUT' || error.message.includes('timed out')
          });
          result.output += `${testFile}: FAILED\n${error.message}\n`;
          console.log(`   ❌ ${testFile}: FAILED`);
          
          // 失败处理：立即停止
          if (config.on_failure === 'stop' && !error.code?.includes('ETIMEDOUT')) {
            throw new Error(`测试失败：${testFile}`);
          }
        }
      }
    } else {
      console.log(`⚠️ 测试目录不存在，跳过`);
      result.status = 'skipped';
    }
    
    // 4. 更新状态
    result.status = result.tests_failed > 0 ? 'failed' : 'passed';
    result.completed_at = new Date().toISOString();
    
  } catch (error) {
    result.status = 'error';
    result.error = error.message;
    result.completed_at = new Date().toISOString();
    console.log(`❌ 测试异常：${error.message}`);
  }
  
  console.log(`\n结果：${result.status} (${result.tests_passed}/${result.tests_run} 通过)`);
  return result;
}

// 执行批次测试
function runBatch(batch) {
  console.log(`\n\n📦 执行批次 ${batch.batch_id}`);
  console.log('='.repeat(60));
  console.log(`技能：${batch.skills.join(', ')}`);
  console.log(`风险等级：${batch.risk_level}`);
  console.log(`预计时间：${batch.estimated_minutes} 分钟`);
  
  const batchResult = {
    batch_id: batch.batch_id,
    started_at: new Date().toISOString(),
    skills: [],
    status: 'running'
  };
  
  for (const skillName of batch.skills) {
    const result = testSkill(skillName, config.timeout_per_skill_minutes);
    batchResult.skills.push(result);
    
    if (result.status === 'failed' || result.status === 'error') {
      batchResult.status = 'failed';
      testResults.total_failed++;
      
      // 失败立即停止
      console.log(`\n❌ 批次 ${batch.batch_id} 失败，停止测试`);
      break;
    } else if (result.status === 'skipped') {
      testResults.total_skipped++;
    } else {
      testResults.total_passed++;
    }
  }
  
  batchResult.completed_at = new Date().toISOString();
  batchResult.status = batchResult.skills.every(s => s.status === 'passed') ? 'passed' : 'failed';
  
  return batchResult;
}

// 生成 HTML 报告
function generateHtmlReport() {
  console.log('\n\n📊 生成 HTML 报告...');
  
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>TDR 测试报告 - Super Sales Agent</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    .summary { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 5px; }
    .passed { color: green; }
    .failed { color: red; }
    .skipped { color: orange; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #4CAF50; color: white; }
    tr:nth-child(even) { background: #f2f2f2; }
  </style>
</head>
<body>
  <h1>🚀 TDR 测试报告 - Super Sales Agent</h1>
  
  <div class="summary">
    <h2>测试概览</h2>
    <p><strong>开始时间:</strong> ${testResults.started_at}</p>
    <p><strong>结束时间:</strong> ${new Date().toISOString()}</p>
    <p><strong>总计:</strong> ${config.total_skills} 个 skill</p>
    <p><strong>通过:</strong> <span class="passed">${testResults.total_passed}</span></p>
    <p><strong>失败:</strong> <span class="failed">${testResults.total_failed}</span></p>
    <p><strong>跳过:</strong> <span class="skipped">${testResults.total_skipped}</span></p>
  </div>
  
  <h2>批次详情</h2>
  <table>
    <tr>
      <th>批次</th>
      <th>技能</th>
      <th>状态</th>
      <th>开始时间</th>
      <th>完成时间</th>
    </tr>
    ${testResults.batches.map(batch => `
      <tr>
        <td>${batch.batch_id}</td>
        <td>${batch.skills.map(s => s.name).join(', ')}</td>
        <td class="${batch.status}">${batch.status}</td>
        <td>${batch.started_at}</td>
        <td>${batch.completed_at || '-'}</td>
      </tr>
    `).join('')}
  </table>
  
  <h2>技能详情</h2>
  ${testResults.batches.flatMap(b => b.skills).map(skill => `
    <div style="margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px;">
      <h3>${skill.name}</h3>
      <p><strong>状态:</strong> <span class="${skill.status}">${skill.status}</span></p>
      <p><strong>测试:</strong> ${skill.tests_passed}/${skill.tests_run} 通过</p>
      ${skill.errors.length > 0 ? `
        <div style="background: #ffe6e6; padding: 10px; margin: 10px 0;">
          <strong>错误:</strong>
          <ul>
            ${skill.errors.map(e => `<li>${e.test}: ${e.error}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
  `).join('')}
</body>
</html>`;
  
  const reportFile = path.join(REPORTS_DIR, `test-report-${new Date().toISOString().slice(0,10)}.html`);
  fs.writeFileSync(reportFile, html);
  console.log(`✅ 报告已保存：${reportFile}`);
  
  return reportFile;
}

// 生成 Discord 通知内容
function generateDiscordNotification(reportFile) {
  console.log('\n📬 生成 Discord 通知...');
  
  const status = testResults.total_failed === 0 ? '✅ 全部通过' : `❌ ${testResults.total_failed} 个失败`;
  
  const message = `🚀 **TDR 测试完成**\n\n` +
    `**总计:** ${config.total_skills} 个 skill\n` +
    `**通过:** ${testResults.total_passed}\n` +
    `**失败:** ${testResults.total_failed}\n` +
    `**跳过:** ${testResults.total_skipped}\n` +
    `**状态:** ${status}\n\n` +
    `📄 详细报告：${reportFile}`;
  
  // 保存到文件，由调用者发送
  const notificationFile = path.join(REPORTS_DIR, `discord-notification-${new Date().toISOString().slice(0,10)}.md`);
  fs.writeFileSync(notificationFile, message);
  console.log(`📝 Discord 通知已保存：${notificationFile}`);
  console.log('');
  console.log('通知内容：');
  console.log('-'.repeat(50));
  console.log(message);
  console.log('-'.repeat(50));
  
  return notificationFile;
}

// 主流程
try {
  // 执行所有批次
  for (const batch of config.test_plan.batches) {
    const batchResult = runBatch(batch);
    testResults.batches.push(batchResult);
    
    if (batchResult.status === 'failed') {
      console.log('\n❌ 测试失败，停止后续批次');
      break;
    }
  }
  
  // 生成报告
  testResults.status = testResults.total_failed === 0 ? 'passed' : 'failed';
  testResults.completed_at = new Date().toISOString();
  
  const reportFile = generateHtmlReport();
  
  // 生成 Discord 通知（不自动发送，由调用者决定如何发送）
  const notificationFile = generateDiscordNotification(reportFile);
  
  // 保存测试结果
  const resultsFile = path.join(REPORTS_DIR, `test-results-${new Date().toISOString().slice(0,10)}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(testResults, null, 2));
  console.log(`\n✅ 测试结果已保存：${resultsFile}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('🎉 测试完成！');
  console.log(`总计：${testResults.total_passed} 通过 / ${testResults.total_failed} 失败 / ${testResults.total_skipped} 跳过`);
  console.log('='.repeat(60));
  
} catch (error) {
  console.error('\n❌ 测试执行异常:', error.message);
  testResults.status = 'error';
  testResults.error = error.message;
  process.exit(1);
}
