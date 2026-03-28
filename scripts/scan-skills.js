#!/usr/bin/env node
/**
 * scan-skills.js - 扫描 monorepo 所有 skill 并生成测试计划
 */

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/skills';
const OUTPUT_FILE = '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/test-plan.json';

const skills = fs.readdirSync(SKILLS_DIR).filter(f => 
  fs.statSync(path.join(SKILLS_DIR, f)).isDirectory()
);

console.log('🔍 扫描 24 个 skill...\n');

const scanResults = skills.map(skillName => {
  const skillDir = path.join(SKILLS_DIR, skillName);
  const skillFile = path.join(skillDir, 'SKILL.md');
  const testDir = path.join(skillDir, 'test');
  const packageFile = path.join(skillDir, 'package.json');
  
  // 读取 SKILL.md
  let description = '';
  let externalDeps = [];
  
  if (fs.existsSync(skillFile)) {
    const content = fs.readFileSync(skillFile, 'utf8');
    const descMatch = content.match(/## 描述\n+([^#]+)/);
    description = descMatch ? descMatch[1].trim().split('\n')[0] : '';
    
    // 检测外部依赖
    if (content.includes('OKKI') || content.includes('okki')) externalDeps.push('okki');
    if (content.includes('SMTP') || content.includes('email') || content.includes('邮件')) externalDeps.push('smtp');
    if (content.includes('Discord') || content.includes('message')) externalDeps.push('discord');
    if (content.includes('PDF')) externalDeps.push('pdf');
    if (content.includes('Excel') || content.includes('XLSX')) externalDeps.push('excel');
    if (content.includes('Word') || content.includes('DOCX')) externalDeps.push('word');
  }
  
  // 检查是否有测试
  const hasTests = fs.existsSync(testDir);
  let testFiles = [];
  if (hasTests) {
    testFiles = fs.readdirSync(testDir).filter(f => 
      f.endsWith('.js') || f.endsWith('.sh') || f.endsWith('.py')
    );
  }
  
  // 评估风险等级
  let riskLevel = 'low';
  if (externalDeps.includes('okki') || externalDeps.includes('smtp')) {
    riskLevel = 'medium';
  }
  if (skillName.includes('approval') || skillName.includes('payment')) {
    riskLevel = 'high';
  }
  
  // 预计测试时间
  let estimatedMinutes = 5;
  if (externalDeps.length > 1) estimatedMinutes = 10;
  if (riskLevel === 'high') estimatedMinutes = 15;
  
  return {
    name: skillName,
    function: description || '功能待分析',
    external_deps: externalDeps,
    has_existing_tests: hasTests,
    test_files: testFiles,
    test_type: externalDeps.length > 0 ? 'integration' : 'unit',
    requires_real_api: externalDeps.includes('okki') || externalDeps.includes('smtp'),
    estimated_minutes: estimatedMinutes,
    risk_level: riskLevel,
    notes: hasTests ? `已有 ${testFiles.length} 个测试文件` : '需要创建测试'
  };
});

// 统计
const total = scanResults.length;
const highRisk = scanResults.filter(s => s.risk_level === 'high').length;
const requiresApi = scanResults.filter(s => s.requires_real_api).length;
const hasTests = scanResults.filter(s => s.has_existing_tests).length;
const totalMinutes = scanResults.reduce((sum, s) => sum + s.estimated_minutes, 0);

const testPlan = {
  scanned_at: new Date().toISOString(),
  monorepo: 'super-sales-agent',
  skills_dir: SKILLS_DIR,
  total_count: total,
  high_risk_count: highRisk,
  requires_api_count: requiresApi,
  has_existing_tests_count: hasTests,
  total_estimated_minutes: totalMinutes,
  skills: scanResults
};

// 保存测试计划
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(testPlan, null, 2));

console.log('✅ 扫描完成！\n');
console.log(`总计：${total} 个 skill`);
console.log(`高风险：${highRisk} 个`);
console.log(`需要真实 API：${requiresApi} 个`);
console.log(`已有测试：${hasTests} 个`);
console.log(`预计时间：${totalMinutes} 分钟\n`);
console.log(`📄 测试计划已保存：${OUTPUT_FILE}\n`);

// 高风险技能
if (highRisk > 0) {
  console.log('⚠️ 高风险技能（需要人工确认）：');
  scanResults.filter(s => s.risk_level === 'high').forEach(s => {
    console.log(`  - ${s.name}: ${s.function}`);
  });
  console.log('');
}

// 需要真实 API 的技能
if (requiresApi > 0) {
  console.log('🔌 需要真实 API 的技能：');
  scanResults.filter(s => s.requires_real_api).forEach(s => {
    console.log(`  - ${s.name}: ${s.external_deps.join(', ')}`);
  });
  console.log('');
}
