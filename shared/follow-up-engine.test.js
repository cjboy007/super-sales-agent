const assert = require('node:assert/strict');
const test = require('node:test');

const { buildFarreachSmtpInvocation, dailyCapFor } = require('./follow-up-engine');

test('farreach follow-up send uses execFile arguments without shell interpolation', () => {
  const body = 'Hello $(touch /tmp/owned) "quoted" `backticks`';
  const invocation = buildFarreachSmtpInvocation({
    smtpCli: '/repo/skills/imap-smtp-email/scripts/smtp.js',
    signature: 'jordan',
    email: 'buyer@example.com',
    subject: 'Quote $(whoami)',
    body,
  });

  assert.equal(invocation.command, process.execPath);
  assert.deepEqual(invocation.args, [
    '/repo/skills/imap-smtp-email/scripts/smtp.js',
    'send',
    '--to',
    'buyer@example.com',
    '--subject',
    'Quote $(whoami)',
    '--body',
    body,
    '--signature',
    'jordan',
  ]);
});

test('follow-up engine applies a bounded daily send cap with explicit override', () => {
  const previous = process.env.SSA_FOLLOW_UP_DAILY_CAP;
  try {
    delete process.env.SSA_FOLLOW_UP_DAILY_CAP;
    assert.equal(dailyCapFor({ DAILY_SEND_CAP: 12 }), 12);
    assert.equal(dailyCapFor({ DAILY_SEND_CAP: 12 }, { dailyCap: 3 }), 3);

    process.env.SSA_FOLLOW_UP_DAILY_CAP = '7';
    assert.equal(dailyCapFor({ DAILY_SEND_CAP: 12 }), 7);
  } finally {
    if (previous === undefined) delete process.env.SSA_FOLLOW_UP_DAILY_CAP;
    else process.env.SSA_FOLLOW_UP_DAILY_CAP = previous;
  }
});
