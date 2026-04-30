/**
 * OKKI 跟进记录写入模块 (OKKI Trail Writer)
 * 
 * 功能:
 * 1. 创建订单/合同类型跟进记录（remark_type=103）
 * 2. 支持去重检查
 * 3. 记录未匹配日志
 * 
 * Trail 类型枚举:
 * - 101: 快速记录
 * - 102: 邮件
 * - 103: 订单/合同（复用电话类型）
 * - 104: 会面
 * - 105: 社交平台
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';

const execAsync = promisify(exec);

// ==================== 配置 ====================

const CONFIG = {
  // OKKI CLI 路径
  okkiCliPath: '/Users/wilson/.openclaw/workspace/xiaoman-okki/api/okki.py',
  
  // 去重记录文件
  processedFile: '/tmp/okki-sync-processed.json',
  
  // 未匹配日志文件
  unmatchedLog: '/tmp/okki-unmatched-emails.log',
  
  // Trail 类型
  TRAIL_TYPE: {
    ORDER_CREATE: 101 // 订单创建
  }
};

// ==================== 工具函数 ====================

/**
 * 执行 OKKI CLI 命令
 */
async function execOkkiCli(args: string[] = []): Promise<any> {
  const command = `python3 "${CONFIG.okkiCliPath}" --json ${args.join(' ')}`;
  
  try {
    const { stdout, stderr } = await execAsync(command, {
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    try {
      return JSON.parse(stdout);
    } catch {
      return { raw: stdout, stderr };
    }
  } catch (error: any) {
    throw new Error(`OKKI CLI 执行失败：${error.message}`);
  }
}

/**
 * 加载已处理记录
 */
function loadProcessedRecords(): Record<string, any> {
  try {
    if (fs.existsSync(CONFIG.processedFile)) {
      const data = fs.readFileSync(CONFIG.processedFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('加载已处理记录失败:', (e as Error).message);
  }
  return {};
}

/**
 * 保存已处理记录
 */
function saveProcessedRecord(uid: string, metadata: any = {}): boolean {
  try {
    const records = loadProcessedRecords();
    records[uid] = {
      processed_at: new Date().toISOString(),
      ...metadata
    };
    fs.writeFileSync(CONFIG.processedFile, JSON.stringify(records, null, 2));
    return true;
  } catch (e) {
    console.error('保存已处理记录失败:', (e as Error).message);
    return false;
  }
}

/**
 * 检查是否已处理
 */
function isProcessed(uid: string): boolean {
  const records = loadProcessedRecords();
  return !!records[uid];
}

// ==================== 核心功能 ====================

/**
 * 创建订单跟进记录
 * 
 * @param companyId OKKI 客户公司 ID
 * @param orderData 订单数据
 * @returns 创建结果
 */
export async function createOrderTrail(
  companyId: string,
  orderData: {
    uid: string;              // 订单 UID（用于去重）
    orderNo: string;          // 订单编号
    date: string;             // 订单日期
    totalAmount: string;      // 总金额
    deliveryDate?: string;    // 交期
    products?: Array<{        // 产品列表
      name: string;
      quantity: number;
      unit_price: number;
    }>;
    filePaths?: string[];     // 生成的文件路径
  }
): Promise<{
  success: boolean;
  company_id?: string;
  trail_id?: string;
  reason?: string;
  message?: string;
}> {
  // 去重检查
  if (isProcessed(orderData.uid)) {
    return {
      success: false,
      reason: 'duplicate',
      message: '订单已处理',
      company_id: companyId
    };
  }
  
  // 构建产品列表字符串
  const productList = orderData.products && orderData.products.length > 0
    ? orderData.products.map(p => `  - ${p.name} x ${p.quantity}`).join('\n')
    : '(未列出产品)';
  
  // 构建文件列表字符串
  const fileList = orderData.filePaths && orderData.filePaths.length > 0
    ? `\n文件：${orderData.filePaths.join(', ')}`
    : '';
  
  // 构建跟进内容
  const content = `订单生成\n` +
    `编号：${orderData.orderNo}\n` +
    `日期：${orderData.date}\n` +
    `总金额：${orderData.totalAmount}\n` +
    (orderData.deliveryDate ? `交期：${orderData.deliveryDate}\n` : '') +
    `产品列表:\n${productList}${fileList}`;
  
  try {
    const result = await execOkkiCli([
      'trail', 'add',
      '--company', companyId,
      '--content', `"${content.replace(/"/g, '\\"')}"`,
      '--type', CONFIG.TRAIL_TYPE.ORDER_CREATE.toString()
    ]);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // 记录已处理
    saveProcessedRecord(orderData.uid, {
      type: 'order',
      company_id: companyId,
      trail_id: result.trail_id || result.data?.trail_id,
      order_no: orderData.orderNo
    });
    
    return {
      success: true,
      company_id: companyId,
      trail_id: result.trail_id || result.data?.trail_id
    };
  } catch (e: any) {
    return {
      success: false,
      reason: 'api_error',
      message: e.message,
      company_id: companyId
    };
  }
}

/**
 * 创建合同跟进记录
 * 
 * @param companyId OKKI 客户公司 ID
 * @param contractData 合同数据
 * @returns 创建结果
 */
export async function createContractTrail(
  companyId: string,
  contractData: {
    uid: string;              // 合同 UID（用于去重）
    contractNo: string;       // 合同编号
    date: string;             // 合同日期
    totalAmount: string;      // 总金额
    validUntil?: string;      // 有效期
    products?: Array<{        // 产品列表
      name: string;
      quantity: number;
      unit_price: number;
    }>;
    filePaths?: string[];     // 生成的文件路径
  }
): Promise<{
  success: boolean;
  company_id?: string;
  trail_id?: string;
  reason?: string;
  message?: string;
}> {
  // 去重检查
  if (isProcessed(contractData.uid)) {
    return {
      success: false,
      reason: 'duplicate',
      message: '合同已处理',
      company_id: companyId
    };
  }
  
  // 构建产品列表字符串
  const productList = contractData.products && contractData.products.length > 0
    ? contractData.products.map(p => `  - ${p.name} x ${p.quantity}`).join('\n')
    : '(未列出产品)';
  
  // 构建文件列表字符串
  const fileList = contractData.filePaths && contractData.filePaths.length > 0
    ? `\n文件：${contractData.filePaths.join(', ')}`
    : '';
  
  // 构建跟进内容
  const content = `合同生成\n` +
    `编号：${contractData.contractNo}\n` +
    `日期：${contractData.date}\n` +
    `总金额：${contractData.totalAmount}\n` +
    (contractData.validUntil ? `有效期：${contractData.validUntil}\n` : '') +
    `产品列表:\n${productList}${fileList}`;
  
  try {
    const result = await execOkkiCli([
      'trail', 'add',
      '--company', companyId,
      '--content', `"${content.replace(/"/g, '\\"')}"`,
      '--type', CONFIG.TRAIL_TYPE.ORDER_CREATE.toString()
    ]);
    
    if (result.error) {
      throw new Error(result.error);
    }
    
    // 记录已处理
    saveProcessedRecord(contractData.uid, {
      type: 'contract',
      company_id: companyId,
      trail_id: result.trail_id || result.data?.trail_id,
      contract_no: contractData.contractNo
    });
    
    return {
      success: true,
      company_id: companyId,
      trail_id: result.trail_id || result.data?.trail_id
    };
  } catch (e: any) {
    return {
      success: false,
      reason: 'api_error',
      message: e.message,
      company_id: companyId
    };
  }
}

/**
 * 同步订单到 OKKI（完整流程）
 * 
 * @param orderData 订单数据（包含客户信息）
 * @returns 同步结果
 */
export async function syncOrderToOkki(orderData: {
  uid: string;
  orderNo: string;
  date: string;
  totalAmount: string;
  deliveryDate?: string;
  products?: Array<{
    name: string;
    quantity: number;
    unit_price: number;
  }>;
  filePaths?: string[];
  okkiCompanyId: string;
}): Promise<{
  success: boolean;
  company_id?: string;
  trail_id?: string;
  reason?: string;
  message?: string;
}> {
  // 去重检查
  if (isProcessed(orderData.uid)) {
    return {
      success: false,
      reason: 'duplicate',
      message: '订单已处理'
    };
  }
  
  // 检查是否有 OKKI 客户 ID
  if (!orderData.okkiCompanyId) {
    return {
      success: false,
      reason: 'customer_not_found',
      message: '未关联 OKKI 客户'
    };
  }
  
  // 创建跟进记录
  return await createOrderTrail(orderData.okkiCompanyId, {
    uid: orderData.uid,
    orderNo: orderData.orderNo,
    date: orderData.date,
    totalAmount: orderData.totalAmount,
    deliveryDate: orderData.deliveryDate,
    products: orderData.products,
    filePaths: orderData.filePaths
  });
}

// ==================== 导出 ====================

export {
  isProcessed,
  loadProcessedRecords,
  saveProcessedRecord
};
