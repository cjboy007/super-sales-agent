#!/usr/bin/env node

/**
 * Category Stats — Phase 4
 *
 * Analyzes capsules by category, computes success rates, confidence distribution,
 * blast radius trends, and generates evolution reports.
 *
 * Usage:
 *   node category-stats.js                  # print summary
 *   node category-stats.js --json           # JSON output
 *   node category-stats.js --report         # generate weekly report markdown
 *   node category-stats.js --weekly         # generate this week's report
 */

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.env.WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'agents', 'main', 'workspace');
const EVOLUTION_DIR = path.join(WORKSPACE, 'evolution');
const CAPSULE_INDEX = path.join(EVOLUTION_DIR, 'capsules', 'capsule-index.json');
const ARCHIVE_DIR = path.join(EVOLUTION_DIR, 'archive');
const REPORTS_DIR = path.join(EVOLUTION_DIR, 'reports');

// ==================== Data Loading ====================

function loadCapsules() {
  try {
    return JSON.parse(fs.readFileSync(CAPSULE_INDEX, 'utf8'));
  } catch {
    return { capsules: [] };
  }
}

function loadArchiveTasks() {
  if (!fs.existsSync(ARCHIVE_DIR)) return [];
  return fs.readdirSync(ARCHIVE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf8')));
}

// ==================== Category Analysis ====================

function computeStats() {
  const index = loadCapsules();
  const tasks = loadArchiveTasks();
  const capsules = index.capsules || [];

  if (capsules.length === 0) {
    return { total: 0, message: 'No capsules in index yet.' };
  }

  // Category breakdown
  const byCategory = {};
  for (const c of capsules) {
    const cat = c.category || 'unknown';
    if (!byCategory[cat]) {
      byCategory[cat] = { count: 0, total_score: 0, total_files: 0, total_lines: 0, scores: [], capsules: [] };
    }
    byCategory[cat].count++;
    byCategory[cat].total_score += c.outcome_score || 0;
    byCategory[cat].total_files += (c.blast_radius?.files || 0);
    byCategory[cat].total_lines += (c.blast_radius?.lines || 0);
    byCategory[cat].scores.push(c.outcome_score || 0);
    byCategory[cat].capsules.push(c);
  }

  // Compute averages
  const categories = {};
  for (const [cat, data] of Object.entries(byCategory)) {
    const avgScore = data.total_score / data.count;
    const minScore = Math.min(...data.scores);
    const maxScore = Math.max(...data.scores);
    categories[cat] = {
      count: data.count,
      avg_score: Math.round(avgScore * 100) / 100,
      min_score: minScore,
      max_score: maxScore,
      avg_files: Math.round(data.total_files / data.count),
      avg_lines: Math.round(data.total_lines / data.count),
      capsules: data.capsules.map(c => ({
        id: c.capsule_id,
        score: c.outcome_score,
        goal: c.goal_summary,
        pattern: c.task_pattern
      }))
    };
  }

  // Overall stats
  const allScores = capsules.map(c => c.outcome_score || 0);
  const totalFiles = capsules.reduce((s, c) => s + (c.blast_radius?.files || 0), 0);
  const totalLines = capsules.reduce((s, c) => s + (c.blast_radius?.lines || 0), 0);
  const avgScore = allScores.length > 0 ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 100) / 100 : 0;

  // Success rate (score >= 0.7 = success)
  const successCount = allScores.filter(s => s >= 0.7).length;
  const successRate = allScores.length > 0 ? Math.round(successCount / allScores.length * 100) : 0;

  // Confidence distribution (for capsules that have it)
  const withConfidence = capsules.filter(c => c.confidence_score !== null && c.confidence_score !== undefined);

  // Top capsules by score
  const topCapsules = [...capsules].sort((a, b) => (b.outcome_score || 0) - (a.outcome_score || 0)).slice(0, 5);

  return {
    total_capsules: capsules.length,
    total_tasks_archived: tasks.length,
    total_files_changed: totalFiles,
    total_lines_changed: totalLines,
    avg_outcome_score: avgScore,
    success_rate: successRate,
    categories,
    confidence_coverage: withConfidence.length + '/' + capsules.length,
    top_capsules: topCapsules.map(c => ({
      id: c.capsule_id,
      category: c.category,
      score: c.outcome_score,
      goal: c.goal_summary,
      files: c.blast_radius?.files || 0,
      lines: c.blast_radius?.lines || 0
    })),
    generated_at: new Date().toISOString()
  };
}

// ==================== Report Generation ====================

function generateReport(stats) {
  if (stats.total_capsules === 0) {
    return '# 进化分析报告\n\n暂无 Capsule 数据。完成任务后自动生成。\n';
  }

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  let md = '# AI Agent 进化周报\n\n';
  md += '**周期：** ' + weekStart.toLocaleDateString('zh-CN') + ' — ' + now.toLocaleDateString('zh-CN') + '\n';
  md += '**生成时间：** ' + now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) + '\n\n';

  md += '---\n\n';
  md += '## 总览\n\n';
  md += '| 指标 | 数值 |\n|------|------|\n';
  md += '| Capsule 总数 | ' + stats.total_capsules + ' |\n';
  md += '| 已归档任务 | ' + stats.total_tasks_archived + ' |\n';
  md += '| 累计变更文件 | ' + stats.total_files_changed + ' |\n';
  md += '| 累计变更行数 | ' + stats.total_lines_changed + ' |\n';
  md += '| 平均结果评分 | ' + stats.avg_outcome_score + ' |\n';
  md += '| 成功率 (score >= 0.7) | ' + stats.success_rate + '% |\n';
  md += '| 置信度覆盖率 | ' + stats.confidence_coverage + ' |\n\n';

  md += '## 分类统计\n\n';
  const catIcons = {
    build: '🏗️', refactor: '🔄', optimize: '⚡',
    repair: '🔧', test: '🧪', integrate: '🔌', unknown: '❓'
  };

  for (const [cat, data] of Object.entries(stats.categories).sort((a, b) => b[1].count - a[1].count)) {
    const icon = catIcons[cat] || '📦';
    md += '### ' + icon + ' ' + cat + ' (' + data.count + ')\n\n';
    md += '| 指标 | 数值 |\n|------|------|\n';
    md += '| 平均评分 | ' + data.avg_score + ' |\n';
    md += '| 评分范围 | ' + data.min_score + ' ~ ' + data.max_score + ' |\n';
    md += '| 平均影响 | ' + data.avg_files + ' 文件 / ' + data.avg_lines + ' 行 |\n\n';
    for (const c of data.capsules) {
      const scoreBar = '⭐'.repeat(Math.round(c.score * 5));
      md += '- **' + c.id + '** ' + scoreBar + ' — ' + c.goal + '\n';
      md += '  模式：' + c.pattern + '\n';
    }
    md += '\n';
  }

  md += '## Top 5 高价值 Capsule\n\n';
  for (let i = 0; i < stats.top_capsules.length; i++) {
    const c = stats.top_capsules[i];
    md += (i + 1) + '. **' + c.id + '** (' + c.category + ') — ' + c.goal + '\n';
    md += '   评分 ' + c.score + ' | ' + c.files + ' 文件 / ' + c.lines + ' 行\n\n';
  }

  md += '## 进化趋势\n\n';
  const highScore = stats.categories;
  const dominantCat = Object.entries(highScore).sort((a, b) => b[1].count - a[1].count)[0];
  if (dominantCat) {
    md += '当前主导类别：**' + dominantCat[0] + '**（' + dominantCat[1].count + ' 个，平均评分 ' + dominantCat[1].avg_score + '）\n\n';
  }
  md += '### 建议\n\n';
  if (stats.success_rate >= 80) {
    md += '- ✅ 整体成功率良好（' + stats.success_rate + '%），可以加速任务推进\n';
  } else if (stats.success_rate >= 60) {
    md += '- ⚠️ 成功率 ' + stats.success_rate + '%，建议优化低分任务的执行策略\n';
  } else {
    md += '- 🔴 成功率偏低（' + stats.success_rate + '%），建议增加 Reviewer 审查深度\n';
  }
  md += '- 📈 当前仅有 ' + Object.keys(stats.categories).length + ' 个类别有数据，建议拓展任务类型\n';
  md += '- 📊 置信度覆盖率 ' + stats.confidence_coverage + '，建议在 Phase 4 中由 Auditor 补充\n';

  md += '\n---\n\n_由 PHOENIX auto-evolution v2 自动生成_\n';
  return md;
}

// ==================== CLI ====================

const args = process.argv.slice(2);

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const stats = computeStats();

if (args[0] === '--json') {
  console.log(JSON.stringify(stats, null, 2));
  process.exit(0);
}

if (args[0] === '--report' || args[0] === '--weekly') {
  const report = generateReport(stats);
  const dateStr = new Date().toISOString().split('T')[0];
  const reportPath = path.join(REPORTS_DIR, dateStr + '-evolution-weekly.md');
  fs.writeFileSync(reportPath, report);
  console.log(report);
  console.log('\n✅ Report saved to: ' + reportPath);
  process.exit(0);
}

// Default: print summary
console.log('=== AI Agent Evolution Stats ===\n');
console.log('Capsules:', stats.total_capsules);
console.log('Archived tasks:', stats.total_tasks_archived);
console.log('Avg outcome score:', stats.avg_outcome_score);
console.log('Success rate:', stats.success_rate + '%');
console.log('Total files changed:', stats.total_files_changed);
console.log('Total lines changed:', stats.total_lines_changed);
console.log('Confidence coverage:', stats.confidence_coverage);
console.log('');

if (stats.categories) {
  console.log('By category:');
  for (const [cat, data] of Object.entries(stats.categories).sort((a, b) => b[1].count - a[1].count)) {
    console.log('  ' + cat + ': ' + data.count + ' tasks, avg=' + data.avg_score + ', files=' + data.avg_files + ', lines=' + data.avg_lines);
  }
}

if (stats.top_capsules && stats.top_capsules.length > 0) {
  console.log('\nTop capsules:');
  for (const c of stats.top_capsules) {
    console.log('  ' + c.id + ' (' + c.category + ') score=' + c.score + ' — ' + c.goal.substring(0, 50));
  }
}

module.exports = { computeStats, generateReport };
