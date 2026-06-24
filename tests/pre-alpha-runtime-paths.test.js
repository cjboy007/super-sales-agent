const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUNTIME_FILES = [
  'shared/follow-up-engine.js',
  'shared/reply-processor.js',
  'farreach/reply-processor.js',
  'farreach/sales-orchestrator.js',
  'scripts/scan-skills.js',
  'scripts/test-runner.js',
  'scripts/sync-bank-config.sh',
  'hero-pumps/scripts/cron-send.sh',
  'hero-pumps/scripts/regenerate-templates.js',
  'skills/imap-smtp-email/auto-capture.js',
  'skills/imap-smtp-email/kb-retrieval.js',
  'skills/imap-smtp-email/okki-sync.js',
  'skills/imap-smtp-email/scripts/path-utils.js',
  'skills/imap-smtp-email/scripts/smart-send.js',
];

test('runtime scripts do not bake in Wilson-specific absolute workspace paths', () => {
  const offenders = RUNTIME_FILES.filter((relativePath) => {
    const source = fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
    return source.includes('/Users/wilson/.openclaw/workspace') ||
      source.includes('/Users/wilson/.ssa') ||
      source.includes('/Users/wilson/obsidian-vault');
  });

  assert.deepEqual(offenders, []);
});
