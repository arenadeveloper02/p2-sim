# Upstream Sync — Extensibility Notes

Rolling log of structural improvements that reduce merge conflict surface with `simstudioai/sim`.

## Principles

- Keep fork-owned code in isolated path prefixes (see `merge-policy.json`).
- Regenerate generated contracts (`bun run mship:generate`) instead of hand-merging.
- Prefer extension hooks over editing upstream-owned files inline.

## Notes

<!-- Agents append dated entries below during each sync run. -->
### 2026-08-04 — merge-policy coverage gaps found during grill (run 2026-08-04, 518 commits)

`forkFirst` held perfectly: upstream touched **zero** of its 42 prefixes. But the audit found
**fork-owned paths that are absent from `merge-policy.json`** and are therefore treated as shared
code. None conflicted this run, yet each is one upstream rename away from being silently overwritten
or silently broken. Recommend adding to `forkFirst`:

- `apps/sim/local-copilot/` and `apps/sim/app/api/local-copilot/` — 77-file fork product backed by
  migrations `0248`–`0251` + `0261`. It imports deep upstream copilot internals, so it breaks via
  **type errors rather than conflicts** when upstream refactors (this run: `@/lib/mothership/skills`
  was deleted out from under `local-copilot/lib/tools/user-skills.ts`).
- `apps/sim/public/favicon/**` and `apps/sim/public/icon.svg` — Arena marks. Conflicted against
  upstream's new Sim wordmark this run; `lib/branding/` alone does not cover them.
- `apps/sim/lib/{anthropic,chart-generation,development,help,image-generation,utils}/`,
  `apps/sim/lib/{channel-accounts,facebook-accounts}.ts`
- `apps/sim/tools/{chart_generation,development,google_ads_v1,image_generation,semrush,spyfu}/`
  and the fork's hosted-key tests `apps/sim/tools/*-hosting.test.ts`
- `apps/sim/app/api/{agent,app,gmail,google,google-ads,google-ads-v1,meeting,slack,stats}/`
- `apps/sim/blocks/blocks/{chart_generator,cost,development,figma,google_ads_v1,image_fusion,semrush,spyfu}.ts`
- `apps/sim/hooks/queries/{app-banner,billing-credit-usage,deployed-chat-threads,hubspot-accounts,organization-oauth-apps,organization-usage,unipile-accounts,unipile}.ts`
- `apps/sim/{config,utilities}/`, `apps/sim/probe-development-models.ts`

`regenerateAfterMerge` is now **incomplete**. Upstream added generated artifacts with CI check gates
that fork-added tools/skills will fail. It should become:
`mship:generate`, `tool-metadata:generate`, `mship-tools:generate`, `skills:sync`,
`agent-stream-docs:generate`.

Structural lessons for shrinking future conflict surface:

1. **Fork additions to upstream files are the whole cost.** Every expensive conflict this run was a
   fork edit *inside* an upstream file — `providers/models.ts` (Azure families), `lib/auth/auth.ts`
   (Arena origins + cookie domain), `blocks/blocks/hubspot.ts`, `tools/registry.ts`,
   `app/(interfaces)/chat/**`. Where upstream offers an extension seam, use it: the fork's
   `tools/exa/hosting.ts` uses upstream's own `ToolHostingConfig` pattern and cost **nothing** to
   merge, while the same feature expressed as inline edits to `tools/exa/*.ts` produced 6 conflicts.
2. **`providers/models.ts` wants a sidecar.** The Azure/`azure-anthropic` families are pure additions
   in a file upstream rewrites every release. A `providers/models.fork.ts` merged into the catalog at
   registration time would drop the single largest conflict in the repo.
3. **`auth.ts` wants the same.** Upstream just proved the pattern by extracting connectors to
   `lib/auth/connectors/providers.ts`. Move the fork's trusted-origin / cross-subdomain-cookie /
   Arena-hub logic into a fork-owned `lib/auth/arena-origins.ts` consumed by one call site.
4. **Test deletions come back.** The fork deleted two upstream tests (`home/hooks/use-chat.test.ts`,
   `home/hooks/stream/turn-model-serialize.test.ts`); upstream then modified both, producing
   modify/delete conflicts. Adapt upstream tests instead of deleting them.
