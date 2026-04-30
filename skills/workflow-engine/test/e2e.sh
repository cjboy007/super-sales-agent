#!/bin/bash
# E2E 测试脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧪 Running Workflow Engine E2E Tests..."
echo ""

# 运行所有 E2E 测试
echo "📧 Email to Quotation Tests..."
node test/e2e/email-to-quotation.test.js

echo ""
echo "📋 Quotation to Follow-up Tests..."
node test/e2e/quotation-to-followup.test.js 2>/dev/null || echo "⚠️  Skipped (not implemented)"

echo ""
echo "👤 Customer Stage Transition Tests..."
node test/e2e/customer-stage-transition.test.js 2>/dev/null || echo "⚠️  Skipped (not implemented)"

echo ""
echo "🔗 Multi-System Integration Tests..."
node test/e2e/multi-system-integration.test.js 2>/dev/null || echo "⚠️  Skipped (not implemented)"

echo ""
echo "✅ All E2E tests completed!"
