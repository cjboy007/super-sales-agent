#!/usr/bin/env bash
set -euo pipefail

apps_dir="${SSA_APPS_DIR:-/home/ssa-deploy/apps}"
current_link="${SSA_CURRENT_LINK:-$apps_dir/super-sales-agent-current}"
pm2_app="${SSA_PM2_APP:-ssa-closed-alpha-web}"
health_url="${SSA_HEALTH_URL:-http://127.0.0.1:3210/health}"
release_tarball="${SSA_RELEASE_TARBALL:?SSA_RELEASE_TARBALL is required}"
release_name="${SSA_RELEASE_NAME:-ssa-$(date -u +%Y%m%d%H%M%S)-github}"
release_dir="$apps_dir/$release_name"
keep_releases="${SSA_KEEP_RELEASES:-6}"

log() {
  printf '[deploy] %s\n' "$*"
}

require_file() {
  if [ ! -f "$1" ]; then
    printf 'Required file not found: %s\n' "$1" >&2
    exit 1
  fi
}

require_file "$release_tarball"
mkdir -p "$apps_dir"

if [ -e "$release_dir" ]; then
  printf 'Release directory already exists: %s\n' "$release_dir" >&2
  exit 1
fi

previous_target=""
if [ -L "$current_link" ]; then
  previous_target="$(readlink -f "$current_link")"
fi

log "extracting $release_name"
mkdir -p "$release_dir"
tar -xzf "$release_tarball" -C "$release_dir"

require_file "$release_dir/web-frontend/package.json"
require_file "$release_dir/web-frontend/.next/standalone/server.js"
require_file "$release_dir/web-frontend/.next/standalone/.next/BUILD_ID"

tmp_link="$current_link.tmp"
ln -sfn "$release_dir" "$tmp_link"
mv -Tf "$tmp_link" "$current_link"

log "restarting $pm2_app"
if ! pm2 describe "$pm2_app" >/dev/null 2>&1; then
  printf 'PM2 app not found: %s\n' "$pm2_app" >&2
  if [ -n "$previous_target" ]; then
    ln -sfn "$previous_target" "$tmp_link"
    mv -Tf "$tmp_link" "$current_link"
  fi
  exit 1
fi

pm2 restart "$pm2_app"

log "checking $health_url"
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -fsS -I --max-time 5 "$health_url" >/dev/null; then
    pm2 save
    log "release active: $release_dir"
    find "$apps_dir" -maxdepth 1 -type d -name 'ssa-*' -printf '%T@ %p\n' \
      | sort -rn \
      | awk -v keep="$keep_releases" 'NR > keep { print $2 }' \
      | while IFS= read -r old_release; do
          if [ "$old_release" != "$release_dir" ] && [ "$old_release" != "$previous_target" ]; then
            rm -rf "$old_release"
          fi
        done
    exit 0
  fi
  sleep 2
done

printf 'Health check failed for %s\n' "$release_dir" >&2
if [ -n "$previous_target" ] && [ -d "$previous_target" ]; then
  log "rolling back to $previous_target"
  ln -sfn "$previous_target" "$tmp_link"
  mv -Tf "$tmp_link" "$current_link"
  pm2 restart "$pm2_app" || true
fi
exit 1
