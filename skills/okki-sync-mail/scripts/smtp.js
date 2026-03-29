#!/usr/bin/env node

/**
 * SMTP Email CLI
 * Send email via SMTP protocol. Works with Gmail, Outlook, 163.com, and any standard SMTP server.
 * Supports attachments, HTML content, multiple recipients, and scheduled sending.
 * 
 * Parameter parsing powered by Commander.js with strict validation.
 */

const { Command, Option, InvalidArgumentError } = require('commander');
const nodemailer = require('nodemailer');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { recordSentEmail, getStatus } = require('./send-log');
const { fetchEmail } = require('./imap');
const { validateReadPath } = require('./path-utils');
const { sanitizeQuotedContent } = require('../lib/sanitize');
const { buildReplyAllRecipients, parseAndValidate } = require('../lib/email-parser');

const WORKSPACE_DIR = '/Users/wilson/.openclaw/workspace';
const SCHEDULED_DIR = path.resolve(__dirname, '../scheduled');

// ═══════════════════════════════════════════════════════════════════════════════
// Error Codes & Unified Error Handling
// ═══════════════════════════════════════════════════════════════════════════════

const ErrorCodes = {
  // Parameter validation errors (100-199)
  MISSING_REQUIRED_PARAM: 100,
  INVALID_PARAM_FORMAT: 101,
  INVALID_EMAIL_FORMAT: 102,
  INVALID_DATE_FORMAT: 103,
  INVALID_JSON_FORMAT: 104,
  FILE_NOT_FOUND: 105,
  PARAM_CONFLICT: 106,
  
  // SMTP errors (200-299)
  SMTP_CONNECTION_FAILED: 200,
  SMTP_AUTH_FAILED: 201,
  SMTP_SEND_FAILED: 202,
  SMTP_RATE_LIMIT_EXCEEDED: 203,
  
  // File system errors (300-399)
  FILE_READ_FAILED: 300,
  FILE_WRITE_FAILED: 301,
  DIRECTORY_NOT_FOUND: 302,
  
  // Business logic errors (400-499)
  DRAFT_NOT_FOUND: 400,
  EMAIL_NOT_FOUND: 401,
  SIGNATURE_NOT_FOUND: 402,
  SCHEDULE_NOT_FOUND: 403,
  
  // System errors (500-599)
  INTERNAL_ERROR: 500,
  CONFIG_MISSING: 501,
};

class SMTPError extends Error {
  constructor(code, message, suggestions = []) {
    super(message);
    this.name = 'SMTPError';
    this.code = code;
    this.suggestions = suggestions;
    this.timestamp = new Date().toISOString();
  }
  
  toString() {
    let output = `❌ Error [${this.code}]: ${this.message}`;
    if (this.suggestions.length > 0) {
      output += '\n\n💡 Suggestions:';
      this.suggestions.forEach(s => output += `\n   - ${s}`);
    }
    return output;
  }
}

function createError(code, message, suggestions = []) {
  return new SMTPError(code, message, suggestions);
}

// Wrap validation functions to throw InvalidArgumentError for Commander.js
function createValidationError(message, suggestions = []) {
  const err = new InvalidArgumentError(message);
  err.code = ErrorCodes.INVALID_EMAIL_FORMAT;
  err.suggestions = suggestions;
  return err;
}

function validateEmail(email, forCommander = false) {
  if (!email || typeof email !== 'string') {
    const err = forCommander 
      ? createValidationError('Email address is required', ['Use --to "user@example.com" format'])
      : createError(ErrorCodes.INVALID_EMAIL_FORMAT, 'Email address is required', ['Use --to "user@example.com" format']);
    throw err;
  }
  
  // Simple email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    const err = forCommander
      ? createValidationError(`Invalid email format: ${email}`, ['Email should be in format: user@domain.com', 'Avoid spaces and special characters'])
      : createError(ErrorCodes.INVALID_EMAIL_FORMAT, `Invalid email format: ${email}`, ['Email should be in format: user@domain.com', 'Avoid spaces and special characters']);
    throw err;
  }
  return true;
}

function validateEmailList(emailList, forCommander = false) {
  if (!emailList || typeof emailList !== 'string') {
    return [];
  }
  
  const emails = emailList.split(',').map(e => e.trim()).filter(Boolean);
  emails.forEach(email => validateEmail(email, forCommander));
  return emails;
}

function validateFilePath(filePath, description = 'File', forCommander = false) {
  if (!filePath || typeof filePath !== 'string') {
    const err = forCommander
      ? createValidationError(`${description} path is required`, ['Provide a valid file path'])
      : createError(ErrorCodes.FILE_NOT_FOUND, `${description} path is required`, ['Provide a valid file path']);
    throw err;
  }
  
  const resolvedPath = validateReadPath(filePath);
  if (!fs.existsSync(resolvedPath)) {
    const err = forCommander
      ? createValidationError(`${description} not found: ${filePath}`, [`Check if the file exists at ${resolvedPath}`, 'Use absolute path or path relative to workspace'])
      : createError(ErrorCodes.FILE_NOT_FOUND, `${description} not found: ${filePath}`, [`Check if the file exists at ${resolvedPath}`, 'Use absolute path or path relative to workspace']);
    throw err;
  }
  return resolvedPath;
}

function validateDateFormat(dateStr, forCommander = false) {
  if (!dateStr || typeof dateStr !== 'string') {
    const err = forCommander
      ? createValidationError('Date string is required', ['Use format: "YYYY-MM-DD HH:mm"'])
      : createError(ErrorCodes.INVALID_DATE_FORMAT, 'Date string is required', ['Use format: "YYYY-MM-DD HH:mm"']);
    throw err;
  }
  
  const trimmed = dateStr.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    const err = forCommander
      ? createValidationError(`Invalid date format: ${dateStr}`, ['Expected format: "YYYY-MM-DD HH:mm"', 'Example: "2026-03-30 09:00"'])
      : createError(ErrorCodes.INVALID_DATE_FORMAT, `Invalid date format: ${dateStr}`, ['Expected format: "YYYY-MM-DD HH:mm"', 'Example: "2026-03-30 09:00"']);
    throw err;
  }
  
  const [, year, month, day, hour, minute, second = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  );
  
  if (Number.isNaN(date.getTime())) {
    const err = forCommander
      ? createValidationError(`Invalid date value: ${dateStr}`, ['Check if the date values are valid (e.g., month 01-12, hour 00-23)'])
      : createError(ErrorCodes.INVALID_DATE_FORMAT, `Invalid date value: ${dateStr}`, ['Check if the date values are valid (e.g., month 01-12, hour 00-23)']);
    throw err;
  }
  
  return date;
}

function validateJSON(jsonStr, description = 'JSON', forCommander = false) {
  if (!jsonStr || typeof jsonStr !== 'string') {
    const err = forCommander
      ? createValidationError(`${description} string is required`, ['Provide a valid JSON string'])
      : createError(ErrorCodes.INVALID_JSON_FORMAT, `${description} string is required`, ['Provide a valid JSON string']);
    throw err;
  }
  
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    const throwErr = forCommander
      ? createValidationError(`Invalid ${description} format: ${err.message}`, ['Check JSON syntax (quotes, commas, brackets)', 'Use single quotes for shell strings: \'{"key": "value"}\''])
      : createError(ErrorCodes.INVALID_JSON_FORMAT, `Invalid ${description} format: ${err.message}`, ['Check JSON syntax (quotes, commas, brackets)', 'Use single quotes for shell strings: \'{"key": "value"}\'']);
    throw throwErr;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Commander.js Program Setup
// ═══════════════════════════════════════════════════════════════════════════════

const program = new Command();

program
  .name('smtp')
  .description('📧 SMTP Email CLI - Send emails with attachments, HTML, and scheduling')
  .version('2.0.0')
  .configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => process.stderr.write(str),
    outputError: (str, write) => write(str),
  })
  .showHelpAfterError('(Run "node smtp.js -h" for help)')
  .configureHelp({
    sortOptions: true,
    sortSubcommands: true,
  });

// Helper to create common options
const commonOptions = {
  to: new Option('-t, --to <email>', 'Recipient email(s), comma-separated for multiple')
    .argParser((value) => {
      validateEmailList(value, true);
      return value;
    }),
  subject: new Option('-s, --subject <text>', 'Email subject'),
  body: new Option('-b, --body <text>', 'Email body content'),
  bodyFile: new Option('--body-file <file>', 'Read body from file')
    .argParser((value) => validateFilePath(value, 'Body file', true)),
  cc: new Option('--cc <email>', 'CC email(s), comma-separated'),
  bcc: new Option('--bcc <email>', 'BCC email(s), comma-separated'),
  signature: new Option('--signature <name>', 'Use signature template (e.g., en-sales, cn-sales)'),
  attach: new Option('-a, --attach <files>', 'Attach file(s), comma-separated')
    .argParser((value) => {
      const files = value.split(',').map(f => f.trim()).filter(Boolean);
      files.forEach(f => validateFilePath(f, 'Attachment', true));
      return value;
    }),
  html: new Option('--html', 'Send as HTML format'),
  dryRun: new Option('--dry-run', 'Preview email without sending'),
  confirmSend: new Option('--confirm-send', 'Confirm sending (required for actual send)'),
  from: new Option('-f, --from <email>', 'Sender email (overrides default)')
    .argParser((value) => {
      validateEmail(value, true);
      return value;
    }),
};



function loadLog() {
  const LOG_FILE = path.join(WORKSPACE_DIR, 'mail-archive/sent/sent-log.json');

  if (fs.existsSync(LOG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (err) {
      console.warn(`[rate-limit] Failed to parse log file: ${err.message}`);
      return [];
    }
  }
  return [];
}

// SMTP Transporter 单例（复用连接池）
let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      pool: true,  // 启用连接池
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
      maxConnections: 5,  // 最大并发连接数
    });
    console.log('[SMTP] Transporter created (connection pool enabled)');
  }
  return _transporter;
}

/**
 * @deprecated 使用 getTransporter() 代替，复用单例 transporter
 */
function createTransporter() {
  const config = {
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
  };

  if (!config.host || !config.auth.user || !config.auth.pass) {
    throw new Error('Missing SMTP configuration. Please set SMTP_HOST, SMTP_USER, and SMTP_PASS in .env');
  }

  return nodemailer.createTransport(config);
}

async function buildMailOptions(options) {
  // Handle --reply-to: fetch original email and build quoted text
  let quotedText = '';
  let inReplyTo = undefined;
  let references = undefined;
  let replyAllRecipients = [];

  if (options.replyTo) {
    try {
      const originalEmail = await fetchEmail(options.replyTo);
      if (originalEmail) {
        // Set In-Reply-To header (points to immediate parent)
        inReplyTo = originalEmail.messageId || `<${options.replyTo}@mail>`;
        
        // Set References header (accumulates entire thread history)
        // Format: [ancestor-ids] [parent-id]
        if (originalEmail.references) {
          // Inherit parent's References + parent's Message-ID
          references = `${originalEmail.references} ${inReplyTo}`;
        } else {
          // First reply in thread: References = parent's Message-ID
          references = inReplyTo;
        }

        // Build quoted text (sanitize HTML to prevent XSS/prompt injection)
        const fromName = originalEmail.from || 'Sender';
        const fromDate = originalEmail.date ? new Date(originalEmail.date).toLocaleString() : 'Unknown date';
        const fromAddress = originalEmail.fromAddress || '';

        // Sanitize original email content before quoting
        let quotedContent = originalEmail.text || originalEmail.html || '';
        if (originalEmail.html) {
          quotedContent = sanitizeQuotedContent(originalEmail.html, {
            stripStyles: true,
            maxDepth: 2
          });
        } else if (originalEmail.text && /<[a-z][\s\S]*>/i.test(originalEmail.text)) {
          quotedContent = sanitizeQuotedContent(originalEmail.text, {
            stripStyles: true,
            maxDepth: 2
          });
        }

        quotedText = `\n\n────────────────────────────────\nOn ${fromDate}, ${fromName} <${fromAddress}> wrote:\n\n${quotedContent}`;

        // Auto "Reply All" - collect all recipients (original sender + To + Cc)
        const selfEmail = process.env.SMTP_USER;
        
        // Parse recipients to remove (if specified)
        // Remove list can be plain text (e.g., "mailing-list") or email addresses
        const removeList = options.remove 
          ? options.remove.split(',').map(r => r.toLowerCase().trim()).filter(Boolean)
          : [];
        
        // Use RFC-compliant email parser to build reply-all recipients
        replyAllRecipients = buildReplyAllRecipients(
          {
            fromAddress: fromAddress,
            to: originalEmail.to,
            cc: originalEmail.cc
          },
          selfEmail,
          removeList
        );
      }
    } catch (err) {
      console.error(`⚠️  Failed to fetch original email (UID: ${options.replyTo}): ${err.message}`);
    }
  }

  const mailOptions = {
    from: options.from || process.env.SMTP_FROM || process.env.SMTP_USER,
    to: options.to,
    // Auto "Reply All" unless explicitly overridden
    cc: options.cc !== undefined ? options.cc : (replyAllRecipients.length > 0 ? replyAllRecipients.join(',') : undefined),
    bcc: options.bcc || undefined,
    subject: options.subject || '(no subject)',
    text: options.text || undefined,
    html: options.html || undefined,
    attachments: options.attachments || [],
    headers: {
      'In-Reply-To': inReplyTo || undefined,
      'References': references || undefined,
    },
  };

  // Handle inline images (CID references)
  if (options.inlineImages && options.inlineImages.length > 0) {
    // Add inline images to attachments with cid property
    options.inlineImages.forEach(img => {
      mailOptions.attachments.push({
        filename: img.filename,
        path: img.path,
        cid: img.cid,
      });
    });
    
    // Validate HTML content contains matching cid references
    if (mailOptions.html) {
      const cidPattern = /cid:([^"'\s>]+)/g;
      const foundCids = new Set();
      let match;
      while ((match = cidPattern.exec(mailOptions.html)) !== null) {
        foundCids.add(match[1]);
      }
      
      const providedCids = new Set(options.inlineImages.map(img => img.cid));
      const missingCids = [...foundCids].filter(cid => !providedCids.has(cid));
      
      if (missingCids.length > 0) {
        console.error(`⚠️  Warning: HTML contains cid references without corresponding inline images: ${missingCids.join(', ')}`);
      }
      
      const unusedCids = [...providedCids].filter(cid => !foundCids.has(cid));
      if (unusedCids.length > 0) {
        console.error(`⚠️  Warning: Inline images provided but not used in HTML: ${unusedCids.join(', ')}`);
      }
    }
  }

  if (!mailOptions.text && !mailOptions.html) {
    mailOptions.text = options.body || '';
  }

  // Append quoted text if present
  if (quotedText) {
    // Always append to text version (for proper plain text quoting)
    if (mailOptions.text) {
      mailOptions.text += quotedText;
    }
    // For HTML, use properly formatted block
    if (mailOptions.html) {
      // Strip HTML tags from quoted text for clean display
      const plainQuoted = quotedText.replace(/<[^>]*>/g, '');
      mailOptions.html += `<br><br><div style="border-left: 2px solid #ccc; padding-left: 15px; margin-top: 20px; color: #666; font-size: 13px;"><p style="margin: 0 0 10px 0; font-weight: bold; color: #999;">────────────────────────────────</p><p style="margin: 0; white-space: pre-wrap;">${plainQuoted}</p></div>`;
    }
  }

  // Add signature
  if (options.signature && options.signatureHtml) {
    if (mailOptions.html) {
      mailOptions.html += options.signatureHtml;
    } else if (mailOptions.text) {
      mailOptions.html = mailOptions.text.replace(/\n/g, '<br>') + options.signatureHtml;
      delete mailOptions.text;
    } else {
      mailOptions.html = options.signatureHtml;
    }
  }

  return mailOptions;
}

async function sendEmail(options) {
  const isDryRun = Boolean(options.dryRun || options['dry-run']);
  const isConfirmSend = Boolean(options.confirmSend || options['confirm-send']);
  const mailOptions = await buildMailOptions(options);

  // P0-2: Draft-first behavior - default to saving draft unless --confirm-send is provided
  if (!isDryRun && !isConfirmSend) {
    // Save as draft instead of sending
    const { saveDraft } = require('./drafts');
    const draftData = {
      to: mailOptions.to,
      cc: mailOptions.cc,
      bcc: mailOptions.bcc,
      subject: mailOptions.subject,
      body: mailOptions.text || '',
      html: mailOptions.html || null,
      attachments: mailOptions.attachments || [],
      signature: options.signature,
      language: options.language || 'en',
      intent: options.intent,
      requires_human_approval: true,
      notes: 'Auto-saved draft from send command (draft-first mode)',
    };
    const draftResult = saveDraft(draftData);
    return {
      success: true,
      draft: true,
      draft_id: draftResult.draft_id,
      message: '草稿已保存，使用 --confirm-send 参数实际发送',
      logEntry: recordSentEmail(mailOptions, { success: true, messageId: null, draft: true }),
    };
  }

  if (!isDryRun && isConfirmSend) {
    const transporter = getTransporter();

    try {
      await transporter.verify();
      console.error('SMTP server is ready to send');
    } catch (err) {
      throw new Error(`SMTP connection failed: ${err.message}`);
    }

    const rateLimit = parseInt(process.env.SMTP_RATE_LIMIT, 10) || 50;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    // Filter by numeric status code 4 (成功) or legacy string 'sent'
    const recentLog = loadLog().filter(entry => entry.timestamp > oneHourAgo && (entry.status === 4 || entry.status === 'sent'));

    if (recentLog.length >= rateLimit) {
      throw new Error(
        `Rate limit exceeded: ${recentLog.length}/${rateLimit} emails sent in the last hour. ` +
        `Please wait before sending more emails. (SMTP_RATE_LIMIT=${rateLimit})`
      );
    }

    console.error(`[Rate Limit] ${recentLog.length}/${rateLimit} emails sent in last hour - OK to send`);

    const info = await transporter.sendMail(mailOptions);
    const logEntry = recordSentEmail(mailOptions, { success: true, messageId: info.messageId });

    // Auto-check delivery status after sending (wait 2 seconds for server processing)
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Query the log to confirm delivery status
    const statusEntry = getStatus(info.messageId, 'messageId');
    const confirmedDeliveryStatus = statusEntry ? {
      status: statusEntry.status || 4,  // 4=成功
      status_text: statusEntry.status_text || '成功',
      messageId: info.messageId,
      acceptedByServer: true,
      confirmedAt: new Date().toISOString(),
      deliveryNote: statusEntry.deliveryNote || 'Email accepted by SMTP server',
    } : {
      status: 4,  // 4=成功
      status_text: '成功',
      messageId: info.messageId,
      acceptedByServer: true,
      confirmedAt: new Date().toISOString(),
      deliveryNote: 'Email accepted by SMTP server',
    };

    // Update log entry with confirmed status
    const { updateLogEntry } = require('./send-log');
    if (updateLogEntry) {
      try {
        updateLogEntry(info.messageId, { deliveryStatus: confirmedDeliveryStatus });
      } catch (err) {
        console.error(`[send-email] Failed to update delivery status: ${err.message}`);
      }
    }

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      to: mailOptions.to,
      status: confirmedDeliveryStatus,
      logEntry: {
        timestamp: logEntry.timestamp,
        from: logEntry.from,
        subject: logEntry.subject,
      },
    };
  }

  console.error('\n🔍 DRY-RUN MODE - Email NOT sent\n');
  console.error('═══════════════════════════════════════════════════════════');
  console.error('From:', mailOptions.from);
  console.error('To:', mailOptions.to);
  if (mailOptions.cc) console.error('CC:', mailOptions.cc);
  if (mailOptions.bcc) console.error('BCC:', mailOptions.bcc);
  console.error('Subject:', mailOptions.subject);
  console.error('───────────────────────────────────────────────────────────');
  console.error('Body (text):', mailOptions.text ? mailOptions.text.substring(0, 500) + (mailOptions.text.length > 500 ? '...' : '') : '(none)');
  if (mailOptions.html) {
    console.error('Body (html):', mailOptions.html.substring(0, 500) + (mailOptions.html.length > 500 ? '...' : ''));
  }
  if (mailOptions.attachments && mailOptions.attachments.length > 0) {
    console.error('───────────────────────────────────────────────────────────');
    console.error('Attachments:');
    mailOptions.attachments.forEach((att, i) => {
      console.error(`  ${i + 1}. ${att.filename || att.path}`);
    });
  }
  console.error('═══════════════════════════════════════════════════════════\n');

  const logEntry = recordSentEmail(mailOptions, { success: true, messageId: null });

  return {
    success: true,
    dryRun: true,
    preview: {
      from: mailOptions.from,
      to: mailOptions.to,
      cc: mailOptions.cc,
      bcc: mailOptions.bcc,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
      attachments: mailOptions.attachments.map(att => att.filename || att.path),
    },
    status: {
      status: 'dry_run',
      messageId: null,
      acceptedByServer: false,
      timestamp: new Date().toISOString(),
      note: 'Dry-run mode - email not actually sent',
    },
    logEntry: {
      timestamp: logEntry.timestamp,
      from: logEntry.from,
      subject: logEntry.subject,
    },
  };
}

function renderSignature(sigData) {
  // Replace placeholder [Your Name] with actual sender name
  const senderName = process.env.SMTP_SENDER_NAME || 'Simon Lee';
  const nameValue = sigData.name_field === '[Your Name]' ? senderName : sigData.name_field;
  
  return `
<br>
<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">
  <p style="margin: 0;">${sigData.greeting}</p>
  <p style="margin: 5px 0;"><strong>${nameValue}</strong><br>
  ${sigData.title}<br>
  ${sigData.company}</p>
  <p style="margin: 5px 0; font-size: 12px; color: #666;">
    📍 ${sigData.address_cn}<br>
    📍 ${sigData.address_vn}<br>
    📧 ${sigData.email} | 📞 ${sigData.phone}<br>
    🌐 ${sigData.website}</p>
  <p style="margin: 10px 0 0; padding-top: 10px; border-top: 1px solid #ddd; font-size: 12px; color: #999;">
    ${sigData.tagline}
  </p>
</div>
  `.trim();
}

function readAttachment(filePath) {
  const realPath = validateReadPath(filePath);
  if (!fs.existsSync(realPath)) {
    throw new Error(`Attachment file not found: ${filePath}`);
  }
  return {
    filename: path.basename(realPath),
    path: realPath,
  };
}

function ensureScheduledDir() {
  if (!fs.existsSync(SCHEDULED_DIR)) {
    fs.mkdirSync(SCHEDULED_DIR, { recursive: true });
  }
}

function generateScheduleId() {
  return `sched-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseSendAt(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Missing required option: --send-at "YYYY-MM-DD HH:mm"');
  }

  const trimmed = input.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error('Invalid --send-at format. Expected "YYYY-MM-DD HH:mm"');
  }

  const [, year, month, day, hour, minute, second = '0'] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
    0
  );

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --send-at value: ${input}`);
  }

  return date;
}

function serializeMailOptions(options) {
  return {
    from: options.from,
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: options.subject,
    text: options.text,
    html: options.html,
    body: options.body,
    signature: options.signature,
    signatureHtml: options.signatureHtml,
    dryRun: Boolean(options.dryRun || options['dry-run']),
    attachments: (options.attachments || []).map(att => ({
      filename: att.filename,
      path: att.path,
    })),
  };
}

function writeScheduleRecord(record) {
  ensureScheduledDir();
  const filePath = path.join(SCHEDULED_DIR, `${record.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
  return filePath;
}

function loadScheduleRecord(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveScheduleRecord(filePath, record) {
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf8');
}

async function processScheduledFile(filePath) {
  const record = loadScheduleRecord(filePath);

  if (record.status !== 'pending') {
    return {
      skipped: true,
      reason: `Schedule already ${record.status}`,
      id: record.id,
      file: filePath,
    };
  }

  record.status = 'sending';
  record.processingStartedAt = new Date().toISOString();
  saveScheduleRecord(filePath, record);

  try {
    const result = await sendEmail(record.mailOptions);
    record.status = 'sent';
    record.sentAt = new Date().toISOString();
    record.result = result;
    saveScheduleRecord(filePath, record);

    return {
      id: record.id,
      file: filePath,
      status: record.status,
      result,
    };
  } catch (err) {
    record.status = 'failed';
    record.failedAt = new Date().toISOString();
    record.error = err.message;
    saveScheduleRecord(filePath, record);
    throw err;
  }
}

async function scheduleEmail(options, sendAtInput) {
  // Accept either a Date object or a string
  const sendAt = sendAtInput instanceof Date ? sendAtInput : parseSendAt(sendAtInput);
  const now = Date.now();
  const delayMs = sendAt.getTime() - now;

  const record = {
    id: generateScheduleId(),
    createdAt: new Date().toISOString(),
    sendAt: sendAt.toISOString(),
    requestedSendAt: sendAtInput,
    status: 'pending',
    mailOptions: serializeMailOptions(options),
  };

  const filePath = writeScheduleRecord(record);

  if (delayMs <= 0) {
    const result = await processScheduledFile(filePath);
    return {
      success: true,
      scheduled: true,
      immediate: true,
      id: record.id,
      file: filePath,
      sendAt: record.sendAt,
      result,
    };
  }

  console.error(`⏰ Scheduled email ${record.id} for ${record.sendAt} (${Math.round(delayMs / 1000)}s later)`);

  await new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        await processScheduledFile(filePath);
        resolve();
      } catch (err) {
        reject(err);
      }
    }, delayMs);
  });

  const finalRecord = loadScheduleRecord(filePath);
  return {
    success: true,
    scheduled: true,
    completed: true,
    id: record.id,
    file: filePath,
    sendAt: finalRecord.sendAt,
    status: finalRecord.status,
    result: finalRecord.result,
  };
}

function listScheduledEmails() {
  ensureScheduledDir();
  return fs.readdirSync(SCHEDULED_DIR)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const filePath = path.join(SCHEDULED_DIR, name);
      const record = loadScheduleRecord(filePath);
      return {
        id: record.id,
        file: filePath,
        status: record.status,
        sendAt: record.sendAt,
        to: record.mailOptions?.to,
        subject: record.mailOptions?.subject,
      };
    });
}

async function sendDueScheduledEmails() {
  const now = Date.now();
  const scheduled = listScheduledEmails();
  const due = scheduled.filter(item => item.status === 'pending' && new Date(item.sendAt).getTime() <= now);
  const results = [];

  for (const item of due) {
    try {
      const result = await processScheduledFile(item.file);
      results.push({ success: true, ...result });
    } catch (err) {
      results.push({ success: false, id: item.id, file: item.file, error: err.message });
    }
  }

  return {
    success: true,
    processed: results.length,
    results,
  };
}

async function prepareSendOptions(options) {
  if (!options.to) {
    throw new Error('Missing required option: --to <email>');
  }
  if (!options.subject && !options['subject-file']) {
    throw new Error('Missing required option: --subject <text> or --subject-file <file>');
  }

  if (options['subject-file']) {
    validateReadPath(options['subject-file']);
    options.subject = fs.readFileSync(options['subject-file'], 'utf8').trim();
  }

  if (options['body-file']) {
    validateReadPath(options['body-file']);
    const content = fs.readFileSync(options['body-file'], 'utf8');
    if (options['body-file'].endsWith('.html') || options.html) {
      options.html = content;
      delete options.text;
    } else {
      options.text = content;
      delete options.html;
    }
  } else if (options['html-file']) {
    validateReadPath(options['html-file']);
    options.html = fs.readFileSync(options['html-file'], 'utf8');
    delete options.text;
  } else if (options.body) {
    if (options.html === true || options.html === 'true') {
      options.html = options.body;
      delete options.text;
    } else {
      options.text = options.body;
      delete options.html;
    }
  }

  if (options.attach) {
    const attachFiles = options.attach.split(',').map(f => f.trim()).filter(Boolean);
    options.attachments = attachFiles.map(f => readAttachment(f));
    console.log(`📎 已添加 ${options.attachments.length} 个附件:`);
    options.attachments.forEach(att => console.log(`   - ${att.filename}`));
  }

  // Handle --inline parameter for embedded images (CID references)
  if (options.inline) {
    // Check mutual exclusion with --plain-text
    if (options['plain-text']) {
      throw new Error('❌ --plain-text and --inline are mutually exclusive. Inline images require HTML content.');
    }
    
    try {
      // Parse JSON array: '[{"cid":"abc123","path":"./logo.png"}]'
      const inlineImages = JSON.parse(options.inline);
      if (!Array.isArray(inlineImages)) {
        throw new Error('--inline must be a JSON array of objects with "cid" and "path" properties');
      }
      
      options.inlineImages = inlineImages.map(img => {
        if (!img.cid || !img.path) {
          throw new Error(`Each inline image must have "cid" and "path" properties: ${JSON.stringify(img)}`);
        }
        const realPath = validateReadPath(img.path);
        if (!fs.existsSync(realPath)) {
          throw new Error(`Inline image file not found: ${img.path}`);
        }
        return {
          cid: img.cid,
          filename: path.basename(realPath),
          path: realPath,
        };
      });
      
      console.log(`🖼️  已添加 ${options.inlineImages.length} 个内嵌图片:`);
      options.inlineImages.forEach(img => console.log(`   - CID: ${img.cid}, File: ${img.filename}`));
      
      // Ensure HTML mode is enabled for inline images
      options.html = options.html || true;
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error(`Invalid --inline JSON format: ${options.inline}. Expected format: '[{"cid":"abc123","path":"./logo.png"}]'`);
      }
      throw err;
    }
  }

  if (options.signature) {
    const signaturePath = path.resolve(__dirname, `../signatures/signature-${options.signature}.json`);
    if (fs.existsSync(signaturePath)) {
      const sigData = JSON.parse(fs.readFileSync(signaturePath, 'utf8'));
      options.signatureHtml = renderSignature(sigData);
      console.log(`📝 已加载签名模板：${options.signature}`);
    } else {
      console.error(`⚠️  签名模板不存在：${signaturePath}`);
    }
  }

  // Handle --plain-text parameter: force plain text mode, ignore HTML
  if (options['plain-text']) {
    if (options.html) {
      console.log('⚠️  --plain-text specified, HTML content will be converted to plain text');
      delete options.html;
    }
    if (options.body && !options.text) {
      options.text = options.body;
    }
    console.log('📝 强制纯文本模式已启用');
  }

  // Normalize --reply-to parameter
  if (options['reply-to']) {
    options.replyTo = options['reply-to'];
  }

  return options;
}

async function testConnection() {
  const transporter = getTransporter();

  try {
    await transporter.verify();
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      subject: 'SMTP Connection Test',
      text: 'This is a test email from the IMAP/SMTP email skill.',
      html: '<p>This is a <strong>test email</strong> from the IMAP/SMTP email skill.</p>',
    });

    return {
      success: true,
      message: 'SMTP connection successful',
      messageId: info.messageId,
    };
  } catch (err) {
    throw new Error(`SMTP test failed: ${err.message}`);
  }
}

async function interactiveMode() {
  const prompts = require('prompts');

  console.log('\n📧 SMTP Email Interactive Mode\n');
  console.log('Follow the prompts to configure and send an email.\n');

  // Step 1: Recipient
  const toPrompt = await prompts({
    type: 'text',
    name: 'to',
    message: 'Recipient email (to):',
    validate: value => value && value.includes('@') ? true : 'Please enter a valid email address',
  });

  if (!toPrompt.to) {
    console.log('Cancelled.');
    return;
  }

  // Step 2: CC (optional)
  const ccPrompt = await prompts({
    type: 'text',
    name: 'cc',
    message: 'CC email(s) (optional, comma-separated):',
  });

  // Step 3: Subject
  const subjectPrompt = await prompts({
    type: 'text',
    name: 'subject',
    message: 'Email subject:',
    validate: value => value ? true : 'Subject is required',
  });

  if (!subjectPrompt.subject) {
    console.log('Cancelled.');
    return;
  }

  // Step 4: Content type
  const typePrompt = await prompts({
    type: 'select',
    name: 'contentType',
    message: 'Content type:',
    choices: [
      { title: 'Plain Text', value: 'text' },
      { title: 'HTML', value: 'html' },
    ],
  });

  // Step 5: Body content
  const bodyPrompt = await prompts({
    type: 'text',
    name: 'body',
    message: `Enter email body (${typePrompt.contentType}):`,
    validate: value => value ? true : 'Body is required',
  });

  if (!bodyPrompt.body) {
    console.log('Cancelled.');
    return;
  }

  // Step 6: Attachments (optional)
  const attachPrompt = await prompts({
    type: 'text',
    name: 'attachments',
    message: 'Attachments (optional, comma-separated paths):',
  });

  // Step 7: Signature (optional)
  const sigPrompt = await prompts({
    type: 'text',
    name: 'signature',
    message: 'Signature template name (optional, e.g., en-sales):',
  });

  // Step 8: Confirm
  const confirmPrompt = await prompts({
    type: 'confirm',
    name: 'send',
    message: 'Send this email?',
    initial: true,
  });

  if (!confirmPrompt.send) {
    console.log('Cancelled.');
    return;
  }

  // Build options
  const options = {
    to: toPrompt.to,
    cc: ccPrompt.cc || undefined,
    subject: subjectPrompt.subject,
    [typePrompt.contentType]: bodyPrompt.body,
    signature: sigPrompt.signature || undefined,
  };

  if (attachPrompt.attachments) {
    options.attach = attachPrompt.attachments;
  }

  // Send email
  try {
    const prepared = await prepareSendOptions(options);
    const result = await sendEmail(prepared);
    console.log('\n✅ Email sent successfully!');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('\n❌ Failed to send email:', err.message);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Commander.js Command Registrations
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register all subcommands with Commander.js
 */
function registerCommands() {
  // Send command
  program
    .command('send')
    .description('📤 Send email (draft-first mode by default)')
    .addOption(commonOptions.to.makeOptionMandatory('Recipient email is required'))
    .addOption(commonOptions.subject.makeOptionMandatory('Email subject is required'))
    .addOption(commonOptions.body)
    .addOption(commonOptions.bodyFile)
    .addOption(commonOptions.cc)
    .addOption(commonOptions.bcc)
    .addOption(commonOptions.signature)
    .addOption(commonOptions.attach)
    .addOption(commonOptions.html)
    .addOption(commonOptions.dryRun)
    .addOption(commonOptions.confirmSend)
    .addOption(commonOptions.from)
    .option('--subject-file <file>', 'Read subject from file')
    .option('--html-file <file>', 'Read HTML body from file')
    .option('--send-at <datetime>', 'Schedule email for later (format: "YYYY-MM-DD HH:mm")', (value) => {
      return validateDateFormat(value, true);
    })
    .option('--reply-to <uid>', 'Reply to email UID (auto-includes original recipients in CC)')
    .option('--remove <emails>', 'Exclude specific recipients from reply-all (comma-separated)')
    .option('--inline <json>', 'Inline images as CID references (JSON array)', (value) => {
      const parsed = validateJSON(value, 'Inline images', true);
      if (!Array.isArray(parsed)) {
        throw createValidationError(
          '--inline must be a JSON array',
          ['Format: \'[{"cid":"logo123","path":"./logo.png"}]\'']
        );
      }
      parsed.forEach(img => {
        if (!img.cid || !img.path) {
          throw createValidationError(
            'Each inline image must have "cid" and "path" properties',
          );
        }
        validateFilePath(img.path, 'Inline image', true);
      });
      return parsed;
    })
    .option('--plain-text', 'Force plain text mode (mutually exclusive with --inline)')
    .option('--language <lang>', 'Email language (en/cn)', 'en')
    .option('--intent <type>', 'Email intent (inquiry/reply/followup)')
    .action(async (options) => {
      try {
        const prepared = await prepareSendOptions(options);
        let result;
        if (options.sendAt) {
          // options.sendAt is already a Date object from the parser
          result = await scheduleEmail(prepared, options.sendAt);
        } else {
          result = await sendEmail(prepared);
        }
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Test command
  program
    .command('test')
    .description('🔍 Test SMTP connection')
    .action(async () => {
      try {
        const result = await testConnection();
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // List signatures command
  program
    .command('list-signatures')
    .description('📋 List available signature templates')
    .action(() => {
      try {
        const signaturesDir = path.resolve(__dirname, '../signatures');
        if (!fs.existsSync(signaturesDir)) {
          throw createError(
            ErrorCodes.DIRECTORY_NOT_FOUND,
            `Signature directory not found: ${signaturesDir}`,
            ['Check if the signatures folder exists']
          );
        }

        const files = fs.readdirSync(signaturesDir).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
          console.log('📭 No signature templates found');
          return;
        }

        console.log('\n📝 Available Signature Templates:\n');
        files.forEach(file => {
          const sigData = JSON.parse(fs.readFileSync(path.join(signaturesDir, file), 'utf8'));
          const name = file.replace('signature-', '').replace('.json', '');
          console.log(`  - ${name} (${sigData.language || 'unknown'} / ${sigData.role || 'general'})`);
        });
        console.log('');
      } catch (err) {
        handleError(err);
      }
    });

  // Show signature command
  program
    .command('show-signature <name>')
    .description('📝 Show signature template details')
    .action((name) => {
      try {
        const signaturePath = path.resolve(__dirname, `../signatures/signature-${name}.json`);
        if (!fs.existsSync(signaturePath)) {
          throw createError(
            ErrorCodes.SIGNATURE_NOT_FOUND,
            `Signature template not found: ${name}`,
            ['Run list-signatures to see available templates']
          );
        }

        const sigData = JSON.parse(fs.readFileSync(signaturePath, 'utf8'));
        console.log('\n📝 Signature Template Details:\n');
        console.log('Name:', name);
        console.log('Language:', sigData.language || 'Unspecified');
        console.log('Role:', sigData.role || 'Unspecified');
        console.log('─────────────────────────────────────────');
        console.log('Greeting:', sigData.greeting);
        console.log('Name:', sigData.name_field);
        console.log('Title:', sigData.title);
        console.log('Company:', sigData.company);
        console.log('Email:', sigData.email);
        console.log('Phone:', sigData.phone);
        console.log('Website:', sigData.website);
        console.log('Address (CN):', sigData.address_cn);
        console.log('Address (VN):', sigData.address_vn);
        console.log('Tagline:', sigData.tagline);
        console.log('');
      } catch (err) {
        handleError(err);
      }
    });

  // List scheduled command
  program
    .command('list-scheduled')
    .description('📅 List scheduled email tasks')
    .action(() => {
      try {
        const result = {
          success: true,
          scheduledDir: SCHEDULED_DIR,
          items: listScheduledEmails(),
        };
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Send due command
  program
    .command('send-due')
    .description('⏰ Send all due scheduled emails')
    .action(async () => {
      try {
        const result = await sendDueScheduledEmails();
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Interactive command
  program
    .command('interactive')
    .description('🎯 Interactive email wizard')
    .action(async () => {
      try {
        await interactiveMode();
      } catch (err) {
        handleError(err);
      }
    });

  // Draft command
  program
    .command('draft')
    .description('📝 Save email as draft')
    .addOption(commonOptions.to)
    .addOption(commonOptions.subject)
    .addOption(commonOptions.body)
    .addOption(commonOptions.bodyFile)
    .addOption(commonOptions.cc)
    .addOption(commonOptions.bcc)
    .addOption(commonOptions.signature)
    .addOption(commonOptions.attach)
    .option('--language <lang>', 'Draft language', 'en')
    .option('--intent <type>', 'Draft intent')
    .option('--template <name>', 'Template used')
    .option('--notes <text>', 'Draft notes')
    .option('--no-approval', 'Skip approval requirement')
    .option('--file <file>', 'Load draft from JSON file')
    .action((options) => {
      try {
        const { saveDraft } = require('./drafts');
        
        const draftData = {
          to: options.to,
          cc: options.cc,
          bcc: options.bcc,
          subject: options.subject,
          body: options.body,
          html: options.html,
          signature: options.signature,
          language: options.language || 'en',
          intent: options.intent,
          template_used: options.template,
          requires_human_approval: options.approval !== false,
          notes: options.notes,
        };
        
        if (options.bodyFile) {
          draftData.body = fs.readFileSync(options.bodyFile, 'utf8');
        }
        
        if (options.attach) {
          const attachFiles = options.attach.split(',').map(f => f.trim()).filter(Boolean);
          draftData.attachments = attachFiles.map(f => ({
            filename: path.basename(f),
            path: validateFilePath(f),
          }));
        }
        
        if (options.file) {
          const fileData = JSON.parse(fs.readFileSync(validateFilePath(options.file), 'utf8'));
          Object.assign(draftData, fileData);
        }
        
        const result = saveDraft(draftData);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Send draft command
  program
    .command('send-draft <draftId>')
    .description('📤 Send a draft')
    .option('--confirm-send', 'Confirm sending')
    .option('--dry-run', 'Preview without sending')
    .option('--archive', 'Archive after sending')
    .action(async (draftId, options) => {
      try {
        const { sendDraft } = require('./drafts');
        const result = await sendDraft(draftId, {
          confirmSend: options.confirmSend,
          dryRun: options.dryRun,
          archive: options.archive,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // List drafts command
  program
    .command('list-drafts')
    .description('📋 List all drafts')
    .option('--intent <type>', 'Filter by intent')
    .option('--language <lang>', 'Filter by language')
    .option('--only-approval', 'Show only drafts requiring approval')
    .option('--json', 'Output as JSON')
    .action((options) => {
      try {
        const { listDrafts } = require('./drafts');
        
        const drafts = listDrafts({
          intent: options.intent,
          language: options.language,
          onlyApproval: options.onlyApproval,
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
      } catch (err) {
        handleError(err);
      }
    });

  // Show draft command
  program
    .command('show-draft <draftId>')
    .description('📝 Show draft details')
    .option('--json', 'Output as JSON')
    .action((draftId, options) => {
      try {
        const { loadDraft } = require('./drafts');
        const draft = loadDraft(draftId);
        if (!draft) {
          throw createError(
            ErrorCodes.DRAFT_NOT_FOUND,
            `Draft not found: ${draftId}`,
            ['Run list-drafts to see available drafts']
          );
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
      } catch (err) {
        handleError(err);
      }
    });

  // Delete draft command
  program
    .command('delete-draft <draftId>')
    .description('🗑️ Delete a draft')
    .action((draftId) => {
      try {
        const { deleteDraft } = require('./drafts');
        const result = deleteDraft(draftId);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Draft edit command
  program
    .command('draft-edit <draftId>')
    .alias('edit-draft')
    .description('✏️ Edit draft (supports structured patch)')
    .option('--to <email>', 'Update recipient')
    .option('--subject <text>', 'Update subject')
    .option('--body <text>', 'Update body')
    .option('--body-file <file>', 'Load new body from file')
    .option('--html <content>', 'Update HTML body')
    .option('--html-file <file>', 'Load HTML from file')
    .option('--cc <email>', 'Update CC')
    .option('--bcc <email>', 'Update BCC')
    .option('--attach <files>', 'Update attachments')
    .option('--signature <name>', 'Update signature')
    .option('--language <lang>', 'Update language')
    .option('--intent <type>', 'Update intent')
    .option('--notes <text>', 'Update notes')
    .option('--patch-file <file>', 'Load structured patch from JSON file')
    .option('--no-approval', 'Remove approval requirement')
    .option('--inspect', 'View draft details (read-only)')
    .option('--print-patch-template', 'Print patch template')
    .action(async (draftId, options) => {
      try {
        const { editDraft, inspectDraft, printPatchTemplate } = require('./drafts');
        
        if (options.printPatchTemplate) {
          const result = printPatchTemplate();
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        
        if (options.inspect) {
          const result = inspectDraft(draftId);
          console.log(JSON.stringify(result, null, 2));
          return;
        }
        
        const updates = {};
        
        if (options.patchFile) {
          const patchData = JSON.parse(fs.readFileSync(validateFilePath(options.patchFile), 'utf8'));
          if (patchData.ops && Array.isArray(patchData.ops)) {
            Object.assign(updates, patchData);
          } else {
            Object.assign(updates, patchData);
          }
        }
        
        if (options.to) updates.to = options.to;
        if (options.subject) updates.subject = options.subject;
        if (options.body) updates.body = options.body;
        if (options.cc) updates.cc = options.cc;
        if (options.bcc) updates.bcc = options.bcc;
        if (options.html) updates.html = options.html;
        if (options.signature) updates.signature = options.signature;
        if (options.language) updates.language = options.language;
        if (options.intent) updates.intent = options.intent;
        if (options.notes) updates.notes = options.notes;
        if (options.approval === false) updates.requires_human_approval = false;
        
        if (options.bodyFile) {
          updates.body = fs.readFileSync(validateFilePath(options.bodyFile), 'utf8');
        }
        
        if (options.htmlFile) {
          updates.html = fs.readFileSync(validateFilePath(options.htmlFile), 'utf8');
        }
        
        if (options.attach) {
          const attachFiles = options.attach.split(',').map(f => f.trim()).filter(Boolean);
          updates.attachments = attachFiles.map(f => ({
            filename: path.basename(f),
            path: validateFilePath(f),
          }));
        }
        
        if (Object.keys(updates).length === 0) {
          throw createError(
            ErrorCodes.MISSING_REQUIRED_PARAM,
            'No updates provided',
            ['Use --to, --subject, --body, --patch-file, etc.', 'Run with --inspect to view current draft']
          );
        }
        
        const result = editDraft(draftId, updates);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Send status command
  program
    .command('send-status [identifier] [field]')
    .alias('status')
    .description('📬 Check delivery status')
    .action((identifier, field, options) => {
      try {
        if (!identifier) {
          const { getAllRecentStatus } = require('./send-log');
          const statuses = getAllRecentStatus(10);
          console.log(JSON.stringify({
            success: true,
            count: statuses.length,
            statuses,
          }, null, 2));
        } else if (field === 'messageId' && !isNaN(parseInt(identifier))) {
          const { getAllRecentStatus } = require('./send-log');
          const statuses = getAllRecentStatus(parseInt(identifier));
          console.log(JSON.stringify({
            success: true,
            count: statuses.length,
            statuses,
          }, null, 2));
        } else {
          const status = getStatus(identifier, field || 'messageId');
          if (!status) {
            throw createError(
              ErrorCodes.EMAIL_NOT_FOUND,
              `Email not found: ${identifier}`,
              ['Check the identifier and field']
            );
          }
          console.log(JSON.stringify({
            success: true,
            status,
          }, null, 2));
        }
      } catch (err) {
        handleError(err);
      }
    });

  // Reply command
  program
    .command('reply')
    .description('📤 Reply to email (auto "Reply All")')
    .requiredOption('--message-id <uid>', 'Original email UID')
    .option('--body <text>', 'Reply body')
    .option('--body-file <file>', 'Load body from file')
    .option('--subject <text>', 'Custom subject')
    .option('--signature <name>', 'Use signature template')
    .option('--remove <emails>', 'Exclude recipients')
    .option('--dry-run', 'Preview without sending')
    .action(async (options) => {
      try {
        if (!options.body && !options.bodyFile) {
          throw createError(
            ErrorCodes.MISSING_REQUIRED_PARAM,
            'Missing --body or --body-file',
            ['Provide reply content with --body or --body-file']
          );
        }
        
        const replyOptions = {
          to: options.to || 'placeholder@reply.local',
          subject: options.subject || `Re: `,
          body: options.body || '',
          signature: options.signature,
          remove: options.remove,
          dryRun: options.dryRun,
        };
        
        if (options.bodyFile) {
          replyOptions.body = fs.readFileSync(validateFilePath(options.bodyFile), 'utf8');
        }
        
        replyOptions['reply-to'] = options.messageId;
        
        const prepared = await prepareSendOptions(replyOptions);
        const result = await sendEmail(prepared);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Reply all command
  program
    .command('reply-all')
    .description('📤 Reply all to email')
    .requiredOption('--message-id <uid>', 'Original email UID')
    .option('--body <text>', 'Reply body')
    .option('--body-file <file>', 'Load body from file')
    .option('--subject <text>', 'Custom subject')
    .option('--signature <name>', 'Use signature template')
    .option('--remove <emails>', 'Exclude recipients')
    .option('--dry-run', 'Preview without sending')
    .action(async (options) => {
      try {
        if (!options.body && !options.bodyFile) {
          throw createError(
            ErrorCodes.MISSING_REQUIRED_PARAM,
            'Missing --body or --body-file',
            ['Provide reply content with --body or --body-file']
          );
        }
        
        const replyOptions = {
          to: options.to || 'placeholder@reply.local',
          subject: options.subject || `Re: `,
          body: options.body || '',
          signature: options.signature,
          remove: options.remove,
          dryRun: options.dryRun,
        };
        
        if (options.bodyFile) {
          replyOptions.body = fs.readFileSync(validateFilePath(options.bodyFile), 'utf8');
        }
        
        replyOptions['reply-to'] = options.messageId;
        
        const prepared = await prepareSendOptions(replyOptions);
        const result = await sendEmail(prepared);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Forward command
  program
    .command('forward')
    .description('📤 Forward email')
    .requiredOption('--message-id <uid>', 'Original email UID')
    .requiredOption('--to <email>', 'Forward to email')
    .option('--body <text>', 'Forward note', 'Please see the forwarded email below.')
    .option('--cc <email>', 'CC email')
    .option('--bcc <email>', 'BCC email')
    .option('--signature <name>', 'Use signature')
    .option('--forward-attachments', 'Forward original attachments')
    .option('--draft', 'Save as draft (default)')
    .option('--confirm-send', 'Send directly')
    .option('--dry-run', 'Preview without sending')
    .option('--mailbox <name>', 'Original email mailbox', 'INBOX')
    .action(async (options) => {
      try {
        const { forwardEmail } = require('./forward');
        const result = await forwardEmail({
          uid: options.messageId,
          to: options.to,
          cc: options.cc,
          bcc: options.bcc,
          body: options.body,
          signature: options.signature,
          forwardAttachments: options.forwardAttachments === true,
          draft: options.draft !== 'false' && !options.confirmSend,
          confirmSend: options.confirmSend === true,
          dryRun: options.dryRun === true,
          mailbox: options.mailbox,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  // Draft aliases for backward compatibility
  program
    .command('draft-create')
    .alias('create-draft')
    .description('📝 Save draft (alias for draft)')
    .addOption(commonOptions.to)
    .addOption(commonOptions.subject)
    .addOption(commonOptions.body)
    .addOption(commonOptions.bodyFile)
    .addOption(commonOptions.cc)
    .addOption(commonOptions.bcc)
    .addOption(commonOptions.signature)
    .addOption(commonOptions.attach)
    .option('--language <lang>', 'Draft language', 'en')
    .option('--intent <type>', 'Draft intent')
    .option('--template <name>', 'Template used')
    .option('--notes <text>', 'Draft notes')
    .option('--no-approval', 'Skip approval')
    .option('--file <file>', 'Load from JSON file')
    .action((options) => {
      try {
        const { saveDraft } = require('./drafts');
        
        const draftData = {
          to: options.to,
          cc: options.cc,
          bcc: options.bcc,
          subject: options.subject,
          body: options.body,
          html: options.html,
          signature: options.signature,
          language: options.language || 'en',
          intent: options.intent,
          template_used: options.template,
          requires_human_approval: options.approval !== false,
          notes: options.notes,
        };
        
        if (options.bodyFile) {
          draftData.body = fs.readFileSync(options.bodyFile, 'utf8');
        }
        
        if (options.attach) {
          const attachFiles = options.attach.split(',').map(f => f.trim()).filter(Boolean);
          draftData.attachments = attachFiles.map(f => ({
            filename: path.basename(f),
            path: validateFilePath(f),
          }));
        }
        
        if (options.file) {
          const fileData = JSON.parse(fs.readFileSync(validateFilePath(options.file), 'utf8'));
          Object.assign(draftData, fileData);
        }
        
        const result = saveDraft(draftData);
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('draft-send <draftId>')
    .description('📤 Send draft (alias for send-draft)')
    .option('--confirm-send', 'Confirm sending')
    .option('--dry-run', 'Preview without sending')
    .option('--archive', 'Archive after sending')
    .action(async (draftId, options) => {
      try {
        const { sendDraft } = require('./drafts');
        const result = await sendDraft(draftId, {
          confirmSend: options.confirmSend,
          dryRun: options.dryRun,
          archive: options.archive,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (err) {
        handleError(err);
      }
    });
}

/**
 * Unified error handler for Commander.js
 */
function handleError(err) {
  if (err instanceof SMTPError) {
    console.error(err.toString());
    process.exit(1);
  } else if (err instanceof InvalidArgumentError) {
    console.error(`❌ Invalid argument: ${err.message}`);
    process.exit(1);
  } else {
    console.error(`❌ Unexpected error: ${err.message}`);
    console.error('Stack:', err.stack);
    process.exit(1);
  }
}

// Register all commands
registerCommands();

// Parse and execute
program.parse(process.argv);

module.exports = {
  parseSendAt,
  prepareSendOptions,
  sendEmail,
  scheduleEmail,
  sendDueScheduledEmails,
  listScheduledEmails,
  processScheduledFile,
  SCHEDULED_DIR,
};
