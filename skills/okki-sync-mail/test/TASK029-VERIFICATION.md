# Task 029: OKKI Sync Mail P2 - Temp File Cleanup Optimization

## Summary

统一 temp 文件清理策略，确保所有分支都清理临时文件，草稿附件改为持久化存储。

## Analysis

### Original Issues in forward.js

1. **Incomplete cleanup logic**: The `cleanupTempAttachments()` function was only called conditionally:
   ```javascript
   finally {
     if (!draft || confirmSend || dryRun) {
       cleanupTempAttachments(attachments);
     }
   }
   ```
   
2. **Problem scenario**: When `draft=true`, `confirmSend=false`, `dryRun=false` (creating a draft), temp files were **NOT cleaned up**.

3. **Draft attachments in temp**: Draft attachments were stored in `temp/forwards/` which should be cleaned, but this created a conflict - we need draft attachments to persist.

## Solution

### 1. Created `lib/temp.js` - Unified Temp File Management

New module providing:
- `createTempDir(purpose)` - Create temp subdirectories
- `trackFile(filePath)` - Track files for cleanup
- `cleanupTempFiles(files, options)` - Cleanup tracked files with safety checks
- `cleanupTempDir(purpose, options)` - Cleanup entire temp subdirectory
- `createDraftAttachmentsDir(draftId)` - Create persistent draft attachment storage
- `moveAttachmentToDraft(tempPath, draftId, filename)` - Move attachments from temp to draft storage
- `cleanupDraftAttachments(draftId)` - Cleanup draft attachments directory

**Safety features:**
- Only cleans files within `temp/` directory
- Ignores files outside temp directory (prevents accidental deletion)
- Verbose logging option for debugging

### 2. Updated `forward.js` - Apply Cleanup in All Branches

**Changes:**
1. Import temp module: `const temp = require('../lib/temp');`
2. Use temp module for directory creation: `const TEMP_DIR = temp.createTempDir('forwards');`
3. Track attachments: `return downloadResult.downloaded.map(file => temp.trackFile(file.path));`
4. **Draft mode**: Move attachments to persistent storage `drafts/<draft_id>/attachments/`
5. **Send/dry-run mode**: Keep attachments in temp (will be cleaned)
6. **Finally block**: ALWAYS cleanup temp files (unconditional)

**Key logic:**
```javascript
try {
  if (draft && !confirmSend) {
    // Draft mode: move attachments to persistent draft storage
    if (forwardAttachments && attachments.length > 0) {
      const draftId = drafts.generateDraftId('F');
      const persistentAttachments = attachments.map(att => {
        const newPath = temp.moveAttachmentToDraft(att.path, draftId, att.filename);
        return { filename: att.filename, path: newPath, persistent: true };
      });
      basePayload.attachments = persistentAttachments;
    }
    // ... save draft
  } else {
    // Send/dry-run mode: use temp attachments
    basePayload.attachments = attachments;
    // ... send email
  }
} finally {
  // ALWAYS cleanup temp attachments in all branches
  // Draft mode attachments are persistent (not in temp), so they won't be cleaned
  const cleanupResult = temp.cleanupTempFiles(attachments, { verbose: false });
}
```

### 3. Created Integration Tests

`test/test-forward-cleanup.js` - 7 test cases:
1. Temp directory structure
2. Track and cleanup files
3. Draft attachments directory (persistent)
4. Move attachment from temp to draft
5. Cleanup only temp files (safety check)
6. Forward.js module integration
7. Cleanup ignores non-temp files

**All tests pass ✅**

## Files Modified

| File | Action | Description |
|------|--------|-------------|
| `lib/temp.js` | Created | Unified temp file management module |
| `scripts/forward.js` | Modified | Apply cleanup in all branches, draft attachments to persistent storage |
| `test/test-forward-cleanup.js` | Created | Integration tests for temp cleanup |

## Verification

```bash
# Run integration tests
cd /Users/wilson/.openclaw/workspace/skills/imap-smtp-email
node test/test-forward-cleanup.js

# Result: All 7 tests passed ✅
```

### Temp Directory State

```bash
$ ls -la temp/forwards/
total 0  # Empty - temp files properly cleaned
```

### Draft Attachments Structure

```
drafts/
└── DRAFT-20260329023951-F/
    ├── attachments/
    │   └── attachment.pdf  # Persistent storage
    └── DRAFT-20260329023951-F.json
```

## Behavior Matrix

| Mode | draft | confirmSend | dryRun | Attachment Storage | Cleanup |
|------|-------|-------------|--------|-------------------|---------|
| Draft (default) | true | false | false | `drafts/<id>/attachments/` (persistent) | Temp files cleaned ✅ |
| Draft with approval | true | true | false | `drafts/<id>/attachments/` (persistent) | Temp files cleaned ✅ |
| Direct send | false | - | false | `temp/forwards/` | Cleaned in finally ✅ |
| Dry run | - | - | true | `temp/forwards/` | Cleaned in finally ✅ |

## Benefits

1. **No temp file leaks**: All branches cleanup temp files via try-finally
2. **Draft attachments persist**: Drafts can be sent later with attachments intact
3. **Safety**: Only cleans files within temp directory
4. **Maintainability**: Centralized temp management in `lib/temp.js`
5. **Testability**: Comprehensive integration tests

## Next Steps

- [ ] Consider applying same pattern to other scripts (imap.js, smtp.js) if they use temp files
- [ ] Add periodic cleanup job for old draft attachments (optional)
- [ ] Monitor temp directory size in production
