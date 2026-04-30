#!/usr/bin/env node

/**
 * Reviewer Starter — outputs structured reviewer task for complex tasks.
 *
 * This script reads a task file, validates it, and prints a structured JSON
 * payload that the coordinator agent can use to spawn a Reviewer sub-agent.
 *
 * Usage:
 *   node start-reviewer.js <task-file.json>
 *
 * The coordinator agent should:
 *   1. Run this script to get the reviewer payload
 *   2. Spawn a Reviewer sub-agent with the payload.prompt
 *   3. Apply the review result via: heartbeat-coordinator.js apply-review
 */

const fs = require('fs');
const path = require('path');

const taskFile = process.argv[2];
if (!taskFile || !fs.existsSync(taskFile)) {
  console.error('❌ Task file not found.');
  console.error('Usage: node start-reviewer.js <task-file.json>');
  process.exit(1);
}

const task = JSON.parse(fs.readFileSync(taskFile, 'utf8'));

// Validate task is pending (needs review)
if (task.status !== 'pending') {
  console.error(`⚠️ Task ${task.task_id} status is '${task.status}', expected 'pending'.`);
  console.error('This script is for tasks that need review.');
  process.exit(1);
}

const subtasks = task.context?.subtasks || [];
const metadata = task.metadata || {};

const reviewerPrompt = `You are a Reviewer in the auto-evolution system. Your job is to analyze a complex task and generate a detailed execution plan.

## Task
- **ID:** ${task.task_id}
- **Goal:** ${task.goal}
- **Category:** ${metadata.category || 'unknown'}
- **Pattern:** ${metadata.task_pattern || 'unknown'}
- **Complexity:** ${metadata.complexity_score || 'N/A'}/25

## Context
${task.context?.background || task.description || 'No additional context.'}

## Subtasks (user-provided, may need refinement)
${subtasks.length > 0 ? subtasks.map((s, i) => `${i + 1}. ${s}`).join('\n') : '(No subtasks provided — you need to generate them from the goal.)'}

## Output (strict JSON only)
\`\`\`json
{
  "verdict": "approve",
  "feedback": "Your analysis of the task",
  "validation_commands": ["echo test"],
  "strategy": ["High-level step 1", "High-level step 2"],
  "next_instructions": {
    "summary": "Step 1 of N",
    "current_step": 1,
    "total_steps": 3,
    "step": {
      "step": 1,
      "action": "Detailed action for step 1",
      "detail": "Implementation guidance..."
    },
    "acceptance_criteria": ["Criterion 1", "Criterion 2"]
  }
}
\`\`\`

Output ONLY the JSON, no explanation.`;

const payload = {
  task_id: task.task_id,
  task_file: taskFile,
  phase: 'review',
  complexity: metadata.complexity_score,
  category: metadata.category,
  prompt: reviewerPrompt,
  instructions: 'Spawn a Reviewer sub-agent with the prompt above. Apply result via: node heartbeat-coordinator.js apply-review <task-file> <result-file>',
};

console.log(JSON.stringify(payload, null, 2));
