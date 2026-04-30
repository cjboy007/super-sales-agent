/**
 * SQLite 数据库连接模块
 * 
 * 使用 better-sqlite3 提供同步数据库操作
 */

import Database from 'better-sqlite3';
import * as path from 'path';

// 数据库文件路径
const DB_PATH = path.join(__dirname, '..', 'db', 'crm.db');

// 创建数据库连接
export const db = new Database(DB_PATH);

// 启用外键约束
db.pragma('foreign_keys = ON');

// 导出常用方法
export const get = db.prepare.bind(db);
export const all = db.prepare.bind(db);
export const run = db.prepare.bind(db);
export const transaction = db.transaction.bind(db);

/**
 * 关闭数据库连接
 */
export function closeDb(): void {
  db.close();
}

/**
 * 初始化数据库（运行所有迁移）
 */
export async function initializeDatabase(): Promise<void> {
  const fs = await import('fs');
  const migrationsDir = path.join(__dirname, '..', 'db', 'migrations');
  
  // 读取所有迁移文件
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // 按文件名排序（001, 002, ...）
  
  // 运行迁移
  for (const file of files) {
    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log(`Running migration: ${file}`);
    db.exec(sql);
  }
  
  console.log('Database initialized successfully');
}
