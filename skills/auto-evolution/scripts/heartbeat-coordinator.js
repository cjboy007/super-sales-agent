#!/usr/bin/env node

/**
 * Coordinator Heartbeat — drives the full evolution loop.
 * 
 * Each tick processes one task through the complete cycle:
 * pending → Reviewer → reviewed → Executor → Auditor → pending (next) or completed
 * 
 * The coordinator spawns 3 sub-agent roles:
 * - Reviewer: pre-execution review, generates instructions
 * - Executor: implements one subtask
 * - Auditor: post-execution quality check, decides pass/retry
 * 
 * CLI usage:
 *   node heartbeat-coordinator.js                           # scan + process one task
 *   node heartbeat-coordinator.js --phase review            # only review
 *   node heartbeat-coordinator.js --phase execute           # only execute
 *   node heartbeat-coordinator.js --phase audit             # only audit
 *   node heartbeat-coordinator.js apply-review <task> <result>
 *   node heartbeat-coordinator.js apply-exec <task> <result>
 *   node heartbeat-coordinator.js apply-audit <task> <result>
 */

const fs = require('fs');
const path = require('path');
const { classifyTask, extractTaskPattern } = require('./utils/classify');

// Workspace resolution
const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.env.WORKSPACE || path.join(require('os').homedir(), '.openclaw', 'agents', 'main', 'workspace');
const TASKS_DIR = process.env.EVOLUTION_TASKS_DIR || path.join(WORKSPACE, 'evolution', 'tasks');
const EVOLUTION_DIR = path.join(WORKSPACE, 'evolution');
const CAPSULE_INDEX_FILE = path.join(EVOLUTION_DIR, 'capsules', 'capsule-index.json');
const LOCK_FILE = path.join(TASKS_DIR, '.coordinator.lock');
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

function ensureMetadata(task) {
  if (!task.metadata) {
    task.metadata = {
      category: classifyTask(task.goal),
      task_pattern: extractTaskPattern(task.goal),
      complexity_score: task.context?.complexity_score ?? null,
      blast_radius: null,
      confidence_score: null,
      validation_commands: null,
      related_capsules: null,
      diff_summary: null
    };
  }
  return task;
}

// ==================== Capsule Matching (v2 Phase 3) ====================

function loadCapsuleIndex() {
  try {
    if (fs.existsSync(CAPSULE_INDEX_FILE)) {
      return JSON.parse(fs.readFileSync(CAPSULE_INDEX_FILE, 'utf8'));
    }
  } catch { /* ignore */ }
  return { capsules: [] };
}

function matchRelatedCapsules(task) {
  const index = loadCapsuleIndex();
  if (!index.capsules || index.capsules.length === 0) return [];

  const goal = (task.goal || '').toLowerCase();
  const keywords = goal.split(/\s+/).filter(w => w.length > 2);
  const category = task.metadata?.category || classifyTask(task.goal);

  const scored = index.capsules.map(c => {
    let score = 0;
    // Category match (40%)
    if (c.category === category) score += 0.4;
    // Pattern/keyword match (40%)
    const text = ((c.task_pattern || '') + ' ' + (c.goal_summary || '')).toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) { score += 0.4 / keywords.length; break; }
    }
    // Complexity proximity (20%)
    const diff = Math.abs((c.complexity_score || 12) - (task.metadata?.complexity_score || 12));
    if (diff <= 5) score += 0.2;
    return { ...c, match_score: score };
  });

  return scored
    .filter(c => c.match_score > 0.3)
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, 3);
}

// ==================== Lock ====================

function acquireLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      const age = Date.now() - lockData.timestamp;
      if (age < LOCK_TIMEOUT_MS) {
        console.log(`⏳ Locked (${Math.round(age / 1000)}s ago), skipping`);
        return false;
      }
      console.log(`⚠️ Lock expired, force-acquiring`);
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ timestamp: Date.now(), pid: process.pid }));
    return true;
  } catch (err) {
    console.error('❌ Lock failed:', err.message);
    return false;
  }
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch (err) {}
}

// ==================== Task Scanning ====================

function scanTasks() {
  if (!fs.existsSync(TASKS_DIR)) return [];
  const tasks = [];
  const files = fs.readdirSync(TASKS_DIR).filter(f => f.endsWith('.json') && f.startsWith('task-'));
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, file), 'utf8'));
      tasks.push({ file, ...data });
    } catch (err) {
      console.error(`⚠️ Read ${file} failed:`, err.message);
    }
  }
  return tasks;
}

function selectNextTask(tasks, filterPhase) {
  // Optional phase filter for CLI --phase flag
  const statusForPhase = { review: 'pending', execute: 'reviewed', audit: 'executing' };
  const filtered = filterPhase && statusForPhase[filterPhase]
    ? tasks.filter(t => t.status === statusForPhase[filterPhase])
    : tasks;
  
  // Priority: reviewed (needs exec) > pending (needs review) > executing (needs audit)
  const reviewed = filtered.filter(t => t.status === 'reviewed');
  if (reviewed.length > 0) {
    reviewed.sort((a, b) => a.task_id.localeCompare(b.task_id));
    return { task: reviewed[0], phase: 'execute' };
  }
  
  const executing = filtered.filter(t => t.status === 'executing');
  if (executing.length > 0) {
    executing.sort((a, b) => a.task_id.localeCompare(b.task_id));
    return { task: executing[0], phase: 'audit' };
  }
  
  const pending = filtered.filter(t => t.status === 'pending');
  if (pending.length > 0) {
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    pending.sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 99;
      const pb = priorityOrder[b.priority] ?? 99;
      if (pa !== pb) return pa - pb;
      return a.task_id.localeCompare(b.task_id);
    });
    return { task: pending[0], phase: 'review' };
  }
  
  return null;
}

// ==================== Phase: Review ====================

function buildReviewPrompt(task) {
  const iteration = (task.current_iteration || 0) + 1;
  const subtasks = task.context?.subtasks || [];
  const execPlan = task.context?.execution_plan || [];
  const lastResult = task.result || {};
  const completedStep = lastResult.subtask_completed || 0;
  const nextStep = completedStep + 1;

  // Ensure metadata
  ensureMetadata(task);

  // Find related capsules
  const relatedCapsules = matchRelatedCapsules(task);

  const steps = execPlan.length > 0
    ? execPlan.map(s => `${s.step}. ${s.action}${s.validation ? ' [verify: ' + s.validation.join(', ') + ']' : ''}`)
    : subtasks.map((s, i) => `${i + 1}. ${s}`);

  let prompt = `You are a Reviewer for the auto-evolution system.

## Task
- **ID:** ${task.task_id}
- **Goal:** ${task.goal}
- **Category:** ${task.metadata.category}
- **Pattern:** ${task.metadata.task_pattern}
- **Iteration:** ${iteration} / ${task.max_iterations}
- **Progress:** ${completedStep} / ${Math.max(subtasks.length, execPlan.length)} steps

## Steps
${steps.join('\n')}

## Previous Result
${lastResult.summary || '(First iteration)'}
`;

  // Inject historical capsule references
  if (relatedCapsules.length > 0) {
    prompt += `\n## Historical Reference (${relatedCapsules.length} similar capsules)\n`;
    for (const c of relatedCapsules) {
      prompt += `- **${c.capsule_id}** (${c.category}) — ${c.goal_summary} | Score: ${c.outcome_score} | Pattern: ${c.task_pattern}\n`;
    }
    prompt += '\nReference these historical capsules when planning.\n';
    // Store related capsules in metadata
    task.metadata.related_capsules = relatedCapsules.map(c => c.capsule_id);
  }

  prompt += `\n## Output Requirements\n1. Include "validation_commands": array of shell commands to verify the result\n2. Include "strategy": ordered execution steps\n\n## Output (strict JSON)\n\`\`\`json\n{\n  "verdict": "approve",\n  "feedback": "Review comments",\n  "validation_commands": ["npm test"],\n  "strategy": ["Step 1 description", "Step 2 description"],\n  "next_instructions": {\n    "summary": "Iteration ${iteration}: Step ${nextStep}",\n    "current_step": ${nextStep},\n    "total_steps": ${Math.max(subtasks.length, execPlan.length)},\n    "step": {\n      "step": ${nextStep},\n      "action": "${(execPlan[nextStep - 1]?.action || subtasks[nextStep - 1] || '')}",\n      "detail": "Implementation details..."\n    },\n    "acceptance_criteria": ["Criterion 1", "Criterion 2"]\n  }\n}\n\`\`\`\n\nOutput only JSON.\n`;

  return prompt;
}

function applyReview(task, reviewResult) {
  const filePath = path.join(TASKS_DIR, task.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const now = new Date().toISOString();
  
  let review;
  try {
    // Lazy JSON extraction: try fenced block first, then smallest {..} containing "verdict"
    const jsonMatch = reviewResult.match(/```json\s*([\s\S]*?)\s*```/) || 
                      reviewResult.match(/\{[^{}]*"verdict"[^{}]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : reviewResult;
    review = JSON.parse(jsonStr);
  } catch (err) {
    console.error('⚠️ Parse review failed:', err.message);
    review = { verdict: 'approve', feedback: reviewResult, next_instructions: null };
  }
  
  if (review.verdict === 'complete') {
    data.status = 'completed';
    data.review = { verdict: 'complete', reviewed_at: now, feedback: review.feedback };
  } else {
    data.status = 'reviewed';
    data.current_iteration = (data.current_iteration || 0) + 1;
    data.review = {
      verdict: review.verdict || 'approve',
      reviewed_at: now,
      feedback: review.feedback || '',
      next_instructions: review.next_instructions || null
    };

    // v2: Save validation_commands and strategy to metadata
    if (!data.metadata) data.metadata = {};
    if (review.validation_commands) data.metadata.validation_commands = review.validation_commands;
    if (review.strategy) data.metadata._reviewer_strategy = review.strategy;
  }

  data.updated_at = now;
  if (!data.history) data.history = [];
  data.history.push({
    timestamp: now,
    action: `iteration_${data.current_iteration || 0}_reviewed`,
    role: 'reviewer',
    verdict: review.verdict,
    notes: review.feedback || `Review: ${review.verdict}`
  });
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ Task ${task.task_id} reviewed: ${review.verdict}`);
  return review.verdict;
}

// ==================== Phase: Execute ====================

function buildExecutePrompt(task) {
  const instructions = task.review?.next_instructions;
  if (!instructions) {
    return `Task ${task.task_id} is reviewed but missing next_instructions.`;
  }
  
  const step = instructions.step || {};
  const criteria = instructions.acceptance_criteria || [];
  
  return `You are an Executor for the auto-evolution system.

## Task
- **ID:** ${task.task_id}
- **Goal:** ${task.goal}
- **Current Step:** ${instructions.current_step} / ${instructions.total_steps}

## Subtask
**${step.action || instructions.summary}**

${step.detail || ''}

## Acceptance Criteria
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Rules
- Run verification after each change
- If verification fails, attempt fix (max 3 tries)
- If unfixable, set needs_manual: true and describe

## Output (strict JSON)
\`\`\`json
{
  "subtask_completed": ${instructions.current_step},
  "summary": "What was done",
  "acceptance_criteria_met": ["Passed criteria"],
  "needs_manual": false,
  "fixes_applied": ["Fixes (if any)"]
}
\`\`\`
`;
}

function applyExecution(task, execResult) {
  const filePath = path.join(TASKS_DIR, task.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const now = new Date().toISOString();
  
  let result;
  try {
    const jsonMatch = execResult.match(/```json\s*([\s\S]*?)\s*```/) || 
                      execResult.match(/\{[^{}]*"subtask_completed"[^{}]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : execResult;
    result = JSON.parse(jsonStr);
  } catch (err) {
    result = {
      subtask_completed: (data.review?.next_instructions?.current_step || 0),
      summary: execResult
    };
  }
  
  data.status = 'executing'; // Now ready for audit
  data.updated_at = now;
  data.result = {
    iteration: data.current_iteration,
    completed_at: now,
    subtask_completed: result.subtask_completed || 0,
    summary: result.summary || '',
    acceptance_criteria_met: result.acceptance_criteria_met || []
  };
  
  if (!data.history) data.history = [];
  data.history.push({
    timestamp: now,
    action: `iteration_${data.current_iteration}_executed`,
    role: 'executor',
    subtask: result.subtask_completed || 0,
    result: 'success',
    notes: result.summary || `Step ${result.subtask_completed} done`
  });
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ Task ${task.task_id} step ${result.subtask_completed} executed (awaiting audit)`);
}

// ==================== Phase: Audit ====================

function buildAuditPrompt(task) {
  const instructions = task.review?.next_instructions;
  const result = task.result || {};
  
  return `You are an Auditor for the auto-evolution system.

## Task
- **ID:** ${task.task_id}
- **Goal:** ${task.goal}
- **Current Step:** ${instructions?.current_step || '?'} / ${instructions?.total_steps || '?'}

## Instructions Given
${instructions?.step?.action || 'N/A'}
${instructions?.step?.detail || ''}

## Acceptance Criteria
${(instructions?.acceptance_criteria || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}

## Execution Result
${result.summary || 'No summary provided'}

## Your Job
1. Verify instructions were followed
2. Check acceptance criteria are met
3. Decide: pass / fail (with feedback)

## Output (strict JSON)
\`\`\`json
{
  "verdict": "pass",
  "feedback": "Audit comments",
  "criteria_passed": ["Criteria that passed"],
  "issues": ["Issues found (if any)"]
}
\`\`\`
`;
}

function applyAudit(task, auditResult) {
  const filePath = path.join(TASKS_DIR, task.file);
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const now = new Date().toISOString();
  
  let audit;
  try {
    const jsonMatch = auditResult.match(/```json\s*([\s\S]*?)\s*```/) || 
                      auditResult.match(/\{[^{}]*"verdict"[^{}]*\}/);
    const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : auditResult;
    audit = JSON.parse(jsonStr);
  } catch (err) {
    console.error('⚠️ Parse audit failed:', err.message);
    audit = { verdict: 'pass', feedback: auditResult };
  }
  
  const subtasks = data.context?.subtasks || [];
  const completedStep = data.result?.subtask_completed || 0;
  const allDone = completedStep >= subtasks.length;
  
  if (audit.verdict === 'pass') {
    if (allDone) {
      data.status = 'completed';
    } else {
      data.status = 'pending'; // Next subtask
    }
  } else {
    // Fail — retry
    data.status = 'pending';
    data.current_iteration = (data.current_iteration || 0) + 1;
  }
  
  data.updated_at = now;
  if (!data.history) data.history = [];
  data.history.push({
    timestamp: now,
    action: `iteration_${data.current_iteration}_audited`,
    role: 'auditor',
    verdict: audit.verdict,
    notes: audit.feedback || `Audit: ${audit.verdict}`
  });
  
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ Task ${task.task_id} audited: ${audit.verdict} → ${data.status}`);
  return { verdict: audit.verdict, nextStatus: data.status };
}

// ==================== Main ====================

async function main(filterPhase) {
  console.log(`\n🔄 Coordinator @ ${new Date().toISOString()}`);
  
  if (!acquireLock()) return;
  
  try {
    const tasks = scanTasks();
    console.log(`📋 Found ${tasks.length} tasks`);
    
    const statusCounts = {};
    for (const t of tasks) {
      statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
    }
    console.log(`📊 Status:`, JSON.stringify(statusCounts));
    
    const selection = selectNextTask(tasks, filterPhase);
    if (!selection) {
      console.log('✅ No tasks to process');
      return;
    }
    
    const { task, phase } = selection;
    console.log(`🎯 Selected: ${task.task_id} (${phase}) - ${task.goal}`);
    
    if (phase === 'review') {
      const prompt = buildReviewPrompt(task);

      // Persist related_capsules metadata to task file
      if (task.metadata && task.metadata.related_capsules && task.metadata.related_capsules.length > 0 && task.file) {
        const filePath = path.join(TASKS_DIR, task.file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        data.metadata = data.metadata || {};
        data.metadata.related_capsules = task.metadata.related_capsules;
        data.updated_at = new Date().toISOString();
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`🔗 Linked ${task.metadata.related_capsules.length} capsule(s) to ${task.task_id}`);
      }

      console.log('\n--- REVIEW_PROMPT_START ---');
      console.log(JSON.stringify({
        task_id: task.task_id,
        task_file: task.file,
        phase: 'review',
        prompt
      }));
      console.log('--- REVIEW_PROMPT_END ---');
      
    } else if (phase === 'execute') {
      const prompt = buildExecutePrompt(task);
      console.log('\n--- EXECUTE_PROMPT_START ---');
      console.log(JSON.stringify({
        task_id: task.task_id,
        task_file: task.file,
        phase: 'execute',
        prompt
      }));
      console.log('--- EXECUTE_PROMPT_END ---');
      
    } else if (phase === 'audit') {
      const prompt = buildAuditPrompt(task);
      console.log('\n--- AUDIT_PROMPT_START ---');
      console.log(JSON.stringify({
        task_id: task.task_id,
        task_file: task.file,
        phase: 'audit',
        prompt
      }));
      console.log('--- AUDIT_PROMPT_END ---');
    }
    
  } finally {
    releaseLock();
  }
}

// CLI sub-commands
let phaseFilter = null;
let cmdIdx = 2;
// Parse --phase flag
if (process.argv[2] === '--phase' && process.argv[3]) {
  phaseFilter = process.argv[3];
  cmdIdx = 4;
}
const cmd = process.argv[cmdIdx];
const taskFile = process.argv[cmdIdx + 1];
const resultFile = process.argv[cmdIdx + 2];

if (cmd === 'apply-review' && taskFile && resultFile) {
  const task = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, taskFile), 'utf8'));
  task.file = taskFile;
  applyReview(task, fs.readFileSync(resultFile, 'utf8'));

} else if (cmd === 'apply-exec' && taskFile && resultFile) {
  const task = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, taskFile), 'utf8'));
  task.file = taskFile;
  applyExecution(task, fs.readFileSync(resultFile, 'utf8'));

} else if (cmd === 'apply-audit' && taskFile && resultFile) {
  const task = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, taskFile), 'utf8'));
  task.file = taskFile;
  applyAudit(task, fs.readFileSync(resultFile, 'utf8'));

} else {
  main(phaseFilter).catch(err => {
    console.error('❌ Error:', err);
    releaseLock();
  });
}

module.exports = { scanTasks, selectNextTask, buildReviewPrompt, buildExecutePrompt, buildAuditPrompt, applyReview, applyExecution, applyAudit, classifyTask, extractTaskPattern, matchRelatedCapsules };
