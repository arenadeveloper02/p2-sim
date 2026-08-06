# No open questions

All decisions resolved from merge-policy / ledger.

See `run.md` → `## Grill analysis` for the reasoning behind each self-resolution, and
`merge-plan.draft.json` for the work orders.

Two items were considered as candidate blockers and resolved by inspection instead of asking:

1. **`productionBrowserSourceMaps: true` (`simstudioai/sim#5605`)** — upstream's rationale is
   premised on the repo's source already being public. Verified: `arenadeveloper02/p2-sim`
   is `PUBLIC`. Taken. One-line revert in `apps/sim/next.config.ts` if the EC2 Docker build
   cost turns out to matter.
2. **"Talk to sales" → `/demo` (`simstudioai/sim#5602`)** — not a reroute for the fork. Those
   CTAs already point at `/demo`; upstream only replaces the literal with a shared constant.
   Taken.

**Pre-existing issue for the reviewer (does not block this merge):**
`apps/sim/app/(landing)/demo/components/demo-scheduler/demo-scheduler.tsx` defaults `CAL_LINK`
to `'team/sim/demo'` — Sim's calendar, not Arena's. Override with `NEXT_PUBLIC_CAL_LINK`
before relying on the demo funnel. This predates the sync; `#5616` only preloads whatever
`CAL_LINK` already resolves to.
