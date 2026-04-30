#!/bin/bash
cd /Users/wilson/.openclaw/workspace/monorepo/super-sales-agent/hero-pumps
exec >> /tmp/hero-pumps-send.log 2>&1
echo "=== $(date) ==="
node scripts/smtp-send-batch-v2.js --limit 20
