#!/usr/bin/env node
/**
 * 日志模块
 * 
 * 记录所有文档生成操作
 * 
 * 使用方式：
 * const logger = require('./logger');
 * logger.info('生成文档', { type: 'pi', output: 'PI-001' });
 * logger.error('生成失败', { error: '数据验证失败' });
 */

const fs = require('fs');
const path = require('path');

// 日志目录
const LOG_DIR = path.join(__dirname, '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'generate.log');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 日志级别
const LEVELS = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

// 格式化时间
function formatTime(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

// 写入日志
function writeLog(level, message, data = {}) {
  const timestamp = formatTime(new Date());
  const logEntry = {
    timestamp,
    level,
    message,
    ...data
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (error) {
    console.error('❌ 错误：无法写入日志文件');
    console.error(error.message);
  }
  
  // 同时输出到控制台
  const consolePrefix = {
    [LEVELS.INFO]: '✅',
    [LEVELS.WARN]: '⚠️',
    [LEVELS.ERROR]: '❌'
  };
  
  console.log(`${consolePrefix[level] || ''} [${timestamp}] ${message}`);
  if (Object.keys(data).length > 0) {
    console.log('   ', JSON.stringify(data));
  }
}

// 公开 API
module.exports = {
  info: (message, data) => writeLog(LEVELS.INFO, message, data),
  warn: (message, data) => writeLog(LEVELS.WARN, message, data),
  error: (message, data) => writeLog(LEVELS.ERROR, message, data),
  
  // 记录文档生成
  logGeneration: (type, output, status, data = {}) => {
    writeLog(LEVELS.INFO, `文档生成：${type}`, {
      output,
      status,
      ...data
    });
  },
  
  // 记录验证失败
  logValidationFailed: (type, errors) => {
    writeLog(LEVELS.WARN, `数据验证失败：${type}`, {
      errors
    });
  },
  
  // 获取日志文件路径
  getLogFile: () => LOG_FILE
};
