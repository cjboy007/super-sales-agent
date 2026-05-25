#!/usr/bin/env node
/**
 * Security gate for command execution helpers.
 *
 * This test keeps CI focused on the P0/P1 command-injection surface without
 * running any external commands or touching network services.
 */
'use strict';

const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    failed++;
    failures.push({ name, error: err.message });
    process.stdout.write(`  ✗ ${name}: ${err.message}\n`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function assertContains(haystack, needle, label) {
  if (!haystack.includes(needle)) {
    throw new Error(`${label}: expected to find ${needle}`);
  }
}

function assertNotContains(haystack, needle, label) {
  if (haystack.includes(needle)) {
    throw new Error(`${label}: forbidden pattern present: ${needle}`);
  }
}

const emailInbox = read('farreach/handlers/email-inbox.js');
const workflowExecutor = read('skills/workflow-engine/lib/action-executor.js');

console.log('\n🧨 Command injection guardrails');

test('email inbox handler uses spawn with argv array for CLI calls', () => {
  assertContains(emailInbox, "const { spawn } = require('child_process')", 'email-inbox import');
  assertContains(emailInbox, 'spawn(cmd, args, {', 'email-inbox spawn call');
  assertNotContains(emailInbox, 'exec(', 'email-inbox');
  assertNotContains(emailInbox, 'shell: true', 'email-inbox');
});

test('workflow action executor does not import child_process or execute shell commands', () => {
  assertNotContains(workflowExecutor, 'child_process', 'action-executor');
  assertNotContains(workflowExecutor, 'exec(', 'action-executor');
  assertNotContains(workflowExecutor, 'spawn(', 'action-executor');
  assertNotContains(workflowExecutor, 'shell: true', 'action-executor');
});

console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  ✗ ${f.name}: ${f.error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
