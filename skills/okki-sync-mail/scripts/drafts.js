#!/usr/bin/env node

/**
 * Draft Management CLI
 * Save, list, and send email drafts with confirmation.
 * 
 * Supports structured patch format for draft editing (aligned with lark-mail):
 * - inspect: View draft details without modification
 * - set_body / set_reply_body: Edit body content
 * - add_attachment / remove_attachment: Manage attachments
 * - ops array format for complex edits
 */

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const { validateWritePath } = require('./path-utils');

const DRAFTS_DIR = path.resolve(__dirname, '../drafts');

// SMTP Transporter singleton
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.resolve(__dirname, '../.env') });
    
    _transporter = nodemailer.createTransport({
      pool: true,
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED !== 'false',
      },
      maxConnections: 5,
    });
  }
  return _transporter;
}

// Load send-log for recording
function loadSendLog() {
  const WORKSPACE_DIR = '/Users/wilson/.openclaw/workspace';
  const LOG_FILE = path.join(WORKSPACE_DIR, 'mail-archive/sent/sent-log.json');
  
  if (fs.existsSync(LOG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (err) {
      return [];
    }
  }
  return [];
}

function recordSentEmail(mailOptions, result) {
  const WORKSPACE_DIR = '/Users/wilson/.openclaw/workspace';
  const LOG_FILE = path.join(WORKSPACE_DIR, 'mail-archive/sent/sent-log.json');
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    messageId: result.messageId,
    to: mailOptions.to,
    subject: mailOptions.subject,
    status: result.success ? 'sent' : 'failed',
    error: result.error || null,
  };
  
  const log = loadSendLog();
  log.push(logEntry);
  
  const logDir = path.dirname(LOG_FILE);
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
}

/**
 * Ensure drafts directory exists
 */
function ensureDraftsDir() {
  if (!fs.existsSync(DRAFTS_DIR)) {
    fs.mkdirSync(DRAFTS_DIR, { recursive: true });
    console.error(`📁 Created drafts directory: ${DRAFTS_DIR}`);
  }
}

/**
 * Generate unique draft ID
 * Format: DRAFT-YYYYMMDDHHmmss-{type}
 * type: I=inquiry, C=confirmation, R=reply, G=general
 */
function generateDraftId(type = 'G') {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  return `DRAFT-${timestamp}-${type.toUpperCase()}`;
}

/**
 * Save draft to file
 * @param {Object} draftData - Draft content and metadata
 * @returns {Object} Saved draft record
 */
function saveDraft(draftData) {
  ensureDraftsDir();
  
  // Validate drafts directory is within allowed write paths
  const validatedDraftsDir = validateWritePath(DRAFTS_DIR);
  
  const draftId = draftData.draft_id || generateDraftId(draftData.type || 'G');
  const timestamp = new Date().toISOString();
  
  const draft = {
    draft_id: draftId,
    subject: draftData.subject,
    body: draftData.body,
    to: draftData.to,
    cc: draftData.cc,
    bcc: draftData.bcc,
    html: draftData.html,
    attachments: draftData.attachments || [],
    inlineImages: draftData.inlineImages || [],
    signature: draftData.signature,
    language: draftData.language || 'en',
    template_used: draftData.template_used,
    intent: draftData.intent,
    confidence: draftData.confidence,
    requires_human_approval: draftData.requires_human_approval !== false, // default true
    escalate: draftData.escalate || false,
    created_at: draftData.created_at || timestamp,
    updated_at: timestamp,
    original_email: draftData.original_email,
    notes: draftData.notes,
  };

  const filePath = path.join(validatedDraftsDir, `${draftId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(draft, null, 2), 'utf8');
  
  console.error(`✅ Draft saved: ${draftId}`);
  console.error(`📁 Location: ${filePath}`);
  
  return {
    success: true,
    draft_id: draftId,
    file_path: filePath,
    draft,
  };
}

/**
 * Load draft by ID or file path
 * @param {string} draftIdOrPath - Draft ID or full file path
 * @returns {Object|null} Draft data or null if not found
 */
function loadDraft(draftIdOrPath) {
  let filePath;
  
  if (draftIdOrPath.endsWith('.json') && fs.existsSync(draftIdOrPath)) {
    filePath = draftIdOrPath;
  } else {
    filePath = path.join(DRAFTS_DIR, `${draftIdOrPath}.json`);
  }
  
  if (!fs.existsSync(filePath)) {
    return null;
  }
  
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * List all drafts
 * @param {Object} options - Filter options
 * @returns {Array} List of draft summaries
 */
function listDrafts(options = {}) {
  ensureDraftsDir();
  
  const files = fs.readdirSync(DRAFTS_DIR)
    .filter(name => name.startsWith('DRAFT-') && name.endsWith('.json'))
    .sort()
    .reverse(); // Newest first
  
  const drafts = files.map(name => {
    const filePath = path.join(DRAFTS_DIR, name);
    const draft = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    return {
      draft_id: draft.draft_id,
      subject: draft.subject,
      to: draft.to,
      language: draft.language,
      intent: draft.intent,
      requires_human_approval: draft.requires_human_approval,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
      file_path: filePath,
    };
  });
  
  // Apply filters
  let filtered = drafts;
  if (options.intent) {
    filtered = filtered.filter(d => d.intent === options.intent);
  }
  if (options.language) {
    filtered = filtered.filter(d => d.language === options.language);
  }
  if (options.onlyApproval) {
    filtered = filtered.filter(d => d.requires_human_approval);
  }
  
  return filtered;
}

/**
 * Delete draft
 * @param {string} draftIdOrPath - Draft ID or file path
 * @returns {Object} Result
 */
function deleteDraft(draftIdOrPath) {
  let filePath;
  
  if (draftIdOrPath.endsWith('.json') && fs.existsSync(draftIdOrPath)) {
    filePath = draftIdOrPath;
  } else {
    filePath = path.join(DRAFTS_DIR, `${draftIdOrPath}.json`);
  }
  
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      error: `Draft not found: ${draftIdOrPath}`,
    };
  }
  
  fs.unlinkSync(filePath);
  
  return {
    success: true,
    deleted: draftIdOrPath,
    file_path: filePath,
  };
}

/**
 * Inspect draft - returns projection with has_quoted_content, attachments_summary, inline_summary
 * Aligned with lark-mail +draft-edit --inspect
 * @param {string} draftIdOrPath - Draft ID or file path
 * @returns {Object} Draft projection
 */
function inspectDraft(draftIdOrPath) {
  const draft = loadDraft(draftIdOrPath);
  
  if (!draft) {
    throw new Error(`Draft not found: ${draftIdOrPath}`);
  }
  
  // Detect if draft has quoted content (reply/forward style)
  // Quoted content typically contains patterns like:
  // - "On [date], [name] wrote:"
  // - "---Original Message---"
  // - "<blockquote>" tags
  // - "> " quoted lines
  const bodyText = draft.body || '';
  const bodyHtml = draft.html || bodyText;
  
  const hasQuotedContent = 
    /on\s+[\w\s,]+\s+wrote:/i.test(bodyText) ||
    /---original\s+message---/i.test(bodyText) ||
    /<blockquote/i.test(bodyHtml) ||
    /^>\s+/m.test(bodyText) ||
    /<div[^>]*class=["'][^"']*quote[^"']*["']/i.test(bodyHtml) ||
    /<div[^>]*class=["'][^"']*gmail_quote[^"']*["']/i.test(bodyHtml);
  
  // Build attachments summary
  const attachmentsSummary = (draft.attachments || []).map((att, index) => ({
    index,
    filename: att.filename || att.path || 'unknown',
    path: att.path,
    content_type: att.contentType || guessContentType(att.path || att.filename || ''),
    size: att.size || null,
    cid: att.cid || null,
    part_id: `${index + 1}`, // Simple part_id format
  }));
  
  // Build inline images summary
  const inlineSummary = (draft.inlineImages || []).map((inline, index) => ({
    index,
    filename: inline.filename || inline.path || 'unknown',
    path: inline.path,
    cid: inline.cid || `inline-${index}`,
    content_type: inline.contentType || guessContentType(inline.path || inline.filename || ''),
    part_id: `inline-${index + 1}`,
  }));
  
  // Generate body summary (first 500 chars)
  const bodySummary = bodyHtml 
    ? bodyHtml.substring(0, 500) + (bodyHtml.length > 500 ? '...' : '')
    : (bodyText ? bodyText.substring(0, 500) + (bodyText.length > 500 ? '...' : '') : null);
  
  return {
    ok: true,
    draft_id: draft.draft_id,
    projection: {
      subject: draft.subject,
      to: draft.to,
      cc: draft.cc || null,
      bcc: draft.bcc || null,
      has_quoted_content: hasQuotedContent,
      body_html_summary: bodySummary,
      attachments_summary: attachmentsSummary,
      inline_summary: inlineSummary,
      language: draft.language,
      intent: draft.intent,
      requires_human_approval: draft.requires_human_approval,
      created_at: draft.created_at,
      updated_at: draft.updated_at,
    },
    warning: 'This is a read-only inspection. Use --patch-file to edit.',
  };
}

/**
 * Guess content type from file extension
 */
function guessContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Generate a unique part_id for attachments
 */
function generatePartId() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Apply structured patch operations to draft
 * Aligned with lark-mail patch format
 * @param {Object} draft - Draft object to modify
 * @param {Array} ops - Array of patch operations
 * @param {Object} options - Patch options
 * @returns {Object} Result with updated draft
 */
function applyPatchOperations(draft, ops, options = {}) {
  const results = [];
  
  for (const op of ops) {
    const result = applySingleOperation(draft, op);
    results.push(result);
  }
  
  return {
    success: true,
    draft_id: draft.draft_id,
    operations_applied: results.length,
    results,
    warning: 'This edit flow has no optimistic locking. If the same draft is changed concurrently, the last writer wins.',
  };
}

/**
 * Apply a single patch operation
 */
function applySingleOperation(draft, op) {
  switch (op.op) {
    case 'set_subject':
      draft.subject = op.value;
      return { op: 'set_subject', success: true };
    
    case 'set_body':
      // Full body replacement (including quoted content if any)
      if (typeof op.value === 'string') {
        draft.body = op.value;
        // Clear html if body is plain text, or set html if it's HTML
        if (op.value.includes('<') && op.value.includes('>')) {
          draft.html = op.value;
        } else {
          draft.html = null;
        }
      }
      return { op: 'set_body', success: true };
    
    case 'set_reply_body':
      // Replace only the user-written part, preserve quoted content
      // Detect quoted content and replace only the part before it
      const bodyText = draft.body || '';
      const bodyHtml = draft.html || bodyText;
      
      // Find quoted content patterns
      const quotedPatterns = [
        /^(on\s+[\w\s,]+\s+wrote:)/im,
        /^(---original\s+message---)/im,
        /(<blockquote[^>]*>)/i,
        /(<div[^>]*class=["'][^"']*quote)/i,
        /(<div[^>]*class=["'][^"']*gmail_quote)/i,
      ];
      
      let newBody = op.value;
      let quotedContent = '';
      
      for (const pattern of quotedPatterns) {
        const match = bodyHtml.match(pattern);
        if (match) {
          const splitIndex = match.index;
          quotedContent = bodyHtml.substring(splitIndex);
          break;
        }
      }
      
      // If no quoted content found, just set the body
      if (quotedContent) {
        newBody = op.value + quotedContent;
      }
      
      draft.body = newBody;
      if (newBody.includes('<') && newBody.includes('>')) {
        draft.html = newBody;
      } else {
        draft.html = null;
      }
      return { op: 'set_reply_body', success: true, has_quoted_content: !!quotedContent };
    
    case 'set_to':
      draft.to = op.value;
      return { op: 'set_to', success: true };
    
    case 'set_cc':
      draft.cc = op.value;
      return { op: 'set_cc', success: true };
    
    case 'set_bcc':
      draft.bcc = op.value;
      return { op: 'set_bcc', success: true };
    
    case 'add_recipient':
      const field = op.field || 'to';
      const newRecipient = op.name ? `${op.name} <${op.address}>` : op.address;
      if (!draft[field]) {
        draft[field] = newRecipient;
      } else {
        const existing = draft[field].split(',').map(s => s.trim());
        if (!existing.includes(op.address)) {
          existing.push(newRecipient);
          draft[field] = existing.join(',');
        }
      }
      return { op: 'add_recipient', success: true, field, address: op.address };
    
    case 'remove_recipient':
      const removeField = op.field || 'to';
      if (draft[removeField]) {
        const existing = draft[removeField].split(',').map(s => s.trim());
        const filtered = existing.filter(addr => !addr.includes(op.address));
        draft[removeField] = filtered.join(',');
      }
      return { op: 'remove_recipient', success: true, field: removeField, address: op.address };
    
    case 'add_attachment':
      const attPath = op.path;
      const attFilename = path.basename(attPath);
      const newAttachment = {
        filename: attFilename,
        path: attPath,
        contentType: guessContentType(attFilename),
        part_id: generatePartId(),
      };
      if (!draft.attachments) draft.attachments = [];
      draft.attachments.push(newAttachment);
      return { op: 'add_attachment', success: true, filename: attFilename, part_id: newAttachment.part_id };
    
    case 'remove_attachment':
      const target = op.target;
      if (!draft.attachments) {
        return { op: 'remove_attachment', success: false, error: 'No attachments' };
      }
      
      const originalLength = draft.attachments.length;
      
      if (target.part_id) {
        draft.attachments = draft.attachments.filter(att => att.part_id !== target.part_id);
      } else if (target.cid) {
        draft.attachments = draft.attachments.filter(att => att.cid !== target.cid);
      } else if (target.filename) {
        draft.attachments = draft.attachments.filter(att => att.filename !== target.filename);
      }
      
      const removed = originalLength - draft.attachments.length;
      return { op: 'remove_attachment', success: removed > 0, removed };
    
    case 'add_inline':
      const inlinePath = op.path;
      const inlineCid = op.cid || `inline-${generatePartId()}`;
      const newInline = {
        filename: path.basename(inlinePath),
        path: inlinePath,
        cid: inlineCid,
        contentType: guessContentType(inlinePath),
        part_id: generatePartId(),
      };
      if (!draft.inlineImages) draft.inlineImages = [];
      draft.inlineImages.push(newInline);
      return { op: 'add_inline', success: true, cid: inlineCid, part_id: newInline.part_id };
    
    case 'remove_inline':
      const inlineTarget = op.target;
      if (!draft.inlineImages) {
        return { op: 'remove_inline', success: false, error: 'No inline images' };
      }
      
      const originalInlineLength = draft.inlineImages.length;
      
      if (inlineTarget.part_id) {
        draft.inlineImages = draft.inlineImages.filter(inline => inline.part_id !== inlineTarget.part_id);
      } else if (inlineTarget.cid) {
        draft.inlineImages = draft.inlineImages.filter(inline => inline.cid !== inlineTarget.cid);
      }
      
      const removedInline = originalInlineLength - draft.inlineImages.length;
      return { op: 'remove_inline', success: removedInline > 0, removed: removedInline };
    
    case 'set_header':
      if (!draft.headers) draft.headers = {};
      draft.headers[op.name] = op.value;
      return { op: 'set_header', success: true, name: op.name };
    
    case 'remove_header':
      if (draft.headers) {
        delete draft.headers[op.name];
      }
      return { op: 'remove_header', success: true, name: op.name };
    
    default:
      return { op: op.op, success: false, error: `Unknown operation: ${op.op}` };
  }
}

/**
 * Edit draft with structured patch support
 * Aligned with lark-mail +draft-edit
 * @param {string} draftIdOrPath - Draft ID or file path
 * @param {Object} updates - Updates (can be simple fields or structured patch)
 * @returns {Object} Updated draft
 */
function editDraft(draftIdOrPath, updates) {
  const draft = loadDraft(draftIdOrPath);
  
  if (!draft) {
    throw new Error(`Draft not found: ${draftIdOrPath}`);
  }
  
  // Check if this is a structured patch
  if (updates.ops && Array.isArray(updates.ops)) {
    // Structured patch format
    const patchResult = applyPatchOperations(draft, updates.ops, updates.options);
    
    // Update timestamp
    draft.updated_at = new Date().toISOString();
    
    // Save back
    const filePath = path.join(DRAFTS_DIR, `${draft.draft_id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(draft, null, 2), 'utf8');
    
    return {
      ok: true,
      data: {
        draft_id: draft.draft_id,
        ...patchResult,
      },
    };
  }
  
  // Legacy simple field updates
  const allowedFields = [
    'to', 'cc', 'bcc', 'subject', 'body', 'html', 
    'attachments', 'inlineImages', 'signature', 'language', 'intent', 
    'requires_human_approval', 'notes', 'template_used'
  ];
  
  // Apply only allowed field updates
  let hasChanges = false;
  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key)) {
      draft[key] = value;
      hasChanges = true;
    } else {
      console.error(`⚠️  Warning: Field '${key}' is not allowed for update. Skipping.`);
    }
  }
  
  if (!hasChanges) {
    return {
      success: false,
      draft_id: draft.draft_id,
      message: 'No valid fields to update',
      allowed_fields: allowedFields,
    };
  }
  
  // Update timestamp
  draft.updated_at = new Date().toISOString();
  
  // Save back
  const filePath = path.join(DRAFTS_DIR, `${draft.draft_id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(draft, null, 2), 'utf8');
  
  return {
    success: true,
    draft_id: draft.draft_id,
    message: 'Draft updated successfully',
    updated_fields: Object.keys(updates).filter(k => allowedFields.includes(k)),
    draft,
  };
}

/**
 * Print patch template for structured editing
 * Aligned with lark-mail --print-patch-template
 */
function printPatchTemplate() {
  const template = {
    ops: [
      { op: 'set_subject', value: 'Updated subject' },
      { op: 'set_body', value: '<p>Full body replacement (HTML or plain text)</p>' },
      { op: 'set_reply_body', value: '<p>New reply content only (quoted content preserved automatically)</p>' },
      { op: 'set_to', value: 'recipient@example.com' },
      { op: 'set_cc', value: 'cc@example.com' },
      { op: 'set_bcc', value: 'bcc@example.com' },
      { op: 'add_recipient', field: 'cc', address: 'new@example.com', name: 'New Recipient' },
      { op: 'remove_recipient', field: 'cc', address: 'remove@example.com' },
      { op: 'add_attachment', path: './file.pdf' },
      { op: 'remove_attachment', target: { part_id: '1.3' } },
      { op: 'remove_attachment', target: { cid: 'logo' } },
      { op: 'add_inline', path: './logo.png', cid: 'logo' },
      { op: 'remove_inline', target: { part_id: 'inline-1' } },
      { op: 'remove_inline', target: { cid: 'logo' } },
      { op: 'set_header', name: 'X-Custom', value: 'value' },
      { op: 'remove_header', name: 'X-Custom' },
    ],
    options: {
      rewrite_entire_draft: false,
      allow_protected_header_edits: false,
    },
  };
  
  return {
    ok: true,
    template,
    description: 'Structured patch template for draft editing. Use --patch-file to apply.',
    operations: {
      set_subject: 'Replace subject line',
      set_body: 'Replace entire body (including quoted content)',
      set_reply_body: 'Replace only user-written part, preserve quoted content automatically',
      set_to: 'Replace To recipients',
      set_cc: 'Replace Cc recipients',
      set_bcc: 'Replace Bcc recipients',
      add_recipient: 'Add a recipient to a field',
      remove_recipient: 'Remove a recipient from a field',
      add_attachment: 'Add an attachment by file path',
      remove_attachment: 'Remove attachment by part_id, cid, or filename',
      add_inline: 'Add an inline image (CID reference)',
      remove_inline: 'Remove inline image by part_id or cid',
      set_header: 'Set a custom header',
      remove_header: 'Remove a custom header',
    },
    note: 'For body editing: use set_reply_body for reply/forward drafts to preserve quoted content. Use set_body for full replacement.',
  };
}

/**
 * Send email (local implementation to avoid circular dependency)
 */
async function sendEmailLocal(mailOptions) {
  const isDryRun = Boolean(mailOptions.dryRun);
  
  if (!isDryRun) {
    const transporter = getTransporter();
    
    try {
      await transporter.verify();
    } catch (err) {
      throw new Error(`SMTP connection failed: ${err.message}`);
    }
    
    const info = await transporter.sendMail({
      from: mailOptions.from || process.env.SMTP_USER,
      to: mailOptions.to,
      cc: mailOptions.cc,
      bcc: mailOptions.bcc,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      attachments: mailOptions.attachments,
    });
    
    recordSentEmail(mailOptions, { success: true, messageId: info.messageId });
    
    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      to: mailOptions.to,
    };
  }
  
  // Dry-run mode
  console.error('\n🔍 DRY-RUN MODE - Email NOT sent\n');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('From:', mailOptions.from || process.env.SMTP_USER);
  console.error('To:', mailOptions.to);
  if (mailOptions.cc) console.error('CC:', mailOptions.cc);
  if (mailOptions.bcc) console.error('BCC:', mailOptions.bcc);
  console.error('Subject:', mailOptions.subject);
  console.error('───────────────────────────────────────────────────────────');
  console.error('Body:', mailOptions.text ? mailOptions.text.substring(0, 500) + (mailOptions.text.length > 500 ? '...' : '') : '(none)');
  if (mailOptions.html) {
    console.error('HTML:', mailOptions.html.substring(0, 500) + (mailOptions.html.length > 500 ? '...' : ''));
  }
  if (mailOptions.attachments && mailOptions.attachments.length > 0) {
    console.error('───────────────────────────────────────────────────────────');
    console.error('Attachments:');
    mailOptions.attachments.forEach((att, i) => {
      console.error(`  ${i + 1}. ${att.filename || att.path}`);
    });
  }
  console.error('═══════════════════════════════════════════════════════════\n');
  
  recordSentEmail(mailOptions, { success: true, messageId: null });
  
  return {
    success: true,
    dryRun: true,
    preview: {
      from: mailOptions.from || process.env.SMTP_USER,
      to: mailOptions.to,
      cc: mailOptions.cc,
      bcc: mailOptions.bcc,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      attachments: mailOptions.attachments.map(att => att.filename || att.path),
    },
  };
}

/**
 * Send draft with confirmation
 * @param {string} draftIdOrPath - Draft ID or file path
 * @param {Object} options - Send options
 * @returns {Object} Send result
 */
async function sendDraft(draftIdOrPath, options = {}) {
  const draft = loadDraft(draftIdOrPath);
  
  if (!draft) {
    throw new Error(`Draft not found: ${draftIdOrPath}`);
  }
  
  // Check if confirmation is required
  if (draft.requires_human_approval && !options.confirmSend) {
    return {
      success: false,
      requires_confirmation: true,
      draft_id: draft.draft_id,
      message: 'This draft requires human approval before sending.',
      preview: {
        to: draft.to,
        cc: draft.cc,
        subject: draft.subject,
        body_preview: draft.body ? draft.body.substring(0, 200) + (draft.body.length > 200 ? '...' : '') : '',
      },
      hint: 'Use --confirm-send flag to send this draft after review.',
    };
  }
  
  // Build mail options from draft
  const mailOptions = {
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    text: draft.body,
    html: draft.html,
    signature: draft.signature,
    attachments: draft.attachments || [],
    inlineImages: draft.inlineImages || [],
  };
  
  // Add dry-run if requested
  if (options.dryRun || options['dry-run']) {
    mailOptions.dryRun = true;
  }
  
  try {
    const result = await sendEmailLocal(mailOptions);
    
    // Mark draft as sent (optional: move to sent folder or delete)
    if (options.archiveAfterSend) {
      const sentDir = path.resolve(__dirname, '../drafts/sent');
      if (!fs.existsSync(sentDir)) {
        fs.mkdirSync(sentDir, { recursive: true });
      }
      const sentPath = path.join(sentDir, path.basename(path.join(DRAFTS_DIR, `${draft.draft_id}.json`)));
      fs.renameSync(path.join(DRAFTS_DIR, `${draft.draft_id}.json`), sentPath);
      result.archived = true;
      result.archive_path = sentPath;
    }
    
    return {
      success: true,
      draft_id: draft.draft_id,
      result,
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Update draft (alias for editDraft)
 * @param {string} draftIdOrPath - Draft ID or file path
 * @param {Object} updates - Fields to update
 * @returns {Object} Updated draft
 */
function updateDraft(draftIdOrPath, updates) {
  return editDraft(draftIdOrPath, updates);
}

// CLI Command Handler
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  // Parse options
  const options = {};
  const positional = [];
  
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        options[key] = value;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg) {
      positional.push(arg);
    }
  }
  
  try {
    let result;
    
    switch (command) {
      case 'save': {
        // Read draft data from stdin or file
        let draftData;
        
        if (options.data) {
          draftData = JSON.parse(options.data);
        } else if (options.file) {
          draftData = JSON.parse(fs.readFileSync(options.file, 'utf8'));
        } else {
          // Read from stdin
          const stdin = fs.readFileSync(0, 'utf8');
          draftData = JSON.parse(stdin);
        }
        
        result = saveDraft(draftData);
        break;
      }
      
      case 'list': {
        const drafts = listDrafts({
          intent: options.intent,
          language: options.language,
          onlyApproval: options['only-approval'],
        });
        
        if (options.json) {
          console.log(JSON.stringify(drafts, null, 2));
        } else {
          console.log('\n📝 Drafts:\n');
          if (drafts.length === 0) {
            console.log('  (no drafts)');
          } else {
            drafts.forEach((d, i) => {
              const approvalFlag = d.requires_human_approval ? '⚠️ ' : '✅ ';
              console.log(`  ${i + 1}. ${approvalFlag}${d.draft_id}`);
              console.log(`     To: ${d.to}`);
              console.log(`     Subject: ${d.subject}`);
              console.log(`     Intent: ${d.intent || 'general'} | Lang: ${d.language}`);
              console.log(`     Created: ${d.created_at}`);
              console.log('');
            });
          }
          console.log(`Total: ${drafts.length} draft(s)\n`);
        }
        return;
      }
      
      case 'show': {
        const draftId = positional[1];
        if (!draftId) {
          console.error('❌ Missing draft ID');
          console.error('Usage: drafts show <draft-id>');
          process.exit(1);
        }
        
        const draft = loadDraft(draftId);
        if (!draft) {
          console.error(`❌ Draft not found: ${draftId}`);
          process.exit(1);
        }
        
        if (options.json) {
          console.log(JSON.stringify(draft, null, 2));
        } else {
          console.log('\n📝 Draft Details:\n');
          console.log('ID:', draft.draft_id);
          console.log('To:', draft.to);
          if (draft.cc) console.log('CC:', draft.cc);
          console.log('Subject:', draft.subject);
          console.log('Language:', draft.language);
          console.log('Intent:', draft.intent);
          console.log('Requires Approval:', draft.requires_human_approval ? 'Yes ⚠️' : 'No');
          console.log('Created:', draft.created_at);
          console.log('Updated:', draft.updated_at);
          console.log('─────────────────────────────────────────');
          console.log('Body:');
          console.log(draft.body || draft.html);
          console.log('');
        }
        return;
      }
      
      case 'inspect': {
        // New: inspect draft (aligned with lark-mail --inspect)
        const draftId = options['draft-id'] || positional[1];
        if (!draftId) {
          console.error('❌ Missing draft ID');
          console.error('Usage: drafts inspect --draft-id <draft-id>');
          process.exit(1);
        }
        
        result = inspectDraft(draftId);
        break;
      }
      
      case 'edit':
      case 'patch': {
        // New: structured patch editing
        const draftId = options['draft-id'] || positional[1];
        if (!draftId) {
          console.error('❌ Missing draft ID');
          console.error('Usage: drafts edit --draft-id <draft-id> --patch-file <file>');
          process.exit(1);
        }
        
        if (!options['patch-file']) {
          console.error('❌ Missing --patch-file');
          console.error('Usage: drafts edit --draft-id <draft-id> --patch-file <file>');
          process.exit(1);
        }
        
        const patchData = JSON.parse(fs.readFileSync(options['patch-file'], 'utf8'));
        result = editDraft(draftId, patchData);
        break;
      }
      
      case 'print-patch-template': {
        // New: print patch template
        result = printPatchTemplate();
        break;
      }
      
      case 'send': {
        const draftId = positional[1];
        if (!draftId) {
          console.error('❌ Missing draft ID');
          console.error('Usage: drafts send <draft-id> [--confirm-send] [--dry-run]');
          process.exit(1);
        }
        
        result = await sendDraft(draftId, {
          confirmSend: options['confirm-send'],
          dryRun: options['dry-run'],
          archiveAfterSend: options['archive'],
        });
        break;
      }
      
      case 'delete': {
        const draftId = positional[1];
        if (!draftId) {
          console.error('❌ Missing draft ID');
          console.error('Usage: drafts delete <draft-id>');
          process.exit(1);
        }
        
        result = deleteDraft(draftId);
        break;
      }
      
      case 'update': {
        const draftId = positional[1];
        if (!draftId) {
          console.error('❌ Missing draft ID');
          console.error('Usage: drafts update <draft-id> --data \'{"field": "value"}\'');
          process.exit(1);
        }
        
        if (!options.data) {
          console.error('❌ Missing --data parameter');
          process.exit(1);
        }
        
        const updates = JSON.parse(options.data);
        result = updateDraft(draftId, updates);
        break;
      }
      
      default:
        console.error('Unknown command:', command);
        console.error('\nAvailable commands:');
        console.error('  save                    Save a new draft (from stdin or --file)');
        console.error('  list                    List all drafts');
        console.error('  show <draft-id>         Show draft details');
        console.error('  inspect                 Inspect draft (read-only, aligned with lark-mail)');
        console.error('  edit                    Edit draft with structured patch');
        console.error('  print-patch-template    Print patch template');
        console.error('  send <draft-id>         Send draft (requires --confirm-send)');
        console.error('  delete <draft-id>       Delete draft');
        console.error('  update <draft-id>       Update draft fields (legacy)');
        console.error('\nOptions:');
        console.error('  --file <path>           Load draft data from file');
        console.error('  --data \'json\'           Pass draft data as JSON string');
        console.error('  --draft-id <id>         Draft ID for inspect/edit');
        console.error('  --patch-file <path>     Structured patch file for edit');
        console.error('  --confirm-send          Confirm sending (required for send command)');
        console.error('  --dry-run               Preview without sending');
        console.error('  --archive               Archive draft after sending');
        console.error('  --json                  Output as JSON');
        console.error('  --intent <type>         Filter by intent (list command)');
        console.error('  --language <lang>       Filter by language (list command)');
        console.error('  --only-approval         Show only drafts requiring approval (list command)');
        process.exit(1);
    }
    
    if (result) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  saveDraft,
  loadDraft,
  listDrafts,
  deleteDraft,
  sendDraft,
  updateDraft,
  editDraft,
  inspectDraft,
  printPatchTemplate,
  generateDraftId,
  DRAFTS_DIR,
};
