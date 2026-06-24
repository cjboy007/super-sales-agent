const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const pricingPath = path.resolve(__dirname, '../scripts/pricing-engine.js');
const exchangeRatePath = path.resolve(__dirname, '../scripts/exchange-rate.js');

function loadPricingWithExchangeRateStub(stub) {
  delete require.cache[pricingPath];
  require.cache[exchangeRatePath] = {
    id: exchangeRatePath,
    filename: exchangeRatePath,
    loaded: true,
    exports: stub,
  };
  return require(pricingPath);
}

test('override pricing propagates stale exchange-rate warning', async () => {
  const warning = 'Using stale exchange-rate cache from 2026-06-20 because the API failed';
  const pricing = loadPricingWithExchangeRateStub({
    getRateWithMeta: async () => ({
      rate: 7.25,
      from: 'USD',
      to: 'CNY',
      stale: true,
      fetched_at: '2026-06-20T00:00:00.000Z',
      warning,
    }),
    convertAmount: async () => {
      throw new Error('legacy convertAmount should not be used');
    },
  });

  const result = await pricing.calculatePrice(
    'HDMI-2.1-8K-2M',
    1000,
    'B',
    'CNY',
    { customerId: 'CUST-ACME-001' }
  );

  assert.equal(result.pricingMethod, 'override');
  assert.equal(result.breakdown.exchangeRateStale, true);
  assert.equal(result.breakdown.exchangeRateWarning, warning);
  assert.deepEqual(result.warnings, [warning]);
});
