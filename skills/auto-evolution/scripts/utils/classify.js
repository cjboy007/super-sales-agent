#!/usr/bin/env node

/**
 * Shared task classification utilities.
 * Used by: heartbeat-coordinator.js, capsule-matcher.js, generate-capsule.js
 */

function classifyTask(goal) {
  const g = (goal || '').toLowerCase();
  if (g.includes('fix') || g.includes('bug') || g.includes('修复') || g.includes('error') || g.includes('失败')) return 'repair';
  if (g.includes('optim') || g.includes('性能') || g.includes('缓存') || g.includes('提速')) return 'optimize';
  if (g.includes('refactor') || g.includes('重构') || g.includes('拆分') || g.includes('重组')) return 'refactor';
  if (g.includes('test') || g.includes('测试') || g.includes('验证')) return 'test';
  if (g.includes('integrat') || g.includes('对接') || g.includes('接入') || g.includes('连接')) return 'integrate';
  return 'build';
}

function extractTaskPattern(goal) {
  const g = goal || '';
  if (g.includes('Skill') || g.includes('skill') || g.includes('skill-')) return 'Skill scaffolding';
  if (g.includes('CLI') || g.includes('命令行')) return 'CLI tool creation';
  if (g.includes('邮件') || g.includes('email')) return 'Email processing';
  if (g.includes('API') || g.includes('接口')) return 'API integration';
  if (g.includes('数据') || g.includes('data')) return 'Data pipeline';
  if (g.includes('文档') || g.includes('doc')) return 'Document processing';
  if (g.includes('监控') || g.includes('monitor')) return 'Monitoring setup';
  return 'General task';
}

module.exports = { classifyTask, extractTaskPattern };
