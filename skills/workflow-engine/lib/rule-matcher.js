/**
 * 规则匹配器 - Rule Matcher
 * 
 * 负责高效匹配事件和规则
 */

const { ExpressionEvaluator } = require('./expression-evaluator');

class RuleMatcher {
  constructor(options = {}) {
    this.options = options;
    this.evaluator = new ExpressionEvaluator();
    this.index = new Map(); // 按事件类型索引
  }

  /**
   * 构建规则索引
   * @param {Map} rules - 规则 Map
   */
  buildIndex(rules) {
    this.index.clear();

    for (const [id, rule] of rules) {
      const eventType = rule.trigger?.event_type;
      if (!eventType) continue;

      if (!this.index.has(eventType)) {
        this.index.set(eventType, []);
      }
      this.index.get(eventType).push(rule);
    }

    // 每个事件类型的规则按优先级排序
    for (const [eventType, ruleList] of this.index) {
      ruleList.sort((a, b) => (b.priority || 50) - (a.priority || 50));
    }
  }

  /**
   * 匹配规则
   * @param {object} event - 事件对象
   * @param {Map} rules - 规则 Map
   * @returns {Array} 匹配的规则列表
   */
  match(event, rules) {
    const eventType = event.type;
    
    if (!this.index.has(eventType)) {
      return [];
    }

    const candidates = this.index.get(eventType);
    const matched = [];

    for (const rule of candidates) {
      if (!rule.enabled) continue;

      if (this.matchesConditions(rule, event)) {
        matched.push(rule);
      }
    }

    return matched;
  }

  /**
   * 检查规则条件是否匹配
   * @param {object} rule - 规则对象
   * @param {object} event - 事件对象
   * @returns {boolean}
   */
  matchesConditions(rule, event) {
    if (!rule.trigger?.conditions) {
      return true; // 没有条件，直接匹配
    }

    this.evaluator.setContext({ event, payload: event.payload });
    return this.evaluator.evaluateConditions(rule.trigger.conditions);
  }

  /**
   * 快速查找（仅按事件类型）
   * @param {string} eventType - 事件类型
   * @returns {Array} 候选规则列表
   */
  findByEventType(eventType) {
    return this.index.get(eventType) || [];
  }

  /**
   * 清除索引
   */
  clearIndex() {
    this.index.clear();
  }
}

module.exports = {
  RuleMatcher
};
