const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

test('farreach reply processor delegates to the shared implementation', () => {
  const source = fs.readFileSync(path.join(repoRoot, 'farreach', 'reply-processor.js'), 'utf8');

  assert.match(source, /require\('\.\.\/shared\/reply-processor'\)/);
  assert.doesNotMatch(source, /IMAP_CLI\s*:/);
  assert.doesNotMatch(source, /skills\/imap-smtp-email\/scripts\/imap\.js/);
  assert.ok(source.split(/\r?\n/).length < 40);
});
