# Release Notes — 2026-07-01

All upstream release notes from the last synced `main` SHA through the current sync (7 versions).

## v0.7.13

_Released 2026-06-23 · commit `ad0b8678`_

## Features

- feat(file): include public share status in File read output (#5191)
- feat(file): add Manage Sharing operation to the File block (#5177)
- feat(pii): publish PII image to GHCR and add Presidio sidecar to Helm chart (#5188)
- feat(data-retention): workspace-level overrides for retention and PII (#5186)
- feat(billing): unify upgrade routing with reason context + storage/tables limit emails (#5171)
- feat(guardrails): PII redaction via Presidio sidecar (native VIN, per-rule language) (#5174)
- feat(pii): build & own combined PII (analyzer + anonymizer) image (#5176)
- feat(pi): add pi coding agent harness (#5178)
- feat(trigger): add trigger-eu-region flag to switch runs to eu-central-1 (#5173)
- feat(providers): add Sakana AI provider with Fugu models (#5169)

## Improvements

- improvement(access-controls): ui/ux improvements (#5190)
- improvement(pi): prompting to ensure harness knows push is deterministic (#5180)
- refactor(frontend-arch): migrate server state to React Query, collapse duplicate workflow-state cache, granular error boundaries (#5168)

## Bug Fixes

- fix(enrichment): stop PDL billing on no-match via required-field gating (#5184)
- fix(skills): fix skills icon showing up (#5187)
- fix(trigger): mark cpu-features external to fix deploy build (#5185)
- fix(pii): listen on 5001 to avoid app :3000 collision (awsvpc) (#5182)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.12...v0.7.13)

---

## v0.7.14

_Released 2026-06-25 · commit `11168f91`_

## Features

- feat(salesforce): add Tooling API schema tools (custom field/object) + metadata query (#5209)
- feat(file): workspace-scoped inline images + public-share cascade (#5203)
- feat(gitlab): add repository, code-review, and CI job tools + validation fixes (#5205)
- feat(secrets): ingest env secrets at container runtime instead of fanning into ECS taskdef (#5189)
- feat(gitlab): support self-managed GitLab host across tools, block, triggers, webhook, and connector (#5200)

## Improvements

- refactor(realtime): type the socket event-handler boundary with @sim/realtime-protocol (#5208)
- improvement(sandbox): mount workspace files by presigned URL instead of buffering bytes (#5202)
- refactor(sse): consolidate client SSE readers behind a single typed primitive (#5195)
- refactor(stores): model execution and workflow-diff state as status enums (#5197)
- perf(workspace): server-prefetch home, knowledge, tables, and files list pages (#5196)
- improvement(mistral): update OCR pricing to OCR 4 rate ($4/1,000 pages) (#5193)
- improvement(pi): minor improvements to docs (#5192)

## Bug Fixes

- fix(workspace): add granular error boundaries to 7 more workspace segments (#5207)
- fix(ssr): harden credential query-key factory + fetchers against the 'use client' stub bug (#5206)
- fix(tables): SSR crash from tableKeys in a 'use client' module + drop redundant flushChunks (#5204)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.13...v0.7.14)

---

## v0.7.15

_Released 2026-06-26 · commit `613e8ea0`_

## Features

- feat(triggers): add Twilio SMS, Clerk, incident.io, Rootly, RevenueCat, Loops, and Sentry webhook triggers (#5230)
- feat(uptimerobot): add UptimeRobot v3 integration (#5229)
- feat(downdetector): add Downdetector outage-monitoring integration (#5228)
- feat(rich-editor): rich markdown field + @ mentions for skill & deploy modals (#5215)
- feat(settings): unify all settings pages under a shared SettingsPanel layout (#5219)
- feat(access-control): page-based permission groups, tool-level deny-list, settings row-action consistency (#5216)
- feat(thrive): add Thrive Learning integration (47 tools + block) (#5214)
- feat(db): attribute Postgres connections by runtime via application_name (#5211)

## Improvements

- improvement(docs): align components with the platform design system (#5227)
- refactor(emcn): consolidate date pickers onto the chip Calendar (range support + retire legacy DatePicker) (#5222)
- improvement(docs): Ask AI chat grounded in the docs vector store (#5172)
- improvement(docs): add Academy learning surface (#5213)
- improvement(mothership): add workflow lint for custom tool/skills/mcp tool additions to agent block (#5199)
- perf(frontend): bound logs DOM, kill editor re-render storms, lazy-load heavy deps (#5212)

## Bug Fixes

- fix(copilot): strip hosted apiKey on type-less edit ops + guard hosting.enabled (#5220)
- fix(db): retry the migration connection on transient slot exhaustion (#5226)
- fix(knowledge): document tag filter matches case-insensitively and by calendar day (#5221)
- fix(copilot): strip platform-managed apiKey on hosted-tool blocks in edit_workflow (#5217)

## Other Changes

- chore(deps): bump undici to 7.28.0 and nodemailer to 9.0.1 (#5218)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @ouiliame
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.14...v0.7.15)

---

## v0.7.16

_Released 2026-06-27 · commit `38c088a8`_

## Improvements

- improvement(logs): move per-block progress markers to Redis to cut write amplification (#5248)
- improvement(clickhouse): expand block templates and skills, normalize tool versions (#5246)
- perf(dev): SIM_DEV_MINIMAL_REGISTRY mode to slash local dev-server RAM (#5223)
- improvement(execution): stop rewriting execution snapshots on reuse + skip redundant actor lookup (#5242)
- perf(db): per-role Postgres connection-pool profiles (#5232)
- improvement(webhooks): add trigger-age instrumentation + guard env decryption (#5236)
- perf(trigger): cap concurrency on background DB tasks (#5231)

## Bug Fixes

- fix(webhooks): run inactive deployment-version cleanup inline on deploy (#5250)
- fix(webhooks): cast json provider_config for atomic jsonb merge (#5249)
- fix(sso): keep an exit affordance in edit mode when clean (#5247)
- fix(security): gate credential-set invitation listing to admins and drop token (#5243)
- fix(mcp): pin public IP-literal server URLs to block SSRF redirect bypass (#5244)
- fix(copilot): gate post-tool output writes behind write permission (#5241)
- fix(file-parsers): guard OOXML parsers against decompression-bomb memory exhaustion (#5239)
- fix(security): cap KB document download size to prevent memory-exhaustion DoS (#5240)
- fix(connectors): harden Zendesk connector against SSRF (#5237)

## Other Changes

- chore(data-drains): remove settings callout and unused InfoNote component (#5235)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.15...v0.7.16)

---

## v0.7.17

_Released 2026-06-29 · commit `03718568`_

## Features

- feat(workspaces): gate workspace forking behind runtime workspace-forking feature flag (#5280)
- feat(docs): render workflow previews with the shared editor renderer (#5277)
- feat(mothership): add secrets input in chat (#5274)
- feat(integrations): extend ElevenLabs, Google Drive, Firecrawl, Pinecone, Resend, and S3 tool depth (#5270)
- feat(workflow-renderer): extract pure WorkflowBlockView + SubBlockRowView (#5267)
- feat(integrations): extend Telegram, Outlook, and Notion tool depth (#5265)
- feat(workflow-renderer): extract edge, subflow, and note Views into @sim/workflow-renderer (#5263)
- feat(pii): add redaction timing metrics across sidecar and persist path (#5264)
- feat(integrations): extend Airtable, Google Docs, WhatsApp, and Excel tool depth (#5256)
- feat(workspaces): fork + push/pull (#5210)

## Improvements

- improvement(slack-trigger): expose view, message, and state on interactivity payloads (#5279)
- improvement(settings): persistent layout + locked-down header API (#5278)
- improvement(docs): redesign README (animated hero + product demo) (#5275)
- perf(dev): curate SIM_DEV_MINIMAL_REGISTRY to core toolbar blocks (#5251)
- improvement(emcn): extract design system into shared @sim/emcn package (#5257)
- improvement(docs): flatten the academy learn/chapters panels (#5253)

## Bug Fixes

- fix(uploads): attach compiled binary for AI-generated docs, not source (#5266)
- fix(prism): load prismjs core before language components (#5262)
- fix(emcn): resolve Calendar icon/component barrel collision and preserve prism side effects (#5261)
- fix(knowledge): send tag filters as a JSON string so the document filter works (#5259)
- fix(emcn): repair app-wide crash and unstyled UI after package extraction (#5258)

## Other Changes

- chore(deploy): remove deploy as a2a (#5255)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @andresdjasso
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.16...v0.7.17)

---

## v0.7.18

_Released 2026-06-30 · commit `fabf6964`_

## Features

- feat(forking): resource copying UX to help with setup speed (#5294)
- feat(linq): audit fixes + native auto-registering webhook trigger (#5301)
- feat(broadcast): add july-1 newsletter (template, assets, font) (#5302)
- feat(input-format): upload files in file fields via the file uploader (#5297)
- feat(broadcast): add LinkedIn footer social icon (#5295)
- feat(db): resolve DATABASE_URL per role (DATABASE_URL_<ROLE> with fallback) (#5276)
- feat(providers): add Claude Sonnet 5 model (#5291)
- feat(integrations): wave-4 tool-depth (Slack/Asana/Jira/Google Docs/Trello/Monday) + context.dev validation (#5289)
- feat(rich-markdown-editor): live media embeds + shared embed detection util (#5290)

## Improvements

- improvement(emails): align transactional emails with the platform neutral design system (#5309)
- improvement(billing): ux around on demand toggling and one-off credits (#5307)
- improvement(docs): README redesign — banner + platform screenshot (#5283)
- perf(landing): defer Features preview, memoize integration grid, trim dead weight (#5303)
- improvement(sendblue): audit fixes for optional group numbers, seat_id, typing state/duration (#5300)
- refactor(landing): DRY page metadata via buildLandingMetadata + derive pricing credits (#5299)
- improvement(landing): SSR-friendly URL-state filters + cleanup pass + polish (#5298)
- improvement(landing): refine hero and mothership visuals (#5181)

## Bug Fixes

- fix(mailer): permissions entitlements for enabling/disabling (#5312)
- fix(hitl): build the full enabled-block DAG so any persisted resume target exists (#5313)
- fix(emcn): stop calendar content bleeding through the modal backdrop (#5311)
- fix(settings): chip-consistency + shared credential-style resource row (#5308)
- fix(sidebar): suppress collapse->expand transition flash on fresh load (#5306)
- fix(media-embed): remove ReDoS-prone regexes in host-gated providers (#5305)
- fix(input-format): file-field mode toggle uses canonical arrow icon on the label row (#5304)
- fix(emcn): keep Prism grammar registrations in bundle, never throw on missing grammar (#5293)
- fix(workflow-renderer): validate dropbox host in note embed renderer (#5288)

## Other Changes

- chore(logging): remove redis-progress-markers feature flag (#5287)

## Contributors

- @TheodoreSpeaks
- @andresdjasso
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.17...v0.7.18)

---

## v0.7.19

_Released 2026-07-01 · commit `6e426f85`_

## Features

- feat(careers): careers page backed by the Ashby job board (#5316)
- feat(landing): reintroduce /contact page styled like /demo (#5315)

## Improvements

- improvement(broadcast): white canvas, LinkedIn footer, hi-res logo (#5317)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.18...v0.7.19)
