#!/usr/bin/env bash
# sync-versions.sh <version>
# Updates every package.json version field in the monorepo.
# Called by semantic-release via @semantic-release/exec.
set -euo pipefail

VERSION="${1:?version argument required}"

echo "Syncing all package versions to $VERSION..."

find . -name "package.json" \
  -not -path "*/node_modules/*" \
  -not -path "*/.git/*" \
  -not -path "*/target/*" \
  | while read -r file; do
    if jq -e '.version' "$file" > /dev/null 2>&1; then
      tmp=$(mktemp)
      jq --arg v "$VERSION" '.version = $v' "$file" > "$tmp" && mv "$tmp" "$file"
      echo "  $file → $VERSION"
    fi
  done

echo "Done."
