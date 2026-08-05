# Skipped Upstream Changes — 2026-08-05

Changes from simstudioai/sim we deliberately did not take during this sync.

## HubSpot marketing tracker — simstudioai/sim#5565

**Not taken:** the HubSpot loader wiring in `apps/sim/app/(landing)/layout.tsx` and the
`apps/sim/app/(landing)/hubspot-page-view-tracker.tsx` component.

**Taken:** the `csp.ts` host allowances (`*.hs-scripts.com`, `*.hs-analytics.net`,
`*.hscollectedforms.net`, `*.hs-banner.com`). They are permit-only, and keeping them stops
that file re-conflicting on every future sync.

**Why:** upstream loads `https://js-na2.hs-scripts.com/246720681.js` — Sim's own HubSpot
portal — gated by `isHosted`. Upstream's `isHosted` is true only for `sim.ai`, so this is
inert for self-hosters. The fork **redefined** `isHosted` in
`apps/sim/lib/core/config/env-flags.ts` to include `agent.thearena.ai`,
`dev-agent`/`test-agent`/`test-v1-agent`/`sandbox-agent.thearena.ai` and
`localhost:3000` — so on this fork the loader *would* fire in production. The loader also
injects `hscollectedforms.js`, which scrapes form submissions, so this is lead/PII capture
into a third party's CRM rather than plain pageview telemetry.

**What we miss:** HubSpot pageview and form-capture analytics on the landing site.

**How to re-enable with fork-owned tracking** (one edit, no merge needed): in
`apps/sim/app/(landing)/layout.tsx`, render a `next/script` tag with
`id='hs-script-loader'` pointing at Position2/Arena's own HubSpot portal script under the
existing `isHosted` gate, and restore the pageview tracker component from
`6c3d11b2:apps/sim/app/(landing)/hubspot-page-view-tracker.tsx`. The CSP hosts are already
in place.

## Related pre-existing issue (not an upstream skip)

`apps/sim/app/layout.tsx` on this fork still carries **upstream's** analytics IDs verbatim —
`GTM-T7PHSRX5` and `G-DR7YBE70VS`, byte-identical to `6c3d11b2` — under the same `isHosted`
gate. Fork traffic on `*.thearena.ai` has therefore been reporting into Sim's Google Tag
Manager / GA properties. This predates the sync; swapping in Position2/Arena-owned IDs is a
fork task.
