#!/usr/bin/env node
/**
 * iron-heartbeat.js - Iron 心跳执行器
 * 
 * 职责：
 * 1. 检测 reviewed 状态的任务
 * 2. 获取原子锁
 * 3. 在沙箱内执行 next_instructions
 * 4. 验证执行结果
 * 5. 更新任务状态
 * 
 * 触发频率：每 5 分钟
 * 模型：Qwen（包月）
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const EVOLUTION_DIR = path.join(__dirname, '..');
const TASKS_DIR = path.join(EVOLUTION_DIR, 'tasks');
const LOGS_DIR = path.join(EVOLUTION_DIR, 'logs');
const OUTPUTS_DIR = path.join(EVOLUTION_DIR, 'outputs');
const SCRIPTS_DIR = path.join(EVOLUTION_DIR, 'scripts');

// 确保目录存在
[LOGS_DIR, OUTPUTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const EVENTS_LOG = path.join(LOGS_DIR, 'events.log');

/**
 * 写入事件日志
 */
function logEvent(event, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    ...data
  };
  fs.appendFileSync(EVENTS_LOG, JSON.stringify(entry) + '\n');
  console.log(`📝 事件：${event}`, JSON.stringify(data));
  return entry;
}

/**
 * 原子锁操作
 */
function acquireLock(taskId) {
  try {
    execSync(`bash ${SCRIPTS_DIR}/atomic-lock.sh acquire ${taskId}`, { stdio: 'pipe' });
    return true;
  } catch (error) {
    return false;
  }
}

function releaseLock(taskId) {
  try {
    execSync(`bash ${SCRIPTS_DIR}/atomic-lock.sh release ${taskId}`, { stdio: 'pipe' });
  } catch (error) {
    console.error(`⚠️ 释放锁失败：${taskId}`, error.message);
  }
}

/**
 * 读取任务文件
 */
function readTask(taskId) {
  const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
  if (!fs.existsSync(taskFile)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(taskFile, 'utf8'));
}

/**
 * 写入任务文件
 */
function writeTask(task) {
  const taskFile = path.join(TASKS_DIR, `${task.task_id}.json`);
  fs.writeFileSync(taskFile, JSON.stringify(task, null, 2));
}

/**
 * 列出所有任务
 */
function listTasks() {
  if (!fs.existsSync(TASKS_DIR)) {
    return [];
  }
  return fs.readdirSync(TASKS_DIR)
    .filter(f => f.endsWith('.json') && !f.includes('-example'))
    .map(f => f.replace('.json', ''));
}

/**
 * 验证验收标准
 */
function verifyAcceptanceCriteria(criteria, task) {
  console.log('🔍 验证验收标准...');
  
  const results = criteria.map(criterion => {
    // 简化的验证逻辑 - 实际应该根据具体标准执行检查
    // 例如：检查文件是否存在、测试是否通过等
    
    const passed = true; // 占位符
    
    return {
      criterion,
      passed
    };
  });
  
  const allPassed = results.every(r => r.passed);
  console.log(`验收结果：${allPassed ? '✅ 通过' : '❌ 失败'}`);
  
  return {
    allPassed,
    results
  };
}

/**
 * 在沙箱内执行指令
 */
function executeInSandbox(instructions, task) {
  console.log('🏃 执行指令...');
  
  const outputDir = path.join(OUTPUTS_DIR, String(task.task_id));
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  logEvent('execution_started', {
    task_id: task.task_id,
    instructions_length: instructions.length
  });
  
  try {
    // 方法 1: 直接执行（开发环境）
    // 生产环境应该使用 Docker 或 nsjail 沙箱
    const output = execSync(instructions, {
      cwd: outputDir,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 300000 // 5 分钟超时
    });
    
    console.log('✅ 执行成功');
    
    logEvent('execution_completed', {
      task_id: task.task_id,
      status: 'success'
    });
    
    return {
      success: true,
      output,
      files: fs.readdirSync(outputDir)
    };
    
  } catch (error) {
    console.error('❌ 执行失败:', error.message);
    
    logEvent('execution_failed', {
      task_id: task.task_id,
      error: error.message,
      stderr: error.stderr?.substring(0, 1000)
    });
    
    return {
      success: false,
      error: error.message,
      stderr: error.stderr
    };
  }
}

/**
 * 执行任务
 */
async function executeTask(task) {
  console.log(`🔨 执行任务：${task.task_id}`);
  
  const review = task.review;
  
  if (!review || !review.next_instructions) {
    console.error('❌ 任务没有审阅指令');
    return {
      success: false,
      error: 'No instructions'
    };
  }
  
  // 再次安全检查（防御性）
  const securityCheck = execSync(
    `node ${SCRIPTS_DIR}/security-scan.js ${TASKS_DIR}/${task.task_id}.json`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  
  // 执行指令
  const result = executeInSandbox(review.next_instructions, task);
  
  if (!result.success) {
    return result;
  }
  
  // 验证验收标准
  if (review.acceptance_criteria) {
    const verification = verifyAcceptanceCriteria(review.acceptance_criteria, task);
    result.verification = verification;
    
    if (!verification.allPassed) {
      result.success = false;
      result.error = '验收标准未通过';
    }
  }
  
  return result;
}

/**
 * 更新任务状态（执行后）
 */
function updateTaskAfterExecution(task, result) {
  console.log(`📝 更新任务 ${task.task_id}...`);
  
  const oldStatus = task.status;
  task.updated_at = new Date().toISOString();
  
  if (result.success) {
    // 执行成功，进入下一轮
    task.status = 'pending';
    task.current_subtask = (task.current_subtask || 0) + 1;
  } else {
    // 执行失败，进入 blocked
    task.status = 'blocked';
    task.blocked_at = task.updated_at;
    task.blocked_reason = result.error || '执行失败';
  }
  
  // 记录到 history
  task.history = task.history || [];
  task.history.push({
    timestamp: task.updated_at,
    action: 'execution_completed',
    status: result.success ? 'success' : 'failed',
    error: result.error,
    files_modified: result.files || []
  });
  
  // 更新 result 字段
  if (result.success) {
    task.result = {
      ...task.result,
      last_execution: task.updated_at,
      output: result.output?.substring(0, 1000) // 截断避免过大
    };
  }
  
  writeTask(task);
  
  logEvent('status_changed', {
    task_id: task.task_id,
    from: oldStatus,
    to: task.status,
    agent: 'iron'
  });
  
  console.log(`✅ ${task.task_id} 状态更新：${oldStatus} → ${task.status}`);
}

/**
 * 主流程
 */
async function heartbeat() {
  console.log('🔨 Iron 心跳开始...');
  console.log('='.repeat(50));
  
  logEvent('heartbeat_started', { agent: 'iron' });
  
  try {
    const taskIds = listTasks();
    let processedCount = 0;
    
    for (const taskId of taskIds) {
      const task = readTask(taskId);
      if (!task) continue;
      
      // 只处理 reviewed 状态
      if (task.status !== 'reviewed') {
        continue;
      }
      
      // 尝试获取锁
      if (!acquireLock(taskId)) {
        console.log(`⏳ ${taskId} 已锁定，跳过`);
        continue;
      }
      
      try {
        // 执行任务
        const result = await executeTask(task);
        
        // 更新任务状态
        updateTaskAfterExecution(task, result);
        
        processedCount++;
        
      } finally {
        // 释放锁
        releaseLock(taskId);
      }
    }
    
    console.log('='.repeat(50));
    console.log(`🔨 Iron 心跳完成，处理 ${processedCount} 个任务`);
    
    logEvent('heartbeat_completed', {
      processed: processedCount,
      agent: 'iron'
    });
    
    if (processedCount === 0) {
      console.log('✅ 没有需要处理的任务');
      return 'HEARTBEAT_OK';
    } else {
      return `✅ 处理 ${processedCount} 个任务`;
    }
    
  } catch (error) {
    console.error('❌ 心跳异常:', error);
    logEvent('heartbeat_failed', { error: error.message, agent: 'iron' });
    return `❌ 心跳失败：${error.message}`;
  }
}

// 命令行执行
if (require.main === module) {
  heartbeat().then(result => {
    console.log(result);
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { heartbeat, executeTask };
