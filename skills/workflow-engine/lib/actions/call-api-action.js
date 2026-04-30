/**
 * 调用外部 API 动作
 */
class CallApiAction {
  constructor(options = {}) {
    this.type = 'call_api';
    this.options = options;
  }

  async execute(config, context) {
    const { url, method = 'GET', headers, body, timeout = 30000 } = config;
    
    if (!url) throw new Error('Missing url');

    // 模拟 API 调用（实际使用 fetch/axios）
    return {
      success: true,
      url,
      method,
      status: 200,
      data: { message: 'API call simulated' },
      called_at: new Date().toISOString()
    };
  }
}
module.exports = CallApiAction;
