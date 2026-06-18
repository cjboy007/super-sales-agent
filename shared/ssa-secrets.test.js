const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { loadSsaProfileEnv } = require('./ssa-secrets');

const REPO_ROOT = path.resolve(__dirname, '..');

function withCleanEnv(fn) {
  return () => {
    const keys = [
      'SSA_CONFIG_HOME',
      'SSA_SECRETS_DIR',
      'SSA_PROFILE',
      'EMAIL_PROFILE',
      'SSA_WORKSPACE_ID',
      'SSA_ENABLE_REAL_EMAIL_SEND',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'IMAP_HOST',
      'IMAP_PASS',
    ];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    for (const key of keys) delete process.env[key];
    try {
      fn();
    } finally {
      for (const key of keys) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  };
}

test('loads credentials from an external SSA profile directory', withCleanEnv(() => {
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-config-'));
  const profilesDir = path.join(configHome, 'profiles');
  fs.mkdirSync(profilesDir, { recursive: true });
  fs.writeFileSync(path.join(profilesDir, 'hero-pumps.env'), [
    'SMTP_HOST=smtp.example.test',
    'SMTP_USER=sales@example.test',
    'SMTP_PASS=fake-secret',
    'IMAP_HOST=imap.example.test',
    'IMAP_PASS=fake-secret',
  ].join('\n'));

  process.env.SSA_CONFIG_HOME = configHome;
  const result = loadSsaProfileEnv({ profile: 'hero-pumps', repoRoot: REPO_ROOT });

  assert.equal(result.loaded, true);
  assert.equal(result.profile, 'hero-pumps');
  assert.equal(result.sourcePath, path.join(profilesDir, 'hero-pumps.env'));
  assert.equal(process.env.SMTP_HOST, 'smtp.example.test');
  assert.equal(process.env.SMTP_PASS, 'fake-secret');

  fs.rmSync(configHome, { recursive: true, force: true });
}));

test('rejects repo-local credential fallback when real sending is enabled', withCleanEnv(() => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-repo-'));
  const repoProfile = path.join(tempRoot, 'hero-pumps', '.env');
  const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ssa-config-empty-'));
  fs.mkdirSync(path.dirname(repoProfile), { recursive: true });
  fs.writeFileSync(repoProfile, 'SMTP_HOST=smtp.example.test\nSMTP_USER=sales@example.test\nSMTP_PASS=fake-secret\n');

  process.env.SSA_CONFIG_HOME = configHome;
  process.env.SSA_ENABLE_REAL_EMAIL_SEND = 'true';

  assert.throws(
    () => loadSsaProfileEnv({ repoRoot: tempRoot, localEnvPath: repoProfile, profile: 'hero-pumps' }),
    /Refusing to load repo-local credentials/
  );

  fs.rmSync(configHome, { recursive: true, force: true });
  fs.rmSync(tempRoot, { recursive: true, force: true });
}));
