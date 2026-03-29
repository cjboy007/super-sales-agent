#!/usr/bin/env node

/**
 * Temporary File Management Module
 * Unified temp file creation, tracking, and cleanup.
 * 
 * Usage:
 *   const temp = require('../lib/temp');
 *   
 *   // Create temp directory
 *   const tempDir = temp.createTempDir('forwards');
 *   
 *   // Track files for cleanup
 *   const trackedFiles = [];
 *   trackedFiles.push(temp.trackFile(filePath));
 *   
 *   // Cleanup all tracked files
 *   temp.cleanupTempFiles(trackedFiles);
 */

const path = require('path');
const fs = require('fs');

// Base temp directory
const TEMP_BASE = path.resolve(__dirname, '../temp');

/**
 * Ensure temp base directory exists
 */
function ensureTempBase() {
  if (!fs.existsSync(TEMP_BASE)) {
    fs.mkdirSync(TEMP_BASE, { recursive: true });
  }
}

/**
 * Create a temp subdirectory for a specific purpose
 * @param {string} purpose - Purpose name (e.g., 'forwards', 'imports', 'exports')
 * @returns {string} Path to the temp directory
 */
function createTempDir(purpose) {
  ensureTempBase();
  const tempDir = path.join(TEMP_BASE, purpose);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Get temp directory path without creating it
 * @param {string} purpose - Purpose name
 * @returns {string} Path to the temp directory
 */
function getTempDir(purpose) {
  return path.join(TEMP_BASE, purpose);
}

/**
 * Track a file for later cleanup
 * @param {string} filePath - File path to track
 * @returns {Object} Tracked file object
 */
function trackFile(filePath) {
  return {
    path: filePath,
    tracked_at: new Date().toISOString(),
  };
}

/**
 * Cleanup tracked temporary files
 * @param {Array} files - Array of file paths or tracked file objects
 * @param {Object} options - Cleanup options
 * @param {boolean} options.verbose - Log cleanup actions (default: false)
 * @returns {Object} Cleanup result
 */
function cleanupTempFiles(files, options = {}) {
  const { verbose = false } = options;
  const results = {
    cleaned: 0,
    failed: 0,
    errors: [],
  };

  if (!files || files.length === 0) {
    return results;
  }

  for (const file of files) {
    const filePath = typeof file === 'string' ? file : file.path;
    
    if (!filePath) {
      continue;
    }

    // Safety: only clean files within temp directory
    if (!filePath.startsWith(TEMP_BASE + path.sep)) {
      if (verbose) {
        console.error(`⚠️  Skipping non-temp file: ${filePath}`);
      }
      continue;
    }

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        results.cleaned++;
        if (verbose) {
          console.error(`🗑️  Cleaned: ${filePath}`);
        }
      }
    } catch (err) {
      results.failed++;
      results.errors.push({
        path: filePath,
        error: err.message,
      });
      if (verbose) {
        console.error(`⚠️  Failed to delete ${filePath}: ${err.message}`);
      }
    }
  }

  return results;
}

/**
 * Cleanup entire temp subdirectory
 * @param {string} purpose - Purpose name
 * @param {Object} options - Cleanup options
 * @returns {Object} Cleanup result
 */
function cleanupTempDir(purpose, options = {}) {
  const { verbose = false, recursive = true } = options;
  const tempDir = getTempDir(purpose);

  if (!fs.existsSync(tempDir)) {
    return {
      cleaned: 0,
      failed: 0,
      errors: [],
      message: `Temp directory does not exist: ${purpose}`,
    };
  }

  const results = {
    cleaned: 0,
    failed: 0,
    errors: [],
  };

  try {
    const entries = fs.readdirSync(tempDir);
    
    for (const entry of entries) {
      const entryPath = path.join(tempDir, entry);
      
      try {
        if (recursive && fs.statSync(entryPath).isDirectory()) {
          fs.rmSync(entryPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(entryPath);
        }
        results.cleaned++;
        if (verbose) {
          console.error(`🗑️  Cleaned: ${entryPath}`);
        }
      } catch (err) {
        results.failed++;
        results.errors.push({
          path: entryPath,
          error: err.message,
        });
      }
    }

    // Optionally remove the directory itself
    if (recursive && results.failed === 0) {
      try {
        fs.rmdirSync(tempDir);
      } catch (err) {
        // Ignore if directory not empty
      }
    }
  } catch (err) {
    results.errors.push({
      path: tempDir,
      error: err.message,
    });
  }

  return results;
}

/**
 * Create draft attachment directory (persistent storage for draft attachments)
 * @param {string} draftId - Draft ID
 * @returns {string} Path to draft attachments directory
 */
function createDraftAttachmentsDir(draftId) {
  const draftsDir = path.resolve(__dirname, '../drafts');
  const draftAttachmentsDir = path.join(draftsDir, draftId, 'attachments');
  
  if (!fs.existsSync(draftAttachmentsDir)) {
    fs.mkdirSync(draftAttachmentsDir, { recursive: true });
  }
  
  return draftAttachmentsDir;
}

/**
 * Move attachment from temp to draft attachments directory
 * @param {string} tempPath - Source temp file path
 * @param {string} draftId - Target draft ID
 * @param {string} filename - Filename to preserve
 * @returns {string} New file path in draft attachments directory
 */
function moveAttachmentToDraft(tempPath, draftId, filename) {
  const draftAttachmentsDir = createDraftAttachmentsDir(draftId);
  const newPath = path.join(draftAttachmentsDir, filename);
  
  if (fs.existsSync(tempPath)) {
    fs.copyFileSync(tempPath, newPath);
  }
  
  return newPath;
}

/**
 * Cleanup draft attachments directory
 * @param {string} draftId - Draft ID
 * @returns {Object} Cleanup result
 */
function cleanupDraftAttachments(draftId) {
  const draftsDir = path.resolve(__dirname, '../drafts');
  const draftAttachmentsDir = path.join(draftsDir, draftId, 'attachments');
  
  if (!fs.existsSync(draftAttachmentsDir)) {
    return {
      cleaned: 0,
      failed: 0,
      errors: [],
      message: 'Draft attachments directory does not exist',
    };
  }
  
  return cleanupTempDir(path.join(draftId, 'attachments'), { verbose: false });
}

module.exports = {
  TEMP_BASE,
  createTempDir,
  getTempDir,
  trackFile,
  cleanupTempFiles,
  cleanupTempDir,
  createDraftAttachmentsDir,
  moveAttachmentToDraft,
  cleanupDraftAttachments,
};
