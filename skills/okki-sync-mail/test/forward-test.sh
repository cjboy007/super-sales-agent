#!/bin/bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(dirname "$SCRIPT_DIR")"

cd "$SKILL_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "📧 Forward Command Test Suite"
echo "═══════════════════════════════════════════════════════════"

echo "✅ Test 1: Forward module unit tests"
node test/test-forward.js

echo ""
echo "✅ Test 2: Missing --message-id parameter (should fail)"
if node scripts/smtp.js forward --to "test@example.com" 2>&1 | grep -q "Missing required parameter"; then
    echo "   ✅ Correctly reports missing --message-id"
else
    echo "   ❌ Failed to report missing --message-id"
    exit 1
fi

echo ""
echo "✅ Test 3: Missing --to parameter (should fail)"
if node scripts/smtp.js forward --message-id 12345 2>&1 | grep -q "Missing required parameter"; then
    echo "   ✅ Correctly reports missing --to"
else
    echo "   ❌ Failed to report missing --to"
    exit 1
fi

echo ""
echo "✅ Test 4: Global help includes forward"
if node scripts/smtp.js -h 2>&1 | grep -q "forward"; then
    echo "   ✅ Forward command is listed"
else
    echo "   ❌ Forward command not listed"
    exit 1
fi

echo ""
echo "✅ Test 5: Forward help mentions draft behavior"
if node scripts/smtp.js forward -h 2>&1 | grep -q -- "--confirm-send"; then
    echo "   ✅ Forward help mentions direct send flag"
else
    echo "   ❌ Forward help missing --confirm-send"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "✅ All forward tests passed!"
echo "═══════════════════════════════════════════════════════════"
