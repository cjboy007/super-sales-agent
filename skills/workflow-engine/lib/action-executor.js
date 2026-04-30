/**
 * 动作执行器 - Action Executor
 * 
 * 负责执行工作流中的动作
 * 支持插件化扩展、dry-run 模式、重试机制
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class ActionExecutor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      dryRun: options.dryRun || false,
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      logger: options.logger || console,
      ...options
    };
    
    this.actions = new Map();
    this.actionRegistry = {};
    this.executionLog = [];
    
    // 注册内置动作
    this._registerBuiltInActions();
  }

  /**
   * 注册内置动作
   */
  _registerBuiltInActions() {
    const actionsDir = path.join(__dirname, 'actions');
    
    if (!fs.existsSync(actionsDir)) {
      this.options.logger.warn('Actions directory not found:', actionsDir);
      return;
    }

    const actionFiles = fs.readdirSync(actionsDir)
      .filter(file => file.endsWith('-action.js'));

    for (const file of actionFiles) {
      try {
        const ActionClass = require(path.join(actionsDir, file));
        const action = new ActionClass(this.options);
        this.registerAction(action);
      } catch (error) {
        this.options.logger.error(`Failed to load action ${file}:`, error.message);
      }
    }
  }

  /**
   * 注册动作
   * @param {object} action - 动作实例
   */
  registerAction(action) {
    if (!action.type || !action.execute) {
      throw new Error('Action must have type and execute method');
    }
    
    this.actions.set(action.type, action);
    this.actionRegistry[action.type] = action;
    
    this.options.logger.info(`Registered action: ${action.type}`);
  }

  /**
   * 注销动作
   * @param {string} type - 动作类型
   */
  unregisterAction(type) {
    this.actions.delete(type);
    delete this.actionRegistry[type];
  }

  /**
   * 执行动作
   * @param {object} actionDef - 动作定义
   * @param {object} context - 执行上下文
   * @returns {Promise<any>} 执行结果
   */
  async execute(actionDef, context = {}) {
    const { type, config, retry_policy } = actionDef;
    
    if (!this.actions.has(type)) {
      throw new Error(`Unknown action type: ${type}`);
    }

    const action = this.actions.get(type);
    const maxRetries = retry_policy?.max_retries || this.options.maxRetries;
    
    let lastError;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        this._logExecution(type, context, attempt);
        
        // Dry-run 模式
        if (this.options.dryRun) {
          this.options.logger.info(`[DRY-RUN] Would execute action: ${type}`, config);
          return { dryRun: true, type, config };
        }

        // 执行动作
        const result = await action.execute(config, context);
        
        this._logSuccess(type, result);
        this.emit('action:success', { type, result, context });
        
        return result;
      } catch (error) {
        lastError = error;
        this._logError(type, error);
        this.emit('action:error', { type, error, context, attempt });

        if (attempt < maxRetries) {
          const delay = this._calculateRetryDelay(retry_policy, attempt);
          this.options.logger.info(`Retrying action ${type} in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await this._sleep(delay);
        }
        
        attempt++;
      }
    }

    throw new ActionExecutionError(`Action ${type} failed after ${maxRetries} retries`, lastError);
  }

  /**
   * 执行动作序列
   * @param {Array} actions - 动作列表
   * @param {object} context - 执行上下文
   * @returns {Promise<Array>} 执行结果数组
   */
  async executeAll(actions, context = {}) {
    const results = [];
    
    for (const actionDef of actions) {
      try {
        const result = await this.execute(actionDef, context);
        results.push({ success: true, result, action: actionDef.type });
        
        // 更新上下文（前一个动作的输出作为后一个的输入）
        if (result && typeof result === 'object') {
          context.actions = context.actions || [];
          context.actions.push(result);
        }
      } catch (error) {
        results.push({ success: false, error: error.message, action: actionDef.type });
        
        // 根据错误处理策略决定是否继续
        if (actionDef.on_error === 'stop') {
          break;
        }
      }
    }
    
    return results;
  }

  /**
   * 计算重试延迟
   * @private
   */
  _calculateRetryDelay(retry_policy, attempt) {
    const baseDelay = retry_policy?.delay_seconds || this.options.retryDelay;
    const multiplier = retry_policy?.backoff_multiplier || 2;
    return baseDelay * Math.pow(multiplier, attempt);
  }

  /**
   * 睡眠
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 记录执行日志
   * @private
   */
  _logExecution(type, context, attempt) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: type,
      attempt,
      context: this._sanitizeContext(context)
    };
    
    this.executionLog.push(logEntry);
    this.options.logger.debug(`Executing action: ${type} (attempt ${attempt + 1})`);
  }

  /**
   * 记录成功日志
   * @private
   */
  _logSuccess(type, result) {
    this.options.logger.info(`Action executed successfully: ${type}`);
  }

  /**
   * 记录错误日志
   * @private
   */
  _logError(type, error) {
    this.options.logger.error(`Action failed: ${type}`, error.message);
  }

  /**
   * 清理上下文（移除敏感信息）
   * @private
   */
  _sanitizeContext(context) {
    const sanitized = { ...context };
    delete sanitized.password;
    delete sanitized.token;
    delete sanitized.apiKey;
    return sanitized;
  }

  /**
   * 获取执行日志
   * @returns {Array} 执行日志数组
   */
  getExecutionLog() {
    return this.executionLog;
  }

  /**
   * 清除执行日志
   */
  clearExecutionLog() {
    this.executionLog = [];
  }

  /**
   * 获取已注册的动作列表
   * @returns {Array} 动作类型列表
   */
  getRegisteredActions() {
    return Array.from(this.actions.keys());
  }
}

/**
 * 动作执行错误
 */
class ActionExecutionError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ActionExecutionError';
    this.cause = cause;
  }
}

module.exports = {
  ActionExecutor,
  ActionExecutionError
};
