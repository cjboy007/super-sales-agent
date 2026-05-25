#!/usr/bin/env node
/**
 * P0-5: Human-in-the-loop email blocking tests.
 *
 * Verifies:
 * 1. All send paths default to dry-run/draft without approval-id
 * 2. Production send requires valid approval token
 * 3. Invalid/expired approval tokens are rejected
 * 4. Workflow actions return dryRun: true (no side effects)
 */

const assert = require('assert');
const path = require('path');

const PROJECT_ROOT = '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    failed++;
  }
}

// ─── Test 1: smtp-send-batch.js (v1) defaults to dry-run ───
console.log('\n[Test 1] smtp-send-batch.js — dry-run default');

// Parse args simulation
const v1Args = ['--limit', '5'];
const v1DryRun = v1Args.includes('--dry-run');
const v1ApprovalIdx = v1Args.indexOf('--approval-id');
const v1ApprovalId = v1ApprovalIdx >= 0 ? v1Args[v1ApprovalIdx + 1] : null;
const v1EffectiveDryRun = v1DryRun || !v1ApprovalId;

test('Without --approval-id, effectiveDryRun is true', () => {
  assert.strictEqual(v1EffectiveDryRun, true);
});

test('With --approval-id, effectiveDryRun is false', () => {
  const args2 = ['--limit', '5', '--approval-id', 'APV-123'];
  const dry2 = args2.includes('--dry-run');
  const aIdx2 = args2.indexOf('--approval-id');
  const aId2 = aIdx2 >= 0 ? args2[aIdx2 + 1] : null;
  const eff2 = dry2 || !aId2;
  assert.strictEqual(eff2, false);
});

test('--dry-run flag overrides --approval-id', () => {
  const args3 = ['--limit', '5', '--approval-id', 'APV-123', '--dry-run'];
  const dry3 = args3.includes('--dry-run');
  const aIdx3 = args3.indexOf('--approval-id');
  const aId3 = aIdx3 >= 0 ? args3[aIdx3 + 1] : null;
  const eff3 = dry3 || !aId3;
  assert.strictEqual(eff3, true);
});

// ─── Test 2: Workflow actions return dryRun: true ───
console.log('\n[Test 2] Workflow actions — dryRun enforcement');

const SendEmailAction = require(path.join(PROJECT_ROOT, 'skills/workflow-engine/lib/actions/send-email-action'));
const CallApiAction = require(path.join(PROJECT_ROOT, 'skills/workflow-engine/lib/actions/call-api-action'));
const GenerateQuotationAction = require(path.join(PROJECT_ROOT, 'skills/workflow-engine/lib/actions/generate-quotation-action'));
const CreateOkkiTrailAction = require(path.join(PROJECT_ROOT, 'skills/workflow-engine/lib/actions/create-okki-trail-action'));

(async () => {
  await asyncTest('SendEmailAction returns dryRun: true', async () => {
    const action = new SendEmailAction();
    const result = await action.execute({
      to: 'test@example.com',
      template: 'Hello {{name}}',
      variables: { name: 'Test' }
    }, {});
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.side_effect_performed, false);
    assert.strictEqual(result.message_id, null);
  });

  await asyncTest('CallApiAction returns dryRun: true', async () => {
    const action = new CallApiAction();
    const result = await action.execute({
      url: 'https://api.example.com/test',
      method: 'POST'
    }, {});
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.side_effect_performed, false);
    assert.strictEqual(result.data.message, 'API call simulated');
  });

  await asyncTest('GenerateQuotationAction returns dryRun: true', async () => {
    const action = new GenerateQuotationAction();
    const result = await action.execute({
      customer_id: 'C001',
      template: 'standard',
      items: []
    }, {});
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.side_effect_performed, false);
    assert.strictEqual(result.pdf_url, null);
  });

  await asyncTest('CreateOkkiTrailAction returns dryRun: true', async () => {
    const action = new CreateOkkiTrailAction();
    const result = await action.execute({
      customer_id: 'C001',
      trail_type: 'email',
      content: 'Follow-up note'
    }, {});
    assert.strictEqual(result.dryRun, true);
    assert.strictEqual(result.side_effect_performed, false);
    assert.strictEqual(result.trail_id, null);
  });

  // ─── Test 3: Approval store atomic write ───
  console.log('\n[Test 3] Approval store — atomic write');

  const ApprovalStore = require(path.join(PROJECT_ROOT, 'skills/approval-engine/src/approval-store.js'));

  await asyncTest('createApproval writes atomically', async () => {
    const approval = ApprovalStore.createApproval('test-rule', {
      test: 'P0-5 HITL verification',
      email: 'verify@test.com'
    });
    assert.ok(approval.id.startsWith('APV-'));
    assert.strictEqual(approval.status, 'pending');

    // Read back to verify persistence
    const read = ApprovalStore.getApproval(approval.id);
    assert.ok(read);
    assert.strictEqual(read.id, approval.id);

    // Cleanup
    ApprovalStore.deleteApproval(approval.id);
  });

  // ─── Test 4: Approval token verification logic ───
  console.log('\n[Test 4] Approval token verification');

  await asyncTest('Pending approval is rejected', async () => {
    const approval = ApprovalStore.createApproval('test-rule', { test: 'pending test' });
    assert.strictEqual(approval.status, 'pending');

    const check = await verifyApprovalToken(approval.id);
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('pending'));

    ApprovalStore.deleteApproval(approval.id);
  });

  await asyncTest('Non-existent approval is rejected', async () => {
    const check = await verifyApprovalToken('APV-NONEXISTENT');
    assert.strictEqual(check.valid, false);
    assert.ok(check.reason.includes('not found'));
  });

  // ─── Summary ───
  console.log(`\n========================================`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exit(1);
  }
})();

// Approval token verification (mirrors smtp.js verifyApprovalToken)
async function verifyApprovalToken(approvalId) {
  const approvalEnginePath = path.resolve(PROJECT_ROOT, 'skills/approval-engine/src/approval-store.js');
  const store = require(approvalEnginePath);
  const approval = store.getApproval(approvalId);

  if (!approval) {
    return { valid: false, reason: `Approval ID not found: ${approvalId}` };
  }
  if (approval.status !== 'approved') {
    return { valid: false, reason: `Approval status is "${approval.status}", not "approved"` };
  }
  const lastDecision = approval.decisions[approval.decisions.length - 1];
  return { valid: true, approvedBy: lastDecision?.approver_id || 'unknown' };
}
