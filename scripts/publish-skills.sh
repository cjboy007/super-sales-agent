#!/bin/bash
#
# publish-skills.sh - Auto-publish Super Sales Agent skills to ClawHub
#
# Usage: ./publish-skills.sh [--dry-run]
#
# This script scans all skill directories and publishes new/updated skills
# to ClawHub using the clawhub CLI sync command.
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_DIR="$(dirname "$SCRIPT_DIR")/skills"
LOG_FILE="/tmp/clawhub-publish-$(date +%Y%m%d-%H%M%S).log"

echo "═══════════════════════════════════════════════════════════"
echo "🚀 Super Sales Agent - Auto-Publish Skills"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "📂 Skills Directory: $SKILLS_DIR"
echo "📝 Log File: $LOG_FILE"
echo "⏰ Started: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# Check if clawhub CLI is available
if ! command -v clawhub &> /dev/null; then
    echo "❌ Error: clawhub CLI not found. Please install with: npm install -g clawhub"
    exit 1
fi

# Check authentication
echo "🔐 Checking ClawHub authentication..."
if ! clawhub whoami &> /dev/null; then
    echo "❌ Error: Not authenticated with ClawHub. Run 'clawhub login' first."
    exit 1
fi
echo "✅ Authenticated"
echo ""

# List all skill directories
echo "📦 Scanning skills..."
SKILL_DIRS=()
for dir in "$SKILLS_DIR"/*/; do
    if [ -d "$dir" ]; then
        skill_name=$(basename "$dir")
        # Skip if no SKILL.md file
        if [ -f "$dir/SKILL.md" ]; then
            SKILL_DIRS+=("$skill_name")
            echo "   ✓ $skill_name"
        else
            echo "   ⚠ $skill_name (no SKILL.md, skipping)"
        fi
    fi
done

echo ""
echo "📊 Found ${#SKILL_DIRS[@]} valid skills"
echo ""

# Run clawhub sync
DRY_RUN=""
if [ "$1" == "--dry-run" ]; then
    DRY_RUN="--dry-run"
    echo "🔍 DRY RUN MODE - No changes will be made"
    echo ""
fi

echo "🔄 Running clawhub sync..."
echo ""

# Use clawhub sync to publish all skills from this directory only
# --root specifies the exact directory to scan (avoids scanning other OpenClaw skills)
clawhub sync --root "$SKILLS_DIR" --all --bump patch --tags latest $DRY_RUN 2>&1 | tee "$LOG_FILE"

EXIT_CODE=${PIPESTATUS[0]}

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Publish completed successfully!"
else
    echo "⚠️  Publish completed with warnings (exit code: $EXIT_CODE)"
fi
echo "⏰ Finished: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "═══════════════════════════════════════════════════════════"

exit $EXIT_CODE
