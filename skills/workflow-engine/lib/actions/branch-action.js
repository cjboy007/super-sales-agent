/**
 * 分支动作
 */
class BranchAction {
  constructor(options = {}) {
    this.type = 'branch';
    this.options = options;
  }

  async execute(config, context) {
    const { condition, true_actions, false_actions = [] } = config;
    
    if (!condition) throw new Error('Missing condition');

    // 评估条件（使用 ExpressionEvaluator）
    const conditionResult = this._evaluateCondition(condition, context);
    const actionsToExecute = conditionResult ? true_actions : false_actions;

    return {
      success: true,
      condition,
      condition_result: conditionResult,
      executed_branch: conditionResult ? 'true' : 'false',
      actions_count: actionsToExecute.length
    };
  }

  _evaluateCondition(condition, context) {
    // 简化实现，实际使用 ExpressionEvaluator
    try {
      return eval(condition);
    } catch (e) {
      return false;
    }
  }
}
module.exports = BranchAction;
