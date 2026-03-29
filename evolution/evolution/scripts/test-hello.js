#!/usr/bin/env node
const { execSync } = require('child_process');
const output = execSync('node /Users/wilson/.openclaw/workspace/evolution/scripts/hello-world.js').toString();
if (output.includes('Hello World')) {
  console.log('TEST PASSED: output contains Hello World');
  process.exit(0);
} else {
  console.error('TEST FAILED: output does not contain Hello World');
  process.exit(1);
}
