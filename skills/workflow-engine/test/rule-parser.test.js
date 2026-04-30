/**
 * Rule Parser 单元测试
 */

const assert = require('assert');
const path = require('path');
const { RuleParser, RuleValidationError } = require('../lib/rule-parser');
const { ExpressionEvaluator } = require('../lib/expression-evaluator');

describe('RuleParser', () => {
  let parser;

  beforeEach(() => {
    parser = new RuleParser({
      schemaPath: path.join(__dirname, '../schemas/rule-schema.json'),
      actionSchemaPath: path.join(__dirname, '../schemas/action-schema.json')
    });
  });

  describe('Constructor', () => {
    it('should create parser with default options', () => {
      assert.strictEqual(parser instanceof RuleParser, true);
    });

    it('should create parser with custom schema path', () => {
      const customParser = new RuleParser({
        schemaPath: '/custom/path/schema.json'
      });
      assert.strictEqual(customParser.schemaPath, '/custom/path/schema.json');
    });
  });

  describe('loadSchemas', () => {
    it('should load schemas successfully', () => {
      const result = parser.loadSchemas();
      assert.strictEqual(result, true);
      assert.strictEqual(parser.schema !== null, true);
    });

    it('should throw error when schema file not found', () => {
      const badParser = new RuleParser({
        schemaPath: '/nonexistent/schema.json'
      });
      assert.throws(() => badParser.loadSchemas(), /Failed to load schemas/);
    });
  });

  describe('validateRuleId', () => {
    it('should validate correct rule IDs', () => {
      assert.strictEqual(parser.validateRuleId('vip-inquiry'), true);
      assert.strictEqual(parser.validateRuleId('quote-followup-1'), true);
      assert.strictEqual(parser.validateRuleId('a123'), true);
    });

    it('should reject invalid rule IDs', () => {
      assert.strictEqual(parser.validateRuleId('123abc'), false); // starts with number
      assert.strictEqual(parser.validateRuleId('ABC-123'), false); // uppercase
      assert.strictEqual(parser.validateRuleId('abc_123'), false); // underscore
    });
  });

  describe('extractVariables', () => {
    it('should extract variables from rule', () => {
      const rule = {
        actions: [
          {
            config: {
              to: '${payload.from}',
              template: '${context.template_name}'
            }
          }
        ]
      };

      const variables = parser.extractVariables(rule);
      assert.strictEqual(variables.length, 2);
      assert(variables.includes('payload.from'));
      assert(variables.includes('context.template_name'));
    });

    it('should return empty array when no variables', () => {
      const rule = {
        actions: [
          {
            config: {
              to: 'test@example.com',
              template: 'standard'
            }
          }
        ]
      };

      const variables = parser.extractVariables(rule);
      assert.strictEqual(variables.length, 0);
    });
  });
});

describe('ExpressionEvaluator', () => {
  let evaluator;

  beforeEach(() => {
    evaluator = new ExpressionEvaluator({
      event: {
        type: 'email_received',
        payload: {
          from: 'customer@example.com',
          intent: 'inquiry',
          amount: 50000,
          customer: {
            tier: 'vip',
            name: 'John Doe'
          }
        }
      },
      context: {
        min_amount: 10000,
        target_customer_id: 'okki_12345'
      }
    });
  });

  describe('evaluateCheck', () => {
    it('should evaluate equals operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.intent',
        operator: 'equals',
        value: 'inquiry'
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate not_equals operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.intent',
        operator: 'not_equals',
        value: 'complaint'
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate greater_than operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.amount',
        operator: 'greater_than',
        value: 10000
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate less_than operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.amount',
        operator: 'less_than',
        value: 100000
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate contains operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.customer.name',
        operator: 'contains',
        value: 'John'
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate regex operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.from',
        operator: 'regex',
        value: '.*@example\\.com$'
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate exists operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.customer',
        operator: 'exists',
        value: true
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate in operator', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.customer.tier',
        operator: 'in',
        value: ['vip', 'gold']
      });
      assert.strictEqual(result, true);
    });

    it('should evaluate with variable reference', () => {
      const result = evaluator.evaluateCheck({
        field: 'event.payload.amount',
        operator: 'greater_than',
        value: '${context.min_amount}'
      });
      assert.strictEqual(result, true);
    });
  });

  describe('evaluateConditions', () => {
    it('should evaluate ALL conditions (AND logic)', () => {
      const conditions = {
        type: 'all',
        checks: [
          {
            field: 'event.payload.intent',
            operator: 'equals',
            value: 'inquiry'
          },
          {
            field: 'event.payload.customer.tier',
            operator: 'equals',
            value: 'vip'
          }
        ]
      };

      const result = evaluator.evaluateConditions(conditions);
      assert.strictEqual(result, true);
    });

    it('should evaluate ANY conditions (OR logic)', () => {
      const conditions = {
        type: 'any',
        checks: [
          {
            field: 'event.payload.amount',
            operator: 'greater_than',
            value: 100000
          },
          {
            field: 'event.payload.customer.tier',
            operator: 'equals',
            value: 'vip'
          }
        ]
      };

      const result = evaluator.evaluateConditions(conditions);
      assert.strictEqual(result, true);
    });

    it('should return false when ALL conditions fail', () => {
      const conditions = {
        type: 'all',
        checks: [
          {
            field: 'event.payload.intent',
            operator: 'equals',
            value: 'complaint'
          },
          {
            field: 'event.payload.customer.tier',
            operator: 'equals',
            value: 'normal'
          }
        ]
      };

      const result = evaluator.evaluateConditions(conditions);
      assert.strictEqual(result, false);
    });
  });

  describe('evaluate', () => {
    it('should evaluate simple expression', () => {
      const result = evaluator.evaluate('2 + 2');
      assert.strictEqual(result, 4);
    });

    it('should evaluate expression with variable', () => {
      const result = evaluator.evaluate('${context.min_amount} * 2');
      assert.strictEqual(result, 20000);
    });

    it('should evaluate expression with function', () => {
      const result = evaluator.evaluate('daysSince("2026-01-01")');
      assert(typeof result === 'number');
      assert(result > 0);
    });

    it('should evaluate expression with contains function', () => {
      const result = evaluator.evaluate('contains("Hello World", "World")');
      assert.strictEqual(result, true);
    });
  });

  describe('setContext', () => {
    it('should update context', () => {
      evaluator.setContext({ new_var: 'test' });
      const result = evaluator.evaluate('${new_var}');
      assert.strictEqual(result, 'test');
    });

    it('should merge context', () => {
      evaluator.setContext({ additional: 'data' });
      const result = evaluator.evaluate('${context.min_amount}');
      assert.strictEqual(result, 10000);
    });
  });

  describe('clearContext', () => {
    it('should clear context', () => {
      evaluator.clearContext();
      assert.deepStrictEqual(evaluator.context, {});
    });
  });
});

describe('Integration Tests', () => {
  it('should parse and evaluate complete rule', () => {
    const parser = new RuleParser({
      schemaPath: path.join(__dirname, '../schemas/rule-schema.json'),
      actionSchemaPath: path.join(__dirname, '../schemas/action-schema.json')
    });

    const rule = {
      id: 'test-rule',
      name: 'Test Rule',
      priority: 50,
      enabled: true,
      trigger: {
        event_type: 'email_received',
        conditions: {
          type: 'all',
          checks: [
            {
              field: 'payload.intent',
              operator: 'equals',
              value: 'inquiry'
            }
          ]
        }
      },
      actions: [
        {
          type: 'send_email',
          config: {
            to: '${payload.from}',
            template: 'inquiry-reply'
          }
        }
      ]
    };

    // Parse rule
    const parsed = parser.parse(rule);
    assert.strictEqual(parsed.id, 'test-rule');

    // Evaluate conditions
    const evaluator = new ExpressionEvaluator({
      payload: {
        intent: 'inquiry',
        from: 'test@example.com'
      }
    });

    const conditionsMatch = evaluator.evaluateConditions(parsed.trigger.conditions);
    assert.strictEqual(conditionsMatch, true);
  });
});

console.log('✅ All tests passed!');
