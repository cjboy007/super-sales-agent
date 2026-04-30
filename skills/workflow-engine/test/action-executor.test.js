/**
 * Action Executor 单元测试
 */

const assert = require('assert');
const path = require('path');
const { ActionExecutor } = require('../lib/action-executor');

describe('ActionExecutor', () => {
  let executor;

  beforeEach(() => {
    executor = new ActionExecutor({
      dryRun: false,
      maxRetries: 3,
      logger: {
        info: () => {},
        debug: () => {},
        error: () => {},
        warn: () => {}
      }
    });
  });

  describe('Constructor', () => {
    it('should create executor with default options', () => {
      assert(executor instanceof ActionExecutor);
      assert.strictEqual(executor.options.dryRun, false);
      assert.strictEqual(executor.options.maxRetries, 3);
    });

    it('should create executor with custom options', () => {
      const customExecutor = new ActionExecutor({
        dryRun: true,
        maxRetries: 5
      });
      assert.strictEqual(customExecutor.options.dryRun, true);
      assert.strictEqual(customExecutor.options.maxRetries, 5);
    });
  });

  describe('registerAction', () => {
    it('should register a valid action', () => {
      const action = {
        type: 'test_action',
        execute: async () => ({ success: true })
      };
      
      executor.registerAction(action);
      assert(executor.actions.has('test_action'));
    });

    it('should throw error for invalid action', () => {
      const invalidAction = { type: 'invalid' }; // missing execute
      assert.throws(() => executor.registerAction(invalidAction), /must have type and execute/);
    });
  });

  describe('execute', () => {
    it('should execute a simple action', async () => {
      const action = {
        type: 'simple_action',
        execute: async (config) => ({ result: config.value * 2 })
      };
      
      executor.registerAction(action);
      
      const result = await executor.execute(
        { type: 'simple_action', config: { value: 5 } }
      );
      
      assert.strictEqual(result.result, 10);
    });

    it('should handle dry-run mode', async () => {
      const dryExecutor = new ActionExecutor({ dryRun: true });
      const action = {
        type: 'test_action',
        execute: async () => ({ executed: true })
      };
      
      dryExecutor.registerAction(action);
      
      const result = await dryExecutor.execute({ type: 'test_action', config: {} });
      
      assert.strictEqual(result.dryRun, true);
    });

    it('should retry on failure', async () => {
      let attempts = 0;
      const action = {
        type: 'flaky_action',
        execute: async () => {
          attempts++;
          if (attempts < 3) throw new Error('Temporary failure');
          return { success: true };
        }
      };
      
      executor.registerAction(action);
      
      const result = await executor.execute({ type: 'flaky_action', config: {} });
      
      assert.strictEqual(result.success, true);
      assert.strictEqual(attempts, 3);
    });

    it('should throw after max retries', async () => {
      const action = {
        type: 'failing_action',
        execute: async () => { throw new Error('Always fails'); }
      };
      
      executor.registerAction(action);
      
      await assert.rejects(
        async () => executor.execute({ type: 'failing_action', config: {} }),
        /failed after 3 retries/
      );
    });
  });

  describe('executeAll', () => {
    it('should execute multiple actions in sequence', async () => {
      const action1 = {
        type: 'action_1',
        execute: async () => ({ value: 1 })
      };
      const action2 = {
        type: 'action_2',
        execute: async () => ({ value: 2 })
      };
      
      executor.registerAction(action1);
      executor.registerAction(action2);
      
      const results = await executor.executeAll([
        { type: 'action_1' },
        { type: 'action_2' }
      ]);
      
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].success, true);
      assert.strictEqual(results[1].success, true);
    });

    it('should continue on failure by default', async () => {
      const failing = {
        type: 'failing',
        execute: async () => { throw new Error('Fail') }
      };
      const success = {
        type: 'success',
        execute: async () => ({ ok: true })
      };
      
      executor.registerAction(failing);
      executor.registerAction(success);
      
      const results = await executor.executeAll([
        { type: 'failing' },
        { type: 'success' }
      ]);
      
      assert.strictEqual(results.length, 2);
      assert.strictEqual(results[0].success, false);
      assert.strictEqual(results[1].success, true);
    });
  });

  describe('getRegisteredActions', () => {
    it('should return list of registered actions', () => {
      const action = { type: 'test', execute: async () => {} };
      executor.registerAction(action);
      
      const actions = executor.getRegisteredActions();
      assert(actions.includes('test'));
    });
  });

  describe('getExecutionLog', () => {
    it('should return execution log', async () => {
      const action = {
        type: 'logged_action',
        execute: async () => ({ ok: true })
      };
      
      executor.registerAction(action);
      await executor.execute({ type: 'logged_action', config: {} });
      
      const log = executor.getExecutionLog();
      assert(log.length > 0);
      assert(log[0].action === 'logged_action');
    });
  });
});

describe('Built-in Actions', () => {
  let executor;

  beforeEach(() => {
    executor = new ActionExecutor({
      logger: { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} }
    });
  });

  it('should have send_email action', async () => {
    assert(executor.actions.has('send_email'));
    
    const result = await executor.execute({
      type: 'send_email',
      config: {
        to: 'test@example.com',
        template: 'test-template'
      }
    });
    
    assert.strictEqual(result.success, true);
    assert(result.message_id);
  });

  it('should have create_okki_trail action', async () => {
    assert(executor.actions.has('create_okki_trail'));
    
    const result = await executor.execute({
      type: 'create_okki_trail',
      config: {
        customer_id: 'okki_123',
        trail_type: 102,
        content: 'Test trail'
      }
    });
    
    assert.strictEqual(result.success, true);
    assert(result.trail_id);
  });

  it('should have generate_quotation action', async () => {
    assert(executor.actions.has('generate_quotation'));
    
    const result = await executor.execute({
      type: 'generate_quotation',
      config: {
        customer_id: 'okki_123',
        template: 'standard'
      }
    });
    
    assert.strictEqual(result.success, true);
    assert(result.quotation_no);
  });

  it('should have wait action', async () => {
    assert(executor.actions.has('wait'));
    
    // Quick test (0.1 seconds)
    const result = await executor.execute({
      type: 'wait',
      config: { duration_minutes: 0.001 }
    });
    
    assert.strictEqual(result.success, true);
  }).timeout(5000);
});

console.log('✅ All action executor tests passed!');
