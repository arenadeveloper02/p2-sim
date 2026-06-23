#!/usr/bin/env bash
set -euo pipefail

# Purges leaked DATABASE_URL credentials from all git refs.
# Run only during a coordinated maintenance window after rotating RDS passwords.
#
# Prerequisites:
#   - git-filter-repo installed (`brew install git-filter-repo` or `pip install git-filter-repo`)
#   - Fresh mirror clone of the repository
#   - Branch protection temporarily relaxed for force-push
#   - All collaborators notified to reclone or hard-reset after purge
#
# Usage:
#   ./scripts/purge-credential-history.sh /path/to/mirror-clone

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/mirror-clone" >&2
  exit 1
fi

REPO_DIR="$1"
REPLACE_FILE="$(mktemp)"
trap 'rm -f "$REPLACE_FILE"' EXIT

cat >"$REPLACE_FILE" <<'EOF'
regex:postgresql://p2agent:[^@]+@p2-agents-dev-v2\.cyva1vnsabpo\.us-west-2\.rds\.amazonaws\.com:5432/simstudio\?sslmode=require==>postgresql://REDACTED
regex:postgresql://p2agent:[^@]+@p2-agents-dev\.cyva1vnsabpo\.us-west-2\.rds\.amazonaws\.com:5432/[^?]+==>postgresql://REDACTED
regex:postgresql://p2agent:[^@]+@prod-agents\.cyva1vnsabpo\.us-west-2\.rds\.amazonaws\.com:5432/simstudio\?sslmode=require==>postgresql://REDACTED
regex:postgresql://p2agent:[^@]+@sandbox-agents\.cyva1vnsabpo\.us-west-2\.rds\.amazonaws\.com:5432/simstudio\?sslmode=require==>postgresql://REDACTED
regex:postgresql://\$\{POSTGRES_USER:-postgres\}:\$\{POSTGRES_PASSWORD:-postgres\}@52\.40\.200\.103:5432/\$\{POSTGRES_DB:-simstudio\}==>postgresql://REDACTED
EOF

cd "$REPO_DIR"

echo "Rewriting history in: $REPO_DIR"
git filter-repo --replace-text "$REPLACE_FILE" --force

echo ""
echo "Post-rewrite verification (run from rewritten repo):"
echo "  bun run check:secrets"
echo "  git grep -i 'rds.amazonaws.com' || true"
echo ""
echo "Force-push all refs:"
echo "  git push --force --all origin"
echo "  git push --force --tags origin"
echo ""
echo "After push: reopen or recreate open PRs; ask collaborators to reclone."
