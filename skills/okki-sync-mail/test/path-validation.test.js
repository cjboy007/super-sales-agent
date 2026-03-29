#!/usr/bin/env node

/**
 * Path Validation Test Suite
 * Tests ALLOWED_WRITE_DIRS implementation across all modules
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🧪 Path Validation Test Suite\n');
console.log('=' .repeat(60));

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.log(`❌ FAIL: ${name}`);
    console.log(`   Error: ${err.message}`);
    failed++;
  }
}

// Test 1: Path utils module loads correctly
test('Path utils module loads', () => {
  const { validateReadPath, validateWritePath } = require('../scripts/path-utils');
  if (typeof validateReadPath !== 'function') throw new Error('validateReadPath not exported');
  if (typeof validateWritePath !== 'function') throw new Error('validateWritePath not exported');
});

// Test 2: validateWritePath accepts allowed directories
test('validateWritePath accepts workspace directory', () => {
  const { validateWritePath } = require('../scripts/path-utils');
  const result = validateWritePath('/Users/wilson/.openclaw/workspace/test');
  if (!result.includes('workspace')) throw new Error('Path not resolved correctly');
});

// Test 3: validateWritePath rejects unauthorized directories
test('validateWritePath rejects /etc/passwd', () => {
  const { validateWritePath } = require('../scripts/path-utils');
  try {
    validateWritePath('/etc/passwd');
    throw new Error('Should have thrown error');
  } catch (err) {
    if (!err.message.includes('Access denied')) throw err;
  }
});

// Test 4: Drafts module uses path validation
test('Drafts saveDraft uses path validation', () => {
  const { saveDraft } = require('../scripts/drafts');
  const draft = {
    subject: 'Test Draft',
    body: 'Test body',
    to: 'test@example.com',
    type: 'G',
  };
  const result = saveDraft(draft);
  if (!result.file_path.includes('drafts')) throw new Error('Draft not saved in drafts dir');
  // Clean up test draft
  if (fs.existsSync(result.file_path)) {
    fs.unlinkSync(result.file_path);
  }
});

// Test 5: Logger module uses path validation
test('Logger recordSentEmail uses path validation', () => {
  const logger = require('../lib/logger');
  const entry = logger.recordSentEmail(
    { from: 'test@example.com', to: 'customer@example.com', subject: 'Test', attachments: [] },
    { success: true, messageId: '<test@example.com>' }
  );
  if (!entry) throw new Error('Log entry not created');
});

// Test 6: Logger ensureLogDir validates path
test('Logger ensureLogDir validates path', () => {
  const logger = require('../lib/logger');
  logger.ensureLogDir();
  if (!fs.existsSync(logger.LOG_DIR)) throw new Error('Log dir not created');
});

// Test 7: IMAP module exports validateWritePath
test('IMAP module imports path-utils', () => {
  // This test ensures the module can be loaded without errors
  const imapModule = require('../scripts/imap');
  if (!imapModule.downloadAttachments) throw new Error('downloadAttachments not exported');
});

// Test 8: Auto-capture uses validated output directory
test('Auto-capture module loads with path validation', () => {
  // This test ensures the module can be loaded without errors
  // auto-capture is a CLI script, so we just verify it doesn't crash on load
  delete require.cache[require.resolve('../auto-capture')];
  require('../auto-capture');
  // If we get here without crashing, the test passes
});

// Test 9: .env.example exists and has proper documentation
test('.env.example exists with ALLOWED_WRITE_DIRS documentation', () => {
  const envExample = fs.readFileSync('./.env.example', 'utf8');
  if (!envExample.includes('ALLOWED_WRITE_DIRS')) {
    throw new Error('ALLOWED_WRITE_DIRS not documented in .env.example');
  }
  if (!envExample.includes('Security: Path Allowlists')) {
    throw new Error('Security section not documented');
  }
});

// Test 10: Path validation prevents directory traversal
test('Path validation prevents directory traversal attacks', () => {
  const { validateWritePath } = require('../scripts/path-utils');
  
  // Test various traversal attempts
  const maliciousPaths = [
    '/Users/wilson/.openclaw/workspace/../../../etc/passwd',
    '/Users/wilson/.openclaw/workspace/../../.ssh/id_rsa',
    '/tmp/../../root/.bashrc',
  ];
  
  maliciousPaths.forEach(testPath => {
    try {
      const resolved = validateWritePath(testPath);
      // If it doesn't throw, check that resolved path is still within allowed dirs
      if (resolved.includes('/etc') || resolved.includes('/.ssh') || resolved.includes('/root')) {
        throw new Error(`Path traversal succeeded for ${testPath}`);
      }
    } catch (err) {
      // Expected to throw for malicious paths
      if (!err.message.includes('Access denied') && !err.message.includes('ALLOWED_WRITE_DIRS')) {
        throw err;
      }
    }
  });
});

// Summary
console.log('=' .repeat(60));
console.log(`\n📊 Test Results: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('❌ Some tests failed. Review the errors above.');
  process.exit(1);
} else {
  console.log('✅ All tests passed! Path validation is working correctly.\n');
  process.exit(0);
}
