/**
 * 表达式求值器 - Expression Evaluator
 * 
 * 负责解析和计算条件表达式
 * 支持：逻辑运算符、比较运算符、变量引用、函数调用
 */

class ExpressionEvaluator {
  constructor(context = {}) {
    this.context = context;
    this.functions = this._registerFunctions();
  }

  /**
   * 注册内置函数
   */
  _registerFunctions() {
    return {
      /**
       * 计算两个日期之间的天数
       * @param {string} dateStr - 日期字符串
       * @returns {number} 天数
       */
      daysSince: (dateStr) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        return Math.floor(diff / (1000 * 60 * 60 * 24));
      },

      /**
       * 检查字符串是否包含子串
       * @param {string} str - 原字符串
       * @param {string} substr - 子串
       * @returns {boolean}
       */
      contains: (str, substr) => {
        if (!str || !substr) return false;
        return String(str).includes(String(substr));
      },

      /**
       * 正则匹配
       * @param {string} str - 原字符串
       * @param {string} pattern - 正则表达式
       * @returns {boolean}
       */
      matches: (str, pattern) => {
        if (!str || !pattern) return false;
        try {
          const regex = new RegExp(pattern);
          return regex.test(String(str));
        } catch (e) {
          return false;
        }
      },

      /**
       * 检查字段是否存在
       * @param {any} value - 值
       * @returns {boolean}
       */
      exists: (value) => {
        return value !== undefined && value !== null;
      },

      /**
       * 转换为大写
       * @param {string} str - 字符串
       * @returns {string}
       */
      upper: (str) => {
        return String(str || '').toUpperCase();
      },

      /**
       * 转换为小写
       * @param {string} str - 字符串
       * @returns {string}
       */
      lower: (str) => {
        return String(str || '').toLowerCase();
      },

      /**
       * 字符串长度
       * @param {string|Array} value - 字符串或数组
       * @returns {number}
       */
      length: (value) => {
        if (!value) return 0;
        return value.length || 0;
      },

      /**
       * 当前时间戳
       * @returns {number}
       */
      now: () => {
        return Date.now();
      },

      /**
       * 日期格式化
       * @param {string} dateStr - 日期字符串
       * @param {string} format - 格式
       * @returns {string}
       */
      formatDate: (dateStr, format) => {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return '';
        
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return (format || 'YYYY-MM-DD')
          .replace('YYYY', year)
          .replace('MM', month)
          .replace('DD', day)
          .replace('HH', hours)
          .replace('mm', minutes);
      }
    };
  }

  /**
   * 获取嵌套对象的值
   * @param {object} obj - 对象
   * @param {string} path - 路径（如 "payload.customer.email"）
   * @returns {any}
   */
  _getNestedValue(obj, path) {
    if (!obj || !path) return undefined;
    
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === undefined || value === null) {
        return undefined;
      }
      value = value[key];
    }
    
    return value;
  }

  /**
   * 替换变量引用
   * @param {string} expression - 表达式
   * @returns {string} 替换后的表达式
   */
  _replaceVariables(expression) {
    return expression.replace(/\$\{([^}]+)\}/g, (match, path) => {
      const value = this._getNestedValue(this.context, path);
      if (value === undefined) {
        return 'undefined';
      }
      return JSON.stringify(value);
    });
  }

  /**
   * 调用函数
   * @param {string} funcName - 函数名
   * @param {Array} args - 参数
   * @returns {any}
   */
  _callFunction(funcName, args) {
    if (!this.functions[funcName]) {
      throw new Error(`Unknown function: ${funcName}`);
    }
    return this.functions[funcName](...args);
  }

  /**
   * 解析函数调用
   * @param {string} expression - 表达式
   * @returns {string} 解析后的表达式
   */
  _parseFunctions(expression) {
    // 匹配函数调用：funcName(arg1, arg2, ...)
    const functionPattern = /(\w+)\(([^)]*)\)/g;
    
    return expression.replace(functionPattern, (match, funcName, argsStr) => {
      const args = argsStr.split(',').map(arg => {
        const trimmed = arg.trim();
        // 尝试解析为 JSON
        try {
          return JSON.parse(trimmed);
        } catch (e) {
          // 如果是字符串，去掉引号
          return trimmed.replace(/^["']|["']$/g, '');
        }
      });
      
      const result = this._callFunction(funcName, args);
      return JSON.stringify(result);
    });
  }

  /**
   * 计算单个检查条件
   * @param {object} check - 检查条件
   * @returns {boolean}
   */
  evaluateCheck(check) {
    const { field, operator, value } = check;
    
    // 获取字段值
    let actualValue = this._getNestedValue(this.context, field);
    
    // 替换变量
    if (typeof value === 'string' && value.includes('${')) {
      const replaced = this._replaceVariables(value);
      try {
        value = JSON.parse(replaced);
      } catch (e) {
        // 保持原值
      }
    }
    
    // 执行比较
    switch (operator) {
      case 'equals':
      case '==':
        return actualValue == value;
      
      case 'not_equals':
      case '!=':
        return actualValue != value;
      
      case 'greater_than':
      case '>':
        return Number(actualValue) > Number(value);
      
      case 'less_than':
      case '<':
        return Number(actualValue) < Number(value);
      
      case 'greater_than_or_equal':
      case '>=':
        return Number(actualValue) >= Number(value);
      
      case 'less_than_or_equal':
      case '<=':
        return Number(actualValue) <= Number(value);
      
      case 'contains':
        if (!actualValue || !value) return false;
        return String(actualValue).includes(String(value));
      
      case 'regex':
      case 'matches':
        if (!actualValue || !value) return false;
        try {
          const regex = new RegExp(value);
          return regex.test(String(actualValue));
        } catch (e) {
          return false;
        }
      
      case 'exists':
        return value ? actualValue !== undefined : actualValue === undefined;
      
      case 'in':
        if (!Array.isArray(value)) return false;
        return value.includes(actualValue);
      
      case 'not_in':
        if (!Array.isArray(value)) return true;
        return !value.includes(actualValue);
      
      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * 计算条件组合
   * @param {object} conditions - 条件组合
   * @returns {boolean}
   */
  evaluateConditions(conditions) {
    if (!conditions || !conditions.checks) {
      return true;
    }

    const { type = 'all', checks } = conditions;
    
    if (type === 'all') {
      // AND 逻辑：所有条件都必须满足
      return checks.every(check => this.evaluateCheck(check));
    } else if (type === 'any') {
      // OR 逻辑：至少一个条件满足
      return checks.some(check => this.evaluateCheck(check));
    } else {
      throw new Error(`Unknown condition type: ${type}`);
    }
  }

  /**
   * 计算完整表达式
   * @param {string} expression - 表达式字符串
   * @returns {any}
   */
  evaluate(expression) {
    if (!expression) return undefined;
    
    let expr = expression;
    
    // 1. 替换变量
    expr = this._replaceVariables(expr);
    
    // 2. 解析函数调用
    expr = this._parseFunctions(expr);
    
    // 3. 计算表达式
    try {
      // 安全的表达式求值（仅支持基本运算）
      return Function('"use strict";return (' + expr + ')')();
    } catch (e) {
      throw new Error(`Failed to evaluate expression: ${e.message}`);
    }
  }

  /**
   * 更新上下文
   * @param {object} newContext - 新上下文
   */
  setContext(newContext) {
    this.context = { ...this.context, ...newContext };
  }

  /**
   * 清除上下文
   */
  clearContext() {
    this.context = {};
  }
}

module.exports = {
  ExpressionEvaluator
};
