/**
 * 等待动作
 */
class WaitAction {
  constructor(options = {}) {
    this.type = 'wait';
    this.options = options;
  }

  async execute(config, context) {
    const { duration_minutes, until_condition } = config;
    
    if (!duration_minutes && !until_condition) {
      throw new Error('Missing duration_minutes or until_condition');
    }

    if (duration_minutes) {
      const ms = duration_minutes * 60 * 1000;
      await new Promise(resolve => setTimeout(resolve, ms));
    }

    return {
      success: true,
      waited: duration_minutes ? `${duration_minutes} minutes` : 'until condition',
      completed_at: new Date().toISOString()
    };
  }
}
module.exports = WaitAction;
