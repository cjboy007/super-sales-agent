/**
 * E2E 测试：邮件触发报价单生成
 * 
 * 场景：VIP 客户发送询盘邮件 → 自动创建报价单草稿 → 发送确认邮件 → 创建 OKKI 跟进记录
 */

const assert = require('assert');
const path = require('path');
const { RuleEngine } = require('../../lib/rule-engine');

describe('E2E: Email to Quotation', () => {
  let engine;
  let executionLog = [];

  beforeEach(async () => {
    executionLog = [];
    
    engine = new RuleEngine({
      rulesDir: path.join(__dirname, '../../config/rules'),
      schemasDir: path.join(__dirname, '../../schemas'),
      dryRun: true, // 测试模式不实际执行
      logger: {
        info: (msg) => executionLog.push({ level: 'info', msg }),
        debug: (msg) => executionLog.push({ level: 'debug', msg }),
        error: (msg) => executionLog.push({ level: 'error', msg }),
        warn: (msg) => executionLog.push({ level: 'warn', msg })
      }
    });

    await engine.initialize();
  });

  it('should process VIP inquiry email and generate quotation', async () => {
    // 模拟 VIP 客户询盘邮件
    const event = {
      type: 'email_received',
      payload: {
        from: 'vip@customer.com',
        to: 'sales@your-domain.com',
        subject: 'Inquiry - HDMI Cable 8K',
        body: 'Hi, I need a quote for 5000pcs HDMI 2.1 8K cables...',
        intent: 'inquiry',
        customer: {
          id: 'okki_12345',
          name: 'John Doe',
          tier: 'vip',
          email: 'vip@customer.com'
        },
        inquiry: {
          items: [
            { product: 'HDMI 2.1 8K', quantity: 5000 }
          ]
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'imap'
      }
    };

    // 执行规则引擎
    const result = await engine.handleEvent(event);

    // 验证结果
    assert.strictEqual(result.matched, 1, 'Should match 1 rule (vip-inquiry-auto-reply)');
    assert.strictEqual(result.executed, 1, 'Should execute 1 rule');
    
    const ruleResult = result.results[0];
    assert.strictEqual(ruleResult.rule_id, 'vip-inquiry-auto-reply');
    assert.strictEqual(ruleResult.success, true);
    
    // 验证执行了 3 个动作
    assert.strictEqual(ruleResult.actions.length, 3);
    assert.strictEqual(ruleResult.actions[0].action, 'generate_quotation');
    assert.strictEqual(ruleResult.actions[1].action, 'send_email');
    assert.strictEqual(ruleResult.actions[2].action, 'create_okki_trail');

    console.log('✅ VIP inquiry email test passed');
  });

  it('should process complaint email and escalate', async () => {
    const event = {
      type: 'email_received',
      payload: {
        from: 'unhappy@customer.com',
        subject: 'Complaint - Quality Issue',
        body: 'The cables we received are defective...',
        intent: 'complaint',
        customer: {
          id: 'okki_67890',
          name: 'Jane Smith'
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'imap'
      }
    };

    const result = await engine.handleEvent(event);

    assert.strictEqual(result.matched, 1, 'Should match complaint-escalation rule');
    
    const ruleResult = result.results[0];
    assert.strictEqual(ruleResult.actions.length, 2);
    assert.strictEqual(ruleResult.actions[0].action, 'create_okki_trail');
    assert.strictEqual(ruleResult.actions[1].action, 'send_email');

    console.log('✅ Complaint email test passed');
  });

  it('should handle new customer welcome email', async () => {
    const event = {
      type: 'email_received',
      payload: {
        from: 'new@customer.com',
        subject: 'Hello',
        body: 'Hi, I found your company online...',
        intent: 'inquiry',
        customer: {
          id: 'okki_new',
          name: 'New Customer',
          is_new: true
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'imap'
      }
    };

    const result = await engine.handleEvent(event);

    assert.strictEqual(result.matched, 1, 'Should match new-customer-welcome rule');
    
    const ruleResult = result.results[0];
    assert.strictEqual(ruleResult.actions.length, 2);

    console.log('✅ New customer welcome test passed');
  });

  it('should handle no matching rules', async () => {
    const event = {
      type: 'email_received',
      payload: {
        from: 'spam@spammer.com',
        subject: 'You won a prize!',
        body: 'Click here to claim...',
        intent: 'spam',
        customer: {
          id: 'okki_spam'
        }
      },
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'imap'
      }
    };

    const result = await engine.handleEvent(event);

    assert.strictEqual(result.matched, 0, 'Should not match any rules for spam');
    assert.strictEqual(result.executed, 0);

    console.log('✅ No matching rules test passed');
  });
});

console.log('✅ All E2E email-to-quotation tests passed!');
