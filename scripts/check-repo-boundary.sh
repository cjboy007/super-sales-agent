#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" ]]; then
  echo "ERROR: not inside a git repository" >&2
  exit 2
fi

cd "$repo_root"

blocked=()

is_blocked_path() {
  local path="$1"

  case "$path" in
    .DS_Store|*/.DS_Store) return 0 ;;
    .cache/*|*/.cache/*) return 0 ;;
    .pytest_cache/*|*/.pytest_cache/*) return 0 ;;
    *__pycache__/*|*/__pycache__/*) return 0 ;;
    *.pyc|*.pyo) return 0 ;;
    *.log|logs/*|*/logs/*) return 0 ;;
    *.db-wal|*.db-shm|*.sqlite-wal|*.sqlite-shm) return 0 ;;
    *.tsbuildinfo) return 0 ;;
    .next/*|*/.next/*) return 0 ;;
    screenshots/*|*/screenshots/*|*__screenshot__*|*.screenshot.png) return 0 ;;
    dashboard-*.png|ssa-*.png) return 0 ;;
    data/intelligence/*) return 0 ;;
    runtime-data/*|ssa-runtime/*|mail/*) return 0 ;;
    scripts/output/*|scripts/test-reports/*) return 0 ;;
    output/*|*/output/*) return 0 ;;
    test-results/*|*/test-results/*) return 0 ;;
    test-logs/*|*/test-logs/*) return 0 ;;
    */cache/*.json|*/cache/*.json.bak) return 0 ;;
    */data/*.json.bak|*/data/*.json.e2e-backup) return 0 ;;
    skills/*/examples/*.html|skills/*/examples/*.pdf|skills/*/examples/*.xlsx) return 0 ;;
    */auto-results/*) return 0 ;;
  esac

  case "$path" in
    data/*.json|data/*.csv|data/*.html|data/*.xlsx|data/*.pdf)
      return 0
      ;;
    hero-pumps/leads/*-scan-*.csv)
      return 0
      ;;
  esac

  return 1
}

while IFS= read -r line; do
  [[ -z "$line" ]] && continue

  status="${line:0:2}"
  path="${line:3}"

  # Rename records look like "old -> new"; check the destination path.
  if [[ "$path" == *" -> "* ]]; then
    path="${path##* -> }"
  fi

  if is_blocked_path "$path"; then
    blocked+=("$status $path")
  fi
done < <(git status --porcelain=v1 -uall --ignored=matching)

if (( ${#blocked[@]} > 0 )); then
  echo "Repo boundary check failed."
  echo
  echo "These files look like generated/runtime data and should live under ~/.ssa, not in the SSA repo:"
  printf '  %s\n' "${blocked[@]}"
  echo
  echo "Recommended locations:"
  echo "  intelligence/news: ~/.ssa/data/intelligence/"
  echo "  mail/IMAP output: ~/.ssa/data/mail/"
  echo "  generated docs:   ~/.ssa/data/documents/"
  echo "  logs:             ~/.ssa/logs/"
  echo "  temp work:        ~/.ssa/tmp/"
  exit 1
fi

echo "Repo boundary check passed."
