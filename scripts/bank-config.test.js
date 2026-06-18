const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

function writeBankConfig(filePath, bankName) {
  fs.writeFileSync(filePath, JSON.stringify({
    primary: {
      beneficiary: 'Test Company',
      bank_name: bankName,
      account_no: 'TEST-001',
      swift_code: 'TESTSWIFT',
      active: true,
    },
  }, null, 2));
}

test('bank config reloads when the configured file changes', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-bank-config-test-'));
  const bankPath = path.join(tempDir, 'bank-accounts.json');
  const original = process.env.SSA_BANK_ACCOUNTS_PATH;
  try {
    writeBankConfig(bankPath, 'FIRST BANK');
    process.env.SSA_BANK_ACCOUNTS_PATH = bankPath;
    delete require.cache[require.resolve('./bank-config')];
    const bankConfig = require('./bank-config');

    assert.equal(bankConfig.getPrimaryBank().bank_name, 'FIRST BANK');
    await new Promise((resolve) => setTimeout(resolve, 5));
    writeBankConfig(bankPath, 'SECOND BANK');

    assert.equal(bankConfig.getPrimaryBank().bank_name, 'SECOND BANK');
  } finally {
    if (original === undefined) delete process.env.SSA_BANK_ACCOUNTS_PATH;
    else process.env.SSA_BANK_ACCOUNTS_PATH = original;
    delete require.cache[require.resolve('./bank-config')];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
