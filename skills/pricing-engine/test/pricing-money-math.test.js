const test = require('node:test');
const assert = require('node:assert/strict');

const {
  multiplyMoney,
  sumMoney,
} = require('../scripts/pricing-engine');

test('multiplyMoney rounds customer-facing totals without binary float drift', () => {
  assert.equal(multiplyMoney(2.675, 3), 8.03);
  assert.equal(multiplyMoney(10.075, 1), 10.08);
});

test('multiplyMoney handles large multi-decimal order totals without float drift', () => {
  assert.equal(multiplyMoney(999999.335, 9999), 9998993350.67);
});

test('sumMoney adds customer-facing totals in cents', () => {
  assert.equal(sumMoney([8.03, 10.08, 9998993350.67]), 9998993368.78);
});
