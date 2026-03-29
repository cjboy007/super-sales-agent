#!/usr/bin/env node

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const imap = require('../scripts/imap');
const drafts = require('../scripts/drafts');
const smtp = require('../scripts/smtp');
const forward = require('../scripts/forward');

const savedDrafts = [];
const sentPayloads = [];
const downloadedFiles = [];

const originalFetchEmail = imap.fetchEmail;
const originalDownloadAttachments = imap.downloadAttachments;
const originalSaveDraft = drafts.saveDraft;
const originalSendEmail = smtp.sendEmail;

async function run() {
  const fixtureEmail = {
    uid: 42,
    from: 'Alice <alice@example.com>',
    fromAddress: 'alice@example.com',
    to: 'sales@example.com',
    cc: 'ops@example.com',
    subject: 'Quarterly Update',
    date: new Date('2026-03-29T08:00:00Z'),
    text: 'Hello team,\n\nHere is the latest update.',
    attachments: [
      { filename: 'report.pdf', size: 1234 },
      { filename: 'image.png', size: 4567 },
    ],
    messageId: '<fixture@example.com>',
  };

  imap.fetchEmail = async (uid, mailbox) => {
    assert.strictEqual(uid, 42);
    assert.strictEqual(mailbox, 'INBOX');
    return fixtureEmail;
  };

  imap.downloadAttachments = async (uid, mailbox, dir) => {
    assert.strictEqual(uid, 42);
    assert.strictEqual(mailbox, 'INBOX');
    fs.mkdirSync(dir, { recursive: true });
    const files = ['report.pdf', 'image.png'].map(name => {
      const filePath = path.join(dir, name);
      fs.writeFileSync(filePath, 'fixture');
      downloadedFiles.push(filePath);
      return { filename: name, path: filePath, size: 1 };
    });
    return { uid, downloaded: files };
  };

  drafts.saveDraft = (draft) => {
    savedDrafts.push(draft);
    return {
      success: true,
      draft_id: 'DRAFT-FORWARD-TEST',
      file_path: '/tmp/DRAFT-FORWARD-TEST.json',
      draft,
    };
  };

  smtp.sendEmail = async (payload) => {
    sentPayloads.push(payload);
    return {
      success: true,
      dryRun: Boolean(payload.dryRun),
      messageId: '<sent@example.com>',
      preview: payload.dryRun ? { subject: payload.subject, body: payload.body } : undefined,
    };
  };

  const draftResult = await forward.forwardEmail({
    uid: 42,
    to: 'manager@example.com',
    body: 'Please review.',
    forwardAttachments: true,
    mailbox: 'INBOX',
  });

  assert.strictEqual(draftResult.draft, true);
  assert.strictEqual(draftResult.draft_id, 'DRAFT-FORWARD-TEST');
  assert.strictEqual(savedDrafts.length, 1);
  assert.strictEqual(savedDrafts[0].subject, 'Fwd: Quarterly Update');
  assert(savedDrafts[0].body.includes('Please review.'));
  assert(savedDrafts[0].body.includes('Forwarded Message'));
  assert(savedDrafts[0].body.includes('Cc: ops@example.com'));
  assert.strictEqual(savedDrafts[0].attachments.length, 2);
  assert.strictEqual(draftResult.attachmentsForwarded, 2);

  const sendResult = await forward.forwardEmail({
    uid: 42,
    to: 'director@example.com',
    body: 'FYI',
    confirmSend: true,
    forwardAttachments: false,
    dryRun: true,
    mailbox: 'INBOX',
  });

  assert.strictEqual(sendResult.draft, false);
  assert.strictEqual(sentPayloads.length, 1);
  assert.strictEqual(sentPayloads[0].to, 'director@example.com');
  assert.strictEqual(sentPayloads[0].subject, 'Fwd: Quarterly Update');
  assert.strictEqual(sentPayloads[0].dryRun, true);
  assert(sentPayloads[0].body.includes('FYI'));
  assert(sentPayloads[0].body.includes('Hello team,'));

  assert.strictEqual(forward.normalizeSubject('Fwd: Existing'), 'Fwd: Existing');
  assert.strictEqual(forward.normalizeSubject('Original'), 'Fwd: Original');
  assert(forward.formatForwardedContent(fixtureEmail).includes('Subject: Quarterly Update'));

  console.log(JSON.stringify({
    success: true,
    checks: [
      'default forward saves draft',
      'quoted original content included',
      'attachments carried into draft payload',
      'confirm-send routes into sendEmail',
      'dry-run preserved for send flow',
      'subject normalization works',
    ],
  }, null, 2));
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    imap.fetchEmail = originalFetchEmail;
    imap.downloadAttachments = originalDownloadAttachments;
    drafts.saveDraft = originalSaveDraft;
    smtp.sendEmail = originalSendEmail;
    for (const file of downloadedFiles) {
      try { fs.unlinkSync(file); } catch {}
    }
  });
