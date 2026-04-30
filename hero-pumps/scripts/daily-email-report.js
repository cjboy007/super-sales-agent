#!/usr/bin/env node
/**
 * 每日邮件发送报告
 * 每天 12:00 运行，汇总昨天 12:00 - 今天 12:00 的发送情况
 * 输出 JSON 供 OpenClaw cron 读取并汇报
 */

const fs = require('fs');
const path = require('path');

const SENT_LOG = path.join(__dirname, '../sent-log.json');
const TEMPLATES_DIR = path.join(__dirname, '../campaign-tracker/templates');

function main() {
  const now = new Date();
  // 今天的日期（北京时间）
  const today = now.toISOString().slice(0, 10);
  // 昨天
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  // 读取发送记录
  let sentLog = [];
  if (fs.existsSync(SENT_LOG)) {
    try {
      sentLog = JSON.parse(fs.readFileSync(SENT_LOG, 'utf8'));
    } catch (e) {
      sentLog = [];
    }
  }

  // 今天的发送（UTC 日期匹配）
  const todaySent = sentLog.filter(s => (s.sent_at || '').startsWith(today));
  const yesterdaySent = sentLog.filter(s => (s.sent_at || '').startsWith(yesterday));

  // 待发送模板
  let pendingCount = 0;
  if (fs.existsSync(TEMPLATES_DIR)) {
    const templates = fs.readdirSync(TEMPLATES_DIR).filter(f => 
      f.includes(today) && (f.endsWith('.md') || f.endsWith('.html'))
    );
    pendingCount = templates.length;
  }

  // 按日期统计（最近 7 天）
  const dailyStats = {};
  const cutoff = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
  sentLog.forEach(s => {
    const day = (s.sent_at || '').slice(0, 10);
    if (day >= cutoff) {
      dailyStats[day] = (dailyStats[day] || 0) + 1;
    }
  });

  // 去重统计收件人
  const uniqueRecipients = new Set(sentLog.map(s => s.email).filter(Boolean));

  // 生成报告
  const report = {
    date: today,
    todaySent: todaySent.length,
    yesterdaySent: yesterdaySent.length,
    totalSent: sentLog.length,
    uniqueRecipients: uniqueRecipients.size,
    pendingTemplates: pendingCount,
    recent7Days: dailyStats,
    todayDetails: todaySent.map(s => ({
      time: s.sent_at,
      to: s.email,
      subject: s.subject
    })),
    status: todaySent.length > 0 ? 'normal' : 'no_sends'
  };

  console.log(JSON.stringify(report, null, 2));
}

main();
