# Upstream Sync — Grill Q&A Log

Rolling log of questions asked on sync PRs and human answers. Future sync runs read this file (and `qa-history.jsonl`) before asking again.

<!-- Entries are appended automatically by the harness from PR comments and resume replies. -->

## 2026-07-31 (run 2026-07-31) — PENDING (could not auto-post to PR #676: token lacks pull-requests:write, HTTP 403)

Full question body: `.upstream-sync/ledger/2026-07-31/open-questions.md`. Three genuine fork-vs-upstream decisions for reviewer (utcarshsrivastava-collab):

1. **Desktop app (#5998 +8)** — adopt the new Sim-branded desktop app + its release/CI pipeline into the Arena fork, or skip?
2. **Setup wizard / self-host settings / "Sim wordmark in sidebar" (#5911, #5964, #5990)** — take features but keep Arena branding (no hardcoded "Sim" wordmark), or skip the wordmark change?
3. **PII GLiNER removal (#5697)** — adopt regex-only redaction (drop GLiNER + GPU image), or preserve fork's `apps/pii` GLiNER capability?

Reviewer replies on PR #676 with `/upstream-sync resume` and answers.
