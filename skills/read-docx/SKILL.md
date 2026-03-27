---
name: read-docx
description: Read Word DOCX files and extract text content with proper encoding handling.
metadata: {"clawdbot":{"emoji":"📘","os":["linux","darwin","win32"]}}
---

## Usage

### CLI

```bash
# Read single file or wildcard pattern (run from skill directory)
python3 read-docx.py "path/*.docx"

# Verbose mode
python3 read-docx.py "exams/*.docx" --verbose

# Examples
python3 read-docx.py "exams/HDMI*.docx"
python3 read-docx.py "/path/to/document.docx" -v
```

### Python Code

```python
from docx import Document
import glob
import os

# Read DOCX files (use glob to handle Chinese filename encoding issues)
for f in glob.glob("*.docx"):
    try:
        doc = Document(f)
        # Fast extraction using generator
        text = '\n'.join(p.text for p in doc.paragraphs if p.text.strip())
        
        # Alternative: extract from runs directly (faster for large docs)
        # text = '\n'.join(run.text for para in doc.paragraphs for run in para.runs if run.text.strip())
        
        print(f"--- {os.path.basename(f)} ---")
        print(text)
    except Exception as e:
        print(f"Failed to process {f}: {e}")
```

## Why Not `read` Tool?

- ❌ OpenClaw's `read` tool only supports: text files, images (jpg/png/gif/webp)
- ❌ DOCX is a ZIP archive containing XML - needs specialized parsing
- ✅ `python-docx` handles DOCX structure properly

## Important Notes

### Chinese Filename Encoding

Chinese filenames may have encoding issues when accessed directly. **Always use `glob` wildcards:**

```python
# ✅ Good - glob handles encoding
import glob
for f in glob.glob("考试*.docx"):
    doc = Document(f)

# ❌ Bad - may fail with Chinese filenames
doc = Document("考试.docx")  # Might not find the file
```

### Dependencies

```bash
# Already installed
pip3 install python-docx
```

### Performance Tips

1. **Use wildcards** - Avoids encoding issues with Chinese filenames
2. **Generator expression** - `'\n'.join(p.text for p in ...)` avoids intermediate list
3. **Filter empty paragraphs** - `if p.text.strip()` reduces output noise
4. **For large docs** - Extract from runs directly (see code above)

## File Structure

```
read-docx/
├── SKILL.md          # This file
└── read-docx.py      # CLI script
```
