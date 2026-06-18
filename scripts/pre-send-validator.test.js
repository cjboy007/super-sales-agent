const assert = require('node:assert/strict');
const test = require('node:test');

const { PreSendValidator } = require('./pre-send-validator');

function validDocData(email) {
  return {
    customer: {
      company_name: 'Acme Components GmbH',
      contact: 'Anna Buyer',
      email,
      address: 'Main Strasse 1, Berlin',
    },
    quotation: {
      date: '2026-01-01',
      valid_until: '2099-01-01',
    },
    bank_info: {},
    products: [
      {
        description: 'HDMI cable assembly',
        unit_price: 1.25,
        quantity: 1000,
      },
    ],
  };
}

test('recipient validation rejects different contacts at the same domain', () => {
  const validator = new PreSendValidator();
  validator._validateRecipientEmail(validDocData('alice@acme.example'), 'bob@acme.example');

  assert.match(validator.errors.join('\n'), /邮箱不匹配|email/i);
});

test('recipient validation accepts the exact customer email case-insensitively', () => {
  const validator = new PreSendValidator();
  validator._validateRecipientEmail(validDocData('Alice@Acme.Example'), 'alice@acme.example');

  assert.deepEqual(validator.errors, []);
});
