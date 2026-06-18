const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const store = require('../src/approval-store');

function withTempStore(fn) {
  return () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-approval-store-test-'));
    const originalStorageFile = store.STORAGE_FILE;
    store.setStorageFileForTest(path.join(tempDir, 'approvals.json'));
    try {
      return fn();
    } finally {
      store.setStorageFileForTest(originalStorageFile);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  };
}

test('consumeApproval marks approved tokens as used exactly once', withTempStore(() => {
  const approval = store.createApproval('send-email', {
    to: 'buyer@example.com',
    subject: 'Quote',
  });
  store.updateApproval(approval.id, {
    status: 'approved',
    decisions: [{ approver_id: 'Wilson', decision: 'approve' }],
  });

  const consumed = store.consumeApproval(approval.id);
  assert.equal(consumed.id, approval.id);
  assert.equal(consumed.status, 'consumed');
  assert.match(consumed.consumed_at, /^\d{4}-/);

  assert.equal(store.consumeApproval(approval.id), null);
  assert.equal(store.getApproval(approval.id).status, 'consumed');
}));
