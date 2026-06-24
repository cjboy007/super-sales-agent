#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec >> /tmp/hero-pumps-send.log 2>&1
echo "=== $(date) ==="
node scripts/smtp-send-batch-v2.js --limit 20
