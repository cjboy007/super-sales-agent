#!/usr/bin/env node

/**
 * 工作流引擎 CLI 工具
 */

const { RuleEngine } = require('../lib/rule-engine');
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case 'run':
      await runWorkflow(args);
      break;
    case 'validate':
      await validateRules(args);
      break;
    case 'list-rules':
      await listRules(args);
      break;
    case 'help':
    default:
      showHelp();
  }
}

async function runWorkflow(args) {
  const eventFile = args.find(a => a.startsWith('--event='))?.split('=')[1];
  const dryRun = args.includes('--dry-run');

  if (!eventFile) {
    console.error('❌ Missing --event parameter');
    process.exit(1);
  }

  const event = JSON.parse(fs.readFileSync(eventFile, 'utf-8'));
  
  const engine = new RuleEngine({ dryRun });
  await engine.initialize();
  
  const result = await engine.handleEvent(event);
  
  console.log('✅ Event processed:');
  console.log(`   Matched: ${result.matched} rules`);
  console.log(`   Executed: ${result.executed} rules`);
  
  if (result.results) {
    result.results.forEach((r, i) => {
      console.log(`   Rule ${i + 1}: ${r.rule_id} - ${r.success ? '✅' : '❌'}`);
    });
  }
}

async function validateRules(args) {
  const rulesDir = args.find(a => a.startsWith('--rules='))?.split('=')[1] || './config/rules';
  
  const engine = new RuleEngine({ rulesDir });
  
  try {
    await engine.initialize();
    console.log('✅ Rules validation passed!');
    console.log(`   Loaded: ${engine.rules.size} rules`);
    engine.getRules().forEach(rule => {
      console.log(`   - ${rule.id} (priority: ${rule.priority})`);
    });
  } catch (error) {
    console.error('❌ Rules validation failed:');
    console.error(`   ${error.message}`);
    process.exit(1);
  }
}

async function listRules(args) {
  const engine = new RuleEngine();
  await engine.initialize();
  
  console.log('📋 Loaded rules:');
  engine.getRules().forEach(rule => {
    console.log(`   ${rule.enabled ? '✅' : '⏸️'}  ${rule.id} - ${rule.name} (priority: ${rule.priority}, event: ${rule.event_type})`);
  });
}

function showHelp() {
  console.log(`
Workflow Engine CLI

Usage:
  workflow-cli.js <command> [options]

Commands:
  run          Run workflow with an event
  validate     Validate rule configurations
  list-rules   List all loaded rules
  help         Show this help message

Options:
  --event=<file>     Event JSON file path (for 'run' command)
  --rules=<dir>      Rules directory path (for 'validate' command)
  --dry-run          Run in dry-run mode (don't execute actions)

Examples:
  workflow-cli.js run --event=event.json
  workflow-cli.js validate --rules=config/rules/
  workflow-cli.js list-rules
  workflow-cli.js run --event=event.json --dry-run
`);
}

main().catch(console.error);
