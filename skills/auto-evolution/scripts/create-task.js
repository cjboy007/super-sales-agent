#!/usr/bin/env node

/**
 * Auto Evolution Task Creator — v2 compatible
 * Creates tasks using the v2 schema (goal, context.subtasks, metadata)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { classifyTask, extractTaskPattern } = require('./utils/classify');

const TASKS_DIR = path.join(__dirname, '../tasks');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function assessComplexity() {
  console.log('\n📊 Task Complexity Assessment (1-5 points each)\n');

  const codeLines = parseInt(await prompt('1. Code volume:\n   1=<100 lines, 3=200-500 lines, 5=>1000 lines\n   Score: '), 10) || 3;
  const files = parseInt(await prompt('2. Files to modify:\n   1=1-2, 3=5-10, 5=>20\n   Score: '), 10) || 3;
  const risk = parseInt(await prompt('3. Risk level:\n   1=docs/test, 3=feature improvement, 5=architecture change\n   Score: '), 10) || 3;
  const dependencies = parseInt(await prompt('4. Dependencies:\n   1=none, 3=3-5 deps, 5=cross-system\n   Score: '), 10) || 3;
  const innovation = parseInt(await prompt('5. Innovation:\n   1=routine fix, 3=feature enhancement, 5=new feature\n   Score: '), 10) || 3;

  const total = codeLines + files + risk + dependencies + innovation;

  let mode, taskType;
  if (total <= 10) {
    mode = 'manual';
    taskType = 'Simple';
  } else if (total >= 18) {
    mode = 'auto';
    taskType = 'Complex';
  } else {
    const choice = await prompt(`\nTotal: ${total}/25 (Medium).\nChoose mode:\n   1=manual (recommended)\n   2=auto (Reviewer generates subtasks)\n   Choice (1/2): `);
    mode = choice === '2' ? 'auto' : 'manual';
    taskType = mode === 'auto' ? 'Complex' : 'Simple';
  }

  return { code_lines: codeLines, files: files, risk: risk, dependencies: dependencies, innovation: innovation, total, mode, taskType };
}

function generateTaskId() {
  if (!fs.existsSync(TASKS_DIR)) return 1;
  const files = fs.readdirSync(TASKS_DIR).filter(f => f.match(/task-\d+\.json/));
  const ids = files.map(f => {
    const m = f.match(/task-(\d+)\.json/);
    return m ? parseInt(m[1], 10) : 0;
  });
  return (ids.length > 0 ? Math.max(...ids) : 0) + 1;
}

async function createManualSubtasks() {
  console.log('\n📝 Create Subtasks (empty line to finish)\n');
  const subtasks = [];
  let index = 0;

  while (true) {
    const title = await prompt(`Subtask ${index + 1} title (empty to finish): `);
    if (!title) break;
    const description = await prompt('Description: ');
    subtasks.push({ id: index, title, description });
    index++;
  }

  return subtasks;
}

function generateTaskJson(taskId, goal, description, complexity, subtasks, reviewerModel) {
  const now = new Date().toISOString();

  // v2 schema: goal at root, subtasks inside context
  const task = {
    task_id: String(taskId).padStart(3, '0'),
    goal: goal,
    description: description,
    status: 'pending',
    priority: 'medium',
    created_at: now,
    updated_at: now,
    current_iteration: 0,
    max_iterations: complexity.mode === 'auto' ? 10 : 3,
    context: {
      background: description,
      subtasks: subtasks.map(s => `${s.title}: ${s.description}`),
    },
    metadata: {
      category: classifyTask(goal),
      task_pattern: extractTaskPattern(goal),
      complexity_score: complexity.total,
      blast_radius: null,
      confidence_score: null,
      validation_commands: null,
      related_capsules: null,
      diff_summary: null,
    },
    history: [],
    result: null,
  };

  if (complexity.mode === 'auto') {
    task.status = 'pending';
    task.reviewer = {
      model: reviewerModel || 'anthropic/claude-sonnet-4-20250514',
      instructions: 'Analyze this task and generate detailed subtasks via execution_plan.',
    };
  }

  return task;
}

async function main() {
  console.log('🤖 Auto Evolution Task Creator (v2)\n');

  if (!fs.existsSync(TASKS_DIR)) {
    fs.mkdirSync(TASKS_DIR, { recursive: true });
  }

  const goal = await prompt('Task goal (one line): ');
  const description = await prompt('Task description: ');

  const complexity = await assessComplexity();
  console.log(`\n✅ Task type: ${complexity.taskType} | Mode: ${complexity.mode === 'manual' ? 'manual subtasks' : 'auto (Reviewer generates subtasks)'}`);

  let subtasks = [];
  if (complexity.mode === 'manual') {
    subtasks = await createManualSubtasks();
  }

  let reviewerModel;
  if (complexity.mode === 'auto') {
    reviewerModel = await prompt('Reviewer model (default: anthropic/claude-sonnet-4-20250514): ') || 'anthropic/claude-sonnet-4-20250514';
  }

  const taskId = generateTaskId();
  const taskJson = generateTaskJson(taskId, goal, description, complexity, subtasks, reviewerModel);

  const taskFile = path.join(TASKS_DIR, `task-${String(taskId).padStart(3, '0')}.json`);
  fs.writeFileSync(taskFile, JSON.stringify(taskJson, null, 2) + '\n', 'utf8');

  console.log(`\n✅ Task created!`);
  console.log(`📁 File: ${taskFile}`);
  console.log(`📊 Complexity: ${complexity.total}/25 | ${complexity.taskType}`);
  console.log(`🏷️ Category: ${taskJson.metadata.category} | Pattern: ${taskJson.metadata.task_pattern}`);
  console.log(`📝 Subtasks: ${subtasks.length}`);

  if (complexity.mode === 'auto') {
    console.log(`\n⏳ Next: Start Reviewer to generate detailed subtasks`);
    console.log(`   Command: node scripts/start-reviewer.js ${taskJson.task_id}`);
  } else {
    console.log(`\n⏳ Next: Run coordinator to execute task`);
    console.log(`   Command: node scripts/heartbeat-coordinator.js`);
  }

  rl.close();
}

main().catch(console.error);
