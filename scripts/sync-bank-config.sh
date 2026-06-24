#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${SSA_BANK_ACCOUNTS_PATH:-"$REPO_ROOT/config/bank-accounts.json"}"
TARGET="$REPO_ROOT/skills/quotation-workflow/config/bank-accounts.json"

if [[ ! -f "$SOURCE" ]]; then
  echo "Bank config not found: $SOURCE" >&2
  exit 1
fi

mkdir -p "$(dirname "$TARGET")"
cp "$SOURCE" "$TARGET"
echo "Synced bank config to $TARGET"
