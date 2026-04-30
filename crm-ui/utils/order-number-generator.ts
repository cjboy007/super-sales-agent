/**
 * 订单编号生成器 (Order Number Generator)
 * 
 * 生成格式：ORD-YYYYMMDD-XXX
 * - ORD: 固定前缀
 * - YYYYMMDD: 创建日期（8 位数字）
 * - XXX: 当日序号（3 位数字，从 001 开始）
 * 
 * 说明：
 * - 优先读取当日最大序号，而不是简单 COUNT(*) + 1，避免删除记录后序号回退
 * - 最终唯一性仍由数据库 UNIQUE 约束保证；调用方应在插入冲突时重试
 */

import { db } from '../db/connection';

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * 生成订单编号
 * @param date 创建日期（默认当前日期）
 * @returns 订单编号（如：ORD-20260403-001）
 */
export async function generateOrderNumber(date: Date = new Date()): Promise<string> {
  const dateStr = formatDate(date);
  const prefix = `ORD-${dateStr}-`;

  const query = `
    SELECT order_id
    FROM orders
    WHERE order_id LIKE ?
      AND deleted_at IS NULL
    ORDER BY order_id DESC
    LIMIT 1
  `;

  const latest = await db.get(query, [`${prefix}%`]);
  const lastOrderId = latest?.order_id as string | undefined;
  const lastSequence = lastOrderId ? parseOrderSequence(lastOrderId) || 0 : 0;
  const nextSequence = lastSequence + 1;

  return `${prefix}${String(nextSequence).padStart(3, '0')}`;
}

/**
 * 生成唯一订单编号（带重试）
 * @param date 创建日期
 * @param maxRetries 最大重试次数
 */
export async function generateUniqueOrderNumber(
  date: Date = new Date(),
  maxRetries: number = 5
): Promise<string> {
  let attempt = 0;

  while (attempt < maxRetries) {
    const orderNumber = await generateOrderNumber(date);
    const existing = await db.get(
      'SELECT order_id FROM orders WHERE order_id = ? LIMIT 1',
      [orderNumber]
    );

    if (!existing) {
      return orderNumber;
    }

    attempt += 1;
  }

  throw new Error(`无法生成唯一订单号，已重试 ${maxRetries} 次`);
}

/**
 * 验证订单编号格式
 * @param orderNumber 订单编号
 * @returns 是否合法
 */
export function isValidOrderNumber(orderNumber: string): boolean {
  const regex = /^ORD-\d{8}-\d{3}$/;
  return regex.test(orderNumber);
}

/**
 * 从订单编号解析日期
 * @param orderNumber 订单编号
 * @returns 日期对象或 null
 */
export function parseOrderDate(orderNumber: string): Date | null {
  if (!isValidOrderNumber(orderNumber)) {
    return null;
  }
  
  const dateStr = orderNumber.slice(4, 12); // 提取 YYYYMMDD
  const year = parseInt(dateStr.slice(0, 4));
  const month = parseInt(dateStr.slice(4, 6)) - 1; // JS 月份从 0 开始
  const day = parseInt(dateStr.slice(6, 8));
  
  return new Date(year, month, day);
}

/**
 * 从订单编号解析序号
 * @param orderNumber 订单编号
 * @returns 序号数字或 null
 */
export function parseOrderSequence(orderNumber: string): number | null {
  if (!isValidOrderNumber(orderNumber)) {
    return null;
  }
  
  const seqStr = orderNumber.slice(13, 16); // 提取 XXX
  return parseInt(seqStr);
}
