#!/usr/bin/env bash
set -euo pipefail

BRANCH_NAME="${1:-${GITHUB_REF_NAME:-}}"
GHCR_OWNER="${2:-${GITHUB_REPOSITORY_OWNER:-arenadeveloper02}}"
GHCR_PACKAGE="${3:-p2-sim-simstudio}"

sanitize_branch() {
  local name="$1"
  name="$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed -E 's#[^a-z0-9._-]+#-#g; s#^-+##; s#-+$##')"
  if [ -z "$name" ]; then
    echo "branch"
  else
    echo "$name"
  fi
}

BRANCH_TAG="$(sanitize_branch "$BRANCH_NAME")"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required to resolve the next GHCR tag" >&2
  exit 1
fi

LATEST_PATCH="$(
  gh api "/users/${GHCR_OWNER}/packages/container/${GHCR_PACKAGE}/versions" \
    --paginate \
    --jq '.[]?.metadata.container.tags[]?' 2>/dev/null \
    | sed -nE 's/^.+-0\.0\.([0-9]+)$/\1/p' \
    | sort -n \
    | tail -1 \
    || true
)"

NEXT_PATCH=$(( ${LATEST_PATCH:-0} + 1 ))
echo "${BRANCH_TAG}-0.0.${NEXT_PATCH}"
