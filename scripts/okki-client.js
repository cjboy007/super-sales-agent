/**
 * OKKI CRM 客户端模块
 * 
 * 使用方式：
 * const okki = require('./okki-client');
 * const customer = await okki.getCompany(16064);
 */

const https = require('https');

class OKKIClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.OKKI_API_KEY;
    this.apiSecret = options.apiSecret || process.env.OKKI_API_SECRET;
    this.baseUrl = options.baseUrl || 'https://api.okki.com';
    this.timeout = options.timeout || 10000;
  }

  /**
   * 获取客户详情（优先从缓存加载）
   * @param {string|number} companyId - OKKI 客户 ID
   * @returns {Promise<Object>} 客户信息
   */
  async getCompany(companyId) {
    console.log(`📋 从 OKKI 获取客户详情 (ID: ${companyId})...`);

    // 1. 优先从缓存加载
    const cached = this._getFromCache(companyId);
    if (cached) {
      console.log(`✅ 从缓存加载客户数据：${cached.company_name}`);
      return cached;
    }

    // 2. 缓存未命中，从 OKKI API 获取
    console.log('⚠️  缓存未命中，从 OKKI API 获取...');
    
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'OKKI API 凭证未配置\n' +
        '请设置环境变量：\n' +
        '  export OKKI_API_KEY=your_api_key\n' +
        '  export OKKI_API_SECRET=your_api_secret'
      );
    }

    try {
      // TODO: 调用真实 OKKI API
      const customer = await this._fetchFromOKKI(companyId);
      
      // 3. 保存到缓存
      this._saveToCache(customer);
      
      return customer;
    } catch (error) {
      console.error(`❌ 错误：无法从 OKKI 获取客户数据`);
      console.error(`错误信息：${error.message}`);
      throw error;
    }
  }

  /**
   * 从缓存加载客户数据
   */
  _getFromCache(companyId) {
    const fs = require('fs');
    const path = require('path');
    
    // 缓存文件位置
    const cachePath = path.join(
      __dirname,
      '..',
      '..',
      'xiaoman-okki',
      'api',
      'cache',
      'company_index.json'
    );
    
    try {
      if (!fs.existsSync(cachePath)) {
        return null;
      }
      
      const content = fs.readFileSync(cachePath, 'utf-8');
      const index = JSON.parse(content);
      
      // 查找客户
      const company = index.find(c => 
        String(c.company_id) === String(companyId) ||
        String(c.serial_id) === String(companyId)
      );
      
      if (company) {
        return {
          okki_customer_id: String(company.company_id),
          serial_id: company.serial_id,
          company_name: company.name,
          // 其他字段从完整缓存加载
          contact: '',
          contact_email: '',
          phone: '',
          address: '',
          country: '',
          _from_cache: true
        };
      }
      
      return null;
    } catch (error) {
      console.log(`⚠️  缓存读取失败：${error.message}`);
      return null;
    }
  }

  /**
   * 保存到缓存（简化版，实际应使用 sync_cache.py）
   */
  _saveToCache(customer) {
    // 简化实现，实际应该调用 sync_cache.py
    console.log('💾 客户数据已缓存（详细缓存请使用 sync_cache.py）');
  }

  /**
   * 从 OKKI API 获取（待实现）
   */
  async _fetchFromOKKI(companyId) {
    // TODO: 调用真实 OKKI API
    // 这里返回模拟数据
    return {
      okki_customer_id: String(companyId),
      company_name: 'Test Customer Corp',
      contact: 'John Smith',
      contact_email: 'john@testcustomer.com',
      phone: '+86-755-8888-9999',
      address: 'Floor 12, Building A, High-Tech Industrial Park, Shenzhen',
      country: 'China',
      industry: 'Electronics',
      website: 'www.testcustomer.com'
    };
  }

  /**
   * 验证客户邮箱域名
   * @param {string} email - 邮箱地址
   * @param {Object} customer - OKKI 客户数据
   * @returns {boolean} 是否匹配
   */
  validateEmailDomain(email, customer) {
    if (!customer || !customer.contact_email) {
      return false;
    }

    const emailDomain = email.split('@')[1]?.toLowerCase();
    const okkiDomain = customer.contact_email.split('@')[1]?.toLowerCase();

    return emailDomain === okkiDomain;
  }

  /**
   * 验证客户公司名称
   * @param {string} companyName - 公司名称
   * @param {Object} customer - OKKI 客户数据
   * @returns {boolean} 是否匹配
   */
  validateCompanyName(companyName, customer) {
    if (!customer || !customer.company_name) {
      return false;
    }

    // 简单匹配（不区分大小写）
    return companyName.toLowerCase().includes(customer.company_name.toLowerCase()) ||
           customer.company_name.toLowerCase().includes(companyName.toLowerCase());
  }
}

// 单例模式
let instance = null;

function getOKKIClient() {
  if (!instance) {
    instance = new OKKIClient();
  }
  return instance;
}

module.exports = {
  OKKIClient,
  getOKKIClient,
  validateEmailDomain: (email, customer) => {
    return getOKKIClient().validateEmailDomain(email, customer);
  },
  validateCompanyName: (companyName, customer) => {
    return getOKKIClient().validateCompanyName(companyName, customer);
  }
};
