/**
 * 银行账户配置管理模块
 * 
 * 使用方式：
 * const bankConfig = require('./bank-config');
 * const bankInfo = bankConfig.getPrimaryBank();
 * 
 * 或指定账户：
 * const bankInfo = bankConfig.getBank('primary');
 */

const fs = require('fs');
const path = require('path');

class BankConfig {
  constructor() {
    this.configPath = path.join(__dirname, '..', 'config', 'bank-accounts.json');
    this.config = null;
  }

  /**
   * 加载配置文件
   * @param {boolean} throwError - 是否抛出错误（默认 false，返回 null）
   */
  load(throwError = false) {
    if (this.config) {
      return this.config;
    }

    try {
      const content = fs.readFileSync(this.configPath, 'utf-8');
      this.config = JSON.parse(content);
      return this.config;
    } catch (error) {
      const errorMsg = [
        '❌ 错误：无法加载银行账户配置文件',
        `路径：${this.configPath}`,
        `错误：${error.message}`,
        '',
        '请确保配置文件存在且格式正确。'
      ].join('\n');

      if (throwError) {
        throw new Error(errorMsg);
      } else {
        console.error(errorMsg);
        return null;
      }
    }
  }

  /**
   * 重新加载配置（用于运行时配置更新）
   */
  reload() {
    this.config = null;
    return this.load(true);
  }

  /**
   * 获取主要银行账户
   * @param {boolean} throwError - 是否抛出错误（默认 true）
   */
  getPrimaryBank(throwError = true) {
    const config = this.load(throwError);
    
    if (!config) {
      const msg = '❌ 错误：未找到有效的主要银行账户配置';
      if (throwError) throw new Error(msg);
      console.error(msg);
      return null;
    }
    
    if (!config.primary || !config.primary.active) {
      const msg = '❌ 错误：主要银行账户未激活或配置不完整';
      if (throwError) throw new Error(msg);
      console.error(msg);
      return null;
    }

    return config.primary;
  }

  /**
   * 获取指定银行账户
   * @param {string} type - 'primary' 或 'legacy'
   * @param {boolean} throwError - 是否抛出错误（默认 true）
   */
  getBank(type = 'primary', throwError = true) {
    const config = this.load(throwError);
    
    if (!config) {
      const msg = `❌ 错误：无法加载银行账户配置`;
      if (throwError) throw new Error(msg);
      console.error(msg);
      return null;
    }
    
    if (!config[type]) {
      const msg = `❌ 错误：未找到银行账户配置 "${type}"`;
      if (throwError) throw new Error(msg);
      console.error(msg);
      return null;
    }

    return config[type];
  }

  /**
   * 获取所有银行账户
   */
  getAllBanks() {
    const config = this.load();
    return config;
  }

  /**
   * 验证银行账户信息完整性
   */
  validateBankInfo(bankInfo) {
    const required = ['beneficiary', 'bank_name', 'account_no', 'swift_code'];
    const missing = required.filter(field => !bankInfo[field]);

    if (missing.length > 0) {
      return {
        valid: false,
        errors: missing.map(field => `缺少必填字段：${field}`)
      };
    }

    return { valid: true, errors: [] };
  }
}

// 单例模式
const instance = new BankConfig();

module.exports = {
  getPrimaryBank: () => instance.getPrimaryBank(),
  getBank: (type) => instance.getBank(type),
  getAllBanks: () => instance.getAllBanks(),
  validateBankInfo: (bankInfo) => instance.validateBankInfo(bankInfo),
  load: () => instance.load()
};
