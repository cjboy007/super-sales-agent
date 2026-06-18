const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('customer stages are unique per project and email', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-sales-state-test-'));
  try {
    const dbPath = path.join(tempDir, 'sales-state.db');
    const script = `
      const { SalesState } = require(${JSON.stringify(path.resolve(__dirname, 'sales-state-db.js'))});
      SalesState.upsertCustomer('farreach', 'buyer@example.com', { company: 'Farreach Buyer', stage: 'quoted' });
      SalesState.upsertCustomer('hero-pumps', 'buyer@example.com', { company: 'Hero Buyer', stage: 'sample_sent' });
      const farreach = SalesState.getCustomer('farreach', 'buyer@example.com');
      const hero = SalesState.getCustomer('hero-pumps', 'buyer@example.com');
      console.log(JSON.stringify({ farreach, hero }));
    `;
    const result = spawnSync(process.execPath, ['-e', script], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, SALES_STATE_DB_PATH: dbPath },
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.farreach.company, 'Farreach Buyer');
    assert.equal(parsed.farreach.current_stage, 'quoted');
    assert.equal(parsed.hero.company, 'Hero Buyer');
    assert.equal(parsed.hero.current_stage, 'sample_sent');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
