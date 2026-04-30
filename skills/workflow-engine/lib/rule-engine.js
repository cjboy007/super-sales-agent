/**
 * 规则引擎核心 - Rule Engine Core
 * 
 * 负责规则加载、匹配和执行编排
 */

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { RuleParser } = require('./rule-parser');
const { ExpressionEvaluator } = require('./expression-evaluator');
const { ActionExecutor } = require('./action-executor');

class RuleEngine extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      rulesDir: options.rulesDir || path.join(__dirname, '../config/rules'),
      schemasDir: options.schemasDir || path.join(__dirname, '../schemas'),
      dryRun: options.dryRun || false,
      conflictResolution: options.conflictResolution || 'first-match', // or 'all-match'
      ...options
    };

    this.parser = new RuleParser({
      schemaPath: path.join(this.options.schemasDir, 'rule-schema.json'),
      actionSchemaPath: path.join(this.options.schemasDir, 'action-schema.json')
    });

    this.evaluator = new ExpressionEvaluator();
    this.actionExecutor = new ActionExecutor({
      dryRun: this.options.dryRun,
      logger: this.options.logger || console
    });

    this.rules = new Map();
    this.isInitialized = false;
    this.executionHistory = [];
  }

  /**
   * 初始化引擎（加载规则）
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    this.options.logger.info('Initializing rule engine...');

    // 加载规则
    await this.loadRules();

    // 验证规则
    this.validateRules();

    this.isInitialized = true;
    this.options.logger.info(`Rule engine initialized with ${this.rules.size} rules`);
    
    this.emit('engine:initialized', { rulesCount: this.rules.size });
  }

  /**
   * 加载规则
   */
  async loadRules() {
    const { rulesDir } = this.options;

    if (!fs.existsSync(rulesDir)) {
      this.options.logger.warn('Rules directory not found:', rulesDir);
      return;
    }

    const ruleFiles = fs.readdirSync(rulesDir)
      .filter(file => file.endsWith('.json'));

    for (const file of ruleFiles) {
      try {
        const rulePath = path.join(rulesDir, file);
        const rule = this.parser.parse(rulePath);
        
        // 按优先级排序
        const priority = rule.priority || 50;
        this.rules.set(rule.id, { ...rule, priority });
        
        this.options.logger.debug(`Loaded rule: ${rule.id} (priority: ${priority})`);
      } catch (error) {
        this.options.logger.error(`Failed to load rule ${file}:`, error.message);
      }
    }

    // 按优先级排序规则
    this.sortRulesByPriority();
  }

  /**
   * 验证规则
   */
  validateRules() {
    const ruleIds = new Set();
    
    for (const [id, rule] of this.rules) {
      // 检查 ID 唯一性
      if (ruleIds.has(id)) {
        throw new Error(`Duplicate rule ID: ${id}`);
      }
      ruleIds.add(id);

      // 检查必填字段
      if (!rule.trigger || !rule.actions) {
        throw new Error(`Rule ${id} missing trigger or actions`);
      }
    }
  }

  /**
   * 按优先级排序规则
   */
  sortRulesByPriority() {
    const sorted = Array.from(this.rules.entries())
      .sort(([, a], [, b]) => b.priority - a.priority);
    
    this.rules.clear();
    sorted.forEach(([id, rule]) => this.rules.set(id, rule));
  }

  /**
   * 处理事件
   * @param {object} event - 事件对象
   * @returns {Promise<object>} 执行结果
   */
  async handleEvent(event) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    this.options.logger.info(`Handling event: ${event.type}`);
    this.emit('event:received', event);

    // 查找匹配的规则
    const matchedRules = this.matchRules(event);

    if (matchedRules.length === 0) {
      this.options.logger.debug(`No rules matched for event: ${event.type}`);
      return { matched: 0, executed: 0 };
    }

    this.options.logger.info(`Matched ${matchedRules.length} rules`);

    // 执行规则
    const results = await this.executeRules(matchedRules, event);

    // 记录执行历史
    this.executionHistory.push({
      timestamp: new Date().toISOString(),
      event,
      matchedRules: matchedRules.map(r => r.id),
      results
    });

    return results;
  }

  /**
   * 匹配规则
   * @param {object} event - 事件对象
   * @returns {Array} 匹配的规则列表
   */
  matchRules(event) {
    const matched = [];

    for (const [id, rule] of this.rules) {
      if (!rule.enabled) {
        continue;
      }

      // 检查事件类型
      if (rule.trigger.event_type !== event.type) {
        continue;
      }

      // 检查条件
      if (rule.trigger.conditions) {
        this.evaluator.setContext({ event, payload: event.payload });
        const matches = this.evaluator.evaluateConditions(rule.trigger.conditions);
        
        if (matches) {
          matched.push(rule);
        }
      } else {
        // 没有条件，直接匹配
        matched.push(rule);
      }
    }

    return matched;
  }

  /**
   * 执行规则
   * @param {Array} rules - 规则列表
   * @param {object} event - 触发事件
   * @returns {Promise<object>} 执行结果
   */
  async executeRules(rules, event) {
    const results = [];
    const context = { event, actions: [] };

    if (this.options.conflictResolution === 'first-match') {
      // 只执行第一个匹配的规则
      const rule = rules[0];
      const result = await this.executeRule(rule, context);
      results.push(result);
    } else {
      // 执行所有匹配的规则
      for (const rule of rules) {
        const result = await this.executeRule(rule, context);
        results.push(result);
      }
    }

    return {
      matched: rules.length,
      executed: results.filter(r => r.success).length,
      results
    };
  }

  /**
   * 执行单个规则
   * @param {object} rule - 规则对象
   * @param {object} context - 执行上下文
   * @returns {Promise<object>} 执行结果
   */
  async executeRule(rule, context) {
    try {
      this.options.logger.info(`Executing rule: ${rule.id}`);
      this.emit('rule:executing', { rule, context });

      // 执行动作序列
      const actionResults = await this.actionExecutor.executeAll(rule.actions, context);

      const success = actionResults.every(r => r.success);
      
      const result = {
        rule_id: rule.id,
        success,
        actions: actionResults,
        executed_at: new Date().toISOString()
      };

      this.emit('rule:executed', result);
      return result;
    } catch (error) {
      this.options.logger.error(`Rule execution failed: ${rule.id}`, error.message);
      
      return {
        rule_id: rule.id,
        success: false,
        error: error.message,
        executed_at: new Date().toISOString()
      };
    }
  }

  /**
   * 获取执行历史
   */
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit);
  }

  /**
   * 清除执行历史
   */
  clearExecutionHistory() {
    this.executionHistory = [];
  }

  /**
   * 获取规则列表
   */
  getRules() {
    return Array.from(this.rules.values()).map(rule => ({
      id: rule.id,
      name: rule.name,
      priority: rule.priority,
      enabled: rule.enabled,
      event_type: rule.trigger?.event_type
    }));
  }

  /**
   * 重新加载规则
   */
  async reloadRules() {
    this.rules.clear();
    this.isInitialized = false;
    await this.initialize();
  }
}

module.exports = {
  RuleEngine
};
