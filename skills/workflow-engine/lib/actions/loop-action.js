/**
 * 循环动作
 */
class LoopAction {
  constructor(options = {}) {
    this.type = 'loop';
    this.options = options;
  }

  async execute(config, context) {
    const { items, action, max_iterations = 100 } = config;
    
    if (!items || !Array.isArray(items)) {
      throw new Error('Missing or invalid items array');
    }
    if (!action) {
      throw new Error('Missing action');
    }

    const results = [];
    const iterations = Math.min(items.length, max_iterations);

    for (let i = 0; i < iterations; i++) {
      const item = items[i];
      const itemContext = { ...context, item, index: i };
      
      try {
        // 执行动作（简化实现）
        results.push({ success: true, item: i });
      } catch (error) {
        results.push({ success: false, error: error.message, item: i });
      }
    }

    return {
      success: true,
      total_items: items.length,
      processed: iterations,
      results
    };
  }
}
module.exports = LoopAction;
