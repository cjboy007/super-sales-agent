#!/bin/bash

# Convert HTML to PDF using Chrome/Chromium
# Usage: ./convert-to-pdf.sh <input.html> [output.pdf]

set -e

INPUT_FILE="$1"
OUTPUT_FILE="${2:-${INPUT_FILE%.html}.pdf}"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file not found: $INPUT_FILE"
    exit 1
fi

echo "Converting $INPUT_FILE to $OUTPUT_FILE..."

# Try different Chrome paths
CHROME_PATHS=(
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    "/usr/bin/google-chrome"
    "/usr/bin/chromium-browser"
    "/usr/bin/chromium"
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
)

CHROME=""
for path in "${CHROME_PATHS[@]}"; do
    if [ -f "$path" ] || command -v "$path" &> /dev/null; then
        CHROME="$path"
        break
    fi
done

if [ -z "$CHROME" ]; then
    echo "Error: Chrome/Chromium not found. Please install Google Chrome."
    exit 1
fi

# Convert to PDF
"$CHROME" \
    --headless \
    --disable-gpu \
    --print-to-pdf="$OUTPUT_FILE" \
    --print-to-pdf-no-header \
    --print-to-pdf-no-footer \
    --paper-width=8.27 \
    --paper-height=11.69 \
    --margin-top=0.4 \
    --margin-bottom=0.4 \
    --margin-left=0.4 \
    --margin-right=0.4 \
    "file://$(cd "$(dirname "$INPUT_FILE")" && pwd)/$(basename "$INPUT_FILE")"

if [ -f "$OUTPUT_FILE" ]; then
    echo "✅ PDF created: $OUTPUT_FILE"
    ls -lh "$OUTPUT_FILE"
else
    echo "❌ Failed to create PDF"
    exit 1
fi
