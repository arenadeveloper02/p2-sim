# Grill Q&A — 2026-08-06

## 2026-08-06 · PR #683

**Q** (2026-08-06T07:16:30Z, utcarshsrivastava-collab): # Open questions — upstream sync 2026-08-06 (v0.7.29, 23 commits)

One blocker. Everything else in this batch resolved from `merge-policy.json`, fork precedent, or
verified code behaviour — see `## Grill analysis` in `run.md` and `merge-plan.draft.json`.

Reply on PR #683 with your choice, then comment `/upstream-sync resume`.

---

## Q1 — Sim's HubSpot tracker would actually fire on Arena deployments

**Upstream change:** simstudioai/sim#5565 adds Sim's HubSpot loader to
`apps/sim/app/(landing)/layout.tsx`:

```tsx
const HUBSPOT_SCRIPT_SRC = 'https://js-na2.hs-scripts.com/246720681.js' as const
{isHosted && (
  <Script id='hs-script-loader' src={HUBSPOT_SCRIPT_SRC} strategy='afterInteractive' />
  <Suspense fallback={null}><HubspotPageViewTracker /></Suspense>
)}
```

Portal `246720681` is **simstudioai's** HubSpot account.

**Why it isn't inert for us:** upstream's `isHosted` means `sim.ai` only, but this fork rewrote it
(`apps/sim/lib/core/config/env-flags.ts:34`) to also be true for:

- `https://agent.thearena.ai`
- `https://dev-agent.thearena.ai`, `https://test-agent.thearena.ai`,
  `https://test-v1-agent.thearena.ai`, `https://sandbox-agent.thearena.ai`
- `http://localhost:3000`

So on every Arena environment the loader runs and posts landing-page visitor analytics
(pageviews, form-collection beacons, banner script) into Sim's HubSpot portal.

**Why the harness can't catch it:** the fork has never edited `(landing)/layout.tsx`, so there is
**no merge conflict** — it merges silently unless we issue an explicit directive.

**Also in scope:** `apps/sim/app/(landing)/hubspot-page-view-tracker.tsx` (new upstream file) and
the HubSpot hosts added to `STATIC_SCRIPT_SRC` / `STATIC_CONNECT_SRC` in
`apps/sim/lib/core/security/csp.ts` (`*.hs-scripts.com`, `*.hs-analytics.net`,
`*.hscollectedforms.net`, `*.hs-banner.com`).

### Options

| Option | What we do | Consequence |
|---|---|---|
| **Q1-A** *(recommended)* | Drop the loader, delete `hubspot-page-view-tracker.tsx`, remove the four HubSpot CSP hosts | No third-party tracking on Arena landing pages. Logged in `skipped.md`. Reversible later. |
| **Q1-B** | Keep the tracker, swap in **Arena's** HubSpot portal id | Arena gets its own marketing attribution. **Requires the portal id and its region** (`na1` / `na2` / `eu1` — a wrong region 404s silently). |
| **Q1-C** | Take upstream verbatim | Arena landing traffic (prod, all test/sandbox hosts, and localhost) is reported into Sim's HubSpot portal `246720681`. |

**Please answer with `Q1-A`, `Q1-B` (+ portal id and region), or `Q1-C`.**

---

### For context — decided without asking (no reply needed)

- **DB migrations:** upstream's `0258`/`0259` are **appended** as `0262`/`0263` with bumped journal
  `when` values instead of renumbering the fork's `0258`–`0261`. Renumbering the fork's side would
  make drizzle silently skip upstream's migrations forever on already-migrated databases
  (`drizzle-orm/pg-core/dialect.js:62` gates on `created_at < folderMillis`), so
  `webhook.routing_key` would never be created.
- **Branding:** `apps/sim/public/favicon/` + `icon.svg` stay ours; upstream's new Sim wordmark
  marks are not taken. Landing copy keeps `ArenaWordmark` / "Arena is the AI workspace".
- **Models:** take upstream's new `nvidia` / `zai` (GLM) providers and catalog fixes; never
  re-enable a model the fork commented out; keep `azure-anthropic`.
- **Slack #5323:** union — the fork only relabelled the existing `authMethod` pair, it did not
  build a competing custom-bot feature. `slack_v2` ships preview-gated (inert).
- **`apps/docs`:** upstream-first — the fork doesn't deploy it (`docker-compose.p2prod.yml` runs
  `simstudio` / `realtime` / `migrations` / `db` only). Three fork edits are re-applied.

## 2026-08-06 · PR #683

**Q** (2026-08-06T07:17:17.766Z, upstream-sync[bot]): Grill open questions must be answered before merge starts.
_Context: .upstream-sync/ledger/2026-08-06/open-questions.md_

