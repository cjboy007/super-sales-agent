const assert = require('node:assert/strict');
const test = require('node:test');

const { buildFarreachSmtpInvocation } = require('./follow-up-engine');

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
