#!/usr/bin/env node

/**
 * Email Forward Module
 * Forward emails into draft/send flows with quoted original content.
 * 
 * Temp file management:
 * - All temp files are tracked and cleaned up in finally block
 * - Draft attachments are stored persistently in drafts/<draft_id>/attachments/
 * - Send/dry-run mode attachments are stored in temp/ and cleaned up after
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const drafts = require('./drafts');
const smtp = require('./smtp');
const { sanitizeQuotedContent } = require('../lib/sanitize');
const temp = require('../lib/temp');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const TEMP_DIR = temp.createTempDir('forwards');

function normalizeSubject(subject) {
  const base = (subject || '(no subject)').trim();
  return /^fwd:/i.test(base) ? base : `Fwd: ${base}`;
}

function formatForwardedContent(originalEmail) {
  const originalFrom = originalEmail.from || 'Unknown';
  const originalDate = originalEmail.date ? new Date(originalEmail.date).toLocaleString() : 'Unknown date';
  const originalTo = originalEmail.to || 'Unknown';
  const originalCc = originalEmail.cc || '';
  const originalSubject = originalEmail.subject || '(no subject)';
  
  // Sanitize HTML content to prevent XSS and prompt injection
  let originalBody = originalEmail.text || originalEmail.html || '(No content)';
  if (originalEmail.html) {
    // Prefer HTML but sanitize it first
    originalBody = sanitizeQuotedContent(originalEmail.html, {
      stripStyles: true,
      maxDepth: 2
    });
  } else if (originalEmail.text && /<[a-z][\s\S]*>/i.test(originalEmail.text)) {
    // Text contains HTML tags, sanitize it
    originalBody = sanitizeQuotedContent(originalEmail.text, {
      stripStyles: true,
      maxDepth: 2
    });
  }

  return [
    '────────────────────────────────',
    'Forwarded Message',
    '────────────────────────────────',
    `From: ${originalFrom}`,
    `Date: ${originalDate}`,
    `To: ${originalTo}`,
    ...(originalCc ? [`Cc: ${originalCc}`] : []),
    `Subject: ${originalSubject}`,
    '────────────────────────────────',
    '',
    originalBody,
  ].join('\n');
}

async function collectForwardAttachments(uid, mailbox, originalEmail) {
  if (!originalEmail.attachments || originalEmail.attachments.length === 0) {
    return [];
  }

  const imap = require('./imap');
  const downloadResult = await imap.downloadAttachments(uid, mailbox, TEMP_DIR);
  if (!downloadResult.downloaded || downloadResult.downloaded.length === 0) {
    return [];
  }

  // Track all downloaded files for cleanup
  return downloadResult.downloaded.map(file => temp.trackFile(file.path));
}

/**
 * Cleanup temp attachments - legacy wrapper for backward compatibility
 * @deprecated Use temp.cleanupTempFiles() directly
 */
function cleanupTempAttachments(attachments) {
  return temp.cleanupTempFiles(attachments || [], { verbose: false });
}

async function forwardEmail(options) {
  const {
    uid,
    to,
    body = 'Please see the forwarded email below.',
    forwardAttachments = false,
    draft = true,
    confirmSend = false,
    dryRun = false,
    mailbox = 'INBOX',
    cc,
    bcc,
    from,
    signature,
  } = options;

  if (!uid) throw new Error('Missing required option: uid');
  if (!to) throw new Error('Missing required option: to');

  console.error(`\n📧 Forwarding email (UID: ${uid}) to ${to}...`);
  console.error('📬 Fetching original email...');
  const imap = require('./imap');
  const originalEmail = await imap.fetchEmail(uid, mailbox);
  if (!originalEmail) {
    throw new Error(`Email UID ${uid} not found in mailbox ${mailbox}`);
  }

  const subject = normalizeSubject(originalEmail.subject);
  const quotedOriginal = formatForwardedContent(originalEmail);
  const fullBody = [body, '', quotedOriginal].join('\n');

  let attachments = [];
  let draftId = null;
  
  try {
    if (forwardAttachments) {
      console.error(`📎 Forward attachment mode enabled`);
      attachments = await collectForwardAttachments(uid, mailbox, originalEmail);
      console.error(`✅ Prepared ${attachments.length} attachment(s) for forwarding`);
    }

    const basePayload = {
      from: from || process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      cc,
      bcc,
      subject,
      body: fullBody,
      signature,
      attachments: [], // Will be set based on mode below
      original_email: {
        uid: originalEmail.uid,
        mailbox,
        from: originalEmail.from,
        fromAddress: originalEmail.fromAddress,
        to: originalEmail.to,
        cc: originalEmail.cc,
        subject: originalEmail.subject,
        date: originalEmail.date,
        messageId: originalEmail.messageId,
      },
      intent: 'forward',
      notes: `Forwarded from UID ${uid}${forwardAttachments ? ' with attachments' : ''}`,
    };

    if (draft && !confirmSend) {
      // Draft mode: move attachments to persistent draft storage
      if (forwardAttachments && attachments.length > 0) {
        // Generate draft ID first
        const draftIdPreview = drafts.generateDraftId('F');
        draftId = draftIdPreview;
        
        // Move attachments from temp to draft attachments directory
        const persistentAttachments = attachments.map(att => {
          const newPath = temp.moveAttachmentToDraft(att.path, draftId, att.filename);
          return {
            filename: att.filename,
            path: newPath,
            persistent: true, // Mark as persistent (not temp)
          };
        });
        
        basePayload.attachments = persistentAttachments;
        console.error(`📁 Attachments stored in draft directory: drafts/${draftId}/attachments/`);
      }
      
      const result = drafts.saveDraft({
        ...basePayload,
        draft_id: draftId, // Use pre-generated ID for consistency
        requires_human_approval: true,
      });

      return {
        success: true,
        draft: true,
        draft_id: result.draft_id,
        file_path: result.file_path,
        forwardAttachments,
        attachmentsForwarded: attachments.length,
        originalEmail: basePayload.original_email,
        preview: {
          to,
          subject,
          body: fullBody,
          attachments: attachments.map(att => att.filename),
        },
        message: 'Forward draft saved. Use send-draft <draft-id> --confirm-send to actually send.',
      };
    }

    // Send/dry-run mode: use temp attachments (will be cleaned up)
    basePayload.attachments = attachments;
    
    const sendResult = await smtp.sendEmail({
      ...basePayload,
      dryRun,
      confirmSend,
    });

    return {
      ...sendResult,
      draft: false,
      forwardAttachments,
      attachmentsForwarded: attachments.length,
      originalEmail: basePayload.original_email,
    };
  } finally {
    // ALWAYS cleanup temp attachments in all branches
    // Draft mode attachments are persistent (not in temp), so they won't be cleaned
    const cleanupResult = temp.cleanupTempFiles(attachments, { verbose: false });
    if (cleanupResult.cleaned > 0 || cleanupResult.failed > 0) {
      console.error(`🗑️  Temp cleanup: ${cleanupResult.cleaned} cleaned, ${cleanupResult.failed} failed`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      options[key] = value || true;
      if (value && !value.startsWith('--')) i++;
    }
  }

  if (!options['message-id']) {
    console.error('❌ Missing required parameter: --message-id <UID>');
    process.exit(1);
  }
  if (!options.to) {
    console.error('❌ Missing required parameter: --to <email>');
    process.exit(1);
  }

  const result = await forwardEmail({
    uid: options['message-id'],
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    body: options.body || 'Please see the forwarded email below.',
    signature: options.signature,
    forwardAttachments: options['forward-attachments'] === true || options['forward-attachments'] === 'true',
    draft: options.draft !== 'false',
    confirmSend: options['confirm-send'] === true || options['confirm-send'] === 'true',
    dryRun: options['dry-run'] === true || options['dry-run'] === 'true',
    mailbox: options.mailbox || 'INBOX',
  });

  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}

module.exports = {
  forwardEmail,
  formatForwardedContent,
  normalizeSubject,
  cleanupTempAttachments,
};
