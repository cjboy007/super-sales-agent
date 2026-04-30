#!/usr/bin/env python3
"""Fix duplicate signatures in template files."""
import glob, os

DIR = '/Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/hero-pumps/campaign-tracker/templates-premium/'
fixed = 0

for fpath in glob.glob(os.path.join(DIR, '*.md')):
    with open(fpath) as f:
        content = f.read()
    
    # Find the pattern: signature appears twice
    pattern = """Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2400
www.heropumps.com

Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2400
www.heropumps.com"""
    
    replacement = """Best regards,

Jaden Yeung
Sales Manager | Zhejiang Hero Pump Co., Ltd.
sales@heropumps.com
WhatsApp: +86 136 8034 2400
www.heropumps.com"""
    
    if pattern in content:
        content = content.replace(pattern, replacement)
        with open(fpath, 'w') as f:
            f.write(content)
        fixed += 1

print(f"Fixed {fixed} files")
