/**
 * OKKI 客户匹配器 (OKKI Company Matcher)
 * 
 * 功能:
 * 1. 域名精确匹配（含公共域名黑名单）
 * 2. 向量搜索回退
 * 3. 公司名称模糊匹配
 * 
 * 匹配优先级：
 * 1. 域名精确匹配 > 2. 向量搜索 > 3. 返回 null（等待手动关联）
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

// ==================== 配置 ====================

const CONFIG = {
  // OKKI CLI 路径
  okkiCliPath: '/Users/wilson/.openclaw/workspace/xiaoman-okki/api/okki.py',
  
  // 客户向量搜索脚本路径
  customerSearchScript: '/Users/wilson/.openclaw/workspace/vector_store/search-customers.py',
  
  // Python 虚拟环境路径
  pythonVenv: '/Users/wilson/.openclaw/workspace/vector_store/venv/bin/python3',
  
  // 公共域名黑名单
  publicDomains: [
    'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
    'qq.com', '163.com', '126.com', 'sina.com', 'sohu.com',
    'icloud.com', 'me.com', 'mac.com', 'live.com', 'msn.com'
  ]
};

// ==================== 工具函数 ====================

/**
 * 从邮箱地址提取域名
 */
function extractDomain(email: string): string | null {
  if (!email || typeof email !== 'string') {
    return null;
  }
  const match = email.match(/@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * 检查域名是否为公共域名
 */
function isPublicDomain(domain: string | null): boolean {
  if (!domain) return true;
  return CONFIG.publicDomains.includes(domain.toLowerCase());
}

/**
 * 执行 Python 脚本
 */
async function execPython(scriptPath: string, args: string[] = []): Promise<any> {
  const pythonPath = fs.existsSync(CONFIG.pythonVenv) 
    ? CONFIG.pythonVenv 
    : 'python3';
  
  const command = `${pythonPath} "${scriptPath}" ${args.join(' ')}`;
  
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
    throw new Error(`Python 执行失败：${error.message}`);
  }
}

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

// ==================== 核心功能 ====================

/**
 * 通过域名搜索 OKKI 客户
 */
export async function searchByDomain(domain: string): Promise<{
  company_id: string;
  name: string;
  match_type: 'domain_exact' | 'domain_partial';
  confidence: number;
} | null> {
  if (!domain || isPublicDomain(domain)) {
    return null;
  }
  
  try {
    // 使用 OKKI CLI 搜索客户（通过域名关键词）
    const result = await execOkkiCli(['company', 'list', '-k', domain, '-l', '5']);
    
    if (result.data && result.data.length > 0) {
      // 精确匹配域名
      const exactMatch = result.data.find((company: any) => {
        const companyDomain = extractDomain(company.website || company.email || '');
        return companyDomain === domain;
      });
      
      if (exactMatch) {
        return {
          company_id: exactMatch.company_id || exactMatch.id,
          name: exactMatch.name,
          match_type: 'domain_exact',
          confidence: 0.95
        };
      }
      
      // 部分匹配
      if (result.data.length > 0) {
        return {
          company_id: result.data[0].company_id || result.data[0].id,
          name: result.data[0].name,
          match_type: 'domain_partial',
          confidence: 0.7
        };
      }
    }
    
    return null;
  } catch (error: any) {
    console.error('域名搜索失败:', error.message);
    return null;
  }
}

/**
 * 通过向量搜索匹配客户
 */
export async function searchByVector(
  query: string
): Promise<{
  company_id: string;
  name: string;
  match_type: 'vector';
  confidence: number;
  serial_id?: string;
} | null> {
  try {
    if (!query.trim()) {
      return null;
    }
    
    const result = await execPython(CONFIG.customerSearchScript, [
      `"${query.replace(/"/g, '\\"')}"`,
      '--limit 5',
      '--json'
    ]);
    
    if (result && Array.isArray(result) && result.length > 0) {
      const topMatch = result[0];
      return {
        company_id: topMatch.company_id,
        name: topMatch.name,
        match_type: 'vector',
        confidence: topMatch.score || 0.6,
        serial_id: topMatch.serial_id
      };
    }
    
    return null;
  } catch (error: any) {
    console.error('向量搜索失败:', error.message);
    return null;
  }
}

/**
 * 通过公司名称搜索 OKKI 客户
 */
export async function searchByCompanyName(
  companyName: string
): Promise<{
  company_id: string;
  name: string;
  match_type: 'name_keyword';
  confidence: number;
} | null> {
  if (!companyName || companyName.trim().length < 2) {
    return null;
  }
  
  try {
    const result = await execOkkiCli([
      'company', 'list',
      '-k', `"${companyName.replace(/"/g, '\\"')}"`,
      '-l 5'
    ]);
    
    if (result.data && result.data.length > 0) {
      return {
        company_id: result.data[0].company_id || result.data[0].id,
        name: result.data[0].name,
        match_type: 'name_keyword',
        confidence: 0.6
      };
    }
    
    return null;
  } catch (error: any) {
    console.error('公司名称搜索失败:', error.message);
    return null;
  }
}

/**
 * 匹配 OKKI 客户（主函数）
 * 
 * @param email 客户邮箱
 * @param companyName 公司名称（可选）
 * @param contactName 联系人姓名（可选，用于向量搜索）
 * @returns 匹配结果或 null
 */
export async function matchOkkiCompany(
  email: string,
  companyName?: string,
  contactName?: string
): Promise<{
  company_id: string;
  name: string;
  match_type: string;
  confidence: number;
  serial_id?: string;
} | null> {
  // 步骤 1: 域名精确匹配（跳过公共域名）
  if (email) {
    const domain = extractDomain(email);
    if (domain && !isPublicDomain(domain)) {
      const domainResult = await searchByDomain(domain);
      if (domainResult) {
        return domainResult;
      }
    }
  }
  
  // 步骤 2: 向量搜索回退（组合邮箱 + 公司名 + 联系人）
  const vectorQuery = [email, companyName, contactName].filter(Boolean).join(' ');
  if (vectorQuery.trim()) {
    const vectorResult = await searchByVector(vectorQuery);
    if (vectorResult) {
      return vectorResult;
    }
  }
  
  // 步骤 3: 公司名称关键词搜索
  if (companyName) {
    const nameResult = await searchByCompanyName(companyName);
    if (nameResult) {
      return nameResult;
    }
  }
  
  // 所有匹配方式都失败
  return null;
}

/**
 * 批量匹配 OKKI 客户
 * @param customers 客户列表 [{email, companyName, contactName}]
 * @returns 匹配结果数组
 */
export async function batchMatchOkkiCompanies(
  customers: Array<{
    email: string;
    companyName?: string;
    contactName?: string;
  }>
): Promise<Array<{
  input: any;
  match: any;
}>> {
  const results = [];
  
  for (const customer of customers) {
    const match = await matchOkkiCompany(
      customer.email,
      customer.companyName,
      customer.contactName
    );
    
    results.push({
      input: customer,
      match
    });
  }
  
  return results;
}

// ==================== 导出 ====================

export {
  extractDomain,
  isPublicDomain,
  searchByDomain,
  searchByVector,
  searchByCompanyName
};
