#!/usr/bin/env node
/**
 * heartbeat-coordinator.js - Wilson 心跳协调器
 * 
 * 职责：
 * 1. 激活依赖完成的任务（queued → pending）
 * 2. 检测 pending 任务，进行安全扫描
 * 3. 调用 Sonnet 审阅（自动）
 * 4. 应用审阅结果，更新任务状态
 * 5. 记录所有事件到 logs/events.log
 * 
 * 触发频率：每 5 分钟
 * 模型：Qwen（包月）+ Sonnet（审阅时）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EVOLUTION_DIR = path.join(__dirname, '..');
const TASKS_DIR = path.join(EVOLUTION_DIR, 'tasks');
const LOGS_DIR = path.join(EVOLUTION_DIR, 'logs');
const SCRIPTS_DIR = path.join(EVOLUTION_DIR, 'scripts');

// 确保日志目录存在
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

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
    return false; // 锁已存在
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
 * Step 1: 激活依赖完成的任务
 */
function activateQueuedTasks() {
  console.log('🔗 Step 1: 检查 queued 任务依赖...');
  
  try {
    const output = execSync(`node ${SCRIPTS_DIR}/activate-queued-tasks.js`, { encoding: 'utf8' });
    console.log(output);
    
    const activatedMatch = output.match(/(\d+) 个任务已激活/);
    if (activatedMatch && parseInt(activatedMatch[1]) > 0) {
      logEvent('queued_tasks_activated', { count: parseInt(activatedMatch[1]) });
    }
  } catch (error) {
    console.error('❌ 激活任务失败:', error.message);
    logEvent('activation_failed', { error: error.message });
  }
}

/**
 * Step 2: 安全扫描
 */
function scanTaskSecurity(taskId, task) {
  console.log(`🛡️ Step 2: 安全扫描 ${taskId}...`);
  
  if (!task.review || !task.review.next_instructions) {
    console.log(`ℹ️ ${taskId} 没有审阅指令，跳过安全扫描（需要先审阅）`);
    return { safe: true, noInstructions: true };
  }
  
  try {
    const taskFile = path.join(TASKS_DIR, `${taskId}.json`);
    const output = execSync(`node ${SCRIPTS_DIR}/security-scan.js ${taskFile}`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    const result = JSON.parse(output);
    if (result.safe) {
      console.log(`✅ ${taskId} 安全扫描通过`);
      return { safe: true };
    } else {
      console.error(`❌ ${taskId} 发现危险命令:`, result.flags);
      logEvent('security_scan_failed', {
        task_id: taskId,
        flags: result.flags.map(f => f.reason)
      });
      return { safe: false, flags: result.flags };
    }
  } catch (error) {
    if (error.stdout) {
      try {
        const result = JSON.parse(error.stdout);
        if (!result.safe) {
          console.error(`❌ ${taskId} 发现危险命令:`, result.flags);
          logEvent('security_scan_failed', {
            task_id: taskId,
            flags: result.flags.map(f => f.reason)
          });
          return { safe: false, flags: result.flags };
        }
      } catch {}
    }
    console.error('❌ 安全扫描异常:', error.message);
    return { safe: false, error: error.message };
  }
}

/**
 * Step 3: Sonnet 审阅（自动执行）
 * 使用 Python 脚本调用 Sonnet 审阅
 */
async function reviewTask(task) {
  console.log(`🧠 Step 3: Sonnet 审阅 ${task.task_id}...`);
  
  logEvent('review_started', {
    task_id: task.task_id,
    current_iteration: task.current_iteration,
    model: 'aiberm/claude-sonnet-4-6'
  });
  
  try {
    console.log('📡 调用 Sonnet 审阅...');
    
    const output = execSync(
      `python3 ${SCRIPTS_DIR}/review-with-sonnet.py ${task.task_id}`,
      { 
        encoding: 'utf8',
        timeout: 300000 // 5 分钟超时
      }
    );
    
    console.log(output);
    
    // 提取 JSON OUTPUT 部分
    const jsonMatch = output.match(/=== JSON OUTPUT ===\s*([\s\S]+)/);
    if (!jsonMatch) {
      throw new Error('无法解析 Sonnet 返回的 JSON 结果');
    }
    
    const review = JSON.parse(jsonMatch[1].trim());
    
    console.log(`✅ 审阅完成：${review.verdict} (置信度：${review.confidence})`);
    
    logEvent('review_completed', {
      task_id: task.task_id,
      verdict: review.verdict,
      confidence: review.confidence
    });
    
    return review;
    
  } catch (error) {
    console.error('❌ Sonnet 审阅失败:', error.message);
    logEvent('review_failed', {
      task_id: task.task_id,
      error: error.message
    });
    
    throw error;
  }
}

/**
 * Step 4: 更新任务状态
 */
function updateTaskAfterReview(task, review) {
  console.log(`📝 Step 4: 更新任务 ${task.task_id}...`);
  
  const oldStatus = task.status;
  task.review = review;
  task.updated_at = new Date().toISOString();
  
  if (review.verdict === 'complete') {
    task.status = 'completed';
    task.completed_at = task.updated_at;
  } else if (review.verdict === 'reject') {
    task.current_iteration = (task.current_iteration || 0) + 1;
    if (task.current_iteration >= task.max_iterations) {
      task.status = 'failed';
    } else {
      task.status = 'pending';
    }
  } else {
    task.status = 'reviewed';
  }
  
  task.history = task.history || [];
  task.history.push({
    timestamp: task.updated_at,
    action: 'review_completed',
    verdict: review.verdict,
    confidence: review.confidence,
    feedback: review.feedback
  });
  
  writeTask(task);
  
  logEvent('review_completed', {
    task_id: task.task_id,
    from: oldStatus,
    to: task.status,
    verdict: review.verdict
  });
  
  console.log(`✅ ${task.task_id} 状态更新：${oldStatus} → ${task.status}`);
}

/**
 * 主流程
 */
async function heartbeat() {
  console.log('🫀 Wilson 心跳开始...');
  console.log('='.repeat(50));
  
  logEvent('heartbeat_started', { agent: 'wilson' });
  
  try {
    activateQueuedTasks();
    
    const taskIds = listTasks();
    let processedCount = 0;
    
    for (const taskId of taskIds) {
      const task = readTask(taskId);
      if (!task) continue;
      
      if (task.status !== 'pending') {
        continue;
      }
      
      if (!acquireLock(taskId)) {
        console.log(`⏳ ${taskId} 已锁定，跳过`);
        continue;
      }
      
      try {
        const security = scanTaskSecurity(taskId, task);
        
        if (!security.noInstructions && !security.safe) {
          task.status = 'blocked';
          task.blocked_at = new Date().toISOString();
          task.blocked_reason = '安全扫描失败';
          task.blocked_flags = security.flags;
          writeTask(task);
          
          logEvent('task_blocked', {
            task_id: taskId,
            reason: 'security_scan_failed',
            flags: security.flags
          });
          
          console.log(`❌ ${taskId} 因安全问题被 blocked`);
          continue;
        }
        
        const review = await reviewTask(task);
        updateTaskAfterReview(task, review);
        processedCount++;
        
      } finally {
        releaseLock(taskId);
      }
    }
    
    console.log('='.repeat(50));
    console.log(`🫀 Wilson 心跳完成，处理 ${processedCount} 个任务`);
    
    logEvent('heartbeat_completed', {
      processed: processedCount,
      agent: 'wilson'
    });
    
    if (processedCount === 0) {
      console.log('✅ 没有需要处理的任务');
      return 'HEARTBEAT_OK';
    } else {
      return `✅ 处理 ${processedCount} 个任务`;
    }
    
  } catch (error) {
    console.error('❌ 心跳异常:', error);
    logEvent('heartbeat_failed', { error: error.message });
    return `❌ 心跳失败：${error.message}`;
  }
}

if (require.main === module) {
  heartbeat().then(result => {
    console.log(result);
    process.exit(0);
  }).catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { heartbeat, activateQueuedTasks, scanTaskSecurity, reviewTask };
