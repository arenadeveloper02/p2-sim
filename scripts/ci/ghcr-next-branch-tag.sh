#!/usr/bin/env bash
set -euo pipefail

GHCR_OWNER="${1:-${GITHUB_REPOSITORY_OWNER:-arenadeveloper02}}"
GHCR_PACKAGE="${2:-p2-sim-simstudio}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to resolve the next GHCR tag" >&2
  exit 1
fi

LATEST_PATCH="$(
  gh api "/users/${GHCR_OWNER}/packages/container/${GHCR_PACKAGE}/versions" \
    --paginate \
    --jq '.[]?.metadata.container.tags[]?' 2>/dev/null \
    | sed -nE 's/^0\.0\.([0-9]+)$/\1/p' \
    | sort -n \
    | tail -1 \
    || true
)"

NEXT_PATCH=$(( ${LATEST_PATCH:-0} + 1 ))
echo "0.0.${NEXT_PATCH}"
