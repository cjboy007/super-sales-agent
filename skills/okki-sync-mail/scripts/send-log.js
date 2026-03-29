#!/usr/bin/env node

/**
 * Email Send Log CLI
 * 统一日志模块的 CLI 包装器
 * 
 * Status Codes (aligned with lark-mail):
 * 1 = 正在投递 (sending)
 * 2 = 重试 (retrying)
 * 3 = 退信 (bounced)
 * 4 = SMTP 已接收 (smtp_accepted) ⚠️ SMTP server accepted, NOT actual delivery
 * 5 = 待审批 (pending_approval)
 * 6 = 拒绝 (rejected)
 */

const logger = require('../lib/logger');

// Re-export all functions for backward compatibility
module.exports = {
  recordSentEmail: logger.recordSentEmail,
  getRecent: logger.getRecent,
  searchSent: logger.searchSent,
  getStatus: logger.getStatus,
  getAllRecentStatus: logger.getAllRecentStatus,
  updateLogEntry: logger.updateLogEntry,
};

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'recent':
      const limit = parseInt(args[1]) || 10;
      console.log(JSON.stringify(logger.getRecent(limit), null, 2));
      break;
      
    case 'search':
      const field = args[1] || 'subject';
      const query = args[2];
      if (!query) {
        console.error('Usage: node send-log.js search <field> <query>');
        console.error('Fields: to, from, subject, messageId');
        process.exit(1);
      }
      console.log(JSON.stringify(logger.searchSent(query, field), null, 2));
      break;
      
    case 'send-status':
    case 'status':
      if (!args[1]) {
        const statusLimit = 10;
        console.log(JSON.stringify(logger.getAllRecentStatus(statusLimit), null, 2));
      } else if (!args[2] && !isNaN(parseInt(args[1]))) {
        const statusLimit = parseInt(args[1]);
        console.log(JSON.stringify(logger.getAllRecentStatus(statusLimit), null, 2));
      } else {
        const identifier = args[1];
        const field = args[2] || 'messageId';
        const status = logger.getStatus(identifier, field);
        if (!status) {
          console.error(`Email not found: ${identifier} (field: ${field})`);
          process.exit(1);
        }
        console.log(JSON.stringify(status, null, 2));
      }
      break;
      
    case 'stats':
      console.log(JSON.stringify(logger.getStats(), null, 2));
      break;
      
    default:
      console.error('Email Send Log CLI');
      console.error('\nUsage:');
      console.error('  node send-log.js recent [limit]              - Show recent sent emails');
      console.error('  node send-log.js search <field> <query>      - Search sent emails');
      console.error('  node send-log.js send-status [id] [field]    - Check delivery status');
      console.error('  node send-log.js status [id] [field]         - Alias for send-status');
      console.error('  node send-log.js stats                       - Show statistics');
      console.error('\nFields: to, from, subject, messageId, index');
      console.error('\nStatus examples:');
      console.error('  node send-log.js send-status                          - Show recent 10 statuses');
      console.error('  node send-log.js send-status 5 index                  - Show 5th email status');
      console.error('  node send-log.js send-status "customer@example.com" to - Show status by recipient');
      console.error('  node send-log.js send-status "Product Inquiry" subject - Show status by subject');
      process.exit(1);
  }
}
