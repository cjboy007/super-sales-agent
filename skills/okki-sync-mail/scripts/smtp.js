#!/usr/bin/env node

/**
 * SMTP Email CLI
 * Send email via SMTP protocol. Works with Gmail, Outlook, 163.com, and any standard SMTP server.
 * Supports attachments, HTML content, multiple recipients, and scheduled sending.
 */

const nodemailer = require('nodemailer');
const path = require('path');
const os = require('os');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { recordSentEmail } = require('./send-log');
const { fetchEmail } = require('./imap');

const WORKSPACE_DIR = '/Users/wilson/.openclaw/workspace';
const SCHEDULED_DIR = path.resolve(__dirname, '../scheduled');

function validateReadPath(inputPath) {
  let realPath;
  try {
    realPath = fs.realpathSync(inputPath);
  } catch {
    realPath = path.resolve(inputPath);
  }

  const allowedDirsStr = process.env.ALLOWED_READ_DIRS;
  if (!allowedDirsStr) {
    throw new Error('ALLOWED_READ_DIRS not set in .env. File read operations are disabled.');
  }

  const allowedDirs = allowedDirsStr.split(',').map(d =>
    path.resolve(d.trim().replace(/^~/, os.homedir()))
  );

  const allowed = allowedDirs.some(dir =>
    realPath === dir || realPath.startsWith(dir + path.sep)
  );

  if (!allowed) {
    throw new Error(`Access denied: '${inputPath}' is outside allowed read directories`);
  }

  return realPath;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const command = args[0];
  const options = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      options[key] = value || true;
      if (value && !value.startsWith('--')) i++;
    } else {
      positional.push(arg);
    }
  }

  return { command, options, positional };
}

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
        // Set In-Reply-To and References headers
        inReplyTo = originalEmail.messageId || `<${options.replyTo}@mail>`;
        references = inReplyTo;

        // Build quoted text
        const fromName = originalEmail.from || 'Sender';
        const fromDate = originalEmail.date ? new Date(originalEmail.date).toLocaleString() : 'Unknown date';
        const fromAddress = originalEmail.fromAddress || '';

        quotedText = `\n\n────────────────────────────────\nOn ${fromDate}, ${fromName} <${fromAddress}> wrote:\n\n${originalEmail.text || originalEmail.html || ''}`;

        // Auto "Reply All" - collect all recipients
        const selfEmail = process.env.SMTP_USER;
        if (fromAddress && fromAddress !== selfEmail) {
          replyAllRecipients.push(fromAddress);
        }
        if (originalEmail.to) {
          const toRecipients = originalEmail.to.split(',').map(r => r.trim());
          toRecipients.forEach(r => {
            if (r && r !== selfEmail && !replyAllRecipients.includes(r)) {
              replyAllRecipients.push(r);
            }
          });
        }
        if (originalEmail.cc) {
          const ccRecipients = originalEmail.cc.split(',').map(r => r.trim());
          ccRecipients.forEach(r => {
            if (r && r !== selfEmail && !replyAllRecipients.includes(r)) {
              replyAllRecipients.push(r);
            }
          });
        }
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
    attachments: [],
    headers: {
      'In-Reply-To': inReplyTo || undefined,
      'References': references || undefined,
    },
  };

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

  // Add inline attachments (CID images)
  if (options.inlineAttachments && options.inlineAttachments.length > 0) {
    mailOptions.attachments.push(...options.inlineAttachments);
  }

  // Add regular attachments
  if (options.attachments && options.attachments.length > 0) {
    mailOptions.attachments.push(...options.attachments);
  }

  return mailOptions;
}

async function sendEmail(options) {
  const isDryRun = Boolean(options.dryRun || options['dry-run']);
  const mailOptions = await buildMailOptions(options);

  if (!isDryRun) {
    const transporter = getTransporter();

    try {
      await transporter.verify();
      console.error('SMTP server is ready to send');
    } catch (err) {
      throw new Error(`SMTP connection failed: ${err.message}`);
    }

    const rateLimit = parseInt(process.env.SMTP_RATE_LIMIT, 10) || 50;
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentLog = loadLog().filter(entry => entry.timestamp > oneHourAgo && entry.status === 'sent');

    if (recentLog.length >= rateLimit) {
      throw new Error(
        `Rate limit exceeded: ${recentLog.length}/${rateLimit} emails sent in the last hour. ` +
        `Please wait before sending more emails. (SMTP_RATE_LIMIT=${rateLimit})`
      );
    }

    console.error(`[Rate Limit] ${recentLog.length}/${rateLimit} emails sent in last hour - OK to send`);

    const info = await transporter.sendMail(mailOptions);
    recordSentEmail(mailOptions, { success: true, messageId: info.messageId });

    return {
      success: true,
      messageId: info.messageId,
      response: info.response,
      to: mailOptions.to,
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
  
  // Separate inline and regular attachments
  const inlineAttachments = (mailOptions.attachments || []).filter(att => att.cid);
  const regularAttachments = (mailOptions.attachments || []).filter(att => !att.cid);
  
  if (inlineAttachments.length > 0) {
    console.error('───────────────────────────────────────────────────────────');
    console.error('Inline Images (CID):');
    inlineAttachments.forEach((att, i) => {
      console.error(`  ${i + 1}. CID: ${att.cid}, File: ${att.filename || att.path}`);
    });
  }
  
  if (regularAttachments.length > 0) {
    console.error('───────────────────────────────────────────────────────────');
    console.error('Attachments:');
    regularAttachments.forEach((att, i) => {
      console.error(`  ${i + 1}. ${att.filename || att.path}`);
    });
  }
  console.error('═══════════════════════════════════════════════════════════\n');

  recordSentEmail(mailOptions, { success: true, messageId: null });

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
  const sendAt = parseSendAt(sendAtInput);
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

  // Parameter mutual exclusion check: --plain-text and --inline cannot be used together
  if (options['plain-text'] && options.inline) {
    throw new Error('Parameter conflict: --plain-text and --inline cannot be used together. Plain text mode does not support inline images.');
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

  // --plain-text: Force plain text mode (remove HTML even if provided)
  if (options['plain-text']) {
    if (options.html && !options.text) {
      // Convert HTML to plain text by stripping tags
      options.text = options.html.replace(/<[^>]*>/g, '');
      delete options.html;
      console.log('📝 Plain text mode: HTML content converted to plain text');
    } else if (options.text) {
      // Ensure HTML is removed
      delete options.html;
      console.log('📝 Plain text mode enabled');
    }
  }

  // --inline: Inline images (CID references)
  // Format: --inline '[{"cid":"abc123","path":"/path/to/image.png"}]'
  if (options.inline) {
    try {
      const inlineItems = JSON.parse(options.inline);
      if (!Array.isArray(inlineItems)) {
        throw new Error('--inline must be a JSON array of {cid, path} objects');
      }
      
      options.inlineAttachments = inlineItems.map(item => {
        if (!item.cid || !item.path) {
          throw new Error('Each inline item must have "cid" and "path" properties');
        }
        const attachment = readAttachment(item.path);
        attachment.cid = item.cid;
        return attachment;
      });
      
      console.log(`🖼️  Added ${options.inlineAttachments.length} inline image(s)`);
      options.inlineAttachments.forEach(att => console.log(`   - CID: ${att.cid}, File: ${att.filename}`));
    } catch (e) {
      throw new Error(`Invalid --inline format: ${e.message}. Expected JSON array: '[{"cid":"abc123","path":"/path/to/image.png"}]'`);
    }
  }

  if (options.attach) {
    const attachFiles = options.attach.split(',').map(f => f.trim()).filter(Boolean);
    options.attachments = attachFiles.map(f => readAttachment(f));
    console.log(`📎 已添加 ${options.attachments.length} 个附件:`);
    options.attachments.forEach(att => console.log(`   - ${att.filename}`));
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

async function main() {
  const { command, options, positional } = parseArgs();

  try {
    let result;

    switch (command) {
      case 'send': {
        const prepared = await prepareSendOptions(options);
        if (prepared['send-at']) {
          result = await scheduleEmail(prepared, prepared['send-at']);
        } else {
          result = await sendEmail(prepared);
        }
        break;
      }

      case 'send-due':
        result = await sendDueScheduledEmails();
        break;

      case 'list-scheduled':
        result = {
          success: true,
          scheduledDir: SCHEDULED_DIR,
          items: listScheduledEmails(),
        };
        break;

      case 'test':
        result = await testConnection();
        break;

      case 'list-signatures': {
        const signaturesDir = path.resolve(__dirname, '../signatures');
        if (!fs.existsSync(signaturesDir)) {
          console.error('❌ 签名目录不存在:', signaturesDir);
          process.exit(1);
        }

        const files = fs.readdirSync(signaturesDir).filter(f => f.endsWith('.json'));
        if (files.length === 0) {
          console.log('📭 暂无签名模板');
          process.exit(0);
        }

        console.log('\n📝 可用签名模板:\n');
        files.forEach(file => {
          const sigData = JSON.parse(fs.readFileSync(path.join(signaturesDir, file), 'utf8'));
          const name = file.replace('signature-', '').replace('.json', '');
          console.log(`  - ${name} (${sigData.language || 'unknown'} / ${sigData.role || 'general'})`);
        });
        console.log('');
        return;
      }

      case 'show-signature': {
        const sigName = positional[0];
        if (!sigName) {
          console.error('❌ 缺少参数：签名名称');
          console.error('用法：show-signature <name>');
          console.error('示例：show-signature en-sales');
          process.exit(1);
        }

        const signaturePath = path.resolve(__dirname, `../signatures/signature-${sigName}.json`);
        if (!fs.existsSync(signaturePath)) {
          console.error(`❌ 签名模板不存在：${signaturePath}`);
          console.error('可用签名：运行 list-signatures 查看所有模板');
          process.exit(1);
        }

        const sigData = JSON.parse(fs.readFileSync(signaturePath, 'utf8'));
        console.log('\n📝 签名模板详情:\n');
        console.log('名称:', sigName);
        console.log('语言:', sigData.language || '未指定');
        console.log('角色:', sigData.role || '未指定');
        console.log('─────────────────────────────────────────');
        console.log('问候语:', sigData.greeting);
        console.log('姓名:', sigData.name_field);
        console.log('职位:', sigData.title);
        console.log('公司:', sigData.company);
        console.log('邮箱:', sigData.email);
        console.log('电话:', sigData.phone);
        console.log('网站:', sigData.website);
        console.log('地址 (中国):', sigData.address_cn);
        console.log('地址 (越南):', sigData.address_vn);
        console.log('标语:', sigData.tagline);
        console.log('');
        return;
      }

      case 'interactive':
        await interactiveMode();
        return;

      default:
        console.error('Unknown command:', command);
        console.error('Available commands: send, send-due, list-scheduled, test, list-signatures, show-signature, interactive');
        console.error('\nUsage:');
        console.error('  send                    --to <email> --subject <text> --body <text> [--signature <name>] [--html] [--attach <file>]');
        console.error('  send                    --to <email> --subject <text> --body-file <file> [--signature <name>] [--html-file <file>] [--attach <file>]');
        console.error('  send                    --to <email> --subject <text> --body <text> --send-at "YYYY-MM-DD HH:mm"');
        console.error('  send                    --to <email> --subject <text> --body <text> --plain-text (force plain text mode)');
        console.error('  send                    --to <email> --subject <text> --body <text> --inline \'[{"cid":"abc123","path":"/img.png"}]\'');
        console.error('  send-due                Send all pending scheduled emails that are due');
        console.error('  list-scheduled          List scheduled email jobs');
        console.error('  test                    Test SMTP connection');
        console.error('  list-signatures         列出所有可用签名模板');
        console.error('  show-signature <name>   显示指定签名的详细内容');
        console.error('  interactive             Interactive mode - guided email sending wizard');
        console.error('\nNote: --plain-text and --inline cannot be used together.');
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

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
