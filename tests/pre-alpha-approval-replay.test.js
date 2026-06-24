const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { verifyLegacyOutboundSafety } = require('../skills/imap-smtp-email/lib/outbound-safety');

function withTempRoot(fn) {
  return async () => {
    const previous = {
      root: process.env.SSA_DATA_ROOT,
      realEmail: process.env.SSA_ENABLE_REAL_EMAIL_SEND,
      allowUnverified: process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND,
    };
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-pre-alpha-approval-replay-'));
    process.env.SSA_DATA_ROOT = tempRoot;
    process.env.SSA_ENABLE_REAL_EMAIL_SEND = 'true';
    process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = 'true';
    try {
      await fn(tempRoot);
    } finally {
      if (previous.root === undefined) delete process.env.SSA_DATA_ROOT;
      else process.env.SSA_DATA_ROOT = previous.root;
      if (previous.realEmail === undefined) delete process.env.SSA_ENABLE_REAL_EMAIL_SEND;
      else process.env.SSA_ENABLE_REAL_EMAIL_SEND = previous.realEmail;
      if (previous.allowUnverified === undefined) delete process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND;
      else process.env.SSA_ALLOW_UNVERIFIED_EMAIL_SEND = previous.allowUnverified;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  };
}

function writeDecision(tempRoot) {
  const workspaceId = 'demo-exporter';
  const decision = {
    id: 'email-send-approval',
    kind: 'email.send',
    workspaceId,
    status: 'approved',
    reason: 'Approved by test operator.',
    realExecutionEnabled: true,
    createdAt: new Date().toISOString(),
    approvedBy: 'Wilson',
    payload: {
      to: 'buyer@example.com',
      subject: 'Quote',
      summary: 'Approved email send',
    },
  };
  const decisionsPath = path.join(tempRoot, 'companies', workspaceId, 'approvals', 'side-effect-decisions.json');
  fs.mkdirSync(path.dirname(decisionsPath), { recursive: true });
  fs.writeFileSync(decisionsPath, JSON.stringify([decision], null, 2), 'utf8');
  return { decision, decisionsPath };
}

test('approved email.send runtime decisions are one-shot in the outbound safety gate', withTempRoot(async (tempRoot) => {
  const { decision, decisionsPath } = writeDecision(tempRoot);

  const first = await verifyLegacyOutboundSafety({
    workspaceId: decision.workspaceId,
    to: 'buyer@example.com',
    subject: 'Quote',
    approvalId: decision.id,
  });

  assert.equal(first.allowed, true);
  const consumed = JSON.parse(fs.readFileSync(decisionsPath, 'utf8'))[0];
  assert.equal(consumed.status, 'executed');
  assert.equal(consumed.execution.status, 'executed');

  await assert.rejects(
    verifyLegacyOutboundSafety({
      workspaceId: decision.workspaceId,
      to: 'buyer@example.com',
      subject: 'Quote',
      approvalId: decision.id,
    }),
    /approved runtime decision id/
  );
}));
