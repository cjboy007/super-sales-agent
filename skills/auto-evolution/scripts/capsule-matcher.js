#!/usr/bin/env node

/**
 * Capsule Matcher — Phase 3
 *
 * Matches new tasks against historical capsules and injects references.
 * Can be run standalone or called from the Coordinator.
 *
 * Usage:
 *   node capsule-matcher.js <task-file>              # match and update single task
 *   node capsule-matcher.js --all                     # match all pending tasks
 *   node capsule-matcher.js --dry-run <task-file>     # show matches without updating
 */

const fs = require('fs');
const path = require('path');
const { classifyTask, extractTaskPattern } = require('./utils/classify');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.env.WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'agents', 'main', 'workspace');
const EVOLUTION_DIR = path.join(WORKSPACE, 'evolution');
const CAPSULE_INDEX_FILE = path.join(EVOLUTION_DIR, 'capsules', 'capsule-index.json');
const TASKS_DIR = path.join(EVOLUTION_DIR, 'tasks');

// classifyTask and extractTaskPattern imported from utils/classify.js

// ==================== Capsule Matching ====================

function loadCapsuleIndex() {
  try {
    if (fs.existsSync(CAPSULE_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(CAPSULE_INDEX_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { capsules: [] };
}

function matchCapsules(task, maxResults = 3) {
  const index = loadCapsuleIndex();
  if (!index.capsules || index.capsules.length === 0) {
    return { matches: [], total_available: 0 };
  }

  // Ensure task has metadata
  if (!task.metadata) {
    task.metadata = {
      category: classifyTask(task.goal),
      task_pattern: extractTaskPattern(task.goal),
      complexity_score: null,
      blast_radius: null,
      confidence_score: null,
      validation_commands: null,
      related_capsules: null,
      diff_summary: null
    };
  }

  // Auto-classify if missing
  if (!task.metadata.category) task.metadata.category = classifyTask(task.goal);
  if (!task.metadata.task_pattern) task.metadata.task_pattern = extractTaskPattern(task.goal);

  const goal = (task.goal || '').toLowerCase();
  const keywords = goal.split(/\s+/).filter(w => w.length > 2);
  const category = task.metadata.category;

  const scored = index.capsules.map(c => {
    let score = 0;
    let reasons = [];

    // Category match (40%)
    if (c.category === category) {
      score += 0.4;
      reasons.push('category match');
    }

    // Pattern/keyword match (40%)
    const text = ((c.task_pattern || '') + ' ' + (c.goal_summary || '')).toLowerCase();
    const matchedKeywords = keywords.filter(kw => text.includes(kw));
    if (matchedKeywords.length > 0) {
      score += 0.4 * (matchedKeywords.length / keywords.length);
      reasons.push('keywords: ' + matchedKeywords.join(', '));
    }

    // Complexity proximity (20%)
    const taskComplexity = task.metadata.complexity_score || 12;
    const capsuleComplexity = c.complexity_score || 12;
    const diff = Math.abs(capsuleComplexity - taskComplexity);
    if (diff <= 5) {
      score += 0.2;
      reasons.push('complexity close');
    }

    return {
      capsule_id: c.capsule_id,
      task_id: c.task_id,
      category: c.category,
      task_pattern: c.task_pattern,
      goal_summary: c.goal_summary,
      outcome_score: c.outcome_score,
      blast_radius: c.blast_radius,
      git_commit: c.git_commit,
      created_at: c.created_at,
      output_location: c.output_location,
      match_score: Math.round(score * 100) / 100,
      match_reasons: reasons
    };
  });

  const matches = scored
    .filter(c => c.match_score > 0.3)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, maxResults);

  return {
    matches,
    total_available: index.capsules.length,
    task_category: category,
    task_pattern: task.metadata.task_pattern
  };
}

function formatMatchReport(result) {
  if (result.matches.length === 0) {
    return 'No matching capsules found. ' + result.total_available + ' capsules in index.\nCategory: ' + result.task_category + ' | Pattern: ' + result.task_pattern;
  }

  var report = 'Found ' + result.matches.length + ' matching capsules (' + result.total_available + ' total in index):\n\n';
  for (var i = 0; i < result.matches.length; i++) {
    var m = result.matches[i];
    report += m.capsule_id + ' (' + m.category + ') - Score: ' + Math.round(m.match_score * 100) + '%\n';
    report += '   Goal: ' + m.goal_summary + '\n';
    report += '   Pattern: ' + m.task_pattern + ' | Outcome: ' + m.outcome_score + '\n';
    report += '   Reasons: ' + m.match_reasons.join(', ') + '\n';
    if (m.output_location) report += '   Location: ' + m.output_location + '\n';
    report += '\n';
  }
  return report;
}

// ==================== Update Task File ====================

function updateTaskWithMatches(taskPath, matches) {
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));

  if (!task.metadata) task.metadata = {};
  task.metadata.related_capsules = matches.map(function(m) { return m.capsule_id; });
  task.updated_at = new Date().toISOString();

  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2) + '\n');
  return task;
}

// ==================== CLI ====================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage:');
  console.log('  node capsule-matcher.js <task-file>              # match and update single task');
  console.log('  node capsule-matcher.js --all                     # match all pending tasks');
  console.log('  node capsule-matcher.js --dry-run <task-file>     # show matches without updating');
  process.exit(0);
}

if (args[0] === '--all') {
  if (!fs.existsSync(TASKS_DIR)) {
    console.log('No tasks directory found.');
    process.exit(0);
  }
  const files = fs.readdirSync(TASKS_DIR).filter(function(f) { return f.endsWith('.json') && f.startsWith('task-'); });
  console.log('Processing ' + files.length + ' tasks...\n');
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const taskPath = path.join(TASKS_DIR, f);
    const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));
    const result = matchCapsules(task);
    console.log('\n--- ' + task.task_id + ': ' + task.goal.substring(0, 60) + ' ---');
    console.log(formatMatchReport(result));
    if (result.matches.length > 0) {
      updateTaskWithMatches(taskPath, result.matches);
      console.log('Updated ' + taskPath);
    }
  }
  process.exit(0);
}

if (args[0] === '--dry-run') {
  const taskFile = args[1];
  if (!taskFile || !fs.existsSync(taskFile)) {
    console.error('Task file not found.');
    process.exit(1);
  }
  const dryTask = JSON.parse(fs.readFileSync(taskFile, 'utf8'));
  const dryResult = matchCapsules(dryTask);
  console.log(formatMatchReport(dryResult));
  process.exit(0);
}

// Single file
const singleFile = args[0];
if (!fs.existsSync(singleFile)) {
  console.error('File not found: ' + singleFile);
  process.exit(1);
}

const singleTask = JSON.parse(fs.readFileSync(singleFile, 'utf8'));
const singleResult = matchCapsules(singleTask);
console.log(formatMatchReport(singleResult));

if (singleResult.matches.length > 0) {
  updateTaskWithMatches(singleFile, singleResult.matches);
  console.log('Updated ' + singleFile + ' with ' + singleResult.matches.length + ' capsule references');
}

module.exports = { matchCapsules, classifyTask, extractTaskPattern, formatMatchReport };
