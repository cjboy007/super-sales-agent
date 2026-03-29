#!/usr/bin/env node

/**
 * Unified Logger Module
 * 统一日志模块，用于记录邮件发送、草稿等操作
 * 
 * Status Codes (aligned with lark-mail):
 * 1 = 正在投递 (sending)
 * 2 = 重试 (retrying)
 * 3 = 退信 (bounced)
 * 4 = SMTP 已接收 (smtp_accepted) ⚠️ SMTP server accepted, NOT actual delivery
 * 5 = 待审批 (pending_approval)
 * 6 = 拒绝 (rejected)
 */

const fs = require('fs');
const path = require('path');
const { validateWritePath } = require('../scripts/path-utils');

// Fixed workspace path
const WORKSPACE_DIR = '/Users/wilson/.openclaw/workspace';
const LOG_DIR = path.join(WORKSPACE_DIR, 'mail-archive/sent');
const LOG_FILE = path.join(LOG_DIR, 'sent-log.json');

// Status code mapping (aligned with lark-mail)
const STATUS_CODES = {
  1: { code: 1, text: '正在投递', en: 'sending' },
  2: { code: 2, text: '重试', en: 'retrying' },
  3: { code: 3, text: '退信', en: 'bounced' },
  4: { code: 4, text: 'SMTP 已接收', en: 'smtp_accepted' },
  5: { code: 5, text: '待审批', en: 'pending_approval' },
  6: { code: 6, text: '拒绝', en: 'rejected' }
};

/**
 * Ensure log directory exists
 */
function ensureLogDir() {
  // Validate log directory is within allowed write paths
  validateWritePath(LOG_DIR);
  
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/**
 * Load existing log
 * @returns {Array} Log entries
 */
function loadLog() {
  ensureLogDir();
  if (fs.existsSync(LOG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf8'));
    } catch (err) {
      console.warn(`[logger] Failed to parse log file: ${err.message}`);
      return [];
    }
  }
  return [];
}

/**
 * Save log
 * @param {Array} log - Log entries
 */
function saveLog(log) {
  ensureLogDir();
  // Validate log file path before writing
  const validatedLogFile = validateWritePath(LOG_FILE);
  fs.writeFileSync(validatedLogFile, JSON.stringify(log, null, 2), 'utf8');
}

/**
 * Record sent email
 * @param {Object} mailOptions - Email options (from, to, cc, bcc, subject, attachments)
 * @param {Object} result - Send result (success, messageId, error)
 * @returns {Object} Log entry
 */
function recordSentEmail(mailOptions, result) {
  const log = loadLog();
  
  // Map result to status code
  let statusCode, statusText;
  if (result.success) {
    statusCode = 4; // SMTP accepted
    statusText = '成功';
  } else {
    statusCode = 3; // Bounced/failed
    statusText = '退信';
  }
  
  const entry = {
    timestamp: new Date().toISOString(),
    from: mailOptions.from,
    to: mailOptions.to,
    cc: mailOptions.cc,
    bcc: mailOptions.bcc,
    subject: mailOptions.subject,
    messageId: result.messageId,
    status: statusCode,
    status_text: statusText,
    error: result.error || null,
    attachments: mailOptions.attachments ? mailOptions.attachments.map(att => att.filename || att.path) : [],
  };
  
  log.push(entry);
  saveLog(log);
  
  console.error(`[logger] Recorded: ${entry.messageId || 'dry-run'} - ${entry.subject}`);
  
  return entry;
}

/**
 * Get recent sent emails
 * @param {number} limit - Number of entries
 * @returns {Array} Recent log entries
 */
function getRecent(limit = 10) {
  const log = loadLog();
  return log.slice(-limit).reverse();
}

/**
 * Search sent emails
 * @param {string} query - Search query
 * @param {string} field - Field to search (subject, to, from, messageId)
 * @returns {Array} Matching entries
 */
function searchSent(query, field = 'subject') {
  const log = loadLog();
  const lowerQuery = query.toLowerCase();
  
  return log.filter(entry => {
    if (entry[field]) {
      return entry[field].toLowerCase().includes(lowerQuery);
    }
    return false;
  }).reverse();
}

/**
 * Get email status by messageId or index
 * @param {string} identifier - Message ID or index
 * @param {string} field - Field type (messageId, index, to, subject)
 * @returns {Object|null} Status info
 */
function getStatus(identifier, field = 'messageId') {
  const log = loadLog();
  
  let entry;
  if (field === 'messageId') {
    entry = log.find(e => e.messageId === identifier || e.messageId === `<${identifier}>`);
  } else if (field === 'index' || field === 'idx') {
    const idx = parseInt(identifier, 10);
    if (!isNaN(idx) && idx >= 0 && idx < log.length) {
      entry = log[idx];
    }
  } else if (field === 'to') {
    entry = log.filter(e => e.to && e.to.includes(identifier)).pop();
  } else if (field === 'subject') {
    entry = log.find(e => e.subject && e.subject.toLowerCase().includes(identifier.toLowerCase()));
  }
  
  if (!entry) {
    return null;
  }
  
  // Map status to numeric code
  let statusCode = entry.status;
  if (typeof entry.status === 'string') {
    if (entry.status === 'sent') {
      statusCode = 4;
    } else if (entry.status === 'failed') {
      statusCode = 3;
    } else {
      statusCode = 1;
    }
  }
  
  const statusInfo = STATUS_CODES[statusCode] || { code: statusCode, text: '未知', en: 'unknown' };
  
  // Calculate delivery status
  let deliveryStatusCode, deliveryStatusText;
  if (statusCode === 4 && entry.messageId) {
    deliveryStatusCode = 4;
    deliveryStatusText = '成功';
  } else if (statusCode === 4 && !entry.messageId) {
    deliveryStatusCode = 1;
    deliveryStatusText = '正在投递';
  } else if (statusCode === 3) {
    deliveryStatusCode = 3;
    deliveryStatusText = '退信';
  } else {
    deliveryStatusCode = 1;
    deliveryStatusText = '正在投递';
  }
  
  return {
    messageId: entry.messageId,
    to: entry.to,
    subject: entry.subject,
    sentAt: entry.timestamp,
    status: deliveryStatusCode,
    status_text: deliveryStatusText,
    error: entry.error,
    attachments: entry.attachments || [],
  };
}

/**
 * Get all statuses for recent emails
 * @param {number} limit - Number of entries
 * @returns {Array} Status entries
 */
function getAllRecentStatus(limit = 10) {
  const log = loadLog();
  const recent = log.slice(-limit).reverse();
  
  return recent.map(entry => {
    let statusCode = entry.status;
    if (typeof entry.status === 'string') {
      if (entry.status === 'sent') {
        statusCode = 4;
      } else if (entry.status === 'failed') {
        statusCode = 3;
      } else {
        statusCode = 1;
      }
    }
    
    let deliveryStatusCode, deliveryStatusText;
    if (statusCode === 4 && entry.messageId) {
      deliveryStatusCode = 4;
      deliveryStatusText = '成功';
    } else if (statusCode === 4 && !entry.messageId) {
      deliveryStatusCode = 1;
      deliveryStatusText = '正在投递';
    } else if (statusCode === 3) {
      deliveryStatusCode = 3;
      deliveryStatusText = '退信';
    } else {
      deliveryStatusCode = 1;
      deliveryStatusText = '正在投递';
    }
    
    return {
      messageId: entry.messageId,
      to: entry.to,
      subject: entry.subject,
      sentAt: entry.timestamp,
      status: deliveryStatusCode,
      status_text: deliveryStatusText,
      error: entry.error,
    };
  });
}

/**
 * Update existing log entry
 * @param {string} messageId - Message ID to update
 * @param {Object} updates - Fields to update
 * @returns {boolean} Success
 */
function updateLogEntry(messageId, updates) {
  const log = loadLog();
  const index = log.findIndex(e => e.messageId === messageId || e.messageId === `<${messageId}>`);
  
  if (index !== -1) {
    log[index] = { ...log[index], ...updates };
    saveLog(log);
    console.error(`[logger] Updated: ${messageId}`);
    return true;
  }
  
  console.warn(`[logger] Entry not found: ${messageId}`);
  return false;
}

/**
 * Get log statistics
 * @returns {Object} Statistics
 */
function getStats() {
  const log = loadLog();
  const total = log.length;
  const sent = log.filter(e => e.status === 4 || e.status === 'sent').length;
  const failed = log.filter(e => e.status === 3 || e.status === 'failed').length;
  const today = log.filter(e => e.timestamp.startsWith(new Date().toISOString().slice(0, 10))).length;
  
  return {
    total,
    sent,
    failed,
    today,
    lastEntry: log[log.length - 1] || null,
  };
}

module.exports = {
  recordSentEmail,
  getRecent,
  searchSent,
  getStatus,
  getAllRecentStatus,
  updateLogEntry,
  getStats,
  loadLog,
  saveLog,
  ensureLogDir,
  STATUS_CODES,
  LOG_FILE,
  LOG_DIR,
};
