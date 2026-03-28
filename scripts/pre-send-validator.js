/**
 * 发送前验证模块
 * 
 * 验证文档数据与收件人是否匹配，防止发错客户
 * 
 * 使用方式：
 * const validator = require('./pre-send-validator');
 * const passed = await validator.validate(quotationData, recipientEmail);
 */

const { getOKKIClient } = require('./okki-client');
const bankConfig = require('./bank-config');

class PreSendValidator {
  constructor() {
    this.okki = getOKKIClient();
    this.errors = [];
    this.warnings = [];
  }

  /**
   * 验证发送前所有检查项
   * @param {Object} docData - 文档数据
   * @param {string} recipientEmail - 收件人邮箱
   * @returns {Promise<Object>} { passed: boolean, errors: [], warnings: [] }
   */
  async validate(docData, recipientEmail) {
    console.log('🔍 运行发送前验证...');
    console.log('=' .repeat(60));

    this.errors = [];
    this.warnings = [];

    // 1. 验证收件人邮箱域名
    this._validateRecipientEmail(docData, recipientEmail);

    // 2. 验证客户信息
    this._validateCustomerInfo(docData);

    // 3. 验证银行账户
    this._validateBankAccount(docData);

    // 4. 验证文档日期
    this._validateDates(docData);

    // 5. 验证产品数据
    this._validateProducts(docData);

    // 打印结果
    this._printResults();

    return {
      passed: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * 验证收件人邮箱
   */
  _validateRecipientEmail(docData, recipientEmail) {
    const customer = docData.customer || {};
    const customerEmail = customer.contact_email || customer.email || '';

    if (!recipientEmail) {
      this.errors.push('收件人邮箱为空');
      return;
    }

    if (!customerEmail) {
      this.warnings.push('客户数据中缺少邮箱信息');
      return;
    }

    const recipientDomain = recipientEmail.split('@')[1]?.toLowerCase();
    const customerDomain = customerEmail.split('@')[1]?.toLowerCase();

    if (recipientDomain !== customerDomain) {
      this.errors.push(
        `收件人邮箱域名不匹配:\n` +
        `  文档客户邮箱：${customerEmail}\n` +
        `  实际收件人：${recipientEmail}\n` +
        `  请确认是否发错客户`
      );
    } else {
      console.log(`✅ 收件人邮箱验证通过：${recipientEmail}`);
    }
  }

  /**
   * 验证客户信息
   */
  _validateCustomerInfo(docData) {
    const customer = docData.customer || {};

    // 检查必填字段
    const required = ['company_name', 'contact', 'address'];
    for (const field of required) {
      if (!customer[field]) {
        this.errors.push(`客户信息缺少必填字段：${field}`);
      }
    }

    // 检查是否为示例数据
    const companyName = customer.company_name || '';
    const examplePatterns = ['example', 'test', 'sample', 'demo', 'xxx', 'abc'];
    
    for (const pattern of examplePatterns) {
      if (companyName.toLowerCase().includes(pattern)) {
        this.errors.push(
          `客户公司名称包含示例关键词：${companyName}\n` +
          `  请确认是否使用了真实客户数据`
        );
        break;
      }
    }

    if (this.errors.length === 0) {
      console.log(`✅ 客户信息验证通过：${customer.company_name}`);
    }
  }

  /**
   * 验证银行账户
   */
  _validateBankAccount(docData) {
    const docBank = docData.bank_info || {};
    
    try {
      const configBank = bankConfig.getPrimaryBank(false);
      
      if (!configBank) {
        this.warnings.push('无法加载银行配置，请检查配置文件');
        return;
      }

      // 验证银行账户是否匹配
      if (docBank.account_no && docBank.account_no !== configBank.account_no) {
        this.errors.push(
          `银行账户不匹配:\n` +
          `  文档账户：${docBank.account_no}\n` +
          `  配置账户：${configBank.account_no}\n` +
          `  请确认是否使用了正确的银行账户`
        );
      } else {
        console.log(`✅ 银行账户验证通过：${configBank.bank_name}`);
      }
    } catch (error) {
      this.warnings.push(`银行配置加载失败：${error.message}`);
    }
  }

  /**
   * 验证文档日期
   */
  _validateDates(docData) {
    const quotation = docData.quotation || {};
    const quotationDate = quotation.date || docData.date || '';
    const validUntil = quotation.valid_until || docData.validUntil || '';

    if (!quotationDate) {
      this.errors.push('报价日期为空');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const quoteDate = new Date(quotationDate);
    quoteDate.setHours(0, 0, 0, 0);

    if (quoteDate > today) {
      this.warnings.push(`报价日期是未来日期：${quotationDate}`);
    }

    if (validUntil) {
      const validDate = new Date(validUntil);
      validDate.setHours(0, 0, 0, 0);

      if (validDate < quoteDate) {
        this.errors.push(
          `有效期早于报价日期:\n` +
          `  报价日期：${quotationDate}\n` +
          `  有效期至：${validUntil}`
        );
      } else if (validDate < today) {
        this.errors.push(
          `报价单已过期:\n` +
          `  有效期至：${validUntil}\n` +
          `  请更新报价日期`
        );
      } else {
        console.log(`✅ 日期验证通过：有效期至 ${validUntil}`);
      }
    }
  }

  /**
   * 验证产品数据
   */
  _validateProducts(docData) {
    const products = docData.products || [];

    if (!products || products.length === 0) {
      this.errors.push('产品列表为空');
      return;
    }

    // 检查产品是否为示例数据
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const name = product.description || product.name || '';

      const examplePatterns = ['test', 'sample', 'demo', 'xxx', 'product name'];
      for (const pattern of examplePatterns) {
        if (name.toLowerCase().includes(pattern)) {
          this.errors.push(
            `产品${i + 1}名称包含示例关键词：${name}\n` +
            `  请确认是否使用了真实产品数据`
          );
          break;
        }
      }

      // 检查价格
      const price = product.unit_price || product.price || 0;
      if (price <= 0) {
        this.errors.push(`产品${i + 1}价格无效：${price}`);
      }

      // 检查数量
      const qty = product.quantity || 0;
      if (qty <= 0) {
        this.errors.push(`产品${i + 1}数量无效：${qty}`);
      }
    }

    if (this.errors.filter(e => e.includes('产品')).length === 0) {
      console.log(`✅ 产品数据验证通过：${products.length} 个产品`);
    }
  }

  /**
   * 打印验证结果
   */
  _printResults() {
    console.log('=' .repeat(60));

    if (this.warnings.length > 0) {
      console.log('⚠️  警告:');
      for (const warning of this.warnings) {
        console.log(`  - ${warning}`);
      }
    }

    if (this.errors.length > 0) {
      console.log('❌ 错误:');
      for (const error of this.errors) {
        console.log(`  - ${error}`);
      }
      console.log();
      console.log('❌ 发送前验证未通过，请修复问题后再发送');
    } else {
      console.log('✅ 发送前验证通过');
    }
  }
}

// 便捷函数
async function validatePreSend(docData, recipientEmail) {
  const validator = new PreSendValidator();
  return await validator.validate(docData, recipientEmail);
}

module.exports = {
  PreSendValidator,
  validatePreSend
};
