#!/usr/bin/env node
/**
 * Sales State DB — 本地 SQLite 状态数据库
 * 两个项目共用，通过 project 字段区分（farreach / hero-pumps）
 * 
 * 功能：
 * - 线索管理
 * - 邮件发送记录
 * - 客户阶段跟踪
 * - 回复记录
 * - 统计查询
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, 'state');
const DB_PATH = path.join(DB_DIR, 'sales-state.db');

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    contact_name TEXT,
    country TEXT,
    industry TEXT,
    website TEXT,
    source TEXT DEFAULT 'unknown',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(project, email)
  );

  CREATE TABLE IF NOT EXISTS email_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    template_id TEXT,
    subject TEXT,
    stage TEXT DEFAULT 'cold_email_sent',
    follow_up_count INTEGER DEFAULT 1,
    sent_at TEXT DEFAULT (datetime('now')),
    status TEXT DEFAULT 'sent'
  );

  CREATE TABLE IF NOT EXISTS customer_stages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    company TEXT,
    contact_name TEXT,
    country TEXT,
    current_stage TEXT DEFAULT 'cold_email_sent',
    follow_up_count INTEGER DEFAULT 0,
    last_contact_at TEXT,
    next_follow_up_at TEXT,
    is_cold INTEGER DEFAULT 0,
    cold_until TEXT,
    reply_status TEXT DEFAULT 'no_reply',
    last_reply_at TEXT,
    intent TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    subject TEXT,
    body_preview TEXT,
    intent TEXT,
    priority TEXT,
    draft_reply TEXT,
    is_processed INTEGER DEFAULT 0,
    received_at TEXT DEFAULT (datetime('now'))
  );

  -- Indexes for performance
  CREATE INDEX IF NOT EXISTS idx_stages_project ON customer_stages(project);
  CREATE INDEX IF NOT EXISTS idx_stages_next_followup ON customer_stages(next_follow_up_at);
  CREATE INDEX IF NOT EXISTS idx_replies_project ON replies(project, is_processed);
  CREATE INDEX IF NOT EXISTS idx_leads_project ON leads(project);
`);

const stmts = {
  // Prepared statements for performance
  insertLead: db.prepare(`
    INSERT OR IGNORE INTO leads (project, email, company, contact_name, country, industry, website, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  insertEmail: db.prepare(`
    INSERT INTO email_logs (project, email, company, template_id, subject, stage, follow_up_count)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `),
  upsertStage: db.prepare(`
    INSERT INTO customer_stages (project, email, company, contact_name, country, current_stage, follow_up_count, last_contact_at, next_follow_up_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      current_stage = COALESCE(excluded.current_stage, current_stage),
      follow_up_count = COALESCE(excluded.follow_up_count, follow_up_count),
      last_contact_at = COALESCE(excluded.last_contact_at, last_contact_at),
      next_follow_up_at = COALESCE(excluded.next_follow_up_at, next_follow_up_at),
      updated_at = datetime('now')
  `),
  getDueFollowUps: db.prepare(`
    SELECT * FROM customer_stages
    WHERE project = ? AND is_cold = 0
    AND current_stage NOT IN ('closed_won', 'lost')
    AND next_follow_up_at IS NOT NULL
    AND next_follow_up_at <= datetime('now')
    ORDER BY next_follow_up_at ASC
  `),
  getActiveCustomers: db.prepare(`
    SELECT * FROM customer_stages
    WHERE project = ? AND is_cold = 0
    ORDER BY updated_at DESC
  `),
  insertReply: db.prepare(`
    INSERT INTO replies (project, email, company, subject, body_preview, intent, priority, draft_reply)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  getUnprocessedReplies: db.prepare(`
    SELECT * FROM replies WHERE project = ? AND is_processed = 0 ORDER BY received_at ASC
  `),
  markReplyProcessed: db.prepare(`UPDATE replies SET is_processed = 1 WHERE id = ?`),
  updateStageFields: db.prepare(`
    UPDATE customer_stages SET
      current_stage = COALESCE(?, current_stage),
      follow_up_count = COALESCE(?, follow_up_count),
      next_follow_up_at = COALESCE(?, next_follow_up_at),
      is_cold = COALESCE(?, is_cold),
      cold_until = COALESCE(?, cold_until),
      reply_status = COALESCE(?, reply_status),
      last_reply_at = COALESCE(?, last_reply_at),
      intent = COALESCE(?, intent),
      updated_at = datetime('now')
    WHERE project = ? AND email = ?
  `),
  getStats: db.prepare(`
    SELECT
      COUNT(*) as total_customers,
      SUM(CASE WHEN is_cold = 1 THEN 1 ELSE 0 END) as cold_count,
      SUM(CASE WHEN reply_status = 'no_reply' THEN 1 ELSE 0 END) as no_reply_count,
      SUM(CASE WHEN reply_status = 'replied' THEN 1 ELSE 0 END) as replied_count,
      SUM(CASE WHEN current_stage = 'closed_won' THEN 1 ELSE 0 END) as won_count,
      SUM(CASE WHEN current_stage = 'lost' THEN 1 ELSE 0 END) as lost_count
    FROM customer_stages WHERE project = ?
  `),
  getCustomer: db.prepare(`SELECT * FROM customer_stages WHERE project = ? AND email = ?`),
  isEmailSent: db.prepare(`SELECT COUNT(*) as count FROM customer_stages WHERE project = ? AND email = ?`),
};

// ============ API ============

const SalesState = {
  // 添加线索
  addLead(project, lead) {
    const r = stmts.insertLead.run(
      project, lead.email, lead.company, lead.contact_name,
      lead.country, lead.industry, lead.website, lead.source || 'unknown'
    );
    return r.changes > 0;
  },

  // 批量添加线索
  batchAddLeads(project, leads) {
    const insert = db.transaction((rows) => {
      let added = 0;
      for (const r of rows) {
        if (r.email && stmts.insertLead.run(
          project, r.email, r.company, r.contact_name,
          r.country, r.industry, r.website, r.source || 'unknown'
        ).changes > 0) added++;
      }
      return added;
    });
    return insert(leads);
  },

  // 记录邮件发送
  logEmail(project, email, company, templateId, subject, stage, followUpCount) {
    stmts.insertEmail.run(project, email, company, templateId, subject, stage || 'cold_email_sent', followUpCount || 1);
  },

  // 更新客户阶段（创建或更新）
  upsertCustomer(project, email, data) {
    stmts.upsertStage.run(
      project, email, data.company, data.contact_name, data.country,
      data.stage || 'cold_email_sent', data.follow_up_count || 1,
      new Date().toISOString(), data.next_follow_up_at || null
    );
  },

  // 更新客户阶段字段
  updateStage(project, email, updates) {
    stmts.updateStageFields.run(
      updates.stage || null,
      updates.follow_up_count || null,
      updates.next_follow_up_at || null,
      updates.is_cold !== undefined ? updates.is_cold : null,
      updates.cold_until || null,
      updates.reply_status || null,
      updates.last_reply_at || null,
      updates.intent || null,
      project, email
    );
  },

  // 检查是否已发送过
  isEmailSent(project, email) {
    return stmts.isEmailSent.get(project, email).count > 0;
  },

  // 获取客户记录
  getCustomer(project, email) {
    return stmts.getCustomer.get(project, email) || null;
  },

  // 获取需要跟进的客户
  getDueFollowUps(project) {
    return stmts.getDueFollowUps.all(project);
  },

  // 获取所有活跃客户
  getActiveCustomers(project) {
    return stmts.getActiveCustomers.all(project);
  },

  // 添加回复记录
  addReply(project, reply) {
    stmts.insertReply.run(
      project, reply.email, reply.company, reply.subject,
      (reply.body || '').substring(0, 500), reply.intent, reply.priority,
      reply.draft_reply || null
    );
  },

  // 获取未处理回复
  getUnprocessedReplies(project) {
    return stmts.getUnprocessedReplies.all(project);
  },

  // 标记回复已处理
  markReplyProcessed(id) {
    stmts.markReplyProcessed.run(id);
  },

  // 获取统计
  getStats(project) {
    return stmts.getStats.get(project);
  },

  // 关闭数据库
  close() {
    db.close();
  }
};

module.exports = { SalesState, db };
