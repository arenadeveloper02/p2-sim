<!-- upstream-sync-question -->
## Upstream sync 2026-07-31 — grill questions (v0.7.29 → v0.7.50, 429 commits)

Full analysis is in `.upstream-sync/ledger/2026-07-31/run.md` under **Grill analysis**. Merge policy resolved almost everything mechanically (fork-first on Arena/mothership/branding paths, upstream on infra/integrations/MCP/auth-bumps). Three decisions need a human call — they're genuine fork-vs-upstream product choices, not conflict mechanics:

**1. Desktop app (#5998 + 8 follow-ups)**
Upstream shipped a brand-new top-level, Sim-branded desktop app with its own release/CI pipeline (prerelease tag computation #6044, release script #6060, deepsec fixes #6065). Not covered by the fork-first/upstream-first policy. **Adopt into the Arena fork, or skip it?** If adopted, its Sim branding and independent pipeline aren't covered by the fork's deploy scripts.

**2. Setup wizard + self-host settings plane + "Sim wordmark in sidebar" (#5911, #5964, #5990)**
The fork already routes the sidebar wordmark through fork-owned `lib/branding` (`sidebar-brand-header.tsx`, Arena branding). Upstream #5990 re-introduces a hardcoded **Sim** wordmark plus a self-host settings plane. **Take the setup-wizard/self-host-settings features but keep every surface routed through Arena branding (no hardcoded "Sim" wordmark)? Or skip the wordmark change entirely?**

**3. PII GLiNER removal (#5697)**
Fork's `apps/pii` still ships `requirements-gliner.txt` (GLiNER model support); fork docker-compose files don't wire a GPU image. Upstream drops GLiNER + the CUDA/GPU image for **regex-only** block-output redaction. **Adopt regex-only PII (drop GLiNER), or preserve the fork's GLiNER capability?**

---
Reply on this PR with `/upstream-sync resume` and your answers (e.g. `1: skip · 2: take, keep Arena branding · 3: adopt regex-only`).
