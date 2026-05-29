#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/../.." && pwd)"
source_mode="${SSA_INBOX_SOURCE:-himalaya}"

exec node "$repo_root/scripts/workers/inbox-monitor.mjs" --workspace hero-pumps --source "$source_mode" --himalaya-account heropumps --quiet-empty "$@"
