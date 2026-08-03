# No open questions

All decisions resolved from merge-policy / ledger.

The fork-first strategy provides a safe default for every conflicting file (preserve version-5-main behavior); security, deps, and CI go to upstream per policy; and schema/auth/registry conflicts are `manualReview`, handled by the harness's child conflict agents plus post-merge verification (`bun run mship:generate`, migrations, build/test gates). No item in the 480-commit range (v0.7.29 → v0.7.52) presents a fork-vs-upstream product decision that policy + ledger does not already resolve. Full dispositions and manual-review risk flags are recorded in `run.md` under `## Grill analysis`.
