/**
 * 工作流编排器 - Workflow Orchestrator
 * 
 * 负责编排复杂的动作序列，支持分支、循环等控制流
 */

const { ExpressionEvaluator } = require('./expression-evaluator');

class WorkflowOrchestrator {
  constructor(options = {}) {
    this.options = options;
    this.evaluator = new ExpressionEvaluator();
    this.executionStack = [];
  }

  /**
   * 编排执行动作序列
   * @param {Array} actions - 动作列表
   * @param {object} context - 执行上下文
   * @param {object} actionExecutor - 动作执行器
   * @returns {Promise<Array>} 执行结果
   */
  async orchestrate(actions, context, actionExecutor) {
    const results = [];

    for (const actionDef of actions) {
      try {
        const result = await this.executeAction(actionDef, context, actionExecutor);
        results.push(result);

        // 更新上下文
        if (result.success && result.result) {
          context.actions = context.actions || [];
          context.actions.push(result.result);
        }
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          action: actionDef.type
        });

        if (actionDef.on_error === 'stop') {
          break;
        }
      }
    }

    return results;
  }

  /**
   * 执行单个动作（处理控制流）
   * @param {object} actionDef - 动作定义
   * @param {object} context - 执行上下文
   * @param {object} actionExecutor - 动作执行器
   * @returns {Promise<object>}
   */
  async executeAction(actionDef, context, actionExecutor) {
    const { type, config } = actionDef;

    // 处理分支
    if (type === 'branch') {
      return await this.executeBranch(config, context, actionExecutor);
    }

    // 处理循环
    if (type === 'loop') {
      return await this.executeLoop(config, context, actionExecutor);
    }

    // 处理等待
    if (type === 'wait') {
      return await this.executeWait(config, context);
    }

    // 普通动作
    const result = await actionExecutor.execute(actionDef, context);
    return {
      success: true,
      action: type,
      result
    };
  }

  /**
   * 执行分支
   * @private
   */
  async executeBranch(config, context, actionExecutor) {
    const { condition, true_actions = [], false_actions = [] } = config;

    this.evaluator.setContext(context);
    const conditionResult = this.evaluator.evaluate(condition);

    const actionsToExecute = conditionResult ? true_actions : false_actions;
    const results = await this.orchestrate(actionsToExecute, context, actionExecutor);

    return {
      success: true,
      action: 'branch',
      result: {
        condition,
        condition_result: conditionResult,
        executed_branch: conditionResult ? 'true' : 'false',
        results
      }
    };
  }

  /**
   * 执行循环
   * @private
   */
  async executeLoop(config, context, actionExecutor) {
    const { items = [], action, max_iterations = 100 } = config;
    const results = [];

    const iterations = Math.min(items.length, max_iterations);

    for (let i = 0; i < iterations; i++) {
      const item = items[i];
      const itemContext = { ...context, item, index: i };

      try {
        const result = await this.executeAction(action, itemContext, actionExecutor);
        results.push({ success: true, iteration: i, result });
      } catch (error) {
        results.push({ success: false, iteration: i, error: error.message });

        if (action.on_error === 'stop') {
          break;
        }
      }
    }

    return {
      success: true,
      action: 'loop',
      result: {
        total_items: items.length,
        processed: results.length,
        results
      }
    };
  }

  /**
   * 执行等待
   * @private
   */
  async executeWait(config, context) {
    const { duration_minutes, until_condition } = config;

    if (duration_minutes) {
      const ms = duration_minutes * 60 * 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
    }

    if (until_condition) {
      // 轮询检查条件（简化实现）
      const maxWait = 60000; // 最多等 1 分钟
      const interval = 5000; // 每 5 秒检查一次
      const start = Date.now();

      this.evaluator.setContext(context);
      
      while (Date.now() - start < maxWait) {
        const conditionMet = this.evaluator.evaluate(until_condition);
        if (conditionMet) break;
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    return {
      success: true,
      action: 'wait',
      result: {
        waited: duration_minutes ? `${duration_minutes} minutes` : 'until condition',
        completed_at: new Date().toISOString()
      }
    };
  }
}

module.exports = {
  WorkflowOrchestrator
};
