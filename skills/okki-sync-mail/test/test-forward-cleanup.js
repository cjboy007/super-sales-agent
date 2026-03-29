#!/usr/bin/env node

/**
 * Integration Test: Forward Temp File Cleanup
 * Tests that temp files are properly cleaned up in all scenarios.
 */

const fs = require('fs');
const path = require('path');
const temp = require('../lib/temp');
const drafts = require('../scripts/drafts');

const TEMP_FORWARDS = temp.getTempDir('forwards');

console.log('═══════════════════════════════════════════════════════════');
console.log('Integration Test: Forward Temp File Cleanup');
console.log('═══════════════════════════════════════════════════════════\n');

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    console.log(`🧪 Test: ${name}`);
    fn();
    console.log('✅ PASSED\n');
    testsPassed++;
  } catch (err) {
    console.error(`❌ FAILED: ${err.message}\n`);
    testsFailed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test 1: Temp directory structure
test('Temp directory structure', () => {
  const tempDir = temp.createTempDir('forwards');
  assert(fs.existsSync(tempDir), 'Temp forwards directory should exist');
  assert(tempDir.includes('temp/forwards'), 'Should be in temp/forwards');
});

// Test 2: Track and cleanup files
test('Track and cleanup files', () => {
  // Create test files
  const testFiles = [];
  for (let i = 0; i < 3; i++) {
    const filePath = path.join(TEMP_FORWARDS, `test-${Date.now()}-${i}.tmp`);
    fs.writeFileSync(filePath, `test content ${i}`);
    testFiles.push(temp.trackFile(filePath));
  }
  
  // Verify files exist
  const beforeCount = testFiles.filter(f => fs.existsSync(f.path)).length;
  assert(beforeCount === 3, 'All 3 test files should exist before cleanup');
  
  // Cleanup
  const result = temp.cleanupTempFiles(testFiles);
  assert(result.cleaned === 3, `Should clean 3 files, got ${result.cleaned}`);
  
  // Verify files deleted
  const afterCount = testFiles.filter(f => fs.existsSync(f.path)).length;
  assert(afterCount === 0, 'All files should be deleted after cleanup');
});

// Test 3: Draft attachments directory (persistent storage)
test('Draft attachments directory (persistent)', () => {
  const draftId = 'DRAFT-TEST-' + Date.now();
  const draftAttDir = temp.createDraftAttachmentsDir(draftId);
  
  assert(fs.existsSync(draftAttDir), 'Draft attachments directory should exist');
  assert(draftAttDir.includes('drafts/' + draftId + '/attachments'), 'Should be in drafts/<id>/attachments');
  
  // Create test attachment
  const attPath = path.join(draftAttDir, 'test.pdf');
  fs.writeFileSync(attPath, 'test attachment');
  assert(fs.existsSync(attPath), 'Attachment file should exist');
  
  // Verify it's NOT in temp directory
  assert(!attPath.includes('/temp/'), 'Draft attachments should NOT be in temp directory');
  
  // Cleanup
  const testDraftDir = path.join(path.resolve(__dirname, '../drafts'), draftId);
  fs.rmSync(testDraftDir, { recursive: true, force: true });
});

// Test 4: Move attachment from temp to draft
test('Move attachment from temp to draft', () => {
  const draftId = 'DRAFT-MOVE-TEST-' + Date.now();
  
  // Create temp file
  const tempPath = path.join(TEMP_FORWARDS, `temp-attach-${Date.now()}.pdf`);
  fs.writeFileSync(tempPath, 'temp attachment content');
  
  // Move to draft
  const newPath = temp.moveAttachmentToDraft(tempPath, draftId, 'attachment.pdf');
  
  assert(fs.existsSync(newPath), 'New attachment path should exist');
  assert(newPath.includes('drafts/' + draftId + '/attachments'), 'Should be in draft attachments');
  assert(fs.existsSync(tempPath), 'Original temp file should still exist (copy, not move)');
  
  // Cleanup temp file
  fs.unlinkSync(tempPath);
  
  // Cleanup draft
  const testDraftDir = path.join(path.resolve(__dirname, '../drafts'), draftId);
  fs.rmSync(testDraftDir, { recursive: true, force: true });
});

// Test 5: Cleanup only temp files (not draft attachments)
test('Cleanup only temp files (safety check)', () => {
  const draftId = 'DRAFT-SAFE-' + Date.now();
  
  // Create temp file
  const tempPath = path.join(TEMP_FORWARDS, `temp-${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, 'temp content');
  
  // Create draft attachment
  const draftAttDir = temp.createDraftAttachmentsDir(draftId);
  const draftPath = path.join(draftAttDir, 'draft-attach.pdf');
  fs.writeFileSync(draftPath, 'draft attachment');
  
  // Try to cleanup both (should only clean temp file)
  const files = [
    temp.trackFile(tempPath),
    temp.trackFile(draftPath), // This should NOT be cleaned (not in temp dir)
  ];
  
  const result = temp.cleanupTempFiles(files);
  assert(result.cleaned === 1, `Should clean only 1 temp file, got ${result.cleaned}`);
  assert(fs.existsSync(draftPath), 'Draft attachment should NOT be deleted');
  
  // Cleanup draft
  const testDraftDir = path.join(path.resolve(__dirname, '../drafts'), draftId);
  fs.rmSync(testDraftDir, { recursive: true, force: true });
});

// Test 6: Forward.js integration check
test('Forward.js module integration', () => {
  const forward = require('../scripts/forward');
  
  assert(typeof forward.forwardEmail === 'function', 'forwardEmail should be a function');
  assert(typeof forward.cleanupTempAttachments === 'function', 'cleanupTempAttachments should be a function');
  assert(typeof forward.formatForwardedContent === 'function', 'formatForwardedContent should be a function');
  assert(typeof forward.normalizeSubject === 'function', 'normalizeSubject should be a function');
});

// Test 7: Cleanup with non-temp files (safety)
test('Cleanup ignores non-temp files', () => {
  const nonTempFile = temp.trackFile('/tmp/some-other-file.txt');
  const result = temp.cleanupTempFiles([nonTempFile]);
  
  // Should not clean files outside our temp directory
  assert(result.cleaned === 0, 'Should not clean non-temp files');
});

// Summary
console.log('═══════════════════════════════════════════════════════════');
console.log(`Tests Passed: ${testsPassed}`);
console.log(`Tests Failed: ${testsFailed}`);
console.log('═══════════════════════════════════════════════════════════');

if (testsFailed > 0) {
  process.exit(1);
}
