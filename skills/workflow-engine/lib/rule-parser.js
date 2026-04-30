/**
 * 规则解析器 - Rule Parser
 * 
 * 负责解析和验证规则配置文件
 */

const Ajv = require('ajv');
const fs = require('fs');
const path = require('path');

class RuleParser {
  constructor(options = {}) {
    this.ajv = new Ajv({ 
      allErrors: true,
      strict: false,
      allowUnionTypes: true
    });
    this.schemaPath = options.schemaPath || path.join(__dirname, '../schemas/rule-schema.json');
    this.actionSchemaPath = options.actionSchemaPath || path.join(__dirname, '../schemas/action-schema.json');
    this.schema = null;
    this.actionSchema = null;
  }

  /**
   * 加载 Schema
   */
  loadSchemas() {
    try {
      this.schema = JSON.parse(fs.readFileSync(this.schemaPath, 'utf-8'));
      this.actionSchema = JSON.parse(fs.readFileSync(this.actionSchemaPath, 'utf-8'));
      return true;
    } catch (error) {
      throw new Error(`Failed to load schemas: ${error.message}`);
    }
  }

  /**
   * 解析规则配置文件
   * @param {string|object} ruleConfig - 规则配置（文件路径或对象）
   * @returns {object} 验证通过的规则对象
   */
  parse(ruleConfig) {
    if (!this.schema) {
      this.loadSchemas();
    }

    let rule;
    if (typeof ruleConfig === 'string') {
      try {
        rule = JSON.parse(fs.readFileSync(ruleConfig, 'utf-8'));
      } catch (error) {
        throw new Error(`Failed to read rule file: ${error.message}`);
      }
    } else {
      rule = ruleConfig;
    }

    // 验证规则结构
    const validate = this.ajv.compile(this.schema);
    const valid = validate(rule);

    if (!valid) {
      const errors = validate.errors.map(err => ({
        message: err.message,
        instancePath: err.instancePath,
        schemaPath: err.schemaPath
      }));
      throw new RuleValidationError('Rule validation failed', errors);
    }

    return rule;
  }

  /**
   * 解析多个规则文件
   * @param {string[]} ruleFiles - 规则文件路径数组
   * @returns {object[]} 规则对象数组
   */
  parseAll(ruleFiles) {
    return ruleFiles.map(file => {
      try {
        return this.parse(file);
      } catch (error) {
        console.error(`Failed to parse ${file}: ${error.message}`);
        throw error;
      }
    });
  }

  /**
   * 从目录加载所有规则
   * @param {string} rulesDir - 规则目录路径
   * @returns {object[]} 规则对象数组
   */
  loadFromDirectory(rulesDir) {
    const files = fs.readdirSync(rulesDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(rulesDir, file));
    
    return this.parseAll(files);
  }

  /**
   * 验证规则 ID 格式
   * @param {string} id - 规则 ID
   * @returns {boolean}
   */
  validateRuleId(id) {
    const pattern = /^[a-z][a-z0-9-]*$/;
    return pattern.test(id);
  }

  /**
   * 提取规则中的变量引用
   * @param {object} rule - 规则对象
   * @returns {string[]} 变量引用列表
   */
  extractVariables(rule) {
    const variables = new Set();
    const pattern = /\$\{([^}]+)\}/g;

    const searchVariables = (obj) => {
      if (typeof obj === 'string') {
        const matches = obj.match(pattern) || [];
        matches.forEach(match => {
          const varName = match.slice(2, -1);
          variables.add(varName);
        });
      } else if (Array.isArray(obj)) {
        obj.forEach(searchVariables);
      } else if (obj && typeof obj === 'object') {
        Object.values(obj).forEach(searchVariables);
      }
    };

    searchVariables(rule);
    return Array.from(variables);
  }
}

/**
 * 规则验证错误
 */
class RuleValidationError extends Error {
  constructor(message, errors) {
    super(message);
    this.name = 'RuleValidationError';
    this.errors = errors;
  }

  toString() {
    return `${this.name}: ${this.message}\n${this.errors.map(e => `  - ${e.instancePath}: ${e.message}`).join('\n')}`;
  }
}

module.exports = {
  RuleParser,
  RuleValidationError
};
