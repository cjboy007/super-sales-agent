#!/usr/bin/env node

/**
 * Capsule Generator — Phase 2
 *
 * Generates a Capsule file from a completed task and updates the capsule index.
 *
 * Usage:
 *   node generate-capsule.js <task-file.json>
 *   node generate-capsule.js --all                    # process all packaged tasks
 *   node generate-capsule.js --backfill                # backfill archive tasks
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { classifyTask, extractTaskPattern } = require('./utils/classify');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.env.WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'agents', 'main', 'workspace');
const EVOLUTION_DIR = path.join(WORKSPACE, 'evolution');
const CAPSULES_DIR = path.join(EVOLUTION_DIR, 'capsules');
const ARCHIVE_DIR = path.join(EVOLUTION_DIR, 'archive');
const INDEX_FILE = path.join(CAPSULES_DIR, 'capsule-index.json');

// ==================== Capsule ID Generation ====================

function getNextCapsuleId(index) {
  const max = index.capsules.reduce((m, c) => {
    const num = parseInt(c.capsule_id.replace('capsule-', ''), 10);
    return Math.max(m, num || 0);
  }, 0);
  return `capsule-${String(max + 1).padStart(3, '0')}`;
}

// ==================== Git Info ====================

function getGitInfo(outputLocation) {
  try {
    const cwd = outputLocation || WORKSPACE;
    const commit = execSync('git rev-parse --short HEAD', { cwd, encoding: 'utf8' }).trim();
    // Scope diff to the output directory to avoid counting entire repo
    const pathArg = outputLocation || '.';
    let diffStat = '';
    try {
      diffStat = execSync(`git diff --stat HEAD~5..HEAD -- "${pathArg}"`, { cwd: WORKSPACE, encoding: 'utf8' }).trim();
    } catch {
      try {
        diffStat = execSync(`git diff --stat -- "${pathArg}"`, { cwd: WORKSPACE, encoding: 'utf8' }).trim();
      } catch {
        diffStat = '';
      }
    }
    const fileCount = (diffStat.match(/\|/g) || []).length;
    const linesChanged = diffStat.split('\n').reduce((sum, line) => {
      const match = line.match(/(\d+)\s*(insertion|deletion)/);
      return sum + (match ? parseInt(match[1], 10) : 0);
    }, 0);
    return { commit, fileCount, linesChanged: linesChanged || 0 };
  } catch {
    return { commit: null, fileCount: 0, linesChanged: 0 };
  }
}

// ==================== Capsule Generation ====================

function generateCapsule(task) {
  const metadata = task.metadata || {};
  const result = task.result || {};
  const history = task.history || [];

  const capsuleId = getNextCapsuleId(loadIndex());

  // Extract strategy from execution_plan or subtasks
  const strategy = (task.context?.execution_plan || [])
    .map(s => s.action)
    .filter(Boolean);

  if (strategy.length === 0 && task.context?.subtasks) {
    strategy.push(...task.context.subtasks);
  }

  // Get git info
  const gitInfo = getGitInfo(task.packaged_location || task.context?.reference_files?.[0]);

  // Calculate outcome score from history
  const reviewCount = history.filter(h => h.action?.includes('review') && h.verdict === 'approve').length;
  const totalIterations = task.current_iteration || 1;
  const outcomeScore = Math.min(1, reviewCount / Math.max(totalIterations, 1));

  const capsule = {
    capsule_id: capsuleId,
    task_id: task.task_id,
    created_at: task.packaged_at || task.updated_at || new Date().toISOString(),
    git_commit: gitInfo.commit,
    category: metadata.category || classifyTask(task.goal),
    task_pattern: metadata.task_pattern || extractTaskPattern(task.goal),
    goal_summary: truncate(task.goal, 120),
    strategy: strategy.slice(0, 10),
    outcome: {
      status: result.status || 'success',
      score: Math.round(outcomeScore * 100) / 100,
      iterations: totalIterations,
      validation_passed: result.validation_passed ?? true
    },
    blast_radius: {
      files: metadata.blast_radius?.files ?? gitInfo.fileCount,
      lines: metadata.blast_radius?.lines ?? gitInfo.linesChanged,
      dependencies: metadata.blast_radius?.dependencies ?? 0
    },
    confidence_score: metadata.confidence_score ?? null,
    output_location: task.packaged_location || null,
    skill_name: task.packaged_skill || null
  };

  return capsule;
}

// classifyTask and extractTaskPattern imported from utils/classify.js

function truncate(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
}

// ==================== Index Management ====================

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  } catch {
    return { version: '2.0.0', updated_at: new Date().toISOString(), total: 0, capsules: [] };
  }
}

function saveIndex(index) {
  index.updated_at = new Date().toISOString();
  index.total = index.capsules.length;
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2) + '\n');
}

function saveCapsuleFile(capsule) {
  const file = path.join(CAPSULES_DIR, `${capsule.capsule_id}.json`);
  fs.writeFileSync(file, JSON.stringify(capsule, null, 2) + '\n');
  return file;
}

// ==================== Main ====================

function processTaskFile(taskPath) {
  const task = JSON.parse(fs.readFileSync(taskPath, 'utf8'));

  // Only process packaged/completed tasks
  if (task.status !== 'packaged' && task.status !== 'completed') {
    console.log(`⏭️  Skipped ${task.task_id}: status=${task.status}`);
    return null;
  }

  // Skip if already has capsule
  if (task.capsule) {
    console.log(`⏭️  Skipped ${task.task_id}: already has capsule`);
    return null;
  }

  const capsule = generateCapsule(task);

  // Save capsule file
  const capsuleFile = saveCapsuleFile(capsule);
  console.log(`✅ Generated ${capsule.capsule_id} from ${task.task_id} → ${capsuleFile}`);

  // Update index
  const index = loadIndex();
  index.capsules.push({
    capsule_id: capsule.capsule_id,
    task_id: capsule.task_id,
    category: capsule.category,
    task_pattern: capsule.task_pattern,
    goal_summary: capsule.goal_summary,
    outcome_score: capsule.outcome.score,
    blast_radius: capsule.blast_radius,
    confidence_score: capsule.confidence_score,
    git_commit: capsule.git_commit,
    created_at: capsule.created_at,
    output_location: capsule.output_location
  });
  saveIndex(index);

  // Update task file with capsule reference
  task.capsule = capsule;
  task.updated_at = new Date().toISOString();
  fs.writeFileSync(taskPath, JSON.stringify(task, null, 2) + '\n');
  console.log(`📝 Updated ${taskPath} with capsule reference`);

  return capsule;
}

// ==================== CLI ====================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage:');
  console.log('  node generate-capsule.js <task-file.json>');
  console.log('  node generate-capsule.js --all                    # process all packaged tasks');
  console.log('  node generate-capsule.js --backfill                # backfill archive tasks');
  process.exit(0);
}

if (args[0] === '--backfill') {
  // Process archive tasks
  if (!fs.existsSync(ARCHIVE_DIR)) {
    console.log('No archive directory found.');
    process.exit(0);
  }
  const files = fs.readdirSync(ARCHIVE_DIR).filter(f => f.endsWith('.json'));
  console.log(`📂 Processing ${files.length} archive tasks...\n`);
  let count = 0;
  for (const f of files) {
    try {
      processTaskFile(path.join(ARCHIVE_DIR, f));
      count++;
    } catch (err) {
      console.error(`❌ Error processing ${f}: ${err.message}`);
    }
  }
  console.log(`\n✅ Done. Processed ${count} tasks.`);
  process.exit(0);
}

if (args[0] === '--all') {
  // Process all tasks in tasks/ and archive/
  const dirs = [path.join(EVOLUTION_DIR, 'tasks'), ARCHIVE_DIR].filter(d => fs.existsSync(d));
  let count = 0;
  for (const dir of dirs) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const result = processTaskFile(path.join(dir, f));
        if (result) count++;
      } catch (err) {
        console.error(`❌ Error processing ${f}: ${err.message}`);
      }
    }
  }
  console.log(`\n✅ Done. Generated ${count} capsules.`);
  process.exit(0);
}

// Single file
const taskFile = args[0];
if (!fs.existsSync(taskFile)) {
  console.error(`File not found: ${taskFile}`);
  process.exit(1);
}

processTaskFile(taskFile);
