#!/usr/bin/env node

/**
 * 手动执行 Revolution 任务
 * 
 * 用法：node execute-task.js <task.json>
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const taskPath = process.argv[2];
if (!taskPath) {
  console.log('用法：node execute-task.js <task.json>');
  process.exit(1);
}

const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));

console.log(`🚀 执行 Revolution 任务：${task.task_id}`);
console.log(`   标题：${task.title}`);
console.log(`   优先级：${task.priority || 'P2'}`);
console.log(`   子任务数：${task.subtasks?.length || 0}`);
console.log('');

// 执行子任务
async function executeTask() {
  for (const subtask of task.subtasks || []) {
    console.log(`\n📋 执行子任务：${subtask.title}`);
    console.log(`   类型：${subtask.type}`);
    
    if (subtask.type === 'exec') {
      try {
        console.log(`   命令：${subtask.command}`);
        const output = execSync(subtask.command, {
          encoding: 'utf-8',
          stdio: 'inherit',
          timeout: (subtask.timeoutMinutes || 30) * 60 * 1000
        });
        console.log('✅ 完成');
      } catch (error) {
        console.log('❌ 失败:', error.message);
        if (task.metadata?.stopOnFailure) {
          process.exit(1);
        }
      }
    } else if (subtask.type === 'analysis' || subtask.type === 'coding') {
      console.log('⚠️  需要 LLM 执行，跳过');
      console.log('   指令:', subtask.instruction?.substring(0, 100) + '...');
    }
  }
  
  console.log('\n✅ 任务执行完成');
}

executeTask().catch(err => {
  console.error('❌ 执行失败:', err.message);
  process.exit(1);
});
