#!/usr/bin/env node

/**
 * Path Validation Utilities
 * Centralized path validation for read and write operations.
 * Prevents arbitrary file access by enforcing directory allowlists.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Check .env configuration and warn about missing/placeholder values
 */
function checkEnvConfiguration() {
  const warnings = [];
  const errors = [];
  
  // Check SMTP configuration
  if (!process.env.SMTP_HOST) {
    errors.push('SMTP_HOST is not set in .env');
  }
  if (!process.env.SMTP_USER) {
    errors.push('SMTP_USER is not set in .env');
  }
  if (!process.env.SMTP_PASS || process.env.SMTP_PASS === 'your_smtp_password_here') {
    errors.push('SMTP_PASS is not configured. Please set your SMTP password/authorization code in .env');
  }
  
  // Check IMAP configuration (optional, only needed for --reply-to)
  if (!process.env.IMAP_HOST) {
    warnings.push('IMAP_HOST is not set - --reply-to feature will not work');
  }
  if (!process.env.IMAP_USER) {
    warnings.push('IMAP_USER is not set - --reply-to feature will not work');
  }
  if (!process.env.IMAP_PASS || process.env.IMAP_PASS === 'your_imap_password_here') {
    warnings.push('IMAP_PASS is not configured - --reply-to feature will not work');
  }
  
  // Check sender name configuration
  if (!process.env.SMTP_SENDER_NAME) {
    warnings.push('SMTP_SENDER_NAME is not set - signature will use default name');
  }
  
  // Print warnings
  if (warnings.length > 0) {
    console.error('\n⚠️  Configuration Warnings:');
    warnings.forEach(w => console.error(`   - ${w}`));
    console.error('');
  }
  
  // Throw errors
  if (errors.length > 0) {
    console.error('\n❌ Configuration Errors:');
    errors.forEach(e => console.error(`   - ${e}`));
    console.error('\n📝 To fix:');
    console.error('   1. Edit .env file: vi /Users/wilson/.openclaw/workspace/skills/imap-smtp-email/.env');
    console.error('   2. Set your SMTP password/authorization code');
    console.error('   3. (Optional) Set IMAP credentials for --reply-to feature');
    console.error('   4. (Optional) Set SMTP_SENDER_NAME for signature');
    console.error('\n💡 Example .env:');
    console.error('   SMTP_PASS=your_real_password_here');
    console.error('   IMAP_PASS=your_real_password_here');
    console.error('   SMTP_SENDER_NAME=Your Name');
    console.error('');
    throw new Error('SMTP configuration is incomplete. Please check .env file.');
  }
}

/**
 * Validate that a path is within allowed directories
 * @param {string} inputPath - The path to validate
 * @param {string} envVarName - Environment variable name containing allowed dirs (default: ALLOWED_READ_DIRS)
 * @param {string} operationType - 'read' or 'write' for error messages
 * @returns {string} Resolved real path
 * @throws {Error} If path is outside allowed directories
 */
function validatePath(inputPath, envVarName = 'ALLOWED_READ_DIRS', operationType = 'read') {
  const resolvedPath = path.resolve(inputPath.replace(/^~/, os.homedir()));
  
  // Get real path if file exists (for read operations)
  let realPath = resolvedPath;
  if (operationType === 'read' && fs.existsSync(inputPath)) {
    try {
      realPath = fs.realpathSync(inputPath);
    } catch {
      // If realpath fails, use resolved path
      realPath = resolvedPath;
    }
  }

  const allowedDirsStr = process.env[envVarName];
  if (!allowedDirsStr) {
    throw new Error(`${envVarName} not set in .env. ${operationType.charAt(0).toUpperCase() + operationType.slice(1)} operations are disabled.`);
  }

  const allowedDirs = allowedDirsStr.split(',').map(d =>
    path.resolve(d.trim().replace(/^~/, os.homedir()))
  );

  const allowed = allowedDirs.some(dir =>
    realPath === dir || realPath.startsWith(dir + path.sep)
  );

  if (!allowed) {
    throw new Error(
      `Access denied: '${inputPath}' is outside allowed ${operationType} directories. ` +
      `Allowed: ${allowedDirs.join(', ')}`
    );
  }

  return realPath;
}

/**
 * Validate read path (existing files)
 * @param {string} inputPath - Path to validate
 * @returns {string} Resolved real path
 */
function validateReadPath(inputPath) {
  return validatePath(inputPath, 'ALLOWED_READ_DIRS', 'read');
}

/**
 * Validate write path (directories for writing)
 * @param {string} dirPath - Directory path to validate
 * @returns {string} Resolved path
 */
function validateWritePath(dirPath) {
  return validatePath(dirPath, 'ALLOWED_WRITE_DIRS', 'write');
}

/**
 * Validate file path for attachment operations
 * Ensures attachment is saved within allowed directory
 * @param {string} filePath - File path to validate
 * @param {string} allowedSubdir - Expected subdirectory (e.g., 'mail-attachments')
 * @returns {string} Resolved path
 */
function validateAttachmentPath(filePath, allowedSubdir = 'mail-attachments') {
  const resolved = validateWritePath(filePath);
  
  // Additional check: ensure it's in the expected subdirectory
  const workspaceDir = path.resolve('/Users/wilson/.openclaw/workspace');
  const expectedDir = path.join(workspaceDir, allowedSubdir);
  
  if (!resolved.startsWith(expectedDir + path.sep) && resolved !== expectedDir) {
    throw new Error(
      `Attachment path must be within ${expectedDir}/. ` +
      `Got: ${resolved}`
    );
  }
  
  return resolved;
}

module.exports = {
  checkEnvConfiguration,
  validatePath,
  validateReadPath,
  validateWritePath,
  validateAttachmentPath,
};
