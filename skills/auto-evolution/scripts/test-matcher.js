const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.OPENCLAW_WORKSPACE || process.env.WORKSPACE || (require('os').homedir()) + '/.openclaw/agents/main/workspace';
const CAPSULE_INDEX = WORKSPACE + '/evolution/capsules/capsule-index.json';
const SCRIPTS = WORKSPACE + '/skills/auto-evolution/scripts';

const { matchCapsules, formatMatchReport } = require(SCRIPTS + '/capsule-matcher.js');

// Test 4 different task types
const tests = [
  { goal: 'Build an email skill with intent recognition and auto-reply', metadata: { complexity_score: 15 } },
  { goal: 'Integrate Feishu API for calendar sync and notifications', metadata: { complexity_score: 12 } },
  { goal: 'Fix login timeout bug in production dashboard', metadata: { complexity_score: 8 } },
  { goal: 'Write integration tests for the email processing pipeline', metadata: { complexity_score: 10 } },
];

console.log('=== Capsule Matcher Test ===\n');
console.log('Capsule index loaded from: ' + CAPSULE_INDEX);
console.log('');

for (const t of tests) {
  const task = { goal: t.goal, metadata: t.metadata };
  const result = matchCapsules(task);
  console.log('--- Task: "' + t.goal.substring(0, 55) + '..." ---');
  console.log('  Category: ' + result.task_category + ' | Pattern: ' + result.task_pattern);
  console.log('  Total capsules: ' + result.total_available + ' | Matches: ' + result.matches.length);
  if (result.matches.length > 0) {
    for (const m of result.matches) {
      console.log('  * ' + m.capsule_id + ' (' + m.category + ') score=' + m.match_score + ' - ' + m.goal_summary.substring(0, 40));
    }
  } else {
    console.log('  (no matches above threshold 0.3)');
  }
  console.log('');
}
