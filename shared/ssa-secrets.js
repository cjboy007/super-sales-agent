'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_PROFILE = 'farreach';
const ENV_KEYS = new Set([
  'EMAIL_PROFILE',
  'SSA_PROFILE',
  'SSA_WORKSPACE_ID',
  'SSA_ENABLE_REAL_IMAP',
  'SSA_ENABLE_REAL_EMAIL_SEND',
  'SSA_ALLOW_UNVERIFIED_EMAIL_SEND',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_SECURE',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'SMTP_SENDER_NAME',
  'SMTP_RATE_LIMIT',
  'SMTP_REJECT_UNAUTHORIZED',
  'IMAP_HOST',
  'IMAP_PORT',
  'IMAP_USER',
  'IMAP_PASS',
  'IMAP_TLS',
  'IMAP_SECURE',
  'IMAP_REJECT_UNAUTHORIZED',
  'IMAP_MAILBOX',
  'ALLOWED_READ_DIRS',
  'ALLOWED_WRITE_DIRS',
  'AI_API_KEY',
  'AI_MODEL',
  'DASHSCOPE_API_KEY',
  'DASHSCOPE_CHAT_URL',
  'DISCORD_BOT_TOKEN',
  'FEISHU_APP_ID',
  'FEISHU_APP_SECRET',
  'FEISHU_CHAT_ID',
  'IRON_INBOX_URL',
  'LLM_API_KEY',
  'LLM_API_URL',
  'LLM_MODEL',
  'OKKI_API_KEY',
  'OKKI_CLIENT_ID',
  'OKKI_CLIENT_SECRET',
  'OKKI_INTEGRATION_MODE',
]);

function resolveHome(input) {
  if (!input) return input;
  return String(input).replace(/^~(?=$|\/)/, os.homedir());
}

function defaultConfigHome() {
  return path.join(os.homedir(), '.config', 'super-sales-agent');
}

function defaultSecretsDir(env = process.env) {
  if (env.SSA_SECRETS_DIR) return path.resolve(resolveHome(env.SSA_SECRETS_DIR));
  const configHome = env.SSA_CONFIG_HOME
    ? path.resolve(resolveHome(env.SSA_CONFIG_HOME))
    : defaultConfigHome();
  return path.join(configHome, 'profiles');
}

function sanitizeProfile(profile) {
  const value = String(profile || DEFAULT_PROFILE).trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Invalid SSA profile name: ${value}`);
  }
  return value;
}

function profileFromEnv(env = process.env, fallback = DEFAULT_PROFILE) {
  return sanitizeProfile(env.SSA_PROFILE || env.EMAIL_PROFILE || env.SSA_WORKSPACE_ID || fallback);
}

function parseEnvFile(filePath) {
  const parsed = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function isInside(parentDir, childPath) {
  const parent = path.resolve(parentDir);
  const child = path.resolve(childPath);
  return child === parent || child.startsWith(parent + path.sep);
}

function realEmailSendEnabled(env = process.env) {
  return env.SSA_ENABLE_REAL_EMAIL_SEND === 'true' || env.SSA_ENABLE_REAL_EMAIL_SEND === '1';
}

function assertNotRepoLocal(filePath, repoRoot, env = process.env) {
  if (!filePath || !repoRoot || !realEmailSendEnabled(env)) return;
  if (isInside(repoRoot, filePath)) {
    throw new Error(
      `Refusing to load repo-local credentials while real email sending is enabled: ${filePath}. ` +
      'Move this profile to ~/.config/super-sales-agent/profiles/<profile>.env or set SSA_SECRETS_DIR.'
    );
  }
}

function applyEnv(values, env = process.env, override = false) {
  for (const [key, value] of Object.entries(values)) {
    if (!ENV_KEYS.has(key)) continue;
    if (override || env[key] === undefined) env[key] = value;
  }
}

function loadSsaProfileEnv(options = {}) {
  const env = options.env || process.env;
  const repoRoot = options.repoRoot
    ? path.resolve(options.repoRoot)
    : path.resolve(__dirname, '..');
  const profile = options.profile
    ? sanitizeProfile(options.profile)
    : profileFromEnv(env, DEFAULT_PROFILE);
  const secretsDir = options.secretsDir
    ? path.resolve(resolveHome(options.secretsDir))
    : defaultSecretsDir(env);
  const externalPath = options.profilePath
    ? path.resolve(resolveHome(options.profilePath))
    : path.join(secretsDir, `${profile}.env`);

  if (fs.existsSync(externalPath)) {
    assertNotRepoLocal(externalPath, repoRoot, env);
    applyEnv(parseEnvFile(externalPath), env, Boolean(options.override));
    env.SSA_PROFILE = env.SSA_PROFILE || profile;
    env.EMAIL_PROFILE = env.EMAIL_PROFILE || profile;
    return { loaded: true, profile, sourcePath: externalPath, source: 'external-profile' };
  }

  if (options.localEnvPath && fs.existsSync(options.localEnvPath)) {
    const localPath = path.resolve(options.localEnvPath);
    assertNotRepoLocal(localPath, repoRoot, env);
    applyEnv(parseEnvFile(localPath), env, Boolean(options.override));
    env.SSA_PROFILE = env.SSA_PROFILE || profile;
    env.EMAIL_PROFILE = env.EMAIL_PROFILE || profile;
    return { loaded: true, profile, sourcePath: localPath, source: 'local-fallback' };
  }

  env.SSA_PROFILE = env.SSA_PROFILE || profile;
  env.EMAIL_PROFILE = env.EMAIL_PROFILE || profile;
  return { loaded: false, profile, sourcePath: externalPath, source: 'environment' };
}

function requireSmtpEnv(env = process.env) {
  const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing SMTP configuration: ${missing.join(', ')}. ` +
      'Set platform environment variables or create ~/.config/super-sales-agent/profiles/<profile>.env.'
    );
  }
}

function requireImapEnv(env = process.env) {
  const missing = ['IMAP_HOST', 'IMAP_USER', 'IMAP_PASS'].filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing IMAP configuration: ${missing.join(', ')}. ` +
      'Set platform environment variables or create ~/.config/super-sales-agent/profiles/<profile>.env.'
    );
  }
}

module.exports = {
  DEFAULT_PROFILE,
  defaultConfigHome,
  defaultSecretsDir,
  loadSsaEmailEnv: loadSsaProfileEnv,
  loadSsaProfileEnv,
  parseEnvFile,
  requireImapEnv,
  requireSmtpEnv,
  sanitizeProfile,
};
