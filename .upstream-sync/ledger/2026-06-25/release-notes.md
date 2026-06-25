# Release Notes — 2026-06-25

All upstream release notes from the last synced `main` SHA through the current sync (299 versions).

## v0.2.1

_Released 2025-06-29 · commit `805b245c`_

## Bug Fixes

- fix(csp): update CSP to allow for google drive picker
- fix(kb): fix kb navigation URLs
- fix sourceBlock null check
- fix(cli): package type for esm imports, missing realtime (#574)
- fix(csp): update CSP to allow for google drive picker
- fix(kb): fix kb navigation URLs
- fix sourceBlock null check
- fix sourceBlock null check
- fix lint"
- fix(reconn): take workflow id from url
- fix(function): disabled freestyle, VM by default with node-fetch (#570)
- fix(gmail): gmail webhook synchronous processing (#553)
- fix lint

## Other Changes

- merge(staging-to-main) (#577)
- Merge branch 'staging'
- Merge branch 'staging' of github.com:simstudioai/sim into staging

## Contributors

- @aadamgough
- @adiologydev
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v1.0.0...v0.2.1)

---

## v0.2.2

_Released 2025-06-30 · commit `b3960ad7`_

fix  (#588)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.1...v0.2.2)

---

## v0.2.3

_Released 2025-06-30 · commit `f4e627a9`_

## Features

- add dot check

## Bug Fixes

- fix test failure
- fix typing issue
- fix(func var resolution): variable ref codepath triggered - lint fixed
- fix(func var resolution): variable ref codepath triggered

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.2...v0.2.3)

---

## v0.2.4

_Released 2025-06-30 · commit `1604ce4d`_

## Bug Fixes

- fix(dep): dependency for useEffect missing
- fix lint
- fix(knowledge base): selector infinite render

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.3...v0.2.4)

---

## v0.2.5

_Released 2025-07-02 · commit `3b982533`_

feat, improvement, fix (#595) (#603)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.4...v0.2.5)

---

## v0.2.6

_Released 2025-07-03 · commit `016cd675`_

fix + feat + improvement (#612)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.5...v0.2.6)

---

## v0.2.7

_Released 2025-07-04 · commit `78b5ae7b`_

fix + feat  (#615)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.6...v0.2.7)

---

## v0.2.8

_Released 2025-07-06 · commit `f3bc1fc2`_

fix + feat + improvement  (#621)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.7...v0.2.8)

---

## v0.2.9

_Released 2025-07-08 · commit `c2f786e4`_

fix + feat (#643)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.8...v0.2.9)

---

## v0.2.11

_Released 2025-07-10 · commit `b7d536b7`_

## Features

- feat(models): add grok-4 (#655)
- feat(kb): added cost for kb blocks (#654)
- fix(docs): fixed docs script to reflect the new output format for all blocks (#653)
- fix response format json extraction issues + add warning for invalid json
- feat(kb-tags-filtering): filter kb docs using pre-set tags (#648)
- feat(billing): add comprehensive usage-based billing system (#625)
- Merge pull request #646 from simstudioai/feat/ask-docs
- add 6s timeout (#645)
- fix(sockets): added debouncing for sub-block values to prevent overloading socket server, fixed persistence issue during streaming back from LLM response format, removed unused events (#642)
- fix(sockets): force user to refresh on disconnect in order to mkae changes, add read-only offline mode (#641)
- Add footer fullscreen option
- Add db migration
- fix(response-format): add response format to tag dropdown, chat panel, and chat client (#637)
- feat(build): added turbopack builds to prod (#630)
- feat(tools): added reordering of tool calls in agent tool input (#629)
- feat(enhanced logs): integration + log visualizer canvas (#618)

## Improvements

- Update apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/workflow-block/components/sub-block/components/code.tsx
- Merge pull request #650 from simstudioai/improvement/logging-ui
- improve logging ui
- Convo update
- Convo update

## Bug Fixes

- Merge pull request #652 from simstudioai/fix/resp-format-json-extraction
- fix lint
- fix frozen canvas trace span interpretation issue
- fix lint
- Greptile fixes
- fix(reddit): fixed reddit missing refresh token for oauth
- fix(search-chunk): searchbar in knowledge base chunk (#557)
- Yaml fixes
- Fix loop/parallel yaml
- Modal fixes
- some fixes
- Revert "fix(sockets-server-disconnection): on reconnect force sync store to d…" (#640)
- Fix streaming bug
- UI fixes
- fix(build): fixed build
- Fix spacing
- fix(sockets-server-disconnection): on reconnect force sync store to db (#638)
- Lint fix
- fix(dropdown): simplify & fix tag dropdown for parallel & loop blocks (#634)
- fix(revert-deployed): correctly revert to deployed state as unit op using separate endpoint (#633)
- fix(resp format): non-json input was crashing (#631)
- fix(docs): fixed broken docs links (#632)
- fix(mem-deletion): hard deletion of memory (#622)
- fix(oauth): fix oauth to use correct subblock value setter + remove unused local storage code (#628)
- fix(reddit): update to oauth endpoints (#627)
- fix(frozen canvas): don't error if workflow state not available for migrated logs (#624)
- fix(envvars): t3-env standardization (#606)
- fix(deletions): folder deletions were hanging + use cascade deletions throughout (#620)
- fix(sharing): fixed folders not appearing when sharing workflows (#616)

## Other Changes

- remove useless paths
- remove regex handling never hit
- lint
- revert
- remove duplicate info in trace span info for tool calls
- lint
- Merge pull request #647 from simstudioai/staging
- Merge branch 'main' into staging
- Remove json export
- Lint
- Move upload button
- Lint
- Comment instead of ff
- Lint
- Handle loops/parallel
- Checkpoint
- Lint
- Read workflow checkpoint
- Lint
- Get user workflow tool
- Merge branch 'main' into staging
- Lint
- Checkpoint
- Lint
- Remove logs
- Lint
- It works??
- Lint
- Closer
- Lint
- Initial yaml
- Lint
- Yaml language basics
- Lint
- Better ui
- Remove dead code
- Lint
- Checkpoint
- Lint
- Better
- Lint
- Works?
- Lint
- Big refactor
- Lint
- Lint
- Tool call version
- Lint
- Spacing
- Lint
- Better formatting
- Better formatting
- Initial chatbot ui
- Initial lint
- Initial commit

## Contributors

- @Sg312
- @aadamgough
- @adiologydev
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.9...v0.2.11)

---

## v0.2.12

_Released 2025-07-12 · commit `38f5aae0`_

## Features

- fix(stripe): added missing webhook secret for stripe webhook billing endpoint
- add tool calls to trace span
- improvement: added draft operation
- improvement: added gmail draft operation

## Improvements

- improve UI
- improvement(trace-span): make tool calls separately display in trace span"
- Merge pull request #670 from simstudioai/improvement/gmail

## Bug Fixes

- Merge pull request #673 from simstudioai/fix/trace-spans-tool-calls
- improvement: fixed docs #670
- fix(text-fields): prevent save password on usage limit change (#667)
- fix(precommit-hook): fixed pre commit hook to use lint-staged (#666)
- fix(scrollbar): fixed double scrollbar (#665)
- Merge pull request #659 from simstudioai/fix/cancel-sub

## Other Changes

- remove optional chain
- pass reference id to cancel func

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.11...v0.2.12)

---

## v0.2.13

_Released 2025-07-14 · commit `7192cdef`_

## Features

- feat(wealthbox): added wealthbox crm (#669)
- fix(voice): added voice functionality back to chat client (#676)
- fix(tool-input): added tool input, visibility enum for tool params, fixed google provider bugs (#674)
- feat(queuing): sockets queuing mechanism

## Bug Fixes

- fix(permissions): make permissions check case insensitive, resolve hydration issues by consolidating environment checking function (#678)
- fix(api-timeout): increase timeout for API block to 2 min (#677)
- Merge pull request #671 from simstudioai/fix/queuing
- Merge branch 'fix/queuing' of github.com:simstudioai/sim into fix/queuing
- fix(ui): fixed loop collection placeholder to match parallel collection placeholder
- fix subflow ops to go through queue
- fix retry mechanism
- fix field typing
- fix incorrect dep
- fix subblock updates

## Other Changes

- working impl
- simplify
- remove console.log
- remove test file
- remove console log
- remove unused file

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.12...v0.2.13)

---

## v0.3.1

_Released 2025-07-15 · commit `b7185c9e`_

## Features

- improvement(docs): added new docs content, cleanup old content (#690)
- feat(platform): new UI and templates (#639) (#639)
- feat(platform): new UI and templates (#639)
- Improvement(gmail-tools): added search and read (#680)
- improvement(subflow-docs): docs for loops and parallels added under blocks section (#686)

## Improvements

- improvement(db): further increase db limits (#696)
- improvement(sockets): increase buffer for connections (#695)
- improvement(kb): pagination for docs + remove kb token count problematic query (#689)
- improvement(imports): changed relative to absolute imports (#681)

## Bug Fixes

- fix(docs): minor docs typo fix (#698)
- fix: remove package-lock
- fix: removed package-lock
- fix(kb): auth check for create doc tool (#687)
- fix(console): match by execution & block id when updating console-entry (#685)
- fix(unsubscribe): unsubscribe missing suspense boundary (#683)
- fix(queueing): make debouncing native to queue (#682)

## Other Changes

- Merge pull request #692 from simstudioai/staging
- max 25 conc connections (#691)
- Merge pull request #688 from simstudioai/staging
- remove root-level tailwind v3 override (#684)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.2.13...v0.3.1)

---

## v0.3.2

_Released 2025-07-16 · commit `8f71684d`_

## Features

- feat(sidebar): sidebar toggle and search (#700)

## Improvements

- improvement(voice): interrupt UI + mute mic while agent is talking (#705)

## Bug Fixes

- fix(subflow): fixed subflow execution regardless of path decision (#707)
- fix: permissions check for duplicating workflow (#706)
- fix(invitation): allow admins to remove members from workspace (#701)
- fix(sockets): delete block case (#703)
- fix(schedule): fix for custom cron (#699)
- fix(sockets): remove package-lock

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.1...v0.3.2)

---

## v0.3.3

_Released 2025-07-16 · commit `1e55a0e0`_

## Improvements

- improvement(permissions): remove the unused workspace_member table in favor of permissions (#710)

## Bug Fixes

- fix(subflows): fixed subflows not executing (#711)
- fix: sidebar scroll going over sidebar height (#709)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.2...v0.3.3)

---

## v0.3.4

_Released 2025-07-17 · commit `27794e59`_

## Features

- improvement(starter): added tag dropdown for input fields, fixed response block, remove logs and workflowConnections from api response (#716)
- feat(settings): collapse by default (#714)
- feat(workspace): add ability to leave joined workspaces (#713)

## Bug Fixes

- fix: truncate workspace selector (#715)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.3...v0.3.4)

---

## v0.3.5

_Released 2025-07-17 · commit `06b1d827`_

## Bug Fixes

- fix(condition): fixed condition block to resolve envvars and vars (#718)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.4...v0.3.5)

---

## v0.3.6

_Released 2025-07-19 · commit `f2b1c733`_

## Features

- feat(integrations): added deeper integrations for slack, supabase, firecrawl, exa, notion (#728)
- feat(webhook-triggers): multiple webhook trigger blocks (#725)
- feat(execution-queuing): async api mode + ratelimiting by subscription tier (#702)
- improvement(kb): add loading logic for document selector for kb block (#722)
- improvement(oauth): added advanced mode for all tools with oauth and selectors (#721)

## Improvements

- improvement(ui/ux): workflow, search modal (#729)

## Bug Fixes

- fix(lint): fixed lint (#732)
- fix(autofill-env-vars): simplify/remove logic to not cause useEffect overwrites (#726)
- fix: shortcuts (#730)
- fix(triggers): remove gitkeep (#724)
- fix(docker): fix runtime vars for docker deployments (#723)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.5...v0.3.6)

---

## v0.3.7

_Released 2025-07-21 · commit `560d184c`_

## Features

- fix(router): fixed routing issue with workflow block, added tests (#739)
- fix(config): add t3 to list of transpiled packages to ensure that envvars are picked up correctly (#737)
- fix(docker): fixed docker container healthchecks, added instructions to README for pgvector (#735)

## Bug Fixes

- fix(teams-webhook): response json needs type (#741)
- fix(condition): fixed condition block dropdown (#738)

## Other Changes

- working impl fo ms teams outgoing webhook (#740)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.6...v0.3.7)

---

## v0.3.8

_Released 2025-07-23 · commit `d783ba6f`_

## Features

- fix(condition): fix bug where user can't edit if container when else if is added (#760)
- improvement(chat-panel): added the ability to reuse queries, focus cursor for continuous conversation (#756)
- feat(copilot-v1): Copilot v1 (#662)
- feat(tools): New Qdrant Tool (#644)

## Improvements

- improvement(logs): make perms workspace scoped (#759)

## Bug Fixes

- fix(lint): ran lint (#766)
- fix(chat-deploy): fixed permissions to match the workspace permissions, admins can deploy & edit & delete (#753)
- fix(csp): created csp utils file that holds the csp for organization (#752)
- fix(envvars): use getEnv on the client-side when we need to inject vars for docker runtime, fix folder container & removed folder/subfolder creation modals (#751)
- Revert "v0.3.7: docker fix, docs "
- Revert "v0.3.7: docker fix, docs "
- fix(qdrant): kebab case to camel case for icon properties (#748)

## Other Changes

- Merge branch 'main' into staging

## Contributors

- @Anush008
- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.7...v0.3.8)

---

## v0.3.9

_Released 2025-07-23 · commit `0dd77352`_

## Bug Fixes

- fix(chat-deploy-url): update tests for getEmailDomain (#769)
- fix(chat-deploy): fix chat deploy URL in prod (#767)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.8...v0.3.9)

---

## v0.3.10

_Released 2025-07-24 · commit `a173f6a7`_

## Features

- fix(nextjs): add force dynamic exports for new copilot routes (#784)
- fix(logs): added indexes to speed up logs loading time, modified to only display logs for current workspace (#773)
- improvement(docs): updated docs with new videos, new tools (#770)
- fix(webhooks): readd immediate acks (#771)

## Improvements

- improvement(ui/ux): logs (#762)
- improvement(cleanup): remove old logging code (#779)
- improvement(cleanup): remove workflow_execution_blocks table (#778)
- improvement(kb): workspace permissions system reused here (#761)

## Bug Fixes

- fix(workflow-in-workflow): variables not accessible in child workflow (#783)
- fix(sockets): permissions to align with normal perms system" (#782)
- fix(drizzle): use migrate instead of push for ci (#774)
- fix(condition): fixed condition block else routing bug (#772)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.9...v0.3.10)

---

## v0.3.13

_Released 2025-07-25 · commit `40d3ce5e`_

## Features

- feat: implement native ARM64 Docker builds with CDN support (#791)
- fix(nextjs): add force dynamic to 38 routes (#787)
- fix(kb-perms): search tool perms to use new system (#786)

## Bug Fixes

- fix(create-manifest): manifest not using right tags by arch (#793)
- fix(webhooks): immediate acks only for teams (#788)

## Other Changes

- Merge pull request #792 from simstudioai/staging
- Merge pull request #789 from simstudioai/staging

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.10...v0.3.13)

---

## v0.3.14

_Released 2025-07-28 · commit `9c12ddf4`_

## Features

- refactor(imports): added aliased imports everywhere (#799)
- refactor(logger): code cleanup for new execution logger (#798)
- feat(workflow): added cancellation after launching manual execution (#796)

## Bug Fixes

- fix(picker): fix docs.google.com refused to connect issue (#797)

## Other Changes

- no immediate acks for ms teams webhook (#805)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.13...v0.3.14)

---

## v0.3.15

_Released 2025-07-29 · commit `95a8d641`_

## Features

- feat(landing): add rb2b (#815)
- feat(tools): added arXiv and wikipedia tools/blocks & docs (#814)
- feat(kb-tags): natural language pre-filter tag system for knowledge base searches (#800)
- feat(helm): added helm charts for self-hosting (#813)
- improvement(cdn): add cdn for large video assets with fallback to static assets (#809)
- fix(standalone): selectively enable vercel speed insights, add annotations for envvars (#808)

## Improvements

- improvement(webhooks): move webhook exeucution to trigger.dev (#810)

## Bug Fixes

- fix(webhook-modal): on copy do not change webhook url, fix auth to use regular perms system (#812)
- fix(assets): update README.md (#811)
- fix(evaluator): fix tag dropdown for evaluator block (#807)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.14...v0.3.15)

---

## v0.3.16

_Released 2025-07-29 · commit `b8ad42f5`_

## Features

- feat(domain): drop the 'studio' (#818)
- feat(execution): base execution charge of 0.001/execution (#817)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.15...v0.3.16)

---

## v0.3.17

_Released 2025-07-29 · commit `c2593900`_

## Features

- fix(domain): add redirects to maintain API routes with old host (#820)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.16...v0.3.17)

---

## v0.3.19

_Released 2025-08-05 · commit `aeef2b7e`_

## Features

- feat(models): add openai oss models (#880)
- feat(outlook): add outlook webhook provider (#874)
- fix(copilot): added user scrolling, fixed code block, fixed code copying and styling (#872)
- improvement(copilot): add subblock enums to block metadata (#870)
- Add basic personalizatoin (#868)
- feat(copilot): add user feedback options (#867)
- feat(docs): reindex docs on change (#863)
- fix(docs): add hunter (#857)
- feat(copilot): add billing endpoint (#855)
- fix(wand): add shimmer to long-input while isStreaming, better prompt for system prompt generation (#852)
- feat(copilot): implement copilot (#850)
- improvement(helm): add additional instructions for AWS deployments (#851)
- fix(duplicate): added isWide and advacnedMode to optimistic duplicate, persist collapsed subblock state (#847)
- fix(sockets): add sockets event for tag / env var dropdown selections (#844)
- feat(deploy-chat): added a logo upload for the chat, incr font size
- fix(chat-deploy): added new image upload component, fixed some state issues with success view (#842)
- feat(deploy-chat): added a logo upload for the chat, incr font size
- improvement(sockets): duplicate op should let addBlock take subblock values instead of separate looped op (#836)
- improvement(sockets): add batch subblock updates for duplicate to clear queue faster (#835)
- feat(tools): added hunter.io tools/block, added default values of first option in dropdowns to avoid operation selector issue, added descriptions & param validation & updated docs (#825)
- feat(wand): subblock level wand configuration + migrate old wand usage to this (#829)
- improvement(docs): add base exec charge info to docs (#826)
- fix(domain): fix telemetry endpoint, only add redirects for hosted version (#822)

## Improvements

- improvement(ui/ux) (#831)
- Doc test update
- improvement(copilot): code hygiene + tests (#856)
- improvement(doc-tags-subblock): use table for doc tags subblock in create_document tool for KB (#827)

## Bug Fixes

- fix(invite): fixed invite modal, fix search modal keyboard nav (#879)
- fix(file-upload): fixed file upload URL required (#875)
- fix(yaml): modules that require agent repo (#873)
- fix(copilot): fix state message sent on move to background (#871)
- fix(copilot): make chat history non-interfering (#869)
- improvement(copilot): tool dependency errors show as skipped (#864)
- fix(gmail-webhook): gmail webhook credential injection issue with webhook block (#865)
- fix(billing): increase free tier credits (#862)
- fix(copilot): fix code block overflow (#861)
- fix(google-scopes): removed unnecessary google scopes (#849)
- fix(kb-search): made query optional, so either query or tags or both can be provided (#848)
- fix(logs): forgot dependency for logs breaking pagination' (#846)
- fix(logs-page): optimize logs retrieval queries, consolidate useEffects to prevent dup calls (#845)
- fix(deploy-modal): break down deploy modal into separate components (#837)
- fix(kb-tags): ui fixes, delete persistence for doc page header (#841)
- fix(chat-deploy): fixed form submission access patterns, fixed kb block filters (#839)
- fix(kb-tags): docs page kb tags ui (#838)
- fix(deploy-modal): break down deploy modal into separate components (#837)
- fix(sockets): duplicate block op should go through debounced path (#834)
- fix(deployed-chat): allow non-streaming responses in deployed chat, allow partial failure responses in deployed chat (#833)
- fix(deployed-chat): trigger blocks should not interfere with deployed chat exec (#832)
- fix(bugs): fixed rb2b csp, fixed overly-verbose logs, fixed x URLs (#828)
- fix(search-modal): fixed search modal keyboard nav (#823)

## Other Changes

- Quiet logger
- Remove process.env (#854)
- Lint
- Use process.env instead of .env
- Lint
- Temp logs (#853)
- Merge branch 'main' into staging

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.17...v0.3.19)

---

## v0.3.21

_Released 2025-08-07 · commit `85cdca28`_

## Features

- feat(gpt-5): added gpt-5 models (#896)
- feat(rate-limits): make rate limits configurable via environment variables (#892)
- feat(microsoft-tools): added planner, onedrive, and sharepoint (#840)
- feat(whitelabel): add in the ability to whitelabel via envvars (#887)
- Feat/copilot files (#886)
- feat(ollama): added streaming & tool call support for ollama, updated docs (#884)

## Improvements

- improvement(copilot): incremental edits (#891)

## Bug Fixes

- fix(gpt-5): remove temp, decr socket debounce to 25ms (#898)
- fix(gpt-5): updated pricing (#897)
- fix(build): fixed build (#893)
- fix(agent): export waits for complete workflow state (#889)
- fix(dynamic): remove force-dynamic from routes that don't need it (#888)
- fix(deployed-state): use deployed state for API sync and async execs, deployed state modal visual for enabled/disabled (#885)
- fix(kb-tag-slots): finding next slot, create versus edit differentiation (#882)

## Other Changes

- Merge pull request #883 from simstudioai/staging

## Contributors

- @Sg312
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.19...v0.3.21)

---

## v0.3.22

_Released 2025-08-08 · commit `aedf5e70`_

## Features

- fix(email-validation): add email validation to prevent bouncing, fixed OTP validation (#916)
- Improvement(cc): added cc to gmail and outlook (#900)
- improvement(helm): fix duplicate SOCKET_SERVER_URL and add additional envvars to template (#909)
- feat(whitelist): add email & domain-based whitelisting for signups (#908)
- feat(webhooks): deprecate singular webhook block + add trigger mode to blocks (#903)
- feat(trigger-mode): added trigger-mode to workflow_blocks table (#902)
- feat(execution-filesystem): system to pass files between blocks (#866)

## Improvements

- improvement(chunk-config): migrate unused default for consistency (#913)
- improvement(tag-dropdown): typed tag dropdown values (#910)

## Bug Fixes

- fix(email): manual OTP instead of better-auth (#921)
- fix(otp): fix email not sending (#917)
- fix(mailer): update mailer to use the EMAIL_DOMAIN (#914)
- fix(min-chunk): remove minsize for chunk (#911)
- fix(helm): fix helm charts migrations using wrong image (#907)
- fix(schedules-perms): use regular perm system to view/edit schedule info (#901)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.21...v0.3.22)

---

## v0.3.23

_Released 2025-08-12 · commit `1c818b2e`_

## Features

- feat(variables): multiplayer variables through sockets, persist server side (#933)
- fix(kb): added proper pagination for documents in kb (#937)
- fix(sidebar-ui): fix small ui bug to close gap when creating new workflow (#932)
- feat(usage-indicator): added ability to see current usage (#925)
- improvement(console): added iteration info to console entry for parallel/loop (#930)

## Improvements

- improvement(performance): use redis for session data (#934)
- improvement(subflow): consolidated parallel/loop tags and collaborativeUpdate (#931)
- improvement(control-bar): standardize styling across all control bar buttons (#926)

## Bug Fixes

- fix(tag-dropdown): last char dropped bug (#945)
- fix(kb): kb-level deletion should reflect in doc level kb tags sidebar registry (#944)
- fix(kb-ui): fixed tags hover effect (#942)
- fix(chunks): instantaneous search + server side searching instead of client-side (#940)
- fix(webhooks): fixed all webhook structures (#935)
- improvement(tools): removed transformError, isInternalRoute, directExecution (#928)
- fix(tag-dropdown): fix values for parallel & loop blocks (#929)
- fix(workflow-block): improvements to pulsing effect, active execution state, and running workflow blocks in parallel (#927)
- fix(apikeys): pinned api key to track API key a workflow is deployed with (#924)
- fix(chat): fix chat attachments style in dark mode (#923)
- fix(help): fix email for help route (#922)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.22...v0.3.23)

---

## v0.3.24

_Released 2025-08-12 · commit `f7573fad`_

## Improvements

- Revert "improvement(performance): use redis for session data (#934)" (#934)

## Bug Fixes

- fix(api): fix api block (#951)

## Other Changes

- Merge pull request #948 from simstudioai/staging

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.23...v0.3.24)

---

## v0.3.26

_Released 2025-08-14 · commit `e1f04f42`_

## Features

- improvement(helm): added template for external db secret (#957)
- fix(subflows): added change detection for parallels, updated deploy and status schemas to match parallel/loop (#956)
- improvement(uploads): add multipart upload + batching + retries (#938)
- added file for microsoft verification (#946)

## Improvements

- improvement(oauth): credentials sharing for workflows (#939)

## Bug Fixes

- improvement(credentials-security): use clear credentials sharing helper, fix google sheets block url split bug (#968)
- fix(billing): separate client side and server side envvars for billing (#966)
- Revert "fix(workflow-block): revert change bubbling up error for workflow block" (#965)
- fix workflow block test
- fix(workflow-block): revert change bubbling up error for workflow block (#963)
- fix(api): fix api post and get without stringifying (#955)
- fix(double-read): API Block (#950)
- Revert "fix(api): fix api block (#951)" (#951)

## Other Changes

- Merge pull request #964 from simstudioai/staging
- Merge pull request #954 from simstudioai/staging

## Contributors

- @Sg312
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.24...v0.3.26)

---

## v0.3.27

_Released 2025-08-15 · commit `6133db53`_

## Features

- improvement(billing): add billing enforcement for webhook executions, consolidate helpers (#975)
- fix(force-dynamic): revert force-dynamic for the 38 routes that we previously added it to (#971)
- feat(copilot): add depths (#974)

## Improvements

- improvement/function: remove unused function execution logic in favor of vm, update turborepo (#980)
- improvement(redirects): move redirects to middleware, push to login if no session and workspace if session exists, remove telemetry consent dialog (#976)

## Bug Fixes

- fix(chat-deploy): fixed chat-deploy (#981)
- fix(oauth): webhook + oauthblocks in workflow (#979)
- Fix user message color (#978)
- fix(whitelabel): fix privacy policy & terms, remove unused/unnecessary envvars for whitelabeling (#969)

## Other Changes

- Revert 1a7de84 except tag dropdown changes (keep apps/sim/components/ui/tag-dropdown.tsx) (#972)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.26...v0.3.27)

---

## v0.3.28

_Released 2025-08-16 · commit `97b6bcc4`_

## Features

- feat(copilot): generate agent api key (#989)

## Improvements

- improvement(agent): enable autolayout, export, copilot (#992)

## Bug Fixes

- fix(agent): stringify input into user prompt for agent (#984)
- fix(kb-ui): fixed upload files modal ui, processing ui to match the rest of the kb (#991)
- fix(ishosted): make ishosted true on staging (#993)
- fix(loading): fix workflow detached on first load (#987)
- fix(envvar): clear separation between server-side and client-side billing envvar (#988)
- attempt to fix build issues (#985)

## Other Changes

- Merge pull request #986 from simstudioai/staging (#985)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.27...v0.3.28)

---

## v0.3.30

_Released 2025-08-18 · commit `d75cc1ed`_

## Features

- fix(subflow): add ability to remove block from subflow and refactor to consolidate subflow code (#983)
- feat(copilot): diff improvements (#1002)

## Improvements

- update migration file for notekeeping purpose
- improvement(logs): cleanup code (#999)
- improvement(db): remove deprecated 'state' column from workflow table (#994)

## Bug Fixes

- fix(duplicate): fixed detached state on duplication (#1011)
- fix(control-bar): fix icons styling in disabled state (#1010)
- fix: migration mem issues bypass
- fix(subflow): remove all edges when removing a block from a subflow (#1003)
- fix(workflow-error): allow users to delete workflows with invalid configs/state (#1000)
- fix(logs-sidebar): remove message and fix race condition for quickly switching b/w logs (#1001)
- Fix abort (#998)

## Other Changes

- Merge pull request #1009 from simstudioai/staging
- Merge pull request #1008 from simstudioai/staging
- reduce batch size to prevent timeouts
- Merge pull request #1007 from simstudioai/staging
- syntax issue in migration
- make logs migration batched to prevent mem issues (#1005)
- Merge pull request #1004 from simstudioai/staging

## Contributors

- @Sg312
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.28...v0.3.30)

---

## v0.3.31

_Released 2025-08-19 · commit `1619d63f`_

## Improvements

- Update README.md (#1026)
- improvement(logger): restore server-side logs in prod (#1022)
- improvement(settings): ui/ux (#1021)
- improvement(console): redact api keys from console store (#1020)
- improvement(serializer): filter out advanced mode fields when executing in basic mode, persist the values but don't include them in serialized block for execution (#1018)

## Bug Fixes

- fix(logger): fixed logger to show prod server-side logs (#1027)
- fix(copilot): streaming (#1023)
- fix(picker-ui): picker UI confusing when credential not set + Microsoft OAuth Fixes (#1016)
- fix(copilot): env key validation (#1017)
- fix(copilot): fix origin (#1015)
- fix(webhook): pin webhook URL when creating/saving generic webhook trigger (#1014)
- fix(export): swap upload & download icons (#1013)

## Other Changes

- uploaded brandbook (#1024)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.30...v0.3.31)

---

## v0.3.32

_Released 2025-08-20 · commit `6b185be9`_

## Features

- improvement(supabase): add supabase upsert tool, insert/replace on PK conflict (#1038)
- feat(logs): added sub-workflow logs, updated trace spans UI, fix scroll behavior in workflow registry sidebar (#1037)
- improvement(supabase): added more verbose error logging for supabase operations (#1035)
- improvement(api): add native support for form-urlencoded inputs into API block (#1033)

## Improvements

- improvement(console): increase console max entries for larger workflows (#1032)

## Bug Fixes

- fix(billing): fix upgrade to team plan (#1045)
- fix(oauth-block): race condition for rendering credential selectors and other subblocks + gdrive fixes (#1029)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.31...v0.3.32)

---

## v0.3.33

_Released 2025-08-20 · commit `5d74db53`_

## Features

- feat(copilot-docs): update readme and docs with local hosting instructions (#1043)

## Contributors

- @Sg312

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.32...v0.3.33)

---

## v0.3.34

_Released 2025-08-20 · commit `2c47cf41`_

## Features

- feat(nextjs): upgrade nextjs to 15.5 (#1062)
- improvement(gh-action): add gh action to deploy to correct environment for trigger.dev (#1060)
- feat(input-format): add value field to test input formats (#1059)
- feat(azure-openai): allow usage of azure-openai for knowledgebase uploads and wand generation (#1056)
- improvement(gpt-5): added reasoning level and verbosity to gpt-5 models (#1058)
- feat(mailer): consolidated all emailing to mailer service, added support for Azure ACS (#1054)

## Improvements

- improvement(trigger): upgrade import path for trigger (#1065)
- improvement(trigger): upgrade trigger (#1063)

## Bug Fixes

- fix(placeholder): fix starter block placeholder (#1071)
- fix placeholder text
- fix(gpt-5): fix chat-completions api (#1070)
- fix(theme-provider): preventing flash on page load (#1067)
- fix(gpt-5): fixed verbosity and reasoning params (#1069)
- fix type
- fix(msverify): changed consent for microsoft (#1057)
- fix(input-format): first time execution bug (#1068)
- fix(semantics): fix incorrect imports (#1066)
- fix(billing): fix team plan upgrade (#1053)
- Merge pull request #1055 from simstudioai/fix/picker-race-cond
- fix test
- fix(oauth): gdrive picker race condition, token route cleanup

## Other Changes

- Merge branch 'staging' of github.com:simstudioai/sim into staging
- use personal access token
- pin version

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.33...v0.3.34)

---

## v0.3.35

_Released 2025-08-21 · commit `e107363e`_

## Features

- fix(acs): added FROM_EMAIL_ADDRESS envvar for ACS (#1081)
- fix(migrations): add missing migration for document table (#1080)

## Bug Fixes

- fix(emails): remove unused useCustomFromFormat param (#1082)
- fix(build): clear docker build cache to use correct Next.js version
- fix(build): clear docker build cache to use correct Next.js version (#1075)
- fix(nextjs): downgrade nextjs due to known issue with bun commonjs module bundling (#1073)
- fix(nextjs): downgrade nextjs due to known issue with bun commonjs module bundling (#1073)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.34...v0.3.35)

---

## v0.3.36

_Released 2025-08-21 · commit `991f0442`_

## Features

- feat(theme): added custom envvars for themes (#1089)
- fix(db-consts): make the migrations image fully standalone by adding db consts (#1087)
- fix(templates): added option to delete/keep templates when deleting workspace, updated template modal, sidebar code cleanup (#1086)

## Improvements

- improvement(log-level): make log level configurable via envvar (#1091)

## Bug Fixes

- fix(day-picker): remove unused react-day-picker (#1094)
- fix circular dependsOn for Jira manualIssueKey
- fix(ms-oauth): oauth edge cases (#1093)
- fix(logs): make child workflow span errors the same as root level workflow errors (#1092)
- Fix(excel-range): fixed excel range (#1088)
- fix(webhook-payloads): fixed the variable resolution in webhooks (#1019)
- improvement(emails): fixed email subjects to use provided brand name (#1090)
- fix(infinite-get-session): pass session once per tree using session provider + multiple fixes (#1085)
- improvement(block-error-logs): workflow in workflow (#1084)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.35...v0.3.36)

---

## v0.3.37

_Released 2025-08-22 · commit `4846f6c6`_

## Features

- feat(native-bg-tasks): support webhooks and async workflow executions without trigger.dev (#1106)
- feat(helm): added CRON jobs to helm charts (#1107)
- fix(ocr-azure): added OCR_AZURE_API_KEY envvar (#1102)

## Improvements

- improvement(signup): modify signup and login pages to not show social sign in when not configured, increase logo size (#1103)
- improvement(wand): upgrade wand to use SSE (#1100)

## Bug Fixes

- fix(naming): prevent identical normalized block names (#1105)
- fix(chat-deploy): dark mode ui (#1101)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.36...v0.3.37)

---

## v0.3.38

_Released 2025-08-22 · commit `fdfa935a`_

## Bug Fixes

- fix(billing): vercel cron not processing billing periods (#1112)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.37...v0.3.38)

---

## v0.3.39

_Released 2025-08-24 · commit `ed9b9ad8`_

## Features

- feat(integrations): added parallel AI, mySQL, and postgres block/tools (#1126)
- Feat/copilot client clean (#1118)
- improvement(chat-file-upload): add visual indication of file upload exceeding limit (#1123)

## Bug Fixes

- fix autoconnect (#1127)
- fix(onedrive): fixed advanced mode (#1122)
- improvement(logging): capture pre-execution validation errors in logging session (#1124)
- fix(teams-wh): fixed teams wh payload (#1119)
- fix(tag-dropdown): arrow navigation for submenu affecting text input cursor (#1121)
- fix(logs): fix to remove retrieval of execution of data for basic version of call (#1120)
- fix(ux): minor ux changes (#1109)
- fix(custom-tool): fix textarea, param dropdown for available params, validation for invalid schemas, variable resolution in custom tools and subflow tags (#1117)
- fix(billing): change reset user stats func to invoice payment succeeded (#1116)
- fix(billing): make subscription table source of truth for period start and period end (#1114)

## Contributors

- @Sg312
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.38...v0.3.39)

---

## v0.3.40

_Released 2025-08-28 · commit `fd6d9272`_

## Features

- feat(openrouter): add open router to model block (#1172)
- Revert "feat(debug): create debugger (#1174)" (#1174)
- feat(debug): create debugger (#1174)
- feat(pg): added ability to customize postgres port when running containerized app (#1173)
- improvement(knowledge): remove innerJoin and add id identifiers to results, updated docs (#1170)
- feat(copilot):  context (#1157)
- improvement(sockets): cleanup debounce logic + add flush mechanism to… (#1152)
- improvement(forwarding+excel): added forwarding and improve excel read (#1136)
- feat: added llms.txt and robots.txt (#1145)
- feat: local auto layout (#1144)
- feat(login): add terms and privacy to signup and login pages (#1139)
- feat(copilot): enable azure openai and move key validation (#1134)
- fix(wand): remove unstable__noStore and remove, add additional logs for wand generation (#1133)

## Improvements

- chore(deps): upgrade trigger.dev in gh action (#1171)
- improvement(knowledge): search returns document name (#1167)
- improvement(kb): use trigger.dev for kb tasks (#1166)
- Docs update (#1140)
- improvement(help-modal): ui/ux (#1135)

## Bug Fixes

- Revert "fix(cursor-and-input): fixes cursor and input canvas error (#1168)" (#1168)
- fix(cursor-and-input): fixes cursor and input canvas error (#1168)
- fix(slack): set depends on for slack channel channel subblock (#1177)
- Fix (#1176)
- fix(billing): usage tracking cleanup, shared pool of limits for team/enterprise (#1131)
- fix(security): strengthen email invite validation logic, fix invite page UI (#1162)
- fix(copilot): context filtering (#1160)
- fix(signup): refetch session data on signup (#1155)
- fix(envvars): fix split for pasting envvars with query params (#1156)
- fix(sockets): useCollabWorkflow cleanup, variables store logic simplification (#1154)
- fix(auto-layout): revert (#1148)
- fix(security): fixed SSRF vulnerability (#1149)
- fix(kb-uploads): created knowledge, chunks, tags services and use redis for queueing docs in kb (#1143)
- fix dependency array
- fix(copilot-cleanup): support azure blob upload in copilot, remove dead code & consolidate other copilot files (#1147)
- fix(condition-block): edges not following blocks, duplicate issues (#1146)
- fix(copilot): send api key to sim agent (#1142)
- fix(subblock-race-condition): check loading state correctly (#1141)
- fix(copilot): enterprise api keys (#1138)
- fix(wand): remove edge runtime for wand (#1132)
- fix(files): fix vulnerabilities in file uploads/deletes (#1130)

## Other Changes

- Merge branch 'staging' of github.com:simstudioai/sim into staging

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.39...v0.3.40)

---

## v0.3.41

_Released 2025-08-29 · commit `76fac13f`_

## Features

- feat(kb): add adjustable concurrency and batching to uploads and embeddings (#1198)
- imporvement(pg): added wand config for writing sql queries for generic db blocks & supabase postgrest syntax (#1197)
- feat(tools): add parallel ai, postgres, mysql, slight modifications to dark mode styling (#1192)
- Revert "feat(integrations): added parallel AI, mySQL, and postgres block/tools (#1126)" (#1126)

## Bug Fixes

- fix(billing-ui): open settings when enterprise sub folks press usage indicator (#1194)
- Fix/wand (#1191)

## Other Changes

- Use direct fetch (#1193)
- Switch to node (#1190)
- Merge pull request #1189 from simstudioai/staging
- run bun install
- revert(dep-changes): revert drizzle-orm version and change CI yaml script
- change bun install to be based on frozen-lockfile flag"
- revert drizzle-orm version
- remove bun lock
- revert package.json

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.40...v0.3.41)

---

## v0.3.42

_Released 2025-08-29 · commit `0bc77813`_

## Features

- improvement(kb): add fallbacks for kb configs (#1199)

## Bug Fixes

- fix(deps): downgrade nextjs (#1200)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.41...v0.3.42)

---

## v0.3.43

_Released 2025-08-31 · commit `ee17cf46`_

## Features

- feat(parsers): added pptx, md, & html parsers (#1202)

## Improvements

- improvement(tools): update mysql to respect ssl pref (#1205)

## Bug Fixes

- fix(parsers): fix md, pptx, html kb uploads (#1209)
- fix(permissions): remove permissions granted by org membership (#1206)
- fix(enterprise-billing): simplification to be fixed-cost (#1196)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.42...v0.3.43)

---

## v0.3.44

_Released 2025-09-02 · commit `0cf87e65`_

## Features

- feat(tools): add MongoDB (#1225)
- feat(copilot): stats tracking (#1227)
- feat(e2b-execution): add remote code execution to support Python + Imports (#1226)
- feat(llms): added additional params to llm-based blocks for alternative models (#1223)
- add if not exists check
- improvement(performance): added new indexes for improved session performance (#1215)
- feat(workspace-vars): add workspace scoped environment + fix cancellation of assoc. workspace invites if org invite cancelled (#1208)
- fix(build): add missing pdf-parse dep, add docker build in staging (#1213)

## Improvements

- improvement(hygiene): refactored routes to be more restful, reduced code surface area and removed redundant code (#1217)

## Bug Fixes

- fix(styling): fix styling inconsistencies in dark mode, fix invites fetching to show active members (#1229)
- fix(e2b-env-var): use isTruthy and getEnv (#1228)
- fix(whitelabel): make terms and privacy URL envvars available at build time (#1222)
- fix if not exists check
- fix 80th migration
- fix(wand): remove duplicate transfer encoding header meant to be set by nginx proxy (#1221)
- fix(ui): dark mode styling for switch, trigger modal UI, signup/login improvements with auto-submit for OTP (#1214)
- improvement(copilot): improve context inputs and fix some bugs (#1216)
- fix(build): consolidate pdf parsing dependencies, remove extraneous html deps (#1212)
- fix(organizations): remove org calls when billing is disabled (#1211)

## Other Changes

- make 79th migration idempotent
- Merge branch 'staging' of github.com:simstudioai/sim into staging

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.43...v0.3.44)

---

## v0.3.45

_Released 2025-09-03 · commit `581929bc`_

## Bug Fixes

- fix(rce): always use VM over RCE for custom tools (#1233)
- fix(team): fix organization invitation URL for teams (#1232)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.44...v0.3.45)

---

## v0.3.46

_Released 2025-09-03 · commit `fce1423d`_

## Improvements

- Updates (#1237)

## Contributors

- @Sg312

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.45...v0.3.46)

---

## v0.3.47

_Released 2025-09-04 · commit `60a061e3`_

## Features

- feat(invitations): add ability to resend invitations with cooldown, fixed UI in dark mode issues (#1256)
- feat(duplicate): duplicate variables when duplicating a workflow (#1254)
- feat(enterprise-plan-webhooks): skip webhook queue for enterprise plan users (#1250)
- Add input/output multipliers
- fix(code-subblock): added validation to not parse non-variables as variables in the code subblock (#1240)

## Bug Fixes

- fix(ratelimits): enterprise and team checks should be pooled limit (#1255)
- fix(cost): restored cost reporting for agent block in console entry (#1253)
- fix(sidebar): order by created at (#1251)
- fix(rehydration): consolidate store rehydration code (#1249)
- fix(sidebar): re-ordering based on last edit is confusing (#1248)
- fix(race-condition-workflow-switching): another race condition between registry and workflow stores (#1247)
- fix(hydration): duplicate overlay after idle + subblocks race condition (#1246)
- Merge pull request #1245 from simstudioai/fix/copilot-billing
- fix(whitelabel): move redirects (build-time) for whitelabeling to middlware (runtime) (#1236)

## Other Changes

- Waring
- Lint + tests
- Docs
- change
- Lint

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.46...v0.3.47)

---

## v0.3.50

_Released 2025-09-08 · commit `784992f3`_

## Features

- feat(notifications): added notifications for usage thresholds, overages, and welcome emails (#1266)
- fix(variables): add back ability to reference root block like <start> (#1262)
- Revert "feat(enterprise-plan-webhooks): skip webhook queue for enterprise plan users (#1250)" (#1250)

## Improvements

- 0.3.49: readme updates, router block and variables improvements
- improvement(docs): readme.md to mention .env setup for copilot setup

## Bug Fixes

- fix(notifications): increase precision on billing calculations (#1283)
- Fix(jira): reading multiple issues and write
- fix(sidebar): draggable cursor on sidebar when switching workflows (#1276)
- fix(subblock-param-mapping): consolidate resolution of advanced / basic mode params using canonicalParamId (#1274)
- fix(sockets): move debounce to server side (#1265)
- fix(router): change router block `content` to `prompt` (#1261)
- fix(schedule-self-host): remove incorrect migration (#1260)
- fix(cleanup): cleanup unused vars + webhook typo (#1259)

## Other Changes

- 0.3.48: revert trigger dev bypass for enterprise users

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.47...v0.3.50)

---

## v0.3.51

_Released 2025-09-10 · commit `ea8762e9`_

## Features

- fix(webhooks): made spacing more clear, added copy button for webhook URL & fixed race condition for mcp tools/server fetching in the mcp block (#1309)
- improvement(readme): add e2b reference to readme (#1307)
- Fix(yaml env var): added env var fallback (#1300)
- feat(mcp): added support for mcp servers (#1296)
- feat(account): added user profile pictures in settings (#1297)
- feat(logs-api): expose logs as api + can subscribe to workflow execution using webhook url (#1287)
- feat(usage-api): make external endpoint to query usage (#1285)

## Improvements

- improvement(subblock-defaults): custom defaults for subblocks if needed (#1298)

## Bug Fixes

- fix(webhook-ui): fixed webhook ui (#1301)
- fix(subflow-validation): validate subflow fields correctly + surface serialization errors in the logs correctly (#1299)
- fix(start-input): restore tag dropdown in input-format component (#1294)
- fix(workflow-block): remove process specific circular dependency check (#1293)
- Merge pull request #1286 from simstudioai/fix/copilot-custom-tools
- Fix custom tool save

## Other Changes

- Lint
- V1

## Contributors

- @Sg312
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.50...v0.3.51)

---

## v0.3.52

_Released 2025-09-12 · commit `1ad31c92`_

## Features

- feat(api-keys): add workspace level api keys to share with other workspace members, add encryption for api keys (#1323)
- chore(deployment-versioning): add migration script into repo (#1318)
- feat(docs): overhaul docs (#1317)

## Improvements

- improvement(long-description): modified long description for every block (#1322)

## Bug Fixes

- fix(file-upload): fix nextjs file upload issue with pdf-parse (#1321)
- fix(kb): exclude deleted docs from embeddings/vector search (#1319)
- fix(serializer): Required-field validation now respects sub-block visibility (#1313)
- fix(sheets): fixed google sheets update (#1311)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.51...v0.3.52)

---

## v0.3.53

_Released 2025-09-15 · commit `a06ae0d2`_

## Features

- feat(docs): added footer for page navigation, i18n for docs (#1339)
- feat(idempotency): added generalized idempotency service for all triggers/webhooks (#1330)
- feat(logs): added intelligent search with suggestions to logs (#1329)

## Improvements

- improvement(array-index): resolved variables for 2d arrays (#1328)

## Bug Fixes

- fix(build): upgrade fumadocs to latest (#1341)
- fix(build): upgrade fumadocs (#1340)
- fix(stripe): revert to stable versioning for better auth plugin (#1337)
- fix(stripe): use latest version to fix event mismatch issues (#1336)
- fix(security): fix ssrf vuln and path validation for files route (#1325)

## Other Changes

- changed search for folders and workflows in logs (#1327)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.52...v0.3.53)

---

## v0.3.54

_Released 2025-09-16 · commit `2149f5e3`_

## Features

- feat(google-forms): added google forms block (#1343)
- feat(sms): add generic sms sending block/tool (#1349)
- feat(tools): add generic mail sending block/tools, updated docs script (#1348)
- feat(landing): new landing page (#1219)

## Improvements

- improvement(platform): ui/ux (#1357)
- improvement: branding; auth; chat-deploy (#1351)

## Bug Fixes

- fix(next-js): pin version (#1358)
- fix(layout): fix layout semantics on invite page (#1356)
- fix bun lock (#1354)
- fix(better-auth): revert back to version 1.2.9 (#1352)
- improvement(gh): fix i18n github action to run on merge to staging (#1350)
- fix(bun): pin bun version for db migrations (#1347)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.53...v0.3.54)

---

## v0.3.55

_Released 2025-09-17 · commit `2df65527`_

## Features

- Improvement(sharepoint): added more operations in sharepoint (#1369)
- improvement(idempotency): added atomic claims to prevent duplicate processing for long-running workflows (#1366)
- feat(signup): added back to login functionality to OTP page (#1365)

## Improvements

- improvement(code-structure): move db into separate package (#1364)
- improvement(landing): insert prompt into copilot panel from landing, open panel on entry (#1363)

## Bug Fixes

- fix(dockerfile): needs dummy db url (#1368)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.54...v0.3.55)

---

## v0.3.56

_Released 2025-09-18 · commit `bff1852a`_

## Features

- Improvement(sharepoint): added ability to create list items, different from create list (#1379)
- improvement(search): added more granular logs search, added logs export, improved overall search experience (#1378)

## Bug Fixes

- fix(selectors): gdrive and slack selectors inf loops (#1376)
- fix(actions): updated i18n gh action to use PAT instead of default token (#1377)
- fix(variables): remove quote stripping from short & long inputs (#1375)
- fix(migrations): upgrade drizzle-kit in migrations container (#1374)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.55...v0.3.56)

---

## v0.3.57

_Released 2025-09-22 · commit `c0170270`_

## Features

- fix(csp): added terms, privacy, & logo URLs to CSP (#1413)
- feat: added favicon (#1410)
- feat(otp): added environemnt variable to control enforcement of verified accounts (#1411)
- feat(404): added 404 page (#1401)
- fix(tools): added transform response to handle non-json responses for internal tools (#1400)
- fix(verification): add OTP dev skip (#1395)
- feat(file): add more upload types to the file block (#1386)
- fix(docker): added copilot-related keys to docker container definitions (#1382)
- feat(i18n): update translations (#1381)

## Improvements

- improvement(readme): update readme.md (#1412)
- improvement(usage): bar execution if limits cannot be determined, init user stats record on user creation instead of in stripe plugin (#1399)
- improvement(search): improved filters UI and search suggestions (#1387)

## Bug Fixes

- fix(missing-user-stats): missing user stats rows covered via migration' (#1409)
- fix(tools): fixed arxiv tools (#1403)
- fix(ollama): fix ollama container for CPU vs GPU mode (#1396)
- fix(emails): updated path for email assets to absolute rather than relative paths (#1398)
- fix(cursor): misaligned in long inputs (#1388)
- fix(generic-webhooks): idempotency simplification, generic webhook vars changes (#1384)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.56...v0.3.57)

---

## v0.3.58

_Released 2025-09-22 · commit `5c92d5d4`_

## Improvements

- chore(deps): update trigger.dev sdk (#1416)

## Bug Fixes

- fix(actions): update trigger.dev github action (#1417)

## Other Changes

- chore(deps): upgdate trigger.dev cli (#1414)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.57...v0.3.58)

---

## v0.4.0

_Released 2025-09-29 · commit `10652eb9`_

## Features

- feat(sso): add support for login with SAML/SSO (#1489)
- feat(permissions): allow users to deploy workflows in all workspaces they are an admin in (#1463)
- improvement(copilot): added session context checks in copilot tool calls (#1466)
- feat(i18n): update translations (#1465)
- add google vault to landing page footer (#1464)
- feat(trigger-docs): new trigger docs, function block rce imports fix (#1462)
- feat(i18n): update translations (#1460)
- Feat(google vault): added google vault tool (#1459)
- feat(turbo): added turborepo, tailwind v3 (#1458)
- feat(ci): use blacksmith for ci (#1454)
- feat(manual-trigger): add manual trigger (#1452)
- feat(ci): consolidate ci, make db migrations dependent on ecr success, remove turbopack for staging/prod builds (#1449)
- feat(deployments): make deployed state source of truth for non-manual executions + versioning (#1242)
- Add dh login (#1448)
- feat(infra): add ci for aws image push (#1447)
- feat(infra): add staging docker image
- feat(copilot): add training interface (#1445)
- chore(deps): added entities dependency (#1441)
- feat(i18n): update translations (#1437)
- Revert "feat(traceroot): add traceroot logger" (#1434)
- feat(i18n): added japanese and german translations (#1428)
- improvement(copilot): add best practices for core blocks (#1427)
- feat(traceroot): add traceroot logger
- feat(changelog): added changelog and gh action to auto-release (#1423)
- feat(i18n): update translations (#1421)
- feat(tools): added resend email sender (#1420)
- feat(undo-redo): undo/redo for canvas editing (#1392)

## Improvements

- improvement(ci): ensure atomicity in trigger deploys, improve overall ci organization (#1477)
- improvement(chat): deployed chat no longer uses subdomains, uses sim.ai/chat/[identifier] (#1474)
- improvement(deps): remove vercel speed insights (#1470)
- improvement(parallel): update parallel subflow to support conditional routing (#1444)
- improvement: remove sentry dependency (#1435)
- chore(deps): upgrade turborepo (#1439)
- improvement(subflows): support multiple blocks in parallel subflow, enhance logs to group by iteration for parallels/loop (#1429)
- improvement(copilot): structured metadata context + start block deprecation (#1362)

## Bug Fixes

- fix(copilot): deprecate yaml, json import/export, deprecate build_workflow tool, convert copilot to json-based (#1488)
- Fix copilot diff (#1485)
- fix(ci): remove atomic updates for trigger (#1478)
- Fix(google drive): google sheets creating a file (#1476)
- fix(ui): standardized 404, chat, and invite pages (#1472)
- fix(tools): fixed supabase order by (#1467)
- fix(envvars): use getEnv for isHosted check since it is client-side (#1461)
- fix(tailwind): revert tailwind back to v3 for main app (#1456)
- fix(ci): modify docs embeddings ci to only run on english documentation (#1455)
- fix(css-config): use correct version (#1453)
- fix(ci): docker (#1451)
- fix build error
- fix(usage): persist cost multiplier at provider level instead of also at the logger level (#1433)
- fix(copilot): null check simplified (#1431)
- fix(copilot): restore subblock options (#1430)
- fix(instrumentation): open telemetry init (#1426)
- fix(redirects): move redirects for terms/privacy to client-side redirects (#1418)
- fix(billing): reset usage on transition from free -> paid plan (#1397)

## Other Changes

- chore(docs): remove remaining yml references from docs (#1492)
- Remove double calling of ci (#1450)
- chore(deps): remove unused deps, reduce overall dependencies & size (#1436)

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.3.58...v0.4.0)

---

## v0.4.1

_Released 2025-09-30 · commit `f9f84111`_

## Bug Fixes

- fix(deployed): support internal JWT for deployed child workflow executions (#1498)
- fix(ci): fix docker manifest build (#1495)
- fix(ci): fix docker manifest build

## Contributors

- @Sg312
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.0...v0.4.1)

---

## v0.4.2

_Released 2025-10-01 · commit `745eaff6`_

## Features

- fix(ci): add skip promotion to trigger ci
- feat(i18n): update translations (#1496)

## Improvements

- improvement(db): remove vercel, remove railway, remove crons, improve DB connection config (#1519)
- improvement(trigger): increase maxDuration for background tasks to 10 min to match sync API executions (#1504)
- improvement(var-resolution): resolve variables with block name check and consolidate code (#1469)
- improvement(autolayout): use live block heights / widths for autolayout to prevent overlaps (#1505)
- improvement(ci): trigger.dev pushes (#1506)
- improvement(triggers): uuid, autolayout, copilot context (#1503)

## Bug Fixes

- fix(trigger): inject project id env var in correctly (#1520)
- fix(ci): update trigger.dev ci to only push to staging on merge to staging & for prod as well (#1518)
- fix(redirects): update middleware to allow access to /chat regardless of auth status (#1516)
- fix(router): use getBaseUrl() helper (#1515)
- fix(deployed-version-check): check deployed version existence pre-queuing (#1508)
- Fix/remove trigger promotion (#1513)
- fix(ci): capture correct deployment version output (#1512)
- fix(ci): fix trigger version capture
- Fix trigger ci creds (#1510)
- fix(ci): trigger permissions
- fix(migrations): make sso migration idempotent

## Other Changes

- Remove migrations ci (#1501)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.1...v0.4.2)

---

## v0.4.3

_Released 2025-10-02 · commit `cae0e858`_

## Features

- fix(db): add more options for SSL connection, add envvar for base64 db cert (#1533)
- feat(copilot): JSON sanitization logic + operations sequence diff correctness (#1521)
- feat(cmdk): added knowledgebases to the cmdk modal (#1530)
- feat(posthog): added posthog for analytics (#1523)

## Improvements

- improvement(performance): remove writes to workflow updated_at on position updates for blocks, edges, & subflows (#1531)
- chore(deps): update fumadocs (#1525)
- improvement(db): enforce SSL everywhere where a DB connection is established (#1522)

## Bug Fixes

- fix(fumadocs): fixed client-side export on fumadocs (#1529)
- fix(kb): removed filename constraint from knowledgebase doc names (#1527)
- fix(autolayout): type issue if workflow deployed + remove dead state code (#1524)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.2...v0.4.3)

---

## v0.4.4

_Released 2025-10-02 · commit `2175fd11`_

## Features

- fix(db): added database config to drizzle.config in app container (#1536)
- fix(db): added SSL config to migrations container (#1535)

## Bug Fixes

- fix(db): remove overly complex db connection logic (#1538)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.3...v0.4.4)

---

## v0.4.5

_Released 2025-10-04 · commit `b768ca84`_

## Features

- feat(kb): added json/yaml parser+chunker, added dedicated csv chunker (#1539)
- feat(copilot): fix context / json parsing edge cases (#1542)

## Bug Fixes

- fix(copilot): targeted auto-layout for copilot edits + custom tool persistence (#1546)
- fix(copilot): tool renaming
- fix(billing-blocked): block platform usage if payment fails for regular subs as well (#1541)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.4...v0.4.5)

---

## v0.4.6

_Released 2025-10-05 · commit `377b84e1`_

## Features

- fix(posthog): add rewrites for posthog reverse proxy routes unconditionally, remove unused POSTHOG_ENABLED envvar (#1548)

## Bug Fixes

- fix(kb): force kb uploads to use serve route (#1547)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.5...v0.4.6)

---

## v0.4.7

_Released 2025-10-06 · commit `4dc40734`_

## Features

- feat(blog): created first page (#1550)
- feat(posthog): added posthog provider instead of using nextjs instrumentation (#1555)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.6...v0.4.7)

---

## v0.4.8

_Released 2025-10-06 · commit `174f6a48`_

## Bug Fixes

- fix(blog): center footer, fix dark mode, fix avatar (#1559)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.7...v0.4.8)

---

## v0.4.9

_Released 2025-10-07 · commit `25f5e313`_

## Features

- feat(highlighting): added resolved vars highlighting to code subblock, to be consistent with other subblocks (#1570)
- feat(i18n): update translations (#1569)
- fix(streaming-response): add in handling for the response block when streaming (#1568)
- feat(chat-streaming): added a `stream` option to workflow execute route, updated SDKs, updated docs (#1565)
- feat(nested-workflow-spans): nested child workflow spans in logs sidepanel (#1561)

## Improvements

- improvement(sockets): position persistence on drag end, perms call only on joining room (#1571)

## Bug Fixes

- fix(curl-example): fixed curl example in deploy modal to reflect selected option (#1573)
- fix(workspace-selector-kb): fix selector for assigning workspaces for kbs (#1567)
- fix(undo-redo): preserve trigger/advanced mode (#1566)
- fix(db): enable database connection pooling in production (#1564)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.8...v0.4.9)

---

## v0.4.10

_Released 2025-10-08 · commit `5d887fdc`_

## Improvements

- chore(docs): update docs (#1578)

## Bug Fixes

- fix(ts-sdk): fix job to publish ts sdk (#1576)
- fix(db): reduce overall number of db max conncetions to incr performance (#1575)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.9...v0.4.10)

---

## v0.4.11

_Released 2025-10-10 · commit `c0f5ba75`_

## Features

- feat(sessions): add redis as priority option for session data (#1592)
- feat(deployed-chat): added file upload to workflow execute API, added to deployed chat, updated chat panel (#1588)
- feat(billing): bill by threshold to prevent cancellation edge case (#1583)
- fix(env-vars): remove regex parsing from table subblock, add formatDisplayText to various subblocks that didn't have it (#1582)

## Improvements

- improvement(kb): encode non-ASCII headers for kb uploads (#1595)

## Bug Fixes

- fix(ci): pin all workflows and Dockerfiles to Bun v1.2.22 (#1598)
- fix(webhooks): use next public app url instead of request origin for webhook registration (#1596)
- fix test webhook url (#1594)
- fix(db): revert to dedicated sockets db connection establishment (#1581)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.4.10...v0.4.11)

---

## v0.5.1

_Released 2025-11-12 · commit `63f18995`_

## Features

- feat(blogs): added blog tags (#1935)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5...v0.5.1)

---

## v0.5.2

_Released 2025-11-12 · commit `66c8fa2a`_

## Features

- feat(drizzle): added ods for analytics from drizzle (#1956)
- feat(newgifs): added new gifs (#1953)
- fix(templates-details): restore approval feature, and keep details UI consistent, smoothen out creation of profile (#1943)
- fix(presence): fix additional avatars showing for presence (#1938)

## Improvements

- improvement: template use button (#1954)
- improvement: templates styling (#1952)
- improvement: usage-indicator UI (#1948)

## Bug Fixes

- fix(autoconnect): should check if triggermode is set from the toolbar drag event directly (#1951)
- fix(executor): consolidate execution hooks (#1950)
- fix(deploy): fix button (#1949)
- fix(files): changed file input value sample from string -> object (#1947)
- fix(settings): fix broken api keys, help modal, logs, workflow renaming (#1945)
- fix(wand): subblocks should not be overwritten after wand gen (#1946)
- fix(landing): need to propagate landing page copilot prompt (#1944)
- fix(templates): fix templates details page (#1942)
- fix(templates): fix template details page (#1940)
- fix: table subblock (#1937)

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.1...v0.5.2)

---

## v0.5.3

_Released 2025-11-12 · commit `53150021`_

_Release v0.5.3 — no release body on GitHub; commit has no details._

---

## v0.5.4

_Released 2025-11-13 · commit `d2c01478`_

_Release v0.5.4 — no release body on GitHub; commit has no details._

---

## v0.5.5

_Released 2025-11-14 · commit `aca4d2fc`_

## Features

- feat(i18n): update translations (#1989)
- feat(slack): add better error messages, reminder to add bot to app (#1990)
- feat(slack): added slack full message object in response (#1987)
- feat(files): add presigned URL generation support for execution files (#1980)

## Improvements

- Improvement(ui/ux): signup, command-list, cursors, search modal, workflow runs, usage indicator (#1998)
- improvement(tanstack): migrate multiple stores (#1994)
- improvement(variables): support dot notation for nested objects (#1992)
- improvement(logs): improved logs search (#1985)

## Bug Fixes

- fix(variables): fix variables block json resolution (#1997)
- fix(folders): duplicate (#1996)
- fix(variables): fix double stringification (#1991)
- fix(landing): hero stripe icon (#1988)
- fix(output-selector): z-index in chat deploy modal (#1984)
- fix(settings): update usage data in settings > subs to use reactquery hooks (#1983)
- fix(popovers): billed account + async example command (#1982)
- fix(onedrive): parse array values correctly (#1981)
- fix(logs): show block inputs (#1979)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.4...v0.5.5)

---

## v0.5.6

_Released 2025-11-17 · commit `3058e35e`_

executor fixes, UI improvements, run paths (#2028)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.5...v0.5.6)

---

## v0.5.7

_Released 2025-11-17 · commit `8f0ef580`_

## Features

- fix(workflows): fixed workflow loading in without start block, added templates RQ hook, cleaned up unused templates code (#2035)
- fix(notes): fix notes block spacing, additional logs for billing transfer route (#2029)
- feat(performance): added reactquery hooks for workflow operations, for logs, fixed logs reloading, fix subscription UI (#2017)
- feat(billing): add notif for first failed payment, added upgrade email from free, updated providers that supported granular tool control to support them, fixed envvar popover, fixed redirect to wrong workspace after oauth connect (#2015)
- fix(triggers): disabled trigger shouldn't be added to dag (#2012)
- feat(i18n): update translations (#2009)
- feat(models): added gpt-5.1 (#2007)

## Improvements

- improvement(selectors): consolidate all integration selectors to use the combobox (#2020)
- improvement(docs): remove copy page from mobile view on docs (#2037)
- improvement(undo-redo): expand undo-redo store to store 100 ops instead of 15 (#2036)
- improvement: code subblock, action bar, connections (#2024)
- improvement: runpath edges, blocks, active (#2008)

## Bug Fixes

- fix(workflow-block): clearing child workflow input format field must lazy cascade parent workflow state deletion (#2038)
- fix(triggers): dedup + not surfacing deployment status log (#2033)
- fix(overage): fix pill calculation in the usage indicator to be consistent across views (#2034)
- fix(usage-data): refetch on usage limit update in settings (#2032)
- fix(response): fix response block http format (#2027)
- fix(router): fix error edge in router block + fix source handle problem (#2019)
- fix(copilot): run workflow supports input format and fix run id (#2018)
- fix(variables): Fix resolution on double < (#2016)
- fix(tags): only show start block upstream if is ancestor (#2013)
- fix(triggers): check triggermode and consolidate block type (#2011)
- fix(condition): treat condition input the same as the code subblock (#2006)
- fix(modals): fix z-index for various modals and output selector and variables (#2005)
- fix(pdfs): use unpdf instead of pdf-parse (#2004)
- fix(notes): fix notes, tighten spacing, update deprecated zustand function, update use mention data to ignore block positon (#2002)
- fix(usage-indicator): conditional rendering, upgrade, and ui/ux (#2001)

## Other Changes

- Merge branch 'main' into staging
- test(pr): github trigger (#2000)
- test(pr): hackathon (#1999)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.6...v0.5.7)

---

## v0.5.8

_Released 2025-11-20 · commit `31c34b2e`_

# Release v0.5.8

## Features
- feat: notification store (#2025) by @emir-karabeg

## Other Changes
- v0.5.8: notifications, billing, ui changes, store loading state machine by @icecrasher321
- improvement(linear): cleanup linear checks (#2075) by @icecrasher321
- fix(resolver): json/array field parsing (#2074) by @icecrasher321
- fix(stt): add fallback for ffmpeg (#2073) by @waleedlatif1
- feat(i18n): update translations (#2071) by @waleedlatif1
- fix(linear): update required fields (#2070) by @waleedlatif1
- feat(tools): added speech to text with openai whisper, elevenlabs, and deepgram (#2068) by @waleedlatif1
- fix(blogs): update sitemap and fix loading strat on blogs to prevent mobile crash (#2067) by @waleedlatif1
- improvement(store-hydration): refactor loading state tracking for workflows (#2065) by @icecrasher321
- fix(tools): added stricter aura host db validation check for neo4j tool (#2066) by @waleedlatif1
- feat(chat): add 'add inputs' button to chat window (#2057) by @emir-karabeg
- feat(i18n): update translations (#2064) by @waleedlatif1
- feat(i18n): update translations (#2062) by @waleedlatif1
- improvement(ux): added tab key navigation for agent messages, made variables styling match chat, added neo4j and calendly (#2056) by @waleedlatif1
- improvement(tools): add eleven_v3 to elevenlabs block (#2053) by @ThisGuyCodes
- improvement(tools): added add worksheet to excel block (#2061) by @aadamgough
- fix(z-index): deployment versions rename + view active popover (#2059) by @icecrasher321
- fix(mcp-preview): server and tool name fetch to use tanstack (#2058) by @icecrasher321
- improvement(runners): added blacksmith optimizations to workflows and dockerfiles to enhance performance (#2055) by @waleedlatif1
- fix(dialogs): standardized delete modals (#2049) by @waleedlatif1
- fix(ui): live usage indicator, child trace spans, cancel subscription modal z-index (#2044) by @icecrasher321
- fix(copiolot-ui): fix code markdown rendering in copilot & table (#2048) by @waleedlatif1
- fix(subflows): add loops/parallels to accessible list of blocks in the tag dropdown when contained withitn a subflow (#2047) by @waleedlatif1
- fix(models): remove unrelease oai models, fix help modal (#2046) by @waleedlatif1
- improvement(notifications): add option to disable error notifications, remove deprecated autoFillEnvVars field (#2045) by @waleedlatif1
- feat(agent): messages array, memory (#2023) by @emir-karabeg
- fix(deploy): add sockets op for renaming blocks (#2043) by @waleedlatif1

---

## v0.5.9

_Released 2025-11-20 · commit `842ef27e`_

# Release v0.5.9

## Other Changes
- v0.5.9: add backwards compatibility for agent messages array by @waleedlatif1
- fix(agent): add backwards compat for agent messages array (#2076) by @waleedlatif1

---

## v0.5.11

_Released 2025-11-25 · commit `ebcd2439`_

## Features

- feat(copilot): add claude opus 4.5 and remove context usage indicator (#2113)
- fix(copilot): fix webhook triggers unsaving in new diff store (#2096)
- feat(agent): added workflow, kb, and function as a tool for agent block, fix keyboard nav in tool input (#2107)
- feat(models): added claude opus 4.5 (#2111)
- added new scope (#2110)
- feat(i18n): update translations (#2106)
- improvement(docs): added docs content (#2105)
- feature(models): added vllm provider (#2103)
- added missing mcp images (#2099)
- feat(i18n): update translations (#2097)
- feat(tools): added more tts providers, added stt and videogen models, fixed search modal keyboard nav (#2094)
- improvement(copilot): add gpt5.1 and codex (#2092)
- feat(i18n): update translations (#2088)
- feat: keyboard navigation; improvement: SEO/GEO; refactor: file structure, unused fonts; fix: chat streaming, notification stack (#2083)
- fix(logging): add preprocessing util shared by all execution paths (#2081)

## Improvements

- improvement(logs): surface integration triggers in logs instead of catchall 'webhook' trigger type (#2102)
-  v0.5.10: copilot upgrade, preprocessor, logs search, UI, code hygiene
- improvement(copilot): v0.2 (#2086)
- improvement(chat): ui (#2089)
- improvement(runners): upgrade runners, remove trigger deploy action (#2082)

## Bug Fixes

- improvement(autolayout): simplify code to use fixed block widths, height + refactor (#2112)
- fix(billing): only check owners for billed overages (#2085)
- fix(settings): settings components and behavior consolidation (#2100)
- fix(integ): remove unused oauth providers from list of supported integrations (#2090)
- fix(linear): fix remaining ops (#2087)
- fix(logs): fixed logs search (#2084)
- fix(embeddings): modified embeddings utils to only index english docs (#2078)
- fix(undo-redo): eviction policy to not have unbounded undo-redo stacks (#2079)

## Other Changes

- removed broken scope (#2098)

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.9...v0.5.11)

---

## v0.5.12

_Released 2025-11-28 · commit `1d087968`_

## Features

- fix(custom-tools): add composite index on custom tool names & workspace id (#2131)
- fix(permissions): add client-side permissions validation to prevent unauthorized actions, upgraded custom tool modal (#2130)
- feat(i18n): update translations (#2129)
- feat(tools): added zendesk, pylon, intercom, & mailchimp (#2126)
- feat(i18n): update translations (#2123)
- feat(models): host google gemini models (#2122)
- feat(i18n): update translations (#2120)
- feat(tools): added sentry, incidentio, and posthog tools (#2116)
- fix(memory-util): fixed unbounded array of gmail/outlook pollers causing high memory util, added missing db indexes/removed unused ones, auto-disable schedules/webhooks after 10 consecutive failures (#2115)

## Improvements

- improvement(workflow-execution): perf improvements to passing workflow state + decrypted env vars (#2119)
- improvement(teams-plan): seats increase simplification + not triggering checkout session (#2117)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.11...v0.5.12)

---

## v0.5.13

_Released 2025-12-01 · commit `8c32ad4c`_

## Features

- fix(bill): add requestId to webhook processing (#2144)
- feat(i18n): update translations (#2141)
- feat(tools): add generic search tool (#2140)
- feat(statuspage): added statuspage, updated list of tools in footer, renamed routes (#2139)
- feat(env): added more optional env var examples (#2138)
- feat(i18n): update translations (#2137)
- feat(tools): added apify block/tools (#2136)
- feat(creators): add verification for creators (#2135)
- feat(i18n): update translations (#2134)
- feat(tools): added smtp, sendgrid, mailgun, linkedin, fixed permissions in context menu (#2133)

## Improvements

- improvement(subflow): remove all associated edges when moving a block into a subflow (#2145)

## Bug Fixes

- fix(deps): declare core transient deps explicitly (#2147)
- fix(polling): mark webhook failed on webhook trigger errors (#2146)
- fix(webhooks): count test webhooks towards usage limit (#2143)
- fix(sdks): bump sdk versions (#2142)
- fix(team-plans): track departed member usage so value not lost (#2118)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.12...v0.5.13)

---

## v0.5.14

_Released 2025-12-01 · commit `54cc9374`_

## Improvements

- improvement(selectors): make serviceId sole source of truth (#2128)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.13...v0.5.14)

---

## v0.5.15

_Released 2025-12-01 · commit `774e5d58`_

## Features

- feat(tools): added rds, dynamodb, background color gradient (#2150)

## Bug Fixes

- fix(selector): remove subblock state prop for subblock component (#2151)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.14...v0.5.15)

---

## v0.5.16

_Released 2025-12-02 · commit `e157ce5f`_

## Features

- feat(i18n): update translations (#2163)
- feat(models): added xai models and updated gemini pricing (#2161)
- feat(models): added latest mistral models (#2159)
- feat(i18n): update translations (#2153)

## Improvements

- improvement(lib): refactored lib/ to be more aligned with queries and api directory (#2160)
- improvement(agent): switch default model to claude 4.5 sonnet (#2156)

## Bug Fixes

- fix(logs): logging with error issues for model costs (#2169)
- fix(trace-spans): fix input/output token count in trace spans (#2168)
- fix(jira): fixed incorrect dependsOn for jira project/issue subblcks (#2167)
- fix(templates-page): loading issue due to loading extensive workflow block in preview for all listings (#2166)
- fix(templates): fixed verified creator status displaying & tooltip on templates (#2165)
- fix(subblocks): update guardrails pii selector component to use emcn (#2164)
- fix(icons): fix mailgun, restore tts and smtp blocks (#2162)
- fix(mcp): reuse sessionID for consecutive MCP tool calls, fix dynamic args clearing, fix refreshing tools on save (#2158)
- fix(docs): update docs to background instead of backgroundColor (#2154)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.15...v0.5.16)

---

## v0.5.17

_Released 2025-12-04 · commit `31874939`_

## Features

- feat: terminal serach; fix: delete-modal (#2176)
- feat(i18n): update translations (#2178)
- feat(tools): added zoom, elasticsearch, dropbox, kalshi, polymarket, datadog, ahrefs, gitlab, shopify, ssh, wordpress (#2175)
- feat: light, emcn, modals (#2104)

## Improvements

- chore(deps): upgrade to bun v1.3 (#2181)
- chore(deps): upgrade from nextjs 15.4.1 to 15.4.8 and upgrade turborepo (#2180)

## Bug Fixes

- fix(chat): fix download & clear popover staying open after pressing in floating chat (#2192)
- fix(copilot): fix code viewer in copilot user inp (#2191)
- fix: tooltip on env settings (#2190)
- fix(settings): fixed sso form validation (#2189)
- fix: modals, settings, panel (#2187)
- fix(input): allow test value if no real value provided for inputs in deployed executions (#2186)
- fix(polling): fixed gmail and outlook polling to respect disabled status (#2185)
- fix(executor): nested error activation (#2184)
- fix(mcp): remove client-side cache and reduce server cache from 5m to 30s (#2182)
- fix: commented out light mode (#2173)

## Contributors

- @Sg312
- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.16...v0.5.17)

---

## v0.5.18

_Released 2025-12-05 · commit `6cd078b0`_

## Features

- feat(i18n): update translations (#2208)
- feat(tools): added more slack tools (#2212)
- feat(copilot): superagent (#2201)
- feat(admin): added admin APIs for admin management (#2206)
- fix(images): updated helm charts with branding URL guidance, removed additional nextjs image optimizations (#2205)
- feat(i18n): update translations (#2204)
- feat(error-notifications): workspace-level configuration of slack, email, webhook notifications for workflow execution (#2157)

## Improvements

- improvement: loading, optimistic actions (#2193)
- chore(deps): upgrade to nextjs 16 (#2203)
- improvement: modal UI (#2202)

## Bug Fixes

- fix(custom-bot-slack): dependsOn incorrectly set for bot_token (#2214)
- fix(copilot): validation (#2215)
- fix(import): fix array errors on import/export (#2211)
- fix(env-vars): refactor for workspace/personal env vars to work with server side execution correctly (#2197)
- fix(enterprise-plan): seats should be taken from metadata (#2200)
- fix(profile-pics): remove sharp dependency for serving profile pics in settings (#2199)
- fix(subscription): fixed text clipping on subscription panel (#2198)
- fix(envvar): fix envvar dropdown positioning, remove dead code (#2196)
- fix(settings): fix long description on wordpress integration (#2195)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.17...v0.5.18)

---

## v0.5.19

_Released 2025-12-05 · commit `12c4c2d4`_

## Features

- fix(build): added trigger.dev sdk mock to tests (#2216)
- fix(build): added trigger.dev sdk mock to tests (#2216)

## Bug Fixes

- fix(copilot): fix function execute tool (#2222)
- fix(copilot): fix tool call flash (#2221)
- fix(copilot): fix hanging tool calls (#2218)

## Contributors

- @Sg312
- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.18...v0.5.19)

---

## v0.5.21

_Released 2025-12-08 · commit `c27c233d`_

## Features

- feat(i18n): update translations (#2249)
- feat(i18n): update translations (#2246)
- feat(cursor): add cursor block and tools (#2245)
- feat(i18n): update translations (#2244)
- feat(i18n): update translations (#2238)
- feat(docs): added additional self-hosting documentation (#2237)
- feat(credits): prepurchase credits (#2174)
- improvement(salesforce): fixed refresh and added endpoints (#2177)
- fix(inactivity-notif): add cron to helm (#2235)
- feat(i18n): update translations (#2233)
- fix(google-drive): added support for shared drive (#2232)
- feat(google-groups): added google groups (#2229)
- feat(admin): added more billing, subscriptions, and organization admin API routes (#2225)
- feat(i18n): update translations (#2226)
- feat(tools): google slides tool, terminal console virtualization, tool fixes (#2209)

## Improvements

- improvement(code): removed dedicated code-optimized virtualized viewer, baked it into the code component (#2234)
- improvement(ui): revert settings > envvar ui (#2227)

## Bug Fixes

- fix(docs): fix salesforce docs & update styling (#2248)
- fix(conditional): don't error in condition blocks when no conditions are satisfied (#2243)
- fix(import): fixed trigger save on export/import flow (#2239)
- fix(autolayout): reduce horizontal spacing in autolayout (#2240)
- fix(copilot-autolayout): more subflow cases and deal with resizing (#2236)
-  v0.5.20: google slides, ui fixes, subflow resizing improvements
- fix(copilot): fixed copilot code component overflowing gutter (#2230)
- fix(hosted): fixed hosted providers to exact string match model names rather than check provider names (#2228)
- fix(autolayout): subflow calculation (#2223)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.19...v0.5.21)

---

## v0.5.22

_Released 2025-12-09 · commit `52edbea6`_

## Features

- feat(i18n): update translations (#2268)
- feat(triggers): added rss feed trigger & poller (#2267)
- feat(dropdowns): added searchbox to the operation dropdown for all blocks (#2266)
- feat(redis): added redis option for rate limiter, 10x speed improvement in rate limit checks & reduction of DB load (#2263)
- feat(i18n): update translations (#2262)
- feat(copilot): updated copilot keys to have names, full parity with API keys page (#2260)
- feat(tools): added sftp tool to accompany smtp and ssh tools (#2261)
- feat(i18n): update translations (#2259)
- feat(tools): added duckduckgo (#2258)
- feat(admin): updated admin routes to consolidate duplicate behavior (#2257)

## Improvements

- improvement(org): remove dead seats get endpoint (#2247)

## Bug Fixes

- fix(org-limits): remove fallbacks for enterprise plan (#2255)
- fix(nextjs-size-limit): surface 413s accurately (#2265)
- fix(custom-tools, copilot): custom tools state + copilot fixes (#2264)
- fix(pre-proc-checks): deployed checks should precede cost/ratelimit increments" (#2250)
- fix(timeouts): increased timeouts for function execution & agent (#2256)
- fix(migration): migration got removed by force push (#2253)
- fix(migration): migration got removed by force push (#2253)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.21...v0.5.22)

---

## v0.5.23

_Released 2025-12-10 · commit `b7bbef86`_

## Features

- improvement(chat): add the ability to download files from the deployed chat (#2280)
- feat(ui): logs, kb, emcn (#2207)
- feat(i18n): update translations (#2276)
- feat(i18n): update translations (#2275)
- feat(rate-limiter): token bucket algorithm (#2270)

## Improvements

- improvement: custom tools modal, logs-details (#2283)

## Bug Fixes

- fix(container): resize heuristic improvement (#2285)
- fix(docs): fix copy page button and header hook (#2284)
- fix(creds): glitch allowing multiple credentials in an integration (#2282)
- fix(ime): prevent form submission during IME composition steps (#2279)
- fix(copilot): fix custom tools (#2278)
- fix(autolayout): align by handle (#2277)
- fix(tools): updated kalshi and polymarket tools to accurately reflect outputs (#2274)
- fix(mcp): prevent redundant MCP server discovery calls at runtime, use cached tool schema instead (#2273)

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @mosaxiv
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.22...v0.5.23)

---

## v0.5.24

_Released 2025-12-10 · commit `18b70324`_

## Features

- fix(mcp): added backfill effect to add missing descriptions for mcp tools (#2290)
- feat(folders): add the ability to create a folder within a folder in popover (#2287)

## Improvements

- improvement(log-details): polling, trace spans (#2292)

## Bug Fixes

- fix(redis): cleanup access pattern across callsites (#2289)
- fix(agent): filter out empty params to ensure LLM can set tool params at runtime (#2288)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.23...v0.5.24)

---

## v0.5.25

_Released 2025-12-10 · commit `b5da6137`_

## Improvements

- improvement(ui/ux): small styling improvements (#2293)

## Bug Fixes

- fix(billing): copilot should directly deduct credit balance (#2294)

## Contributors

- @emir-karabeg
- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.24...v0.5.25)

---

## v0.5.26

_Released 2025-12-11 · commit `3fbd57ca`_

## Features

- feat(deployment-version): capture deployment version in log (#2304)
- feat(sidebar): scroll to workflow/folder (#2302)
- feat(i18n): update translations (#2303)
- feat(i18n): update translations (#2299)

## Bug Fixes

- fix(dbs): remove harness from validation on user-provided db creds (#2308)
- fix(x): fix x optional tool params (#2307)
- fix(stagehand): upgraded stagehand sdk to remove deps incomptaible with bun runtime (#2305)
- fix(condition): fix condition block for no outgoing edge (#2306)
- fix(tools): fix perplexity & parallel ai tag dropdown inaccuracies (#2300)
- fix(tools): fixed zendesk tools, kb upload failure for md files, stronger typing (#2297)
- fix(dashboard): prevent dashboard from getting unmounted when on the logs page (#2298)
- fix(ui/ux): templates and knowledge pages (#2296)

## Contributors

- @Sg312
- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.25...v0.5.26)

---

## v0.5.27

_Released 2025-12-11 · commit `e24f31cb`_

## Features

- fix(ollama): fixed messages array for ollama, added gpt-5.2 (#2315)

## Improvements

- improvement(sidebar): auto-scroll (#2312)

## Bug Fixes

- fix(tools): updated browser use and stagehand to use the latest models (#2319)
- fix(pg): for pg tools, use count isntead of length for number of rows impacted (#2317)
- fix(parallel): variable resolution in collection (#2314)
- fix(vuln): fix dns rebinding/ssrf vulnerability (#2316)
- fix(workflow-changes): changes detected in autolayout (#2313)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.26...v0.5.27)

---

## v0.5.28

_Released 2025-12-12 · commit `f526c36f`_

## Features

- feat(ui): added component playground & fixed training modal (#2354)
- feat(i18n): update translations (#2351)
- feat(integration): add spotify (#2347)
- feat(i18n): update translations (#2345)
- feat(i18n): update translations (#2339)
- feat(releases): tag releases to main with version numbers, speed up docker builds (#2337)
- feat(mcp): added the ability to refresh servers to grab new tools (#2335)
- feat(i18n): update translations (#2334)
- fix(envvars): added industry standard dotenv parsing regex for adding envvars in settings (#2327)
- feat(i18n): update translations (#2331)
- feat(i18n): update translations (#2328)
- feat(i18n): update translations (#2321)
- feat(tools): added sqs integration (#2310)

## Improvements

- improvement(kb): modals, page layouts (#2330)

## Bug Fixes

- fix(next): externalize playwright and ws (#2352)
- fix(build): explicitly install shims module from anthropic and openai in stagehand route (#2350)
- fix(validation): don't validate disabled blocks (#2348)
- fix(next): remove openai and anthropic sdk's from serverExternalPackages (#2349)
- fix(copilot): fix incorrectly sanitizing json state (#2346)
- fix(build): fix DB dockerfile (#2344)
- fix(cron): reject CRON requests when CRON secret is not set (#2343)
- fix(minor-bugs): grafana, zep, video generation, templates fixes (#2336)
- fix(browserbase): consoldiated stagehand agent and extract, updated wand UI to resize based on panel size (#2340)
- fix(build): remove incompatible --frozen-lockfile and --omit dev from docker (#2341)
- fix(tools): remove pylon (#2338)
- fix(tools): fixed trello and telegram operations (#2332)
- fix(firecrawl): updated output for firecrawl extract (#2333)
- fix(firecrawl): fixed optional params for firecrawl (#2329)
- fix(tools): fixed tool outputs (#2325)
- fix(kb): handle larger files in the kb (#2324)
- fix(mistral): remove wrapped output from mistral parse for kb parsing pdfs (#2326)
- fix(tools): fixed webflow limit and offset params (#2323)
- fix(nextjs): upgrade nextjs to patch security vuln (#2320)

## Other Changes

- chore(db): remove unused  table and unused route (#2342)

## Contributors

- @EstebanCanela
- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.27...v0.5.28)

---

## v0.5.29

_Released 2025-12-13 · commit `a0fb8896`_

## Features

- fix(tools): add validation for ids in tool routes (#2371)
- feat(i18n): update translations (#2370)
- feat(webflow): added collection, item, & site selectors for webflow (#2368)
- feat(registration): allow self-hosted users to disable registration altogether (#2365)
- feat(og): update og image (#2362)
- feat(docs): add opengraph to docs for dynamic link preview (#2360)
- fix(spotify): added missing human readable scopes to oauth required modal (#2355)

## Improvements

- improvement(admin-routes): cleanup code that could accidentally desync stripe and DB (#2363)
- improvement(autolayout): reduce horizontal spacing (#2357)
- chore(icons): update spotify icon (#2356)

## Bug Fixes

- fix(organizations): move organization better-auth client to conditionally be included based on FF (#2367)
- fix(subflows): prevent cross-boundary connections on autoconnect drop between subflow blocks and regular blocks (#2366)
- fix(sub-deletion): subscription deletion handling for pro vs team/enterprise (#2364)
- fix(deployed-chat): voice mode (#2358)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.28...v0.5.29)

---

## v0.5.30

_Released 2025-12-15 · commit `25afacb2`_

## Features

- feat(i18n): update translations (#2395)
- feat(slack): ability to have DM channels as destination for slack tools (#2388)
- fix(permissions): add client-side hints to prevent read-only users from creating workflows or folders (#2390)
- fix(rce): add 'isolate' to list of trusted deps, fixed custom tools environment resolution (#2387)
- feat(i18n): update translations (#2386)

## Improvements

- improvement: workflow loading, sidebar scrolling (#2322)
- improvement(rce): updated rce to use isolate pkg for RCE (#2385)

## Bug Fixes

- fix(build): downgrade nextjs from canary to 16.0.9 (#2394)
- fix(docs): regen docs (#2393)
- fix(node): use node subprocess explicitly (#2391)
- fixed jira output (#2392)
- fix(vm): use node child process for RCE (#2389)
- fix(wand): should not be able to use wand ui without write/admin perms (#2384)
- fix(wand): validate session before allowing access to wand generation (#2383)
- fix(subscription): incomplete team subscription race condition (#2381)
- fix(landing): prevent url encoding for spaces for footer links (#2376)
- fix(docs): clarify working directory for drizzle migration (#2375)
- fix(vllm): remove requirement for api key for vllm (#2380)
- fix(blog): use unoptimized tag for image assets (#2374)

## Contributors

- @Chadha93
- @Shivam-002
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.29...v0.5.30)

---

## v0.5.31

_Released 2025-12-15 · commit `f9cfca92`_

## Features

- fix(sockets): add zod as direct sockets server dep (#2397)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.30...v0.5.31)

---

## v0.5.32

_Released 2025-12-16 · commit `837aabca`_

## Features

- feat(schedule): add input form to schedule (#2405)

## Bug Fixes

- fix(serializer): condition check should check if any condition are met (#2410)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.31...v0.5.32)

---

## v0.5.33

_Released 2025-12-17 · commit `1d6975db`_

## Features

- feat(vertex): added vertex to list of supported providers (#2430)
- feat(i18n): update translations (#2421)
- feat(service-now): added service now block (#2404)
- improvement(helm): added more to helm charts, remove instance selector for various cloud providers (#2412)

## Improvements

- improvement(subflow): resize vertical height estimate (#2428)
- improvement(mcp): restructure mcp tools caching/fetching info to improve UX (#2416)

## Bug Fixes

- fix(condition): used isolated vms for condition block RCE (#2432)
- fix(inactivity-poll): need to respect level and trigger filters (#2431)
- fix(terminal): fix text wrap for errors and messages with long strings (#2429)
- fix(subflow): resizing live update
- fix(cmd-k): when navigating to current workspace/workflow, close modal instead of navigating (#2420)
- fix(subflow): fix json stringification in subflow collections (#2419)
- fix(chat): fix stale closure in workflow runner for chat (#2418)
- fix(logs-search): restored support for log search queries (#2417)
- fix(loop): increased max loop iterations to 1000 (#2413)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.32...v0.5.33)

---

## v0.5.34

_Released 2025-12-17 · commit `67cfb21d`_

## Features

- fix(custom-tools): added missing _toolSchema to internal param set for agents calling custom tools (#2445)
- feat(i18n): update translations (#2443)
- feat(i18n): update translations (#2438)

## Bug Fixes

- fix(oauth): updated oauth providers that had unstable reference IDs leading to duplicate oauth records (#2441)
- fix(servicenow): update servicenow block to use basic auth instead of oauth (#2435)
- fix(graph): prevent cyclic dependencies in graph following ReactFlow examples (#2439)
- fix(conditions): make outputs correct (#2437)
- fix(envvars): cleanup unused envvars (#2436)

## Contributors

- @Pbonmars-20031006
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.33...v0.5.34)

---

## v0.5.35

_Released 2025-12-18 · commit `eb07a080`_

## Features

- adding clamps for subflow drag and drops of blocks (#2460)
- fix(blog): add back unoptimized tag, fix styling (#2461)
- improvement(copilot): add edge handle validation to copilot edit workflow (#2448)
- improvement(helm): added SSO and cloud storage variables to helm charts (#2454)
- feat(docs): added 404 page for the docs (#2450)
- feat(compare-schema): ci check to make sure schema.ts never goes out of sync with migrations (#2449)
- fix(auth): added same-origin validation to forget password route, added confirmation for disable auth FF (#2447)
- fix(workflow-state, copilot): prevent copilot from setting undefined state, fix order of operations for copilot edit workflow, add sleep tool (#2440)

## Improvements

- Merge pull request #2451 from simstudioai/improvement/SIM-514-useWebhookUrl-conditioning

## Bug Fixes

- fix failing lint from os contributor (#2459)
- fix(teams): webhook notifications crash (#2426)
- fix(blog): revert back to using next image tags in blog (#2458)
- fix(ui): fixed visibility issue on reset passowrd page (#2456)
- fix(notifs): inactivity polling filters, consolidate trigger types, minor consistency issue with filter parsing (#2452)
- Revert "fix(salesforce): updated to more flexible oauth that allows production, developer, and custom domain salesforce orgs (#2441) (#2444)" (#2441)
- fixing lint errors
- fixing a react component:
- fix(salesforce): updated to more flexible oauth that allows production, developer, and custom domain salesforce orgs (#2441) (#2441)
- fixing the useWbehookManangement call to only call the loadwebhookorgenerateurl function when the useWebhookurl flag is true
- fix(condition): async execution isolated vm error (#2446)

## Other Changes

- Merge branch 'main' into staging

## Contributors

- @CodeLoopdroid
- @Pbonmars-20031006
- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.34...v0.5.35)

---

## v0.5.36

_Released 2025-12-19 · commit `4d1a9a3f`_

## Features

- fix(sanitization): added more input sanitization to tool routes (#2475)
- improvement(db): added missing indexes for common access patterns (#2473)
- fix(authentication): added auth checks for various routes, mysql and postgres query validation, csp improvements (#2472)
- fix(unsubscribe): add one-click unsubscribe (#2467)
- feat(i18n): update translations (#2470)
- feat(og): add opengraph images for templates, blogs, and updated existing opengraph image for all other pages (#2466)
- feat(i18n): update translations (#2463)

## Improvements

- improvement(hitl): show resume url in tag dropdown within hitl block (#2464)

## Bug Fixes

- fix(slack): respect message limit, remove duplicate canonical representations (#2469)
- fix(tools): improved slack output ux and jira params (#2462)

## Contributors

- @Pbonmars-20031006
- @aadamgough
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.35...v0.5.36)

---

## v0.5.37

_Released 2025-12-19 · commit `3e697d9e`_

## Features

- fix(condition): fixed deactivated edges when if and else if conditions connected to same destination block, added 100+ unit tests (#2497)
- feat(kb): Adding support for more tags to the KB (#2433)
- fix(helm): add custom egress rules to realtime network policy (#2481)
- fix(subflow): prevent auto-connect across subflow edges with keyboard shortcut block additions, make positioning for auto-drop smarter (#2489)
- fix(autofill): add dummy inputs to prevent browser autofill for various fields, prevent having 0 workflows in workspace (#2482)

## Improvements

- improvement(ui): updated kb tag component to match existing table (#2498)
- improvement(ui): updated subscription and team settings modals to emcn (#2477)

## Bug Fixes

- fix(condition): remove dead code from condition handler, defer resolution to function execute tool like the function block (#2496)
- fix(tool-input): allow multiple instances of workflow block or kb tools as agent tools (#2495)
- fix(logs): always capture cost, logging size failures (#2487)
- fix(edges): prevent autoconnect outgoing edges from response block (#2479)
- fix(redaction): consolidate redaction utils, apply them to inputs and outputs before persisting logs (#2478)
- fix(api-keys): remove billed account check during api key generation (#2476)

## Contributors

- @Lutherwaves
- @Pbonmars-20031006
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.36...v0.5.37)

---

## v0.5.38

_Released 2025-12-20 · commit `4827866f`_

## Features

- feat(settings): added snap to grid slider to settings (#2504)
- feat(audit): added audit log for billing line items (#2500)
- feat(copilot): show inline prompt to increase usage limit or upgrade plan (#2465)
- improvement(queries): add workspaceId to execution logs, added missing indexes based on query insights (#2471)

## Bug Fixes

- fix(code): cmd-z after refocus should not clear subblock (#2503)
- fix(migrations): remove duplicate indexes (#2501)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.37...v0.5.38)

---

## v0.5.39

_Released 2025-12-20 · commit `0f4ec962`_

## Features

- fix(vars): add socket persistence when variable names are changed, update variable name normalization to match block name normalization, added space constraint on envvar names (#2508)

## Bug Fixes

- fix(notion): remove hyphenation of incoming page ID's (#2507)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.38...v0.5.39)

---

## v0.5.40

_Released 2025-12-21 · commit `3d9d9cbc`_

## Features

- fix(jira): added uuid (#2513)

## Improvements

- improvement(supabase): allow non-public schemas (#2511)

## Contributors

- @aadamgough
- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.39...v0.5.40)

---

## v0.5.41

_Released 2025-12-23 · commit `e12dd204`_

## Features

- feat(copilot): add tools to access block outputs and upstream references (#2546)
- fix(billing): add line items for wand (#2543)
- feat(i18n): update translations (#2541)
- improvement(kb): improve chunkers, respect user-specified chunk configurations, added tests (#2539)
- fix(oauth): add User-Agent header to Reddit token refresh (#2517)
- feat(i18n): update translations (#2538)
- feat(i18n): update translations (#2530)
- feat(i18n): update translations (#2526)
- feat(intercom): added additional params to intercom tools (#2523)

## Improvements

- improvement(landing): free usage limit (#2547)
- improvement(block-metadata): remove references to yaml syntax in best practices (#2537)
- improvement(pricing): increase free user limit to 20 usd (#2536)
- improvement(logs): dashboard/logs optimizations and improvements (#2414)
- improvement(docs): update og image (#2529)
- improvement(copilot): improve copilot metadata processing and tool output memory (#2516)

## Bug Fixes

- improvement(logs): fixed logs for parallel and loop execution flow (#2468)
- fix(search): removed full text param from built-in search, anthropic provider streaming fix (#2542)
- fix(dashboard): flash based on loading check (#2535)
- fix(models): memory fixes, provider code typing, cost calculation cleanup (#2515)

## Contributors

- @Pbonmars-20031006
- @Sg312
- @emir-karabeg
- @icecrasher321
- @majiayu000
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.40...v0.5.41)

---

## v0.5.42

_Released 2025-12-23 · commit `57e4b49b`_

## Bug Fixes

- fix memory migration (#2548)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.41...v0.5.42)

---

## v0.5.43

_Released 2025-12-23 · commit `b3042330`_

## Features

- feat(i18n): update translations (#2568)
- feat(schedules): remove save button for schedules, couple schedule deployment with workflow deployment (#2566)
- feat(ux): add expandFolder to auto expand folders on nested folder creation (#2562)
- feat(i18n): update translations (#2561)
- feat(i18n): update translations (#2558)
- feat(tools): added grain and circleback (#2557)
- improvement(vertex): added vertex to all LLM-based blocks, fixed refresh (#2555)

## Improvements

- improvement(logs): state machine of workflow execution (#2560)
- improvement(code-quality): centralize regex checks, normalization (#2554)
- improvement(usage): update usage limit in realtime, standardize token output object across providers (#2553)
- improvement(oauth): remove unused scope hints (#2551)
- improvement(logs): update logs export route to respect filters (#2550)

## Bug Fixes

- fix(grafana): tool outputs (#2565)
- fix(dropbox): access type param pass through to get refresh token (#2564)
- fix(ui): remove css transition on popover and dropdown items to avoid flicker (#2563)
- fix(jina): removed conditionally included outputs from jina (#2559)
- fix(perplexity): remove deprecated perplexity sonar reasoning model (#2556)
- fix(frozen-canvas): need to fetch the deployment version correctly (#2552)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.42...v0.5.43)

---

## v0.5.44

_Released 2025-12-26 · commit `b6ba3b50`_

## Features

- feat(i18n): update translations (#2604)
- feat(tools): added new firecrawl agent endpoint (#2603)
- fix(parallel): add parallel sentinel to make parallel-parallel and parallel-loop work correctly (#2593)
- improvement(tag-dropdown): added option to select block in tag dropdown, custom tools modal improvements, light mode fixes (#2594)
- feat(kb): added tags information to kb docs table (#2589)
- feat: light mode (#2457)
- feat(tests): added testing package, overhauled tests (#2586)
- feat(i18n): update translations (#2585)
- feat(docs): added vector search (#2583)
- feat(chat-otp): added db fallback for chat otp (#2582)
- feat(i18n): update translations (#2578)
- feat(byok): byok for hosted model capabilities (#2574)
- feat(autolayout): add fitToView on autolayout and reduce horizontal spacing between blocks (#2575)

## Improvements

- improvement(easyconnect): use native reactflow getIntersectingNodes instead of custom impl for easy connect (#2601)
- improvement(edges): drag edge over block (#2596)
- improvement(billing): migrate to decimaljs from number.parseFloat (#2588)
- improvement(schedules): use tanstack query to fetch schedule data, cleanup ui on schedule info component (#2584)
- improvement(byok): updated styling for byok page (#2581)
- improvement(byok): remove web search block exa (#2579)
- improvement(variables): update workflows to use deployed variables, not local ones to align with the rest of the canvas components (#2577)

## Bug Fixes

- fix: bg styling outside workspace (#2605)
- fix(tag-dropdown): fix the way variables are displayed in the tag dropdown (#2597)
- fix(block-name): updating block name should update downstream var refs (#2592)
- fix(tools): fixed tool outputs (#2534)
- fix(build): update dockerfile to contain testing package deps (#2591)
- fix(change-detection): move change detection logic to client-side to prevent unnecessary API calls, consolidate utils (#2576)
- fix(cancel-workflow-exec): move cancellation tracking for multi-task envs to redis (#2573)
- fix(router): update router to handle azure creds the same way the agent block does (#2572)
- fix(executor): workflow abort has to send abort signal to route for correct state update (#2571)
- fix(shortcut): fixed global keyboard commands provider to follow `latest ref pattern` (#2569)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.43...v0.5.44)

---

## v0.5.45

_Released 2025-12-27 · commit `dd3209af`_

## Features

- fix(docker): add logger package to realtime dockerfile (#2610)

## Improvements

- improvement(build): migrate to blacksmith sticky disks for faster builds, other build improvements (#2611)
- improvement(usage-indicator): update query invalidation for usage to update in realtime (#2607)
- improvement: required permissions, oauth modal badge (#2609)
- improvement(ui): hide divider when following subblock value is null (#2608)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.44...v0.5.45)

---

## v0.5.46

_Released 2025-12-29 · commit `f895bf46`_

## Features

- feat(i18n): update translations (#2619)
- fix(build): add tsconfig to db dockerfile (#2617)
- feat(tools): added greptile tools/block, updated copilot panel styling (#2618)
- improvement(monorepo): added tsconfig package, resolved type errors in testing package (#2613)

## Improvements

- improvement(globals): light colors (#2620)

## Bug Fixes

- fix(deploy): fix workflow change detection to handle old variable reference format (#2623)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.45...v0.5.46)

---

## v0.5.47

_Released 2025-12-30 · commit `54ab82c8`_

## Features

- improvement(kb): removed zustand cache syncing in kb, added chunk text tokenizer (#2647)
- feat(i18n): update translations (#2645)
- feat(workflow-as-mcp): added ability to deploy workflows as mcp servers and mcp tools (#2415)
- feat(i18n): update translations (#2643)
- improvement(tools): added input validation to jira service management routes (#2642)
- added jsm (#2641)
- feat(cursorrules): updated cursorrules and claude md file (#2640)
- feat(filtering): added the ability to filter logs by date and date range (#2639)
- feat(kb): added permissions to workspace popover, added kb popover to view tags, edit description and kb name (#2634)

## Improvements

- improvement(copilot): ui/ux; refactor: store dimensions (#2636)
- improvement: HITL, subblocks, general (#2633)

## Bug Fixes

- fix(build): resolve failing build due to symlink issue in main app dockerfile (#2650)
- fix(tool-input): code subblock should be emptyable (#2646)
- fix(jsm): combined jira providers for jsm (#2644)
- fix(docker): resolve @sim/logger module not found in realtime container (#2637)
- fix(note): light mode (#2631)
- fix(templates): only change updatedAt for actual updates to workflow or metadata (#2630)
- improvement(sidebar): fix workspace name truncation on sidebar preview (#2628)

## Contributors

- @Pbonmars-20031006
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @ppippi-dev
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.46...v0.5.47)

---

## v0.5.48

_Released 2025-12-31 · commit `eb5d1f3e`_

## Features

- feat(workflow): added context menu for block, pane, and multi-block selection on canvas (#2656)
- feat(i18n): update translations
- feat(copy-paste): allow cross workflow selection, paste, move for blocks (#2649)

## Improvements

- improvement(context-menu): gray out undo redo if the stack is empty (#2657)

## Bug Fixes

- fix(mcp): exclude serverUrl from mcp tool call params (#2654)
- fix(paste): single instance trigger notification correction (#2653)
- fix(jsm): renamed operation (#2651)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.47...v0.5.48)

---

## v0.5.49

_Released 2026-01-03 · commit `3792bdd2`_

## Features

- feat(time-picker): added timepicker emcn component, added to playground, added searchable prop for dropdown, added more timezones for schedule, updated license and notice date (#2668)
- feat(admin): routes to manage deployments (#2667)
- feat(i18n): update translations (#2665)
- feat(imap): added support for imap trigger (#2663)
- feat(email): welcome email; improvement(emails): ui/ux (#2658)
- feat(logs-context-menu): consolidated logs utils and types, added logs record context menu (#2659)

## Improvements

- improvement(invite): aligned styling (#2669)

## Bug Fixes

- fix(grain): updated grain trigger to auto-establish trigger (#2666)
- fix(logging): hitl + trigger dev crash protection (#2664)

## Contributors

- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.48...v0.5.49)

---

## v0.5.50

_Released 2026-01-05 · commit `585f5e36`_

## Features

- improvement(kb): add configurable concurrency to chunks processing, sped up 22x for large docs (#2681)
- fix(kb): fix styling inconsistencies, add rename capability for documents, added search preview (#2680)
- feat(popover): sections; improvement: tooltip, popover; fix(notifications): loading content (#2676)

## Bug Fixes

- fix(grain): save before deploying workflow (#2678)
- fix(kalshi): remove synthetically constructed outputs (#2677)
- fix(variables): fix variables block parsing error for json (#2675)
- fix(import): fix missing blocks in import if undefined keys exist (#2674)

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.49...v0.5.50)

---

## v0.5.51

_Released 2026-01-06 · commit `4fbec0a4`_

## Features

- fix(settings): added isHosted gate to access homepage from settings, fixed context menu options (#2694)
- improvement(hitl): add webhook notification and resume, add webhook block (#2673)
- feat(terminal): added terminal context menu (#2692)
- fix(condition): added success check on condition block processor, fixed terminal preventDefault copy bug (#2691)
- feat(i18n): update translations (#2690)
- feat(supabase): added ability so select certain rows in supabase tools (#2689)
- improvement(kb): optimize processes, add more robust fallbacks for large file ops (#2684)

## Bug Fixes

- fix(traces): remove child trace spans from workflow block after being merged with parent output (#2688)
- fix(child-workflow): hosted api key resolution (#2687)
- fix(grain): fixed output and dropdown (#2685)
- fix(webhook): strip extraneous fields from trigger processing (#2686)

## Contributors

- @Sg312
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.50...v0.5.51)

---

## v0.5.52

_Released 2026-01-06 · commit `bfb6fffe`_

## Features

- feat(combobox): added expression support to combobox (#2697)
- improvement(router): add ports to router block (#2683)

## Bug Fixes

- fix(build): fix type assertion (#2696)

## Contributors

- @Sg312
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.51...v0.5.52)

---

## v0.5.53

_Released 2026-01-06 · commit `f5ab7f21`_

## Features

- fix(agent-tool): fix workflow tool in agent to respect user-provided params, added badge for deployment status (#2705)
- feat(locks): add no-op for locking without redis to allow deployments without redis (#2703)
- feat(i18n): update translations (#2702)
- improvement(response): removed nested response block output, add docs for webhook block, styling improvements for subblocks (#2700)
- fix(canvas): add handler for focus loss for hotkey operations (#2701)

## Bug Fixes

- improvement(triggers): moved save configuration above instructions for better visibility, fixed styling inconsistencies (#2699)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.52...v0.5.53)

---

## v0.5.54

_Released 2026-01-07 · commit `13a6e6c3`_

## Features

- feat(i18n): update translations (#2717)
- improvement(context-menu): added awareness for chat and variables being open, fixed select calculation to match height calculation for selecting multiple blocks (#2715)
- feat(fireflies): added fireflies tools and trigger (#2713)
- improvement(add-block): intuitive autoconnect + positioning (#2714)
- fix(grain): add grain key to idempotency service (#2712)
- improvement(helm): added missing optional envvars to helm for whitelabeling (#2711)
- feat(blacklist): added ability to blacklist models & providers (#2709)
- feat(seo): updated out-of-date site metadata, removed unused static assets, updated emails (#2708)
- fix(resolver): add both new and old workflow blocks for backwards compatibility

## Improvements

- ui improvements for deploy mcp (#2718)

## Bug Fixes

- fix(preproc-errors): should not charge base execution cost in this case (#2719)
- fix(deploy-check): race condition fixes (#2710)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.53...v0.5.54)

---

## v0.5.55

_Released 2026-01-08 · commit `f415e5ed`_

## Features

- improvement(autoconnect): click to add paths also autoconnect (#2737)
- feat(i18n): update translations (#2732)
- improvement(enterprise): feature flagging + runtime checks consolidation (#2730)
- improvement(auth): added ability to inject secrets to kubernetes, server-side ff to disable email registration (#2728)
- feat(i18n): update translations (#2721)
- feat(bedrock): added aws bedrock as a model provider (#2722)
- feat(polling-groups): can invite multiple people to have their gmail/outlook inboxes connected to a workflow (#2695)

## Improvements

- improvement(execution-snapshot): enhance workflow preview in logs and deploy modal (#2742)

## Bug Fixes

- fix(grain): grain trigger update (#2739)
- fix(linear): missing params (#2740)
- fix(chat): update stream to respect all output select objects (#2729)
- fix(devcontainer): use bunx for concurrently command (#2723)

## Contributors

- @Patel230
- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.54...v0.5.55)

---

## v0.5.56

_Released 2026-01-10 · commit `be578e2e`_

## Features

- feat(docs): added circleback docs (#2762)
- feat(deployed-form): added deployed form input (#2679)
- feat(enterprise): permission groups, access control (#2736)
- improvement(wand): added more wands (#2756)
- feat(sidebar): context menu for nav items in sidebar, toolbar blocks, added missing docs for various blocks and triggers (#2754)
- fix(docs): new router (#2755)
- improvement(canvas): add multi-block select, add batch handle, enabled, and edge operations (#2738)
- feat(i18n): update translations (#2749)
- fix(sso): add missing deps to db container for running script (#2746)

## Improvements

- improvement(google-drive) (#2752)
- improvement(billing): team upgrade + session management (#2751)
- improvement(docs): multiplier dropped to 1.4 (#2748)

## Bug Fixes

- fix(build): fixed circular dependencies (#2761)
- fix(ops): fix subflow resizing on exit (#2760)
- fix(tools): fixed workflow tool for agent to respect user provided params, inject at runtime like all other tools (#2750)
- fix(tools): updated memory block to throw better errors, removed deprecated posthog route, remove deprecated templates & console helpers (#2753)

## Contributors

- @aadamgough
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.55...v0.5.56)

---

## v0.5.57

_Released 2026-01-11 · commit `7ffc11a7`_

## Features

- feat(popover): add expandOnHover, added the ability to change the color of a workflow icon, new workflow naming convention (#2770)
- fix(tag-input): add onInputChange to clear errors when new text is entered (#2765)
- feat(copilot): subagents (#2731)

## Improvements

- improvement(response): only allow singleton (#2764)

## Bug Fixes

- fix(resize): fix subflow resize on drag, children deselected in subflow on drag (#2771)
- fix(copilot): fix copilot chat loading (#2769)
- fix(subflow): updated subflow border to match block border (#2768)
- fix(context-menu): make divider on context menu aware of available options (#2766)
- fix(perms): copilot checks undefined issue (#2763)
- fix(router): fix router ports (#2757)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.56...v0.5.57)

---

## v0.5.58

_Released 2026-01-13 · commit `7bf3d73e`_

## Features

- feat(integrations): claude skills to add integrations, lemlist trigger + tools, remove test webhook url (#2785)
- feat(invitations): added FF to disable invitations, added to permission groups, added workspace members admin endpoints (#2783)
- feat(copilot): add context7 (#2779)
- feat(tool): added introspection tools for all db integrations (#2780)
- feat(tools): added workflow tools to agent tools dropdown for discoverability, enforce perms on client for redeploying via the agent (#2778)
- feat(export): added the ability to export workflow (#2777)

## Improvements

- improvement(block-outputs): display metadata properties destructured (#2772)
- improvement(byok): make available for all plans (#2782)

## Bug Fixes

- fix(slack): remove duplicate effect that cleared subblocks on cred change (#2788)
- fix(color-picker): confirm color change before updating workflow color (#2776)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.57...v0.5.58)

---

## v0.5.59

_Released 2026-01-13 · commit `5e8c8432`_

## Features

- feat(export): support maintenance of nested folder structure on import/export, added folder export admin route (#2795)
- feat(a2a): added a2a protocol (#2784)
- chore(readme): trim readme, add more envvar info (#2791)
- fix(ff): add back condition for isHosted FF (#2789)

## Improvements

- chore(docs): update sim references in docs (#2792)
- improvement(FF): CI check to prevent hardcoding of FFs (#2790)

## Bug Fixes

- fix(a2a): removed deployment constraint for redeploying a2a workflows (#2796)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.58...v0.5.59)

---

## v0.5.61

_Released 2026-01-16 · commit `af82820a`_

## Features

- feat(readme): added deepwiki to readme, consolidated utils (#2856)
- improvement(deployed-mcp): added the ability to make the visibility for deployed mcp tools public, updated UX (#2853)
- feat(workspace): added option to leave workspace (#2854)
- improvement(security): added input validation for airtable, lemlist, and more tools to protect against SSRF (#2847)
- feat(ocr): added reducto and pulse for OCR (#2843)
- feat(context-menu): added context menu to dead sidebar space and usage indicator (#2841)
- improvement(permissions): added ability to auto-add new org members to existing permission group, disallow disabling of start block (#2836)
- feat(workflow-controls): added action bar for workflow controls (#2767)
-  v0.5.60: invitation flow improvements, chat fixes, a2a improvements, additional copilot actions
- feat(sheets): added sheet selector for microsoft excel and google sheets tools (#2835)
- feat(starter): in start block input format, don't prevent deletion if only one field remaining, just clear form (#2830)
- fix(misc): added trace spans back to notifications for webhooks, updated verification code for users signing in with email, updated welcome email (#2828)
- improvement(langsmith): add wand for batch ingestion schemas (#2827)
- feat(dashboard): added stats endpoint to compute stats on server side and avoid limit (#2823)
- feat(langsmith): add langsmith tools for logging, output selector use tool-aware listing (#2821)
- fix(agent-tools): added special handling for workflow tool in agent tool input, added react grab and feature flag (#2820)
- feat(reorder): allow workflow/folder reordering (#2818)
- fix(batch-add): on batch add persist subblock values (#2819)
- feat(tinybird): added tinybird block (#2781)
- feat(terminal): migrate from zustand for console terminal logs to indexedDb, incr limit from 5mb to ~GBs (#2812)
- fix(a2a): added file data part and data data part to a2a agents (#2805)
- improvement(oauth): added random identifier in unused accountId to bypass betterauth unique constraint (#2807)
- feat(slack): added get message by timestamp and get thread tool (#2803)
- fix(comparison): add condition to prevent duplicate identical edges (#2799)
- feat(copilot): add commands (#2797)

## Improvements

- improvement(serializer): canonical subblock, serialization cleanups, schedules/webhooks are deployment version friendly (#2848)
- improvement(posthog): improve posthog config to be more lightweight (#2851)
- Improvement: subblocks (#2850)
- improvement: workflow, blocks, preview, avatars, output-select (#2840)
- improvement(chat): partialize chat store to only persist image URL instead of full image in floating chat (#2842)
- improvement(tools): use react query to fetch child workflow schema, avoid refetch and duplicated utils, consolidated utils and testing mocks (#2839)
- improvement(webhooks): lifecycle management with external providers, remove save configuration (#2831)
- improvement(snapshot): show subblocks for trigger only blocks in frozen canvas (#2838)
- improvement(slack): updated docs to include information for slack marketplace submission (#2837)
- improvement(copilot): update copilot to match copilot repo (#2829)
- improvement(emails): update email footer links to link to sim.ai/provider instead of direct provider links (#2826)
- improvement(langsmith): ugpraded langsmith to use tool names directly in dropdown (#2824)
- improvement(pricing): drop agent multiplier in docs, change base exec cost
- improvement(schedule): default schedule timezone (#2800)

## Bug Fixes

- fix(slack): tool params should be in line with block (#2860)
- fix(google-vault): error handling improvement and more params (#2735)
- fix(copilot): copilot edit router block accepts semantic handles (#2857)
- fix(copilot): fix copilot bugs (#2855)
- fix(queries): remove more remaining manual state management and refetching in favor of reactquery (#2852)
- fix(webflow): fix collection & site dropdown in webflow triggers (#2849)
- fix(linear): updated linear tools to enforce only required fields per api spec (#2845)
- improvement(presence): show presence for the same user in another tab, fix z-index of multiplayer cursor to fall behind panel,terminal,sidebar but above blocks, improved connection detection (#2844)
- fix(start): permission check for executor
- fix(drag): read perms prevent drag (#2834)
- fix(sortOrder): initial ordering must be deterministic (#2833)
- fix(popover): fix frozen workspace popover (#2832)
- fix(otp): send welcome email even when user signs up via email/pass along with oauth providers (#2825)
- fix(notifications): consolidate notification utils, update email styling (#2822)
- fix(terminal-colors): change algo to compute colors based on hash of execution id and pointer from bottom (#2817)
- fix(i18n): update translations action to run once per week on sunday (#2816)
- fix(terminal): pop all entries from a single execution when the limit is exceeded (#2815)
- fix(copilot): rewrote user input popover to optimize UX (#2814)
- fix(copilot): commands (#2811)
- fix(chat): remove special handling for non-streaming (#2808)
- fix(invitations): preserve tokens after error (#2806)
- fix(sockets): redrawing edges should not lead to socket ops (#2804)
- fix(triggers): cleanup trigger outputs formatting, fix display name issues (#2801)
- fix(executor): pattern match more errors to prevent swallow (#2802)

## Contributors

- @Sg312
- @aadamgough
- @emir-karabeg
- @icecrasher321
- @lakeesiv
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.59...v0.5.61)

---

## v0.5.62

_Released 2026-01-16 · commit `a8bb0db6`_

## Features

- fix(start): seed initial subblock values on batch add (#2864)

## Improvements

- improvement(avatar): use selection-update as the source of truth for presence, ignore other socket ops (#2866)
- chore(readme): updated readme (#2861)

## Bug Fixes

- fix(sockets): webhooks logic removal from copilot ops (#2862)
- fix(shift): fix shift select blue ring fading (#2863)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.61...v0.5.62)

---

## v0.5.63

_Released 2026-01-18 · commit `b09f6830`_

## Features

- feat(ux): more explicit verbiage on some dialog menus, google drive updates, advanved to additional fields, remove general settings store sync in favor of tanstack (#2875)
- feat(oauth): upgraded all generic oauth plugin providers to use unqiue account ids (#2870)

## Improvements

- improvement(performance): used react scan to identify rerendering issues and react issues (#2873)
- improvement(tool-input): general abstraction to enrich agent context, reuse visibility helpers (#2872)
- improvement(slides): add missing properties definitions (#2877)
- improvement(tools): added visibility for tools that were missing it, added new google and github tools (#2874)

## Bug Fixes

- fix(api): tool input parsing into table from agent output (#2879)
- fix(resolver): tool configs must take precedence (#2876)
- improvement(ui): modal style standardization, select drop improvement, duplication selection fixes (#2871)
- fix(wand): improved flickering for invalid JSON icon while streaming (#2868)
- fix(block-resolver): path lookup check (#2869)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.62...v0.5.63)

---

## v0.5.64

_Released 2026-01-20 · commit `dff1c9d0`_

## Features

- feat(api): added workflows api route for dynamic discovery (#2892)
- feat(settings): add debug mode for superusers (#2893)
- feat(browseruse): upgraded browseruse endpoints to v2 (#2890)
- improvement(router): add resizable textareas for router conditions (#2888)
- feat(search): added operations to search modal in main app, updated retrieval in docs to use RRF (#2889)
- feat(terminal): add fix in copilot for errors (#2885)
- feat(notifs): added block name to error notifications (#2883)
- feat(mcp): updated mcp subblocks for mcp tools to match subblocks (#2882)

## Improvements

- improvement(kb): migrate manual fetches in kb module to use reactquery (#2894)
- improvement(stats): should track mcp and a2a executions like other trigger types (#2895)
- improvement(copilot): variables, conditions, router (#2887)
- improvement(emails): update unsub page, standardize unsub process (#2881)

## Bug Fixes

- fix(kb): align bulk chunk operation with API response (#2899)
- improvement(modal): fixed popover issue in custom tools modal, removed the ability to update if no changes made (#2897)
- fix(copilot): ui/ux (#2891)
- fix(sso): removed provider specific OIDC logic from SSO registration & deregistration scripts (#2896)
- fix(linear): team selector in tool input (#2886)
- fix(undo-redo): preserve subblock values during undo/redo cycles (#2884)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.63...v0.5.64)

---

## v0.5.65

_Released 2026-01-20 · commit `0ce0f98a`_

## Features

- feat(broadcast): email v0.5 (#2905)
- improvement(logs): improved logs ui bugs, added subflow disable UI (#2910)
- fix(ui): change add inputs button to match output selector (#2907)
- feat(tools): added textract, added v2 for mistral, updated tag dropdown (#2904)
- improvement(browseruse): add profile id param (#2903)
- fix(rss): add top-level title, link, pubDate fields to RSS trigger output (#2902)

## Improvements

- improvement(files): update execution for passing base64 strings (#2906)
- improvement(executor): upgraded abort controller to handle aborts for loops and parallels (#2880)

## Bug Fixes

- fix(change-detection): copilot diffs have extra field (#2913)
- fix(a2a): canonical merge (#2912)
- fix(copilot): legacy tool display names (#2911)
- fix(canvas): removed invite to workspace from canvas popover (#2908)
- fix(canonical): copilot path + update parent (#2901)
- fix(google): wrap primitive tool responses for Gemini API compatibility (#2900)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.64...v0.5.65)

---

## v0.5.66

_Released 2026-01-21 · commit `45371e52`_

## Bug Fixes

- fix(ring): duplicate should clear original block (#2916)
- fix(http): options not parsed accurately (#2914)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.65...v0.5.66)

---

## v0.5.67

_Released 2026-01-21 · commit `cc2be33d`_

## Features

- fix(auth): add genericOAuth providers to trustedProviders (#2937)
- feat(workflow-block): preview (#2935)
- chore(helm): add env vars for Vertex AI, orgs, and telemetry (#2922)

## Improvements

- improvement(copilot): tool configs to show nested props (#2936)
- improvement(ui): use BrandedButton and BrandedLink components (#2930)

## Bug Fixes

- fix(workflow-selector): use dedicated selector for workflow dropdown (#2934)
- fix(auth): handle EMAIL_NOT_VERIFIED in onError callback (#2932)
- fix(token-refresh): microsoft, notion, x, linear (#2933)
- fix(null-bodies): empty bodies handling (#2931)
- fix(custom-tools): remove unsafe title fallback in getCustomTool (#2929)
- fix(stores): remove dead code causing log spam on startup (#2927)
- fix(messages-input): fix cursor alignment and auto-resize with overlay (#2926)
- fix(resolver): agent response format, input formats, root level (#2925)
- fix(action-bar): duplicate subflows with children (#2923)
- fix(auth): improve reset password flow and consolidate brand detection (#2924)
- fix(notifications): text overflow with line-clamp (#2921)
- fix(logger): use direct env access for webpack inlining (#2920)
- fix(zustand): updated to useShallow from deprecated createWithEqualityFn (#2919)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.66...v0.5.67)

---

## v0.5.68

_Released 2026-01-22 · commit `e9c4251c`_

## Features

- feat(router): expose reasoning output in router v2 block (#2945)
- improvement(helm): add per-deployment extraVolumes support (#2942)

## Bug Fixes

- fix(executor): handle condition dead-end branches in loops (#2944)
- fix(copilot): always allow, credential masking (#2947)
- fix(resolver): consolidate reference resolution (#2941)
- fix(gmail): expose messageId field in read email block (#2943)
- fix(executor): stop parallel execution when block errors (#2940)
- improvement(workflow-item): stabilize avatar layout and fix name truncation (#2939)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.67...v0.5.68)

---

## v0.5.69

_Released 2026-01-24 · commit `c12931bc`_

## Features

- fix(edge-validation): race condition on collaborative add (#2980)
- feat(blog): enterprise post (#2961)
- improvement(helm): add internal ingress support and same-host path consolidation (#2960)
- fix(security): add authentication and input validation to API routes (#2959)
- feat(admin): add credits endpoint to issue credits to users (#2954)
- feat(blog): v0.5 release post (#2953)
- improvement(kb): add document filtering, select all, and React Query migration (#2951)
- fix(idempotency): add conflict target to atomicallyClaimDb query + remove redundant db namespace tracking (#2950)

## Improvements

- improvement(docs): loop and parallel var reference syntax (#2975)
- improvement(webhooks): remove dead code (#2965)
- improvement(copilot): fast mode, subagent tool responses and allow preferences (#2955)
- improvement(logs): trace span, details (#2952)

## Bug Fixes

- fix(variables): boolean type support and input improvements (#2981)
- fix(landing): ui (#2979)
- fix(integrations): hide from tool bar (#2544)
- fix(copilot): fix edit summary for loops/parallels (#2978)
- fix(auth): copilot routes (#2977)
- fix(blog): slash actions description (#2976)
- fix(notes): ghost edges (#2970)
- fix(hitl): fix condition blocks after hitl (#2967)
- fix(copilot): update copilot chat title (#2968)
- fix(security): restrict API key access on internal-only routes (#2964)
- fix(child-workflow): nested spans handoff (#2966)
- fix(preview): subblock values (#2969)
- fix(copilot): mask credentials fix (#2963)
- fix(envvars): resolution standardized (#2957)
- fix(logs): refresh logic to refresh logs details (#2958)
- fix(billing): handle missing userStats and prevent crashes (#2956)
- fix(subflows): tag dropdown + resolution logic (#2949)

## Other Changes

- chore(deps): bump posthog-js to 1.334.1 (#2948)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.68...v0.5.69)

---

## v0.5.70

_Released 2026-01-24 · commit `8bd5d417`_

## Bug Fixes

- fix(anthropic): use anthropic sdk to transform malformed response schemas to anthropic format (#2988)
- fix(llm): update router and llm_chat tool to call providers routes (#2986)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.69...v0.5.70)

---

## v0.5.71

_Released 2026-01-25 · commit `d63a5cb5`_

## Improvements

- improvement(docs): add quick reference page and update SDK documentation (#2994)

## Bug Fixes

- fix(sdk): improve input handling and separate input from options (#2993)
- fix(releases): improve commit categorization and ci security (#2992)
- fix(copilot): canonical modes should be constructed on edit (#2989)
- fix(context-menu): preserve selection when right-clicking selected block (#2991)
- fix(tooltip): add tooltip to canonical toggle button (#2990)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.70...v0.5.71)

---

## v0.5.72

_Released 2026-01-25 · commit `1c58c35b`_

## Improvements

- improvement(docs): added images and videos to quick references (#3004)

## Bug Fixes

- fix(multi-trigger): resolution paths for triggers (#3002)
- fix(supabase): storage upload + add basic mode version (#2996)
- fix(storage): support Azure connection string for presigned URLs (#2997)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.71...v0.5.72)

---

## v0.5.73

_Released 2026-01-26 · commit `ab4e9dc7`_

## Features

- feat(tools): added more intercom tools (#3022)
- feat(code): undo-redo state (#3018)
- feat(note-block): expand media embed support with tuned aspect ratios (#3016)
- feat(ci): auto-create github releases and add workflow permissions (#3009)
- feat(helm): add branding configmap for custom assets (#3008)

## Improvements

- improvement(tools): updated kalshi and polymarket tools and blocks (#3021)
- improvement(mcp): remove mcp-remote for cursor config (#3020)
- improvement(workflow): hide raw json childworkflow span (#3019)
- improvement(preview): error paths, loops, workflow (#3010)
- improvement(docs): updated logo, added lightbox to action media, fixed minor styling inconsistencies between themes (#3014)
- improvement(preview): consolidate block rendering and fix handle configurations (#3013)

## Bug Fixes

- fix(executor): fix. convergent error edges (#3015)
- fix(max-tokens): anthropic models streaming vs non-streaming (#2999)
- fix(kb): workspace id required for creation (#3001)
- fix(input-format): resolution for blocks with input format fields (#3012)
- fix(copilot): reliable zoom to changed blocks after diff applied (#3011)
- fix(docs): separate local and blob asset resolution for quick-reference (#3007)
- fix(codegen): function prologue resolution edge cases (#3005)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.72...v0.5.73)

---

## v0.5.74

_Released 2026-01-27 · commit `11dc18a8`_

## Features

- feat(autolayout): add snap-to-grid support (#3031)
- feat(tools): added clerk tools and block (#3032)

## Improvements

- improvement(function): timeout increase to 5 min (#3040)
- improvement(helm): update GPU device plugin and add cert-manager issuers (#3036)
- improvement(block-inputs): must parse json accurately + models max_tokens fix (#3033)
- improvement(skills): extend skills (#3035)

## Bug Fixes

- fix(autolayout): pass through gridsize (#3042)
- fix(openrouter): ignored when tools are configured but unused (#3041)
- fix(gemini): token count (#3039)
- fix(models): update cerebras and groq models (#3038)
- fix(hitl): add missing fields to block configs (#3027)
- fix(security): add authentication to remaining tool API routes (#3028)
- fix(workflow): use panel-aware viewport center for paste and block placement (#3024)
- fix(badge): add type variant for dark mode contrast (#3025)
- fix(terminal): persist collapsed state across page refresh (#3023)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.73...v0.5.74)

---

## v0.5.75

_Released 2026-01-28 · commit `c6bf5cd5`_

## Features

- feat(child-workflows): nested execution snapshots (#3059)
- feat(youtube): add captions, trending, and video categories tools with enhanced API coverage (#3060)
- feat(timeout): add API block timeout configuration (#3053)
- feat(terminal): structured output (#3026)
- feat(description): add deployment version descriptions (#3048)
- feat(executor): run from/until block (#3029)

## Improvements

- improvement(preview): include current workflow badge in breadcrumb in workflow snapshot (#3062)
- improvement(inputs): sanitize trigger inputs better (#3047)
- improvement(search-modal): add quick navigation items and fix cmdk value uniqueness (#3050)
- improvement(cmdk): refactor search modal to use cmdk + fix icon SVG IDs (#3044)

## Bug Fixes

- fix(type): logs workspace delivery (#3063)
- fix(copilot): panning on workflow (#3057)
- fix(snapshot): consolidate to use hasWorkflowChanges check (#3051)
- fix(icons): update strokeWidth of action bar items to match, update run from block icon to match run workflow button (#3056)
- fix: terminal spacing, subflow disabled in preview (#3055)
- fix(child-workflow-error-spans): pass trace-spans accurately in block logs (#3054)
- fix(tests): use UTC methods for timezone-independent schedule assertions (#3052)
- fix(workflow): update container dimensions on keyboard movement (#3043)
- fix(loops): fix loops on empty collection (#3049)
- fix(helm): move rotationPolicy under privateKey for cert-manager compatibility (#3046)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.74...v0.5.75)

---

## v0.5.77

_Released 2026-01-30 · commit `31fdd2be`_

## Features

- feat(note-block): enable body dragging to match workflow block (#3073)
- feat(deployments): human-readable version descriptions (#3077)
- feat(tools): added similarweb (#3071)
- feat(calcom): added calcom (#3070)

## Improvements

- improvement(docker): update docker-compose env vars (#3080)
- improvement(docs): instant copy button + performance optimizations (#3076)

## Bug Fixes

- fix(terminal): start precision (#3078)
- fix(note): remove icon from note block in preview (#3075)
- fix(agent-logs): don't filter out agent cost from trace span (#3086)
- fix(invite-modal): remove custom button heights and useEffect anti-pattern (#3082)
- fix(anthropic): token limits for streaming with tool calls (#3084)
- fix(streaming): handle multi-byte UTF-8 chars split across chunks (#3083)
- fix(copilot): hosted api key validation + credential validation (#3000)
- fix(executor): conditional deactivation for loops/parallels (#3069)

## Other Changes

- improvment(sockets): migrate to redis (#3072)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.76...v0.5.77)

---

## v0.5.78

_Released 2026-01-31 · commit `8528fbe2`_

## Features

- feat(tools): added google maps and DSPy (#3098)
- feat(invitations): added invitations query hook, migrated all tool files to use absolute imports (#3092)

## Bug Fixes

- fix(visibility): updated visibility for non-sensitive tool params from user only to user or llm (#3095)
- fix(executor): condition inside parallel (#3094)
- fix(mcp): increase timeout from 1m to 10m (#3093)
- fix(billing): plan should be detected from stripe subscription object (#3090)
- fix(editor): advanced toggle respects user edit permissions (#3089)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.77...v0.5.78)

---

## v0.5.79

_Released 2026-01-31 · commit `2bb68335`_

## Features

- feat(tools): added enrich so (#3103)

## Improvements

- improvement(ratelimits, sockets): increase across all plans, reconnecting notif for sockets (#3096)

## Bug Fixes

- fix(workflow): optimize loop/parallel regeneration and prevent duplicate agent tools (#3100)
- fix(mcp): pass timeout to SDK callTool to override 60s default (#3101)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.78...v0.5.79)

---

## v0.5.80

_Released 2026-02-04 · commit `46822e91`_

## Features

- feat(async-jobs): async execution with job queue backends (#3134)
- feat(timeouts): execution timeout limits (#3120)
- feat(note-block): note block preview newlines (#3127)
- feat(canvas): added the ability to lock blocks (#3102)
- feat(ee): add enterprise modules (#3121)
- feat(editor): added docs link to editor (#3116)

## Improvements

- improvement(openai): migrate to responses api (#3135)
- improvement(timeouts): sync to 50 min, self-hosted maxed out (#3133)
- improvement(rooms): redis client closed should fail with indicator (#3115)
- improvement(files): pass user file objects around consistently (#3119)
- improvement(tag-dropdown): removed custom styling on tag dropdown popover, fixed execution ordering in terminal and loops entries (#3126)
- improvement(billing): duplicate checks for bypasses, logger billing actor consistency, run from block (#3107)

## Bug Fixes

- fix(serializer): validate required fields for blocks without tools (#3137)
- fix(mistral): restore mistral configs for v2 version (#3138)
- fix(limits): updated rate limiter to match execution timeouts, adjusted timeouts fallback to be free plan (#3136)
- fix(providers): correct tool calling message format across all providers (#3132)
- fix(import): preserve workflow colors during import (#3130)
- fix(editor): block rename applies to correct block when selection changes (#3129)
- fix(logs): use formatDuration utility and align file cards styling (#3125)
- fix(http): serialize nested objects in form-urlencoded body (#3124)
- fix(sidebar): right-click replaces selection, reset popover hover state (#3123)
- fix(formatting): consolidate duration formatting into shared utility (#3118)
- fix(mcp): child workflow with response block returns error (#3114)
- fix(cleanup-cron): stale execution cleanup integer overflow (#3113)

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.79...v0.5.80)

---

## v0.5.81

_Released 2026-02-05 · commit `1a66d48a`_

## Features

- feat(azure): added azure anthropic, added backwards compat support for chat completions API, added opus 4.6 (#3145)
- feat(confluence): added more confluence endpoints (#3139)

## Bug Fixes

- fix(client-exec): send correct client workflow state override (#3143)
- fix(inputs): canonical params + manual validations + params resolution cleanups (#3141)
- fix(tracespans): update tracespans tool calls to accurately display inputs for successive identical tool calls (#3140)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.80...v0.5.81)

---

## v0.5.82

_Released 2026-02-06 · commit `a3a99eda`_

## Features

- feat(slack): add file attachment support to slack webhook trigger (#3151)

## Bug Fixes

- fix(resolver): response format and evaluator metrics in deactivated branch (#3152)
- fix(linear): align tool outputs, queries, and pagination with API (#3150)
- fix(executor):  loop sentinel-end wrongly queued (#3148)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.81...v0.5.82)

---

## v0.5.83

_Released 2026-02-07 · commit `479cd347`_

## Features

- feat(models): updated model configs, updated anthropic provider to propagate errors back to user if any (#3159)
- feat(airweave): add airweave block (#3079)
- feat(skills): added skills to agent block (#3149)

## Improvements

- improvement(models): reorder models dropdown (#3164)
- improvement(preview): render nested values like input format correctly in workflow execution preview (#3154)
- improvement(ui): improved skills UI, validation, and permissions (#3156)

## Bug Fixes

- fix(rooms): cleanup edge case for 1hr ttl (#3163)
- fix(auth): swap out hybrid auth in relevant callsites (#3160)
- fix(function): isolated-vm worker pool to prevent single-worker bottleneck + execution user id resolution (#3155)
- fix(azure): add azure-anthropic support to router, evaluator, copilot, and tokenization (#3158)

## Contributors

- @EwanTauran
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.82...v0.5.83)

---

## v0.5.84

_Released 2026-02-07 · commit `6c66521d`_

## Bug Fixes

- fix(models): add request sanitization (#3165)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.83...v0.5.84)

---

## v0.5.85

_Released 2026-02-09 · commit `654cb2b4`_

## Improvements

- improvement(ui): deploy modal, terminal (#3167)

## Bug Fixes

- fix(triggers): id resolution for tools with trigger mode (#3170)

## Contributors

- @emir-karabeg
- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.84...v0.5.85)

---

## v0.5.86

_Released 2026-02-10 · commit `50585273`_

## Features

- feat(copilot): enterprise configuration (#3184)
- feat(logs): add skill icon to trace spans (#3181)
- feat(copilot): copilot mcp + server side copilot execution (#3173)

## Improvements

- improvement(terminal): increase workflow logs limit from 1k to 5k per workflow (#3188)
- improvement(mcp): improved mcp sse events notifs, update jira to handle files, fix UI issues in settings modal, fix org and workspace invitations when bundled (#3182)
- improvement(helm): support copilot-only deployments (#3185)
- improvement(schema): centralize derivation of block schemas (#3175)
- Merge pull request #3179 from simstudioai/improvement/file-download-timeouts
- improvement(preview): added trigger mode context for deploy preview (#3177)
- improvement(jsm): destructured outputs for jsm, jira, and added 1password integration (#3174)

## Bug Fixes

- fix(triggers): add copilot as a trigger type (#3191)
- fix(logs): surface handled errors as info in logs (#3190)
- fix(terminal): subflow logs rendering (#3189)
- fix(posthog): replace proxy rewrite with route handler for reliable body streaming (#3187)
- fix(memory): upgrade bun from 1.3.3 to 1.3.9 (#3186)
- fix(execution): scope execution state per workflow to prevent cross-workflow bleed (#3183)
- fix(mcp): harden notification system against race conditions (#3168)
- fix(slack): resolve file metadata via files.info when event payload is partial (#3176)
- Merge pull request #3172 from simstudioai/fix/notifs

## Contributors

- @Sg312
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.85...v0.5.86)

---

## v0.5.87

_Released 2026-02-10 · commit `27973953`_

## Bug Fixes

- fix(auth): workflow system handler (#3193)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.86...v0.5.87)

---

## v0.5.88

_Released 2026-02-11 · commit `07d50f8f`_

## Features

- feat(confluence): added list space labels, delete label, delete page prop (#3201)
- feat(providers): add Gemini Deep Research via Interactions API (#3192)

## Improvements

- improvement(oom): increase trigger machine size (#3196)

## Bug Fixes

- fix build
- fix(confl): use recommended query param pattern for confluence route (#3202)
- fix(variables): fix tag dropdown and cursor alignment in variables block (#3199)
- fix(hotkeys): remove C, T, E tab-switching hotkeys (#3197)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.87...v0.5.88)

---

## v0.5.89

_Released 2026-02-13 · commit `b45f3962`_

## Features

- feat(internal): added internal api base url for internal calls (#3212)
- feat(creators): added referrers, code redemption, campaign tracking, etc (#3198)
- Merge pull request #3210 from simstudioai/feat/google-books
- feat(google books): Add google books integration

## Improvements

- refactor(tool-input): subblock-first rendering, component extraction, bug fixes (#3207)

## Bug Fixes

- fix(tool-input): sync cleared subblock values to tool params (#3214)
- Remove redundant error handling, move volume item to types file
- fix(agent): always fetch latest custom tool from DB when customToolId is present (#3208)
- Correct error handling, specify auth mode as api key
- fix(copilot): make default model opus 4.5 (#3209)
- fix(s3): support get-object region override and robust S3 URL parsing (#3206)
- fix(terminal): reconnect to running executions after page refresh (#3200)
- fix(change-detection): resolve false positive trigger block change detection (#3204)

## Other Changes

- Migrate last response to types

## Contributors

- @Sg312
- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.88...v0.5.89)

---

## v0.5.90

_Released 2026-02-15 · commit `e204628a`_

_Release v0.5.90 — no release body on GitHub; commit has no details._

---

## v0.5.91

_Released 2026-02-16 · commit `b7e377ec`_

## Features

- feat(i18n): change lockfile (#3216)

## Bug Fixes

- fix(docs): update docs and disable i18n action, upgrade turborepo (#3227)

## Other Changes

- Merge remote-tracking branch 'origin/main' into staging

## Contributors

- @cherkanovart
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.90...v0.5.91)

---

## v0.5.92

_Released 2026-02-17 · commit `da46a387`_

## Features

- feat(pipedrive): added sort order to endpoints that support it, upgraded turborepo (#3237)
- feat(pagination): update pagination for remaining integrations that support it (#3233)
- feat(shortlink): add Beluga short link rewrite for hosted campaigns (#3231)

## Improvements

- improvement(providers): replace @ts-ignore with typed ProviderError class (#3235)
- improvement(lint): fix react-doctor errors and warnings (#3232)
- improvement(copilot): scrolling stickiness (#3218)

## Bug Fixes

- fix(pagination): add missing next_page to response interfaces and operator comments (#3236)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.91...v0.5.92)

---

## v0.5.93

_Released 2026-02-18 · commit `fdca7367`_

## Features

- feat(sub): hide usage limits and seats info from enterprise members (non-admin) (#3243)
- feat(audit-log): add audit events for templates, billing, credentials, env, deployments, passwords (#3246)
- feat(audit-log): add persistent audit log system with comprehensive route instrumentation (#3242)
- feat(access-control): add ALLOWED_INTEGRATIONS env var for self-hosted block restrictions (#3238)
- feat(canvas): allow locked block outbound connections (#3229)
- feat(mcp): add ALLOWED_MCP_DOMAINS env var for domain allowlist (#3240)

## Bug Fixes

- fix(normalization): update allowed integrations checks to be fully lowercase (#3248)
- fix(lock): prevent socket crash when locking agent blocks (#3245)
- fix(copilot): copilot shortcut conflict (#3219)
- fix(shortlink): use redirect instead of rewrite for Beluga tracking (#3239)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.92...v0.5.93)

---

## v0.5.94

_Released 2026-02-18 · commit `15ace5e6`_

## Features

- feat(tools): added vercel block & tools (#3252)

## Bug Fixes

- fix(sidebar): unify workflow and folder insertion ordering (#3250)
- fix(shortlink): remove isHosted guard from redirects, not available at build time on ECS (#3251)

## Other Changes

- chore(deps): upgrade next.js from 16.1.0-canary.21 to 16.1.6 (#3254)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.93...v0.5.94)

---

## v0.5.95

_Released 2026-02-20 · commit `67aa4bb3`_

## Features

- feat(models): add gemini-3.1-pro-preview and update gemini-3-pro thinking levels (#3263)
- feat(tools): added redis, upstash, algolia, and revenuecat (#3261)
- feat(tables): added tables (#2867)
- feat(tools): advanced fields for youtube, vercel; added cloudflare and dataverse tools (#3257)

## Improvements

- improvement(resolver): resovled empty sentinel to not pass through unexecuted valid refs to text inputs (#3266)

## Bug Fixes

- fix(build): fix corrupted sticky disk cache on blacksmith (#3273)
- fix(trigger): update node version to align with main app (#3272)
- fix(tables): hide tables from sidebar and block registry (#3270)
- fix(trigger): add isolated-vm support to trigger.dev container builds (#3269)
- fix(blocks): add required constraint for serviceDeskId in JSM block (#3268)
- fix(blocks): move type coercions from tools.config.tool to tools.config.params (#3264)
- fix(audit-log): lazily resolve actor name/email when missing (#3262)
- fix(workflows): disallow duplicate workflow names at the same folder level (#3260)
- fix(snapshot): changed insert to upsert when concurrent identical child workflows are running (#3259)

## Contributors

- @icecrasher321
- @lakeesiv
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.94...v0.5.95)

---

## v0.5.96

_Released 2026-02-20 · commit `34d92fae`_

## Features

- feat(slack): added ephemeral message send tool, updated ci, updated docs (#3278)
- feat(auth): add OAuth 2.1 provider for MCP connector support (#3274)

## Bug Fixes

- fix(copilot): handle negated operation conditions in block config extraction (#3282)
- fix(trigger): handle Slack reaction_added/reaction_removed event payloads (#3280)
- fix(logs): replace initialData with placeholderData to fix stale log details (#3279)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.95...v0.5.96)

---

## v0.5.97

_Released 2026-02-21 · commit `115f04e9`_

## Bug Fixes

- fix(mcp): use getBaseUrl for OAuth discovery metadata URLs (#3283)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.96...v0.5.97)

---

## v0.5.98

_Released 2026-02-21 · commit `0d86ea01`_

## Features

- feat(tools): added hex (#3293)
- feat(oauth): add CIMD support for client metadata discovery (#3285)

## Bug Fixes

- fix(hex): scope param renames to their respective operations (#3295)
- fix(models): remove retired claude-3-7-sonnet and update default models (#3292)
- fix(redis): prevent false rate limits and code execution failures during Redis outages (#3289)
- fix(deploy): reuse subblock merge helper in use change detection hook (#3287)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.97...v0.5.98)

---

## v0.5.99

_Released 2026-02-23 · commit `af592349`_

## Features

- feat(terminal): expandable child workflow blocks in console (#3306)

## Bug Fixes

- fix(parallel): correct active state pulsing and duration display for parallel subflow blocks (#3305)
- fix(security): allow HTTP for localhost and loopback addresses (#3304)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.98...v0.5.99)

---

## v0.5.100

_Released 2026-02-25 · commit `67f8a687`_

## Features

- feat(api): retry configuration for api block (#3329)
- feat(attio): add Attio CRM integration with 40 tools and 18 webhook triggers (#3324)
- feat(confluence): add webhook triggers for Confluence events (#3318)
- feat(public-api): add env var and permission group controls to disable public API access (#3317)
- feat(gong): add Gong integration with 18 API tools (#3316)
- feat(credentials): multiple credentials per provider (#3211)

## Improvements

- improvement(creds): bulk paste functionality, save notification, error notif (#3328)
- improvement(credentials): ui (#3322)
- improvement(processing): reduce redundant DB queries in execution preprocessing (#3320)
- improvement(audit): enrich metadata across 23 audit log call sites (#3319)
- improvement(migration): move credential selector automigration logic to server side (#3310)

## Bug Fixes

- fix(serializer): default canonical modes construction (#3330)
- fix(attio): automatic webhook lifecycle management and tool fixes (#3327)
- fix(providers): propagate abort signal to all LLM SDK calls (#3325)
- fix(auth): make DISABLE_AUTH work in web app (#3297)
- fix(copy): preserve block names when pasting into workflows without conflicts (#3315)
- fix(execution): scope X-Sim-Via header to internal routes and enforce depth limit (#3313)
- fix(tag-dropdown): exclude downstream blocks in loops and parallel siblings (#3312)
- fix(redis): tighten stale TCP connection detection and add fast lease deadline (#3311)
- fix(credentials): credential dependent endpoints (#3309)

## Other Changes

- docs(credentials): replace environment variables page with credentials docs (#3331)

## Contributors

- @emir-karabeg
- @icecrasher321
- @jayy-77
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.99...v0.5.100)

---

## v0.5.101

_Released 2026-02-26 · commit `4fd09892`_

## Features

- feat(devin): add devin integration for autonomous coding sessions (#3352)
- feat(sidebar): add lock/unlock to workflow registry context menu (#3350)
- feat(google-tasks): add Google Tasks integration (#3342)
- feat(bigquery): add Google BigQuery integration (#3341)
- feat(confluence): add get user by account ID tool (#3345)
- feat(workflow): lock/unlock workflow from context menu and panel (#3336)
- feat(api): audit log read endpoints for admin and enterprise (#3343)
- feat(confluence): return page content in get page version tool (#3344)
- feat(google): add missing tools for Gmail, Drive, Sheets, and Calendar (#3338)
- feat(google-translate): add Google Translate integration (#3337)
- feat(google-sheets): add filter support to read operation (#3333)

## Bug Fixes

- fix(confluence): prevent content erasure on page/blogpost update and fix space update (#3356)
- fix: prevent raw workflowInput from overwriting coerced start block values (#3347)
- fix(confluence): add input validation for SSRF-flagged parameters (#3351)
- fix(credential-selector): remove reserved icon space when no credential selected (#3348)
- fix(terminal): thread executionOrder through child workflow SSE events for loop support (#3346)
- fix(templates): show description tagline on template cards (#3335)
- fix(call-chain): x-sim-via propagation for API blocks and MCP tools (#3332)

## Other Changes

- chore(db): drop 8 redundant indexes and add partial index for stale execution cleanup (#3354)
- chore(executor): extract shared utils and remove dead code from handlers (#3334)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.100...v0.5.101)

---

## v0.5.102

_Released 2026-02-28 · commit `0d2e6ff3`_

## Features

- feat(google-contacts): add google contacts integration (#3340)
- feat(x): add 28 new X API v2 tool integrations and expand OAuth scopes (#3365)
- feat(resend): expand integration with contacts, domains, and enhanced email ops (#3366)
- feat(loops): add Loops email platform integration (#3359)
- feat(ashby): add ashby integration for candidate, job, and application management (#3362)
- feat(greenhouse): add greenhouse integration for managing candidates, jobs, and applications (#3363)
- feat(gamma): add gamma integration for AI-powered content generation (#3358)
- feat(luma): add Luma integration for event and guest management (#3364)
- feat(databricks): add Databricks integration with 8 tools (#3361)
- feat(agent): add MCP server discovery mode for agent tool input (#3353)

## Improvements

- improvement(loops): validate loops integration and update skill files (#3384)
- improvement(resend): add error handling, authMode, and naming consistency (#3382)
- improvement(luma): expand host response fields and harden event ID inputs (#3383)
- improvement(ashby): validate ashby integration and update skill files (#3381)
- improvement(mcp): add all MCP server tools individually instead of as single server entry (#3376)
- improvement(selectors): consolidate selector input logic (#3375)
- improvement(selectors): make selectorKeys declarative (#3374)
- improvement(ci): add sticky disk caches and bump runner for faster builds (#3373)
- improvement(x): align OAuth scopes, add scope descriptions, and set optional fields to advanced mode (#3372)
- improvement(docs): audit and standardize tool description sections, update developer count to 70k (#3371)
- improvement(blocks): update luma styling and linkup field modes (#3370)
- improvement(oauth): reordered oauth modal (#3368)
- improvement(tests): speed up unit tests by eliminating vi.resetModules anti-pattern (#3357)

## Bug Fixes

- fix(chat-deploy): fix launch chat popup and auth persistence, clean up React anti-patterns (#3380)
- fix(sse): fix memory leaks in SSE stream cleanup and add memory telemetry (#3378)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.101...v0.5.102)

---

## v0.5.103

_Released 2026-03-01 · commit `e07e3c34`_

## Features

- feat(docs): add API reference with OpenAPI spec and auto-generated endpoint pages (#3388)
- feat(integrations): add amplitude, google pagespeed insights, and pagerduty integrations (#3385)

## Bug Fixes

- fix(monitoring): set MemoryTelemetry logger to INFO level for production visibility (#3386)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.102...v0.5.103)

---

## v0.5.104

_Released 2026-03-03 · commit `f1ec5fe8`_

## Features

- feat(integrations): add brandfetch integration (#3402)
- feat(integrations): add google meet integration (#3403)
- feat(integrations): add dub.co integration (#3400)

## Improvements

- improvement(executor): support nested loops/parallels (#3398)
- improvement(airtable): added more tools (#3396)

## Bug Fixes

- fix(subflows): fix pointer events for nested subflow interaction (#3409)
- fix(editor): restore cursor position after tag/env-var completion in code editors (#3406)
- fix(logs): add status field to log detail API for polling (#3405)
- fix(socket): persist outbound edges from locked blocks (#3404)
- fix(memory): fix O(n²) string concatenation and unconsumed fetch response leaks (#3399)
- fix(layout): polyfill crypto.randomUUID for non-secure HTTP contexts (#3397)
- fix(icons): fix pagerduty icon (#3392)

## Other Changes

- chore(careers): remove careers page, redirect to Ashby jobs portal (#3401)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.103...v0.5.104)

---

## v0.5.105

_Released 2026-03-04 · commit `70c36cb7`_

## Features

- feat(slack): add new tools and user selectors (#3420)
- feat(servicenow): add offset and display value params to read records (#3415)
- feat(slack): add remove reaction tool (#3414)

## Bug Fixes

- fix(chat): use explicit trigger type check instead of heuristic for chat guard (#3419)
- fix(editor): pass workspaceId to useCredentialName in block preview (#3418)
- fix(memory): add Bun.gc, stream cancellation, and unconsumed fetch drains (#3416)
- fix(subflows): recurse into all descendants for lock, enable, and protection checks (#3412)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.104...v0.5.105)

---

## v0.5.106

_Released 2026-03-05 · commit `3ce94756`_

## Features

- feat(models): add gpt-5.4 and gpt-5.4-pro model definitions (#3424)

## Improvements

- improvement(snapshot): exclude sentinel in client side activation detection (#3432)

## Bug Fixes

- fix(condition): execution with subflow sentinels follow-on, snapshot highlighting, duplicate terminal logs (#3429)
- fix(kbs): legacy subblock id migration + CI check (#3425)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.105...v0.5.106)

---

## v0.5.107

_Released 2026-03-05 · commit `6586c5ce`_

## Features

- feat(slack): add views.open, views.update, views.push, views.publish tools (#3436)
- feat(reddit): add 5 new tools, fix bugs, and audit all endpoints against API docs (#3434)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.106...v0.5.107)

---

## v0.5.108

_Released 2026-03-06 · commit `8c0a2e04`_

## Features

- feat(jira): add search_users tool for user lookup by email (#3451)
- feat(selectors): add dropdown selectors for 14 integrations (#3433)

## Improvements

- improvement(selectors): remove dead semantic fallback code (#3454)
- improvement(selectors): simplify selector context + add tests (#3453)
- improvement(oauth): centralize scopes and remove dead scope evaluation code (#3449)
- improvement(canonical): backfill for canonical modes on config changes (#3447)

## Bug Fixes

- fix(selectors): resolve env var references at design time for selector context (#3446)
- fix(memory): upgrade bun from 1.3.9 to 1.3.10 (#3441)
- fix(tool-input): restore workflow input mapper visibility (#3438)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.107...v0.5.108)

---

## v0.5.109

_Released 2026-03-09 · commit `ecd3536a`_

## Features

- Revert "feat(hosted key): Add exa hosted key (#3221)" (#3221)
- feat(hosted key): Add exa hosted key (#3221)
- feat(evernote): add Evernote integration with 11 tools (#3456)
- feat(obsidian): add Obsidian integration with 15 tools (#3455)

## Bug Fixes

- fix(webhooks): return empty 200 for Slack to close modals cleanly (#3492)

## Other Changes

- chore(monitoring): remove SSE connection tracking and Bun.gc debug instrumentation (#3472)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.108...v0.5.109)

---

## v0.5.110

_Released 2026-03-11 · commit `1c2c2c65`_

## Bug Fixes

- fix(webhooks): eliminate redundant DB queries from webhook execution path (#3523)
- fix(security): add SSRF protection to database tools and webhook delivery (#3500)
- fix(parallel): align integration with Parallel AI API docs (#3501)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.109...v0.5.110)

---

## v0.5.111

_Released 2026-03-11 · commit `36612ae4`_

## Features

- feat(webhooks): dedup and custom ack configuration (#3525)

## Improvements

- improvement(webhooks): move non-polling executions off trigger.dev (#3527)

## Bug Fixes

- fix(gmail): RFC 2047 encode subject headers for non-ASCII characters (#3526)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.110...v0.5.111)

---

## v0.5.112

_Released 2026-03-12 · commit `e9bdc576`_

## Features

- feat(slack): add email field to get user and list users tools (#3509)
- feat(tools): add Fathom AI Notetaker integration (#3531)

## Improvements

- improvement(canvas): enable middle mouse button panning in cursor mode (#3542)

## Bug Fixes

- fix(blocks): clarify condition ID suffix slicing for readability (#3546)
- fix(jira): add explicit fields parameter to search/jql endpoint (#3544)
- fix(jira): add missing write:attachment:jira oauth scope (#3541)
- fix(traces): prevent condition blocks from rendering source agent's timeSegments (#3534)
- fix(blocks): remap condition/router IDs when duplicating blocks (#3533)

## Other Changes

- chore(oauth): remove unused github-repo generic OAuth provider (#3543)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.111...v0.5.112)

---

## v0.5.113

_Released 2026-03-12 · commit `4c12914d`_

## Features

- feat(google-ads): add google ads integration for campaign and ad performance queries (#3360)
- feat(ashby): add webhook triggers with automatic lifecycle management (#3548)

## Bug Fixes

- fix(grain): update to stable version of API (#3556)
- fix(executor): skip Response block formatting for internal JWT callers (#3551)
- fix(jira): remove unnecessary projectId dependency from manualIssueKey (#3547)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.5.112...v0.5.113)

---

## v0.6.1

_Released 2026-03-17 · commit `4f3bc37f`_

## Features

- feat(auth): migrate to better-auth admin plugin with unified Admin tab (#3612)

## Bug Fixes

- fix(mothership): fix tool call scheduling (#3635)

## Contributors

- @Sg312
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6...v0.6.1)

---

## v0.6.2

_Released 2026-03-18 · commit `4bd07318`_

## Features

- feat(blog): add v0.6 blog post and email broadcast (#3636)
- feat(home): resizable chat/resource panel divider (#3648)
- feat(mothership): request ids (#3645)
- feat(knowledge): add upsert document operation (#3644)
- feat(csp): allow chat UI to be embedded in iframes (#3643)

## Improvements

- improvement(landing): added enterprise section (#3637)

## Bug Fixes

- fix(db): reduce connection pool sizes to prevent exhaustion (#3649)
- fix(logs): add durable execution diagnostics foundation (#3564)
- fix(workspace): prevent stale placeholder data from corrupting workflow registry on switch
- fix(mothership): fix mothership file uploads (#3640)

## Other Changes

- waleedlatif1/hangzhou v2 (#3647)

## Contributors

- @PlaneInABottle
- @Sg312
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.1...v0.6.2)

---

## v0.6.3

_Released 2026-03-18 · commit `30f2d1a0`_

## Bug Fixes

- fix(mothership): mothership-ran workflows show workflow validation errors (#3634)
- fix(knowledge): infer MIME type from file extension in create/upsert tools (#3651)
- fix(hubspot): add missing tickets and oauth scopes to OAuth config (#3653)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.2...v0.6.3)

---

## v0.6.4

_Released 2026-03-18 · commit `ff7b5b52`_

## Features

- feat(box): add Box and Box Sign integrations (#3660)
- feat(workday): block + tools (#3663)
- feat(ashby): add 15 new tools and fix existing tool accuracy (#3662)
- feat(docusign): add docusign integration (#3661)

## Improvements

- improvement(billing): immediately charge for billing upgrades (#3664)

## Bug Fixes

- fix(schedules): deployment bug (#3666)
- fix(subflows): subflow-child selection issues, subflow error logs (#3656)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.3...v0.6.4)

---

## v0.6.5

_Released 2026-03-19 · commit `9fcd02fd`_

## Features

- feat(okta): add complete Okta identity management integration (#3685)
- feat(microsoft-ad): add Azure AD (Entra ID) integration (#3686)
- feat(infisical): add Infisical secrets management integration (#3684)

## Improvements

- improvement(platform): landing page cleanup, MX cache fixes, and auth util extraction (#3683)
- improvement(vfs): update custom glob impl to use micromatch, fix vfs filename regex (#3680)
- improvement(platform): added more email validation utils, added integrations page, improved enterprise section, update docs generation script (#3667)
- improvement(react): replace unnecessary useEffect patterns with better React primitives (#3675)

## Bug Fixes

- fix(oauth): fall back to configured scopes when DB scope is empty (#3678)
- fix(home): stop sidebar collapsing when artifact opens (#3677)
- fix(tool): Fix custom tools spreading out string output (#3676)
- fix(open-resource): open resource tool to open existing files (#3670)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.4...v0.6.5)

---

## v0.6.6

_Released 2026-03-19 · commit `1731a4d7`_

## Features

- feat(copilot): add rename operation to user_table tool (#3691)

## Improvements

- improvement(toast): match notification styling with countdown ring and consistent design (#3688)

## Bug Fixes

- fix(preview): show actual nested workflow name in log snapshots (#3689)
- fix(landing): update broken links, change colors (#3687)

## Other Changes

- chore(templates): disable templates page and related UI (#3690)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.5...v0.6.6)

---

## v0.6.7

_Released 2026-03-21 · commit `19442f19`_

## Features

- feat(integrations): add integrationType and tags classification to all blocks (#3702)
- feat(auth): add Turnstile captcha + harmony disposable email blocking (#3699)
- feat(kb): harden sync engine and add connector audit logging (#3697)
- feat(loading) show route specific skeleton UI (#3671)

## Bug Fixes

- fix(canvas): correct z-index layering for selected blocks and connected edges (#3698)
- fix(kb): max depth exceeded chunks page error (#3695)

## Other Changes

- chore(trust): replace Delve trust center with Vanta (#3701)

## Contributors

- @adithyaakrishna
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.6...v0.6.7)

---

## v0.6.8

_Released 2026-03-24 · commit `c78c870f`_

## Features

- feat(quiver): add QuiverAI integration for SVG generation and vectorization (#3728)
- feat(slack): add conversations.create and conversations.invite tools (#3720)
- feat(sidebar): add right-click context menu to settings nav item (#3715)

## Improvements

- improvement(settings): add View Invoices button to subscription billing details (#3726)
- improvement(settings): add searchable member selector in integrations and secrets (#3721)
- improvement(mothership): add file patch tool (#3712)
- improvement(mothership): copilot, files, compaction, tools, persistence, duplication constraints (#3682)

## Bug Fixes

- fix(mothership): async resume and tool result ordering (#3735)
- fix(mothership): parallel tool calls
- fix(mothership): abort streamlining (#3734)
- fix(ppt): dep injection (#3732)
- fix(mothership): tool durability (#3731)
- fix(quiver): build fail (#3730)
- fix(mothership): tool call loop (#3729)
- fix(oauth): decode ID token instead of calling Graph API for Microsoft providers (#3727)
- fix(autolayout): edits coalesced for same request diffs (#3724)
- fix(copilot) Allow loop-in-loop workflow edits (#3723)
- fix(tables): use overflow-clip on header text to allow horizontal scrolling (#3722)
- fix(login): move password reset success message inside the form (#3719)
- fix(auth): use absolute positioning for Turnstile container (#3718)
- fix(mothership): fix build error (#3717)
- fix(kb): store filename with .txt extension for connector documents (#3707)
- fix(mothership): fix edit hashing (#3711)
- fix(mothership): minor followups (#3709)
- fix(mothership): workflow name constraints (#3710)
- fix migration
- fix(auth): hide Turnstile widget container to prevent layout gap (#3706)

## Other Changes

- chore: client and server components (#3716)
- chore: optimize all the images (#3713)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @adithyaakrishna
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.7...v0.6.8)

---

## v0.6.9

_Released 2026-03-24 · commit `ed9a71f0`_

## Features

- feat(settings): add video tooltip previews for canvas settings (#3749)
- feat(admin): Add assume user capability (#3742)
- feat(billing): add appliesTo plan restriction for coupon codes (#3744)
- feat(home): auth-aware landing page navigation (#3743)
- feat(tour): added product tour (#3703)
- feat(table): column drag-and-drop reorder (#3738)

## Improvements

- improvement(mothership): show continue options on abort (#3746)

## Bug Fixes

- fix(home): voice input text persistence bugs (#3737)
- fix(integrations): remove outdated trigger mode text from FAQ (#3739)

## Other Changes

- chore: optimize imports and useShallow (#3740)
- chore: remove lodash (#3741)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @adithyaakrishna
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.8...v0.6.9)

---

## v0.6.10

_Released 2026-03-24 · commit `7b572f1f`_

## Improvements

- Revert "improvement(mothership): show continue options on abort (#3746)" (#3746)
- improvement(tour): fix tour auto-start logic and standardize selectors (#3751)
- improvement(ui): Merge ui components for mothership chat (#3748)

## Bug Fixes

- fix(db): use bigint for token counter columns in user_stats (#3755)
- fix(knowledge): route connector doc processing through queue instead of fire-and-forget (#3754)
- fix(auth): remove captcha from login, fix signup captcha flow (#3753)
- fix(ui): constrain tooltip width and remove question mark cursor (#3752)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.9...v0.6.10)

---

## v0.6.11

_Released 2026-03-25 · commit `6bebbc5e`_

## Features

- feat(misc): skills import, MCP modal, workmark, dispatch modals, collapsed tasks and workflows manipulation, README (#3777)
- Feat(logs) upgrade mothership chat messages to error (#3772)
- feat(ui): add request a demo modal (#3766)
- feat(logs) Add messageId and requestId context to all mothership log messages (#3770)
- feat(hubspot): add 27 CRM tools and fix OAuth scope mismatch (#3765)
- feat(rippling): add Rippling HR integration with 19 tools (#3764)
- feat(agents): generalize repository guidance for coding agents (#3760)

## Improvements

- add logs
- improvement(billing): treat past_due state correctly (#3750)

## Bug Fixes

- fix(copilot): expand tool metadata, fix thinking text rendering, clean up display logic (#3779)
- fix(guard-change): run finalize at right time
- fix(retry): extract code into callback
- fix chatHistory reconnect effect
- fix(explicit-user-abort): separate explicit user abort semantics (#3776)
- fix(client): network drops reconnecting behaviour (#3775)
- fix(notifications): auto-dismiss info-level workflow notifications (#3774)
- fix(mothership): key resumes by orchestration id (#3771)
- fix(billing): atomize usage_log and userStats writes via central recordUsage (#3767)
- fix(user-input): fix multiple re-renders on user-input and split the file (#3768)
- fix(ui): fix kb id extraction logic for resource, sync tags (#3763)

## Other Changes

- Merge branch 'staging' of github.com:simstudioai/sim into staging
- chore(docs): update readme (#3778)
- Merge branch 'staging' of github.com:simstudioai/sim into staging

## Contributors

- @Danigm-dev
- @TheodoreSpeaks
- @adithyaakrishna
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.10...v0.6.11)

---

## v0.6.12

_Released 2026-03-26 · commit `ca87d7ce`_

## Bug Fixes

- fix(blog): restore unoptimized prop on blog cover images (#3782)
- fix(ui): polish subscription billing settings (#3781)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.11...v0.6.12)

---

## v0.6.13

_Released 2026-03-27 · commit `e615816d`_

## Features

- feat(generic): add generic resource tab, refactor home structure, and UI polish (#3803)
- feat(search): add tables, files, knowledge bases, and jobs to cmd-k search (#3800)
- feat(ketch): add Ketch privacy consent integration (#3794)
- feat(granola): add Granola meeting notes integration (#3790)
- feat: fix rerenders on search input (#3784)
- feat(demo-request): block personal email domains (#3786)

## Improvements

- improvement(terminal): performance improvements (#3796)

## Bug Fixes

- fix(ui): Change modal field to be company size (#3801)
- fix(connectors): contentDeferred pattern + validation fixes across all connectors (#3793)
- fix(light): tag dropdown, code highlight (#3799)
- fix(security): harden auth, SSRF, injection, and CORS across API routes (#3792)
- fix: emcn component library design engineering polish (#3672)
- fix(landing): fix image rendering and navbar blog/docs navigation (#3785)

## Other Changes

- chore: fix cn with tw-merge (#3789)
- chore(config): clean up bun, turbo, and next.js config (#3788)

## Contributors

- @TheodoreSpeaks
- @adithyaakrishna
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.12...v0.6.13)

---

## v0.6.14

_Released 2026-03-27 · commit `14089f7d`_

## Features

- feat: update sidebar and knowledge (#3804)

## Improvements

- improvement(sidebar): collapsed sidebar UX, quick-create, hover consistency, and UI polish (#3807)

## Bug Fixes

- fix(knowledge): connector spinner race condition + connectors column (#3812)
- fix(flyout): align inline rename with non-rename styling (#3811)
- fix(knowledge): fix search input flicker on clear and plan display name fallback (#3810)
- fix(knowledge): show spinner on connector chip while syncing (#3808)

## Other Changes

- chore: fix rerenders on files (#3805)
- chore: remove font antialiasing (#3806)

## Contributors

- @adithyaakrishna
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.13...v0.6.14)

---

## v0.6.15

_Released 2026-03-29 · commit `560fa751`_

## Features

- feat(resources): add sort and filter to all resource list pages (#3834)
- feat(analytics): add Profound web traffic tracking (#3835)
- feat(files): interactive markdown checkbox toggling in preview (#3829)
- feat(ui): handle image paste (#3826)
- feat(academy): Sim Academy — interactive partner certification platform (#3824)
- feat(concurrency): bullmq based concurrency control system (#3605)

## Improvements

- improvement(landing): lighthouse performance and accessibility fixes (#3837)
- improvement(ui): sidebar (#3832)
- improvement(home): position @ mention popup at caret and fix icon consistency (#3831)
- improvement(sidebar): expand sidebar by hovering and clicking the edge (#3830)
- improvement(tour): remove auto-start, only trigger on explicit user action (#3823)
- improvement(worker): configuration defaults (#3821)
- update dockerfile (#3819)

## Bug Fixes

- fix(academy): hide academy pages until content is ready (#3839)
- fix(viewer): image pan/zoom, sort fixes, sidebar dot fixes (#3836)
- fix docker image build
- fix(readme): restore readme gifs (#3827)
- fix(knowledge): give users choice to keep or delete documents when removing connector (#3825)
- fix(mcp): use correct modal for creating workflow MCP servers in deploy (#3822)
- fix(security): pentest remediation — condition escaping, SSRF hardening, ReDoS protection (#3820)
- fix dockerfile
- fix(worker): dockerfile + helm updates (#3818)
- fix(security): SSRF, access control, and info disclosure (#3815)
- fix(knowledge): reject non-alphanumeric file extensions from document names (#3816)
- fix(linear): add default null for after cursor (#3814)
- fix(import): dedup workflow name (#3813)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.14...v0.6.15)

---

## v0.6.16

_Released 2026-03-30 · commit `1d7ae906`_

## Bug Fixes

- fix(bullmq): disable temporarily (#3841)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.15...v0.6.16)

---

## v0.6.17

_Released 2026-03-30 · commit `73e00f53`_

## Other Changes

- chore(trigger): update @trigger.dev/sdk and @trigger.dev/build to 4.4.3 (#3843)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.16...v0.6.17)

---

## v0.6.18

_Released 2026-03-30 · commit `7d0fdefb`_

## Features

- feat(logs): add copy link and deep-link support for log entries (#3863)
- feat(logs): add copy link and deep link support for log entries (#3855)
- feat(profound): add Profound AI visibility and analytics integration (#3849)
- Feat/improved logging (#3833)
- feat(block) add block write and append operations (#3665)

## Improvements

- improvement(platform): standardize perms, audit logging, lifecycle across admin, copilot, ui actions (#3858)
- improvement(tour): align product tour tooltip styling with emcn and fix spotlight overflow (#3854)
- improvement(workflow): use DOM hit-testing for edge drop-on-block detection (#3851)

## Bug Fixes

- fix(file): use file-upload subblock (#3862)
- fix(knowledge): fix document processing stuck in processing state (#3857)
- fix(atlassian): harden cloud ID resolution for Confluence and Jira (#3853)
- fix(mothership): hang condition (#3852)
- fix(auth): use standard 'Unauthorized' error in hybrid auth responses (#3850)
- fix(analytics): use getBaseDomain for Profound host field (#3848)
- fix(sidebar): cmd+click opens in new tab, shift+click for range select (#3846)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.17...v0.6.18)

---

## v0.6.19

_Released 2026-03-31 · commit `d5810090`_

## Features

- feat(providers): add Fireworks AI provider integration (#3873)
- feat(launchdarkly): add LaunchDarkly integration for feature flag management (#3870)
- feat(models): add gpt-5.4-mini and gpt-5.4-nano (#3871)
- feat(extend): add Extend AI document processing integration (#3869)
- feat(tailscale): add Tailscale integration with 20 API operations (#3868)
- feat(infra): add dev environment support (#3867)
- feat(secrets-manager): add AWS Secrets Manager integration (#3866)

## Improvements

- improvement(triggers): add tags to all trigger.dev task invocations (#3878)
- improvement(attio): validate integration, fix event bug, add missing tool and triggers (#3872)
- improvement(workflows): replace Zustand workflow sync with React Query as single source of truth (#3860)
- improvement(ui): fix nav loading flash, skeleton mismatches, and React anti-patterns across resource pages (#3864)

## Bug Fixes

- fix(kb): chunking config persistence (#3877)
- fix(chat): align floating chat send button colors with home/mothership chat (#3876)
- fix(reorder): drag and drop hook (#3874)
- fix(vllm): pass env.VLLM_API_KEY to chat requests (#3865)

## Contributors

- @icecrasher321
- @toddkim95
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.18...v0.6.19)

---

## v0.6.20

_Released 2026-04-02 · commit `0fdd8ffb`_

## Features

- feat(rootly): add Rootly incident management integration with 14 tools (#3899)
- feat(rippling): expand Rippling integration from to 86 tools, landing updates (#3886)
- feat(credentials) Add google service account support (#3828)
- feat(landing): added models pages (#3888)
- feat(providers): server-side credential hiding for Azure and Bedrock (#3884)

## Improvements

- improvement(models): update default to claude-sonnet-4-6 and reorganize OpenAI models (#3898)
- improvement(providers): audit and update all provider model definitions (#3893)
- improvement(workflow): seed start block on server side (#3890)
- improvement(credentials): consolidate OAuth modals and auto-fill credential name (#3887)

## Bug Fixes

- fix(credential): fix service_account migration to avoid unsafe enum usage in same transaction (#3897)
- fix(credential) fix credential migration (#3896)
- fix(blog): Fix blog not loading (#3895)
- fix(envvar): remove dead env var
- fix(cost): worker crash incremenental case (#3885)
- fix(encryption): specify authTagLength on all AES-GCM cipher/decipher calls (#3883)

## Other Changes

- chore(bun): update bunfig.toml (#3889)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.19...v0.6.20)

---

## v0.6.21

_Released 2026-04-02 · commit `f0d19504`_

## Bug Fixes

- fix(bullmq): restore CONCURRENCY_CONTROL_ENABLED flag guard (#3903)
- fix(blog): use landing theme variables in MDX components (#3900)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.20...v0.6.21)

---

## v0.6.22

_Released 2026-04-03 · commit `e8f7fe09`_

## Features

- feat(analytics): add PostHog product analytics (#3910)
- feat(blocks): add Credential block (#3907)
- feat(email): abandoned checkout email, 80% free tier warning, credits exhausted email (#3908)
- feat(email): send onboarding followup email 3 days after signup (#3906)
- feat(rootly): expand Rootly integration from 14 to 27 tools (#3902)
- feat(agentmail): add AgentMail integration with 21 tools (#3901)

## Bug Fixes

- fix(tools) Directly query db for custom tool id (#3875)
- fix(enterprise): smooth audit log list animation (#3905)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.21...v0.6.22)

---

## v0.6.23

_Released 2026-04-03 · commit `0b9019d9`_

## Improvements

- improvement(mothership): workflow edits via sockets (#3927)
- refactor(stores): consolidate variables stores into stores/variables/ (#3930)
- improvement(stores): remove deployment state from Zustand in favor of React Query (#3923)

## Bug Fixes

- fix(modals): center modals in visible content area and remove open/close animation (#3937)
- fix(modals): center modals in visible content area accounting for sidebar and panel (#3934)
- Fix "fix in copilot" button (#3931)
- fix(mcp): resolve userId before JWT generation for agent block auth (#3932)
- fix(ui) Fix oauth redirect on connector modal (#3926)
- fix(loading): remove jarring workflow loading spinners (#3928)

## Other Changes

- chore(stores): remove Zustand environment store and dead init scaffolding (#3929)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.22...v0.6.23)

---

## v0.6.24

_Released 2026-04-04 · commit `a54dcbe9`_

## Features

- feat: mothership/copilot feedback (#3940)

## Improvements

- improvement(models): tighten model metadata and crawl discovery (#3942)

## Bug Fixes

- fix(captcha): use getResponsePromise for Turnstile execute-on-submit flow (#3943)
- fix(envvars): restore workflowUserId fallback for scheduled execution env var resolution (#3941)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.23...v0.6.24)

---

## v0.6.25

_Released 2026-04-04 · commit `28af223a`_

## Features

- feat(cloudformation): add AWS CloudFormation integration with 7 operations (#3964)
- feat(block): Add cloudwatch block (#3953)
- feat(analytics): posthog audit — remove noise, add 10 new events (#3960)
- feat(knowledge): add Live sync option to KB connectors + fix embedding billing (#3959)

## Bug Fixes

- fix(integrations): show disabled role combobox for readonly members (#3962)
- fix(kb): fix Linear connector GraphQL type errors and tag slot reuse (#3961)
- fix(setup): db migrate hard fail and correct ini env (#3946)
- fix(setup): bun run prepare explicitly (#3947)
- fix(posthog): upgrade SDKs and fix serverless event flushing (#3951)
- fix(csp): allow Cloudflare Turnstile domains for script, frame, and connect (#3948)
- fix(ui): persist active resource tab in url, fix internal markdown links (#3925)

## Contributors

- @TheodoreSpeaks
- @abhinavDhulipala
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.24...v0.6.25)

---

## v0.6.26

_Released 2026-04-05 · commit `d889f326`_

## Features

- feat(files): expand file editor to support more formats, add docx/xlsx preview (#3971)
- feat(cursor): add list artifacts and download artifact tools (#3970)

## Improvements

- improvement(landing, blog): ui/ux (#3972)
- improvement(execution): multiple response blocks (#3918)

## Bug Fixes

- fix(blocks): resolve Ollama models incorrectly requiring API key in Docker (#3976)
- fix(core): consolidate ID generation to prevent HTTP self-hosted crashes (#3977)
- fix(settings): align skeleton loading states with actual page layouts (#3967)

## Contributors

- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.25...v0.6.26)

---

## v0.6.27

_Released 2026-04-06 · commit `316bc8cd`_

## Features

- feat(folders): soft-delete folders and show in Recently Deleted (#4001)
- feat(home): add double-enter to send top queued message (#4005)
- feat(home): add folders to resource menu (#4000)
- feat(posthog): Add posthog log for signup failed (#3998)
- feat(block): Conditionally hide impersonateUser field from block, add service account prompting (#3966)
- feat(triggers): add Linear v2 triggers with automatic webhook registration (#3991)
- feat(triggers): add Zoom webhook triggers (#3992)
- feat(landing): add PostHog tracking for CTA clicks, demo requests, and prompt submissions (#3994)
- feat(triggers): add Vercel webhook triggers with automatic registration (#3988)
- feat(analytics): add Google Tag Manager and Google Analytics for hosted environments (#3993)
- feat(triggers): add Notion webhook triggers (#3989)
- feat(triggers): add Greenhouse webhook triggers (#3985)
- feat(triggers): add Intercom webhook triggers (#3990)
- feat(triggers): add Gong webhook triggers for call events (#3984)
- feat(triggers): add Resend webhook triggers with auto-registration (#3986)
- feat(integrations): add Sixtyfour AI integration (#3981)
- feat(triggers): add HubSpot merge, restore, and generic webhook triggers (#3983)
- feat(triggers): add Salesforce webhook triggers (#3982)

## Improvements

- refactor(triggers): consolidate v2 Linear triggers into same files as v1 (#4010)
- refactor(webhooks): extract provider-specific logic into handler registry (#3973)

## Bug Fixes

- fix(secrets): restore unsaved-changes guard for settings tab navigation (#4009)
- fix(home): simplify enter-to-send queued message to single press (#4008)
- fix(resource-menu): consistent height between 1 result and no results (#4007)
- fix(webhooks): harden audited provider triggers (#3997)
- fix(sockets): joining currently deleted workflow (#4004)
- fix(subflows): make edges inside subflows directly clickable (#3969)
- fix(secrets): secrets/integrations component code cleanup (#4003)
- fix(blocks): allow tool expansion in disabled mode, improve child deploy badge freshness (#4002)
- fix(copilot): fix copilot running workflow stuck on 10mb error (#3999)
- fix(mothership): fix url keeping markdown hash on resource switch (#3979)
- fix(hitl): fix stream endpoint, pause persistence, and resume page (#3995)
- fix(signup): show multiple signup errors at once (#3987)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.26...v0.6.27)

---

## v0.6.28

_Released 2026-04-07 · commit `3f508e44`_

## Features

- feat(security): add GTM and GA domains to CSP for hosted environments (#4024)
- feat(auth): add DISABLE_GOOGLE_AUTH and DISABLE_GITHUB_AUTH env vars (#4019)
- feat(claude): add you-might-not-need-an-effect slash command (#4018)
- feat(dagster): expand integration with 9 new tools and full GraphQL validation (#4013)

## Improvements

- improvement(docs): ui/ux cleanup (#4016)

## Bug Fixes

- fix(signup): fix turnstile key loading (#4021)
- fix(docs): resolve missing tool outputs for spread-inherited V2 tools (#4020)
- fix(modals): consistent text colors and workspace delete confirmation (#4017)
- fix(knowledge): prevent navigation on context menu actions and widen tags modal (#4015)
- fix(table): escape LIKE wildcards in $contains filter values (#3949)
- fix(sso): default tokenEndpointAuthentication to client_secret_post (#3627)
- fix(blog): stack featured posts vertically on mobile to prevent horizontal overflow (#4012)

## Other Changes

- chore(stores): remove unused exports and dead code from zustand stores (#4014)

## Contributors

- @TheodoreSpeaks
- @emir-karabeg
- @lawrence3699
- @minijeong-log
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.27...v0.6.28)

---

## v0.6.29

_Released 2026-04-07 · commit `d6ec1153`_

login improvements, posthog telemetry (#4026)

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.28...v0.6.29)

---

## v0.6.30

_Released 2026-04-08 · commit `d7da35ba`_

## Features

- feat(secrets): allow admins to view and edit workspace secret values (#4040)
- feat(ui): Add copy button for code blocks in mothership (#4033)
- feat(athena): add AWS Athena integration (#4034)
- feat(chat): drag workflows and folders from sidebar into chat input (#4028)
- feat(slack): add subtype field and signature verification to Slack trigger (#4030)
- feat(posthog): Add tracking on mothership abort (#4023)

## Improvements

- improvement(kb): deferred content fetching and metadata-based hashes for connectors (#4044)
- refactor(polling): consolidate polling services into provider handler pattern (#4035)
- improvement(secrets): parallelize save mutations and add admin visibility for workspace secrets (#4032)

## Bug Fixes

- fix: address PR review comments (#4042)
- fix(kb): show 'pending' instead of past date for overdue next sync (#4039)
- fix(manual): mock payloads nested recursion (#4037)
- Revert "fix(sockets): joining currently deleted workflow (#4004)" (#4004)
- fix(admin): delete workspaces on ban (#4029)
- fix(login): fix captcha headers for manual login (#4025)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.29...v0.6.30)

---

## v0.6.31

_Released 2026-04-08 · commit `cf233bb4`_

## Features

- feat(enterprise): cloud whitelabeling for enterprise orgs (#4047)
- feat(voice): voice input migration to eleven labs (#4041)

## Bug Fixes

- fix(editor): stop highlighting start.input as blue when block is not connected to starter (#4054)
- fix(webhook): throw webhook errors as 4xxs (#4050)
- fix(trigger): add react-dom and react-email to additionalPackages (#4052)
- debug(log): Add logging on socket token error (#4051)
- fix(parallel): remove broken node-counting completion + resolver claim cross-block (#4045)
- fix(kb): disable connectors after repeated sync failures (#4046)
- fix(kb): doc selector (#4048)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.30...v0.6.31)

---

## v0.6.32

_Released 2026-04-08 · commit `f8f37586`_

## Features

- feat(block): Add cloudwatch publish operation (#4027)

## Improvements

- improvement(hitl): streaming, async support + update docs (#4058)

## Bug Fixes

- fix(jsm): improve create request error handling, add form-based submission support (#4066)
- fix(hitl): resume workflow output async (#4065)
- fix(hitl): async resume (#4064)
- fix(subscription-state): remove dead code, change token route check (#4062)
- fix(billing): Skip billing on streamed workflows with byok (#4056)
- fix(error): catch socket auth error as 4xx (#4059)
- fix(whitelabeling): cast activeOrganizationId on session for TS build
- fix(whitelabeling): eliminate logo flash by fetching org settings server-side (#4057)
- fix: merge subblock values in auto-layout to prevent losing router context (#4055)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.31...v0.6.32)

---

## v0.6.33

_Released 2026-04-09 · commit `3c8bb407`_

## Features

- feat(trigger): add ServiceNow webhook triggers (#4077)
- feat(jsm): add ProForma/JSM Forms discovery tools (#4078)

## Improvements

- improvement(polling): fix correctness and efficiency across all polling handlers (#4067)
- improvement(deploy): improve auto-generated version descriptions (#4075)
- improvement(release): address comments (#4069)

## Bug Fixes

- fix(credentials): add cross-cache invalidation for oauth credential queries (#4076)
- fix(trigger): add @react-email/components to additionalPackages (#4068)

## Other Changes

- docs(openapi): add Human in the Loop API endpoints (#4079)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.32...v0.6.33)

---

## v0.6.34

_Released 2026-04-09 · commit `d33acf42`_

## Improvements

- improvement(ci): parallelize Docker builds and fix test timeouts (#4083)

## Bug Fixes

- fix(tools): add Atlassian error extractor to all Jira, JSM, and Confluence tools (#4085)
- fix(trigger): use @react-email/render v2 to fix renderToPipeableStream error (#4084)

## Other Changes

- chore(ci): bump actions/checkout to v6 and dorny/paths-filter to v4 (#4082)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.33...v0.6.34)

---

## v0.6.35

_Released 2026-04-09 · commit `4f40c4ce`_

## Features

- feat(tools): add fields parameter to Jira search block (#4091)

## Bug Fixes

- fix(agent): include model in structured response output (#4092)
- fix(log): log cleanup sql query (#4087)
- fix(tools): handle all Atlassian error formats in parseJsmErrorMessage (#4088)

## Other Changes

- docs(openapi): add Human in the Loop section to API reference sidebar (#4089)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.34...v0.6.35)

---

## v0.6.36

_Released 2026-04-10 · commit `cbfab1ce`_

## Features

- feat(knowledge): add token, sentence, recursive, and regex chunkers (#4102)
- feat(ui): allow multiselect in resource tabs (#4094)
- feat(trigger): add Google Sheets, Drive, and Calendar polling triggers (#4081)

## Improvements

- improvement(integrations, models): ui/ux (#4105)
- improvement(sockets): workflow switching state machine (#4104)
- update(doc): Update hosted key/byok section (#4098)

## Bug Fixes

- fix(trigger): fix polling trigger config defaults, row count, clock-skew, and stale config clearing (#4101)
- fix(ui): support Tab key to select items in tag, env-var, and resource dropdowns (#4096)
- fix(tools): use OAuth-compatible URL for JSM Forms API (#4099)
- fix(trigger): show selector display names on canvas for trigger file/sheet selectors (#4097)
- fix(trigger): resolve dependsOn for trigger-mode subblocks sharing canonical groups with block subblocks (#4095)

## Contributors

- @TheodoreSpeaks
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.35...v0.6.36)

---

## v0.6.37

_Released 2026-04-11 · commit `4309d061`_

## Features

- feat(ee): enterprise feature flags, permission group platform controls, audit logs ui, delete account (#4115)
- feat(ee): add enterprise audit logs settings page (#4111)

## Improvements

- improvement(landing): rebrand to AI workspace, add auth modal, harden PostHog tracking (#4116)

## Bug Fixes

- fix(trigger): handle Drive rate limits, 410 page token expiry, and clean up comments (#4112)
- fix(trigger): fix Google Sheets trigger header detection and row index tracking (#4109)
- fix(execution): fix isolated-vm memory leak and add worker recycling (#4108)

## Other Changes

- chore(triggers): deprecate trigger-save subblock (#4107)

## Contributors

- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.36...v0.6.37)

---

## v0.6.38

_Released 2026-04-12 · commit `8b574769`_

## Bug Fixes

- fix(models): exclude reseller providers from model catalog pages (#4117)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.37...v0.6.38)

---

## v0.6.39

_Released 2026-04-12 · commit `e3d0e74c`_

## Features

- feat(crowdstrike): add tools + validate whatsapp, shopify, trello (#4123)

## Bug Fixes

- fix(models): fix mobile overflow and hide cost bars on small screens (#4125)
- fix(billing): unblock on payment success (#4121)

## Other Changes

- chore(skills): reinforce skill to not guess integration outputs (#4122)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.38...v0.6.39)

---

## v0.6.40

_Released 2026-04-13 · commit `0ac05397`_

## Features

- feat(jsm): add all Forms API endpoints for jira (#4142)
- feat(aws): add IAM and STS integrations (#4137)
- feat(ui): show folder path in search modal (#4138)
- feat(workspaces): add workspace logo upload (#4136)
- feat(agiloft): add Agiloft CLM integration with token-based auth (#4133)
- feat(workspaces): add recency-based workspace switching and redirect (#4131)
- feat(logs): add cancel execution to log row context menu (#4130)

## Improvements

- improvement(ui): remove anti-patterns, fix follow-up auto-scroll, move CopyCodeButton to emcn (#4148)
- improvement(docs): remove references to concurrency control (#4147)
- improvement(mothership): restructured stream, tool structures, code typing, file write/patch/append tools, timing issues (#4090)

## Bug Fixes

- fix(posthog): set email and name on person profile at signup (#4152)
- fix(ci): replace dynamic secret access with explicit secret references (#4151)
- fix(security): resolve ReDoS vulnerability in function execute tag pattern (#4149)
- fix(block-card): webhook URL never hydrates due to namespaced subBlock ID (#4150)
- fix(mothership): revert to deployment and set env var tools (#4141)
- fix(ui): fix home button not working until stream ends (#4145)
- fix(ui): fix flash between home and new chat (#4143)
- fix(ci): Increase build application memory (#4140)
- fix(ui): Focus first text input by default (#4134)
- fix(atlassian): unify error message extraction across all routes (#4135)
- fix(navbar): eliminate auth button flash using useSyncExternalStore (#4127)

## Other Changes

- chore(copilot): streaming paths reviewer group (#4144)
- chore(skills): add code quality review skills and cleanup command (#4129)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.39...v0.6.40)

---

## v0.6.41

_Released 2026-04-14 · commit `3838b6e8`_

## Bug Fixes

- fix(webhooks): non-polling webhook executions silently dropped after BullMQ removal (#4153)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.40...v0.6.41)

---

## v0.6.42

_Released 2026-04-14 · commit `fc079225`_

## Bug Fixes

- fix(mothership): tool path for nested folders (#4158)
- fix(mothership): fix workflow vfs reads (#4156)
- fix(ui): handle long file paths and names in search modal (#4155)

## Contributors

- @Sg312
- @TheodoreSpeaks

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.41...v0.6.42)

---

## v0.6.43

_Released 2026-04-14 · commit `3a1b1a80`_

## Features

- feat(jira): support raw ADF in description and environment fields (#4164)

## Bug Fixes

- fix(google-drive): add auto export format and validate against Drive API docs (#4161)
- fix(triggers): env var resolution in provider configs (#4160)
- fix(billing): add idempotency to billing (#4157)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.42...v0.6.43)

---

## v0.6.44

_Released 2026-04-14 · commit `46ffc490`_

## Features

- feat(microsoft-excel): add SharePoint drive support for Excel integration (#4162)

## Improvements

- improvement(ui): rename user-facing "execution" to "run" (#4176)
- refactor(microsoft-excel): export GRAPH_ID_PATTERN and deduplicate validation (#4174)
- improvement(ui): delegate streaming animation to Streamdown component (#4163)

## Bug Fixes

- fix(blocks): correct required field validation for Jira and Confluence blocks (#4172)
- fix(mothership): fix intelligence regression (#4171)
- fix(ui): align PlayOutline icon with filled Play shape (#4169)
- fix(seo): correct canonical URLs, compress oversized images, add cache headers (#4168)
- fix(ui): resource tab fixes, add search to workspace modal (#4166)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.43...v0.6.44)

---

## v0.6.45

_Released 2026-04-15 · commit `010435c5`_

## Features

- feat(brightdata): add Bright Data integration with 8 tools (#4183)

## Improvements

- improvement(seo): optimize sitemaps, robots.txt, and core web vitals across sim and docs (#4170)

## Bug Fixes

- fix(logs): close sidebar when selected log disappears from filtered list + cleanup (#4186)
- fix(mothership): fix superagent credentials (#4185)
- fix(gemini): support structured output with tools on Gemini 3 models (#4184)
- fix(landing): return 404 for invalid dynamic route slugs (#4182)
- fix(csp): add missing analytics domains, remove unsafe-eval, fix workspace CSP gap (#4179)

## Contributors

- @Sg312
- @emir-karabeg
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.44...v0.6.45)

---

## v0.6.46

_Released 2026-04-16 · commit `387cc977`_

## Improvements

- improvement(landing): optimize core web vitals and accessibility (#4193)

## Bug Fixes

- fix(ui): posthog guard, dynamic import loading, compact variant, rebase cleanup (#4196)
- fix(ui): fix attachment logic on queued mothership messages (#4191)
- fix(mothership): chat stream structuring + logs resource post fix (#4189)
- fix(brightdata): fix async Discover API, echo-back fields, and registry ordering (#4188)

## Other Changes

- Merge pull request #4190 from simstudioai/staging

## Contributors

- @TheodoreSpeaks
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.45...v0.6.46)

---

## v0.6.47

_Released 2026-04-16 · commit `2dbc7fdd`_

## Features

- feat(docs): fill documentation gaps across platform features (#4110)

## Bug Fixes

- fix(ui): stop terminal auto-select from stealing copilot input focus (#4201)
- fix(misc): remove duplicate docs page, update clopus 4.7 (#4200)
- fix(ui): fix focusing bugs while editing files (#4197)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.46...v0.6.47)

---

## v0.6.48

_Released 2026-04-16 · commit `8a50f184`_

## Features

- feat(tables): import csv into existing tables (#4199)

## Improvements

- improvement(ui): remove React anti-patterns, fix CSP violations (#4203)

## Bug Fixes

- fix(executor): subflow edge keys mismatch (#4202)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.47...v0.6.48)

---

## v0.6.49

_Released 2026-04-16 · commit `dcf33021`_

## Features

- feat(monday): add full Monday.com integration (#4210)
- feat(triggers): add Atlassian triggers for Jira, JSM, and Confluence (#4211)

## Improvements

- improvement(mothership): whitespace only deltas need to be preserved, update docs for theshold billing (#4212)
- improvement(logs): fix trigger badge wrapping, time range picker, status filters, and React anti-patterns (#4207)
- improvement(tables): clean up duplicate types, unnecessary memos, and barrel imports (#4205)

## Bug Fixes

- fix(resolver): turn off resolver for opaque schema nodes, unrun paths (#4208)
- fix(export): preserve unicode characters in workflow filenames (#4120)
- fix(socket): sync deploy button state across collaborators (#4206)

## Contributors

- @Sprexatura
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.48...v0.6.49)

---

## v0.6.50

_Released 2026-04-17 · commit `bc09865d`_

## Improvements

- improvement(mothership): agent model dropdown validations, markers for recommended models (#4213)
- improvement(terminal): resize output panel on any layout change via ResizeObserver (#4220)
- improvement(utils): add shared utility functions and replace inline patterns (#4214)
- improvement(sidebar): interleave folders and workflows by sort order in all resource pickers (#4215)

## Bug Fixes

- fix(pdf): PDF previews by adding the missing preview endpoint and allowing same-origin blob URLs in iframe CSP (#4225)
- fix(fireflies): support V2 webhook payload format for meetingId mapping (#4221)
- fix(execution): run pptx/docx/pdf generation inside isolated-vm sandbox (#4217)
- fix(chat): prevent @-mention menu focus loss and stabilize render identity (#4218)

## Other Changes

- docs(assets): Add pics and videos for mothership (#4216)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.49...v0.6.50)

---

## v0.6.51

_Released 2026-04-19 · commit `5f56e467`_

## Features

- feat(tables): column selection, keyboard shortcuts, drag reorder, and undo improvements (#4222)

## Improvements

- improvement(codebase): migrate tests to dbChainMock, extract react-query hooks (#4235)
- improvement(codebase): centralize test mocks, extract @sim/utils, remove dead code (#4228)
- improvement(billing): route scope by subscription referenceId, sync plan from Stripe, transfer storage on org join, outbox service (#4219)

## Bug Fixes

- fix(settings): restore paste-to-destructure for workspace secrets, cleanup hooks and design tokens (#4231)
- fix(landing): render proper 404 for invalid /models and /integrations routes (#4232)
- fix(ui): stop scrolling on leaving workflow sidebar for drag-drop (#4139)
- fix(blocks): resolve variable display in mothership resource preview (#4226)

## Other Changes

- chore(docker): add packages/utils to app and realtime Dockerfiles (#4229)
- chore(readme): update tech stack section (#4227)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.50...v0.6.51)

---

## v0.6.52

_Released 2026-04-21 · commit `ca3bbf14`_

## Features

- feat(integrations): AWS SES, IAM Identity Center, and enhanced IAM/STS/CloudWatch/DynamoDB (#4245)
- feat(contact): add contact page, migrate help/demo forms to useMutation (#4242)
- feat(log): Add wrapper function for standardized logging (#4061)
- feat(jobs): Add data retention jobs (#4128)
- feat(ui): Add slack manifest generator (#4237)

## Improvements

- improvement(contact): add Turnstile CAPTCHA, honeypot, and robustness fixes (#4248)
- improvement(access-control): migrate to workspace scope (#4244)
- improvement(landing): scope navbar/footer to (shell) route group, align scoped 404s with root (#4246)
- improvement(enterprise): slack wizard UI, enterprise docs, data retention updates (#4241)
- improvement(knowledge): show selector with saved option in connector edit modal (#4240)
- improvement(sso): fix provider lookup, migrate UI to emcn, add enterprise SSO docs (#4238)
- improvement(governance): workspace-org invitation system consolidation (#4230)

## Bug Fixes

- fix(settings): hide data-retention nav item when user lacks enterprise plan (#4256)
- fix(deps): bump drizzle-orm 0.45.2 + adopt MCP SDK 1.25.3 native types (#4252)
- fix(aws): add validateAwsRegion to all AWS route schemas to prevent SSRF (#4250)
- fix(landing): resolve error-page crash on invalid /models and /integrations routes (#4243)
- fix(billing): close TOCTOU race in subscription transfer, centralize stripe test mocks (#4239)
- fix(security): enforce URL validation across connectors, providers, and auth flows (SSRF + open-redirect hardening) (#4236)

## Other Changes

- seo(robots): disallow tag-filtered blog URLs from crawlers (#4247)

## Contributors

- @TheodoreSpeaks
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.51...v0.6.52)

---

## v0.6.53

_Released 2026-04-21 · commit `bbf400ff`_

## Bug Fixes

- fix(docs): update simstudio.ai URLs to sim.ai in SSO docs (#4257)
- fix(migration): permission group migration error (#4258)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.52...v0.6.53)

---

## v0.6.54

_Released 2026-04-22 · commit `64cfda52`_

## Features

- feat(observability): add mothership tracing (#4253)

## Improvements

- improvement(migrations): log better errors (#4260)

## Bug Fixes

- fix(otel): chat root OTel span on all early-return paths (#4265)
- fix(db): raise db pool size (#4263)

## Other Changes

- Merge pull request #4261 from simstudioai/staging

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.53...v0.6.54)

---

## v0.6.55

_Released 2026-04-22 · commit `7ca736a7`_

## Features

- feat(ui): add thinking ui to mothership (#4254)

## Improvements

- improvement(repo): separate realtime into separate app (#4262)

## Bug Fixes

- fix(selectors): enable search on all picker and selector subBlocks (#4269)
- fix(auth): add api key auth via sha256 hash lookup (#4266)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.54...v0.6.55)

---

## v0.6.56

_Released 2026-04-23 · commit `6066fc19`_

## Features

- feat(ui): Show subagent logs in bounded vertical view (#4280)
- feat(agentphone): add AgentPhone integration (#4278)
- feat(files): default sort by updated and add updated sort option (#4279)

## Bug Fixes

- fix(agentphone): fix image (#4281)
- fix(tables): account for letter-spacing and displayed content in column auto-resize (#4277)
- fix(api): Pass archivedAt to list table response (#4275)
- fix(retention): switch data retention to be org-level (#4270)

## Other Changes

- Set statement timeout of 90 seconds (#4276)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.55...v0.6.56)

---

## v0.6.58

_Released 2026-04-24 · commit `d6c1bc2f`_

## Improvements

- improvement(mothership): do not silently re-route missing stream id (#4295)
- improvement(tables): race-free row-count trigger + scoped tx timeouts (#4289)
- improvement(mothership): treat error as terminal event (#4290)
- refactor(ashby): align tools, block, and triggers with Ashby API (#4288)
- improvement(mothership): stream retry state machine, progressive re-rendering (#4287)

## Bug Fixes

- fix(mothership): queue supersede crash (#4297)
- fix(table-block): resolve canonical tableId in filter/sort builders (#4294)
- fix(copilot): replace crypto.randomUUID() with generateId() per project rule (#4268)
- fix(mothership): Use heartbeat mechanism for chat locks (#4286)
- fix(db): revert statement_timeout startup options breaking pooled connections (#4284)

## Other Changes

- chore(guide): update contributing guide (#4296)
- Merge pull request #4293 from simstudioai/staging
- chore(bun): bump bun to 1.3.13 (#4291)
- Merge pull request #4285 from simstudioai/staging (#4284)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @voidborne-d
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.56...v0.6.58)

---

## v0.6.59

_Released 2026-04-27 · commit `58a3ae2a`_

## Features

- feat(models): add gpt-5.5 models (#4300)

## Bug Fixes

- fix(mothership): parallel subagent rendering, exec stream re-attach (#4299)
- fix(security): credential-set invite email check + shopify authorize XSS (#4302)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.58...v0.6.59)

---

## v0.6.60

_Released 2026-04-27 · commit `489f2d3b`_

## Features

- feat(slack): canvas related operations (#4306)

## Improvements

- improvement(slack): channel selector for list canvasses (#4307)

## Bug Fixes

- fix(retention-job): add chunking strategy for cleanup (#4305)
- fix(stream): Avoid bun memory leak bug from TransformStream (#4255)
- fix(security): patch copilot tool & multipart upload IDORs (#4304)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.59...v0.6.60)

---

## v0.6.61

_Released 2026-04-29 · commit `6aa3fe3e`_

## Features

- feat(logs): trace span tree rewrite with resizable split, provider icons, and execution improvements (#4292)
- feat(table): expose position parameter for row insertion via copilot (#4326)
- feat(files): extract PDF viewer behind SSR boundary and polish file preview (#4316)
- feat(sap_s4hana): add get_material_document and fix supplier invoice key order (#4317)
- feat(governance): external workspace users from outside org (#4313)
- feat(integrations): SAP S/4HANA (#4301)

## Improvements

- improvement(docs): soften video hover opacity (#4339)
- improvement(sap_s4hana): use MERGE for OData v2 updates and enlarge icon (#4332)
- perf(docker): use turbo prune for app.Dockerfile (#4322)
- improvement(browser-use,stagehand): expose live session URLs (#4314)
- improvement(docker): speed up app image build with cache mounts and parallel node-gyp (#4310)

## Bug Fixes

- fix(files): streaming preview invariant + OOXML style extraction (#4335)
- fix(notion): correctly register tool (#4337)
- fix(ui): adjust docx and code rendering (#4334)
- fix(snapshot): stop markdown preview auto-scroll during patch streams + snapshot styling (#4333)
- fix(knowledge): skip sync and document processing when KB is deleted (#4327)
- fix(table): return 400 instead of 500 on empty batch insert (#4329)
- fix(billing): gate org billing query to invite modal open state and allow GA doubleclick in CSP (#4328)
- fix(copilot): use different chats for different workflows (#4324)
- fix(workflow): throw 4xx on variable resolution failures (#4325)
- fix(docker): use full bun.lock + bump deprecated GHA actions (#4323)
- fix(mcp): Use SDK web-standard transport for copilot mcp (#4320)
- fix(short-input): hide selected text to prevent overlay collision (#4318)
- fix(vm): categorize user or server side errors (#4283)
- fix(ui): display file upload error messages (#4315)
- fix(security): rate limit chat OTP + validate mothership proxy endpoint (#4312)
- fix(security): require internal API key for copilot training endpoints (#4311)
- fix(mothership): stabilize task sidebar ordering on selection (#4309)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @octo-patch
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.60...v0.6.61)

---

## v0.6.62

_Released 2026-05-02 · commit `2aaf2b71`_

## Features

- feat(files): embed sim files and render mermaid diagrams in markdown preview (#4402)
- feat(workflows): lock/duplicate improvements for workflows (#4387)
- feat(tables): add export, import column creation, infinite row pagination (#4373)
- feat(gmail): add edit draft and update label tools (#4374)
- feat(knowledge): add chunking strategies and regex strict boundaries (#4368)
- feat(ui): update context menu (#4362)
- feat(mothership): draft persistence, new task eager creation, doc preview fix, and loading polish (#4361)
- feat(knowledge): add embedding model selection and Cohere reranker (#4349)
- feat(fork): optimistic sidebar entry + Fork | prefix for forked tasks (#4353)
- feat(fork): fork chat from any assistant message (#4343)
- feat(firecrawl): add parse operation and revert short-input selection style (#4340)

## Improvements

- improvement(lock): lock icon next to entity (#4401)
- improvement(home): consolidate chat context kind icon registry (#4397)
- improvement(home): anchor @-mention popup at caret and right-size dropdown widths (#4393)
- improvement(mothership): reuse logs detail panel in resource view (#4389)
- improvement(executor): correctness-by-construction for workflow logs (#4382)
- improvement(tables): bump column auto-fit cap from 600px to 1000px (#4384)
- improvement(workflow): narrow zustand selectors and optimize log tree builds (#4378)
- improvement(invites): remove confusing copy (#4380)
- improvement(repo): update ship skills, flatten internal tools contracts dir (#4379)
- improvement(repo): reorganize contracts directory (#4376)
- improvement(trace): billing trace span typing (#4375)
- improvement(types): enforce patterns outside just hooks directory and fix CI check + fix tracing billing issue (#4367)
- improvement(toast): widen error toasts and bump line-clamp to 3 (#4370)
- improvement(repo): zod based client-server boundary (#4355)
- improvement(sidebar): remove unnecessary useCallback and useMemo wrappers (#4357)
- improvement(kb-selector): add search to knowledge base selector subblock (#4351)

## Bug Fixes

- fix(file): zero byte codegen file format + zoomable preview wrapper + mermaid errors loopback (#4400)
- fix(loading): cursor positioning, render-phase defaultValue sync, remove unnecessary useMemo (#4396)
- fix(serializer): apply tools.config.params before validating required tool params (#4391)
- fix(csp): allow https images in markdown preview and html sandbox (#4394)
- fix(files): unstick monaco find widget tooltips and surface logs in mothership add-resource (#4395)
- fix(mail): use html-to-text for plaintext email fallback (#4392)
- fix(oauth): trim Atlassian OAuth scopes to fix CloudFront 414 (#4388)
- fix(terminal): correct error/cancel block status in logs panel (#4372)
- fix(auth): resolve CORS errors for self-hosted deployments behind reverse proxies (#4369)
- fix(ui): fix tasks loading being cancelled, disable fork button (#4371)
- fix(ui): Add warning for organization-wide settings (#4366)
- fix(tasks): fix sidebar tasks skeleton hanging indefinitely (#4365)
- fix(settings): rename credentials to secrets, align role display (#4364)
- fix(secrets): invalidate env queries so dropdown updates without refresh (#4359)
- fix(custom-tool): include schema parameters in code wand prompt (#4360)
- fix(fork): clear task selection before navigating to fork (#4356)
- fix(fork): scope task list invalidation to current workspace (#4350)
- fix(integrations): harden jira, jsm, ashby, google drive, slack, confluence, notion (#4345)
- fix(cleanup): batch orphaned snapshot deletes to avoid slow-query spike (#4348)
- fix(files): use incremental applyEdits to prevent streaming flicker in Monaco editor (#4347)
- fix(trace): normalize keyed tool names and show credits in trace view (#4344)
- fix(copilot): fix new task error (#4341)

## Other Changes

- revert(executor): undo correctness-by-construction for workflow logs (#4382) (#4382)
- revert(short-input): remove selection:text-transparent (#4318) (#4318)
- chore(skills): update checklist for boundary e2e checklist (#4363)
- Merge pull request #4342 from simstudioai/staging

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.61...v0.6.62)

---

## v0.6.63

_Released 2026-05-02 · commit `d445b9c3`_

## Improvements

- improvement(knowledge): tighten column widths for short numeric/badge values (#4404)

## Bug Fixes

- fix(home): restore folder search in @-mention and plus-menu dropdown (#4403)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.62...v0.6.63)

---

## v0.6.64

_Released 2026-05-02 · commit `4bc6a173`_

## Features

- feat(files): export markdown as zip with embedded images (#4413)
- feat(table): hide new workflow column feature (#4414)
- feat(table): add workflow execution column type (#4338)
- feat(table): make plan table limits configurable via env vars (#4406)

## Improvements

- improvement(sidebar): overlay lock indicator on leading icon (#4412)
- improvement(blocks): depends on misalignments audit (#4409)

## Bug Fixes

- fix(credentials): clear stored refs on credential delete to prevent silent cascade orphaning (#4418)
- fix(memories): get memory tool, mem0 integration update (#4415)
- fix(uploads): direct-to-upload workspace files + shared transport (#4407)
- fix(connectors): harden 10 KB connectors after audit (#4410)
- fix(chat): close SSO auth bypass via checkSSOAccess body flag (#4408)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.63...v0.6.64)

---

## v0.6.65

_Released 2026-05-03 · commit `5be12f8d`_

## Features

- feat(files): allow image uploads in workspace files (#4419)

## Bug Fixes

- fix(files): align upload route image extensions with picker (#4423)
- fix(memory): return 200 with null data when memory key not found on GET (#4421)

## Contributors

- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.64...v0.6.65)

---

## v0.6.66

_Released 2026-05-04 · commit `4253e579`_

## Features

- feat(logs): add Logs block for querying execution logs from workflows (#4442)
- feat(image-generator): add gpt-image-2 model support (#4437)
- feat(mothership): restore attachment previews on draft and add video support (#4435)
- feat(knowledge): expose Cohere reranker controls (#4429)

## Improvements

- improvement(mothership): streaming state transitions (#4439)

## Bug Fixes

- fix(tables): suppress phantom rows on sort, center gutter numbers, stop select-all viewport jump (#4445)
- fix(terminal): use wall-clock duration for loop iterations with concurrent children (#4443)
- fix: double wrap reponse of guest session handler (#4438)
- fix(logs): split summary/detail contracts to make trace tab gate type-safe (#4431)
- fix(copilot): redact sim_key API keys from persisted Mothership chat messages (#4434)
- fix(mothership): stop persisting log resources from get_workflow_logs and self-heal stale log panel entries (#4424)
- fix(mothership): catch draft restore errors instead of crashing /home (#4433)
- fix(executor): strip childTraceSpans from block state before LLM tool calls (#4428)
- fix(knowledge): revert column width multipliers that misaligned Name header (#4427)
- fix(table): return 400 instead of 500 for malformed sort/filter input (#4425)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @stylessh
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.65...v0.6.66)

---

## v0.6.67

_Released 2026-05-05 · commit `8d6b6158`_

## Features

- feat(posthog): correlate task events with copilot logs via request_id (#4453)
- feat(exa): add date filters to search (#4451)

## Improvements

- improvement(logs): increase log details panel max width from 40vw to 60vw (#4449)
- refactor(tables): decouple UI display from DB position (#4448)

## Bug Fixes

- fix(copilot): disambiguate VFS upload paths to prevent stale-row reads (#4454)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.66...v0.6.67)

---

## v0.6.68

_Released 2026-05-05 · commit `efcd51a7`_

## Features

- feat(enterprise): add data drains for continuous export to S3 / webhook (#4440)
- feat(block): Allow wait block to wait up to 30 days (#4331)
- feat(credentials): add Atlassian service account credentials (#4432)

## Improvements

- refactor(tables): row selection as discriminated union (#4466)
- improvement(confluence): expand scopes, persist canonical mode toggle (#4461)

## Bug Fixes

- fix(data-drains): convert unique-name violations to 409 on POST/PUT (#4471)
- fix(mothership): enforce ownership check on workflow resource attachments (#4468)
- fix(security): block IPv4-compatible IPv6 SSRF bypass (#4467)
- fix(md): file streaming patch preview (#4465)
- fix(terminal): terminal console update for child spans + hitl state machine (#4450)
- fix(md-render): fix markdown rendering in file viewer (#4458)
- fix(agent): drop temperature param for claude-opus-4-7 (#4459)
- fix(ui): grey subagent tool calls and soften failure copy (#4457)
- fix(posthog): align tool params with subBlock canonical to fix missing-field error (#4455)

## Other Changes

- chore(docs): upgrade fumadocs to latest minor versions (#4462)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.67...v0.6.68)

---

## v0.6.69

_Released 2026-05-06 · commit `8d934f3a`_

## Features

- feat(files): zoom controls for inline mermaid and images in markdown (#4411)
- feat(sap): add SAP Concur integration block and SAP S/4HANA validation fixes (#4483)
- feat(emailbison): block, tools, sharepoint v2 block with cleaner code (#4470)
- feat(models): add grok-4.3 (#4472)

## Improvements

- improvement(executor): reserved keyword errors (#4482)
- improvement(seo): restore explicit AI/search bot allow-list and add link-preview rules (#4480)
- improvement(next): bundle and CI cache config (#4478)
- improvement(func-exec): normalize inputs to match schema (#4473)
- improvement(resolver): use context variables for block outputs in function block code (#4223)

## Bug Fixes

- fix(workday): correct SOAP service routing and reference types (#4485)
- fix(docker): drop scripts/ from workspaces array (#4484)
- fix(security): xlsx CVE bump and bundled security hardening (#4481)
- fix(office-excel): support Office.js add-in embed and surface Graph errors (#4479)
- fix(agiloft): correct response parsing, add EWGetChoiceLineId tool (#4477)
- fix(function): validate custom tool param keys before code interpolation (#4474)

## Other Changes

- chore(deps): upgrade next.js to 16.2.4 (#4460)
- chore(skills): add /add-model and /validate-model commands (#4475)

## Contributors

- @icecrasher321
- @octo-patch
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.68...v0.6.69)

---

## v0.6.70

_Released 2026-05-07 · commit `5ea80a83`_

_Release v0.6.70 — no release body on GitHub; commit has no details._

---

## v0.6.71

_Released 2026-05-07 · commit `3cc581ea`_

## Bug Fixes

- fix(type-error): subblock migrations type error (#4492)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.70...v0.6.71)

---

## v0.6.72

_Released 2026-05-09 · commit `07b8f1be`_

## Features

- feat(pptx): replace viewer with custom preview (#4536)
- feat(knowledge): include sourceUrl in KB search results (#4533)
- feat(peopledatalabs): add People Data Labs integration (#4513)
- feat(table): live cell updates via SSE + per-table event buffer (#4508)
- feat(search-replace): search & replace, cut, deploy modal ui flicker (#4507)

## Improvements

- improvement(sandbox): expand document generation — style extraction, sandbox hardening, OOM errors, task guards (#4526)
- improvement(mothership-chat): memoize message rows for long-transcript load speed (#4520)
- improvement(peopledatalabs): add titlecase, placeholders, and 404 handling on search (#4519)
- improvement(search-replace): dedupe double indexed segments (#4517)
- improvement(uploads): migrate remaining FormData uploads to presigned PUT (#4509)
- improvement(sandbox): upgrade pptx/docx/pdf bootstrap with image helpers, MIME guards, and 256 MB isolate limit (#4505)
- improvement(apollo): align tools and block with Apollo API docs (#4487)
- improvement(deployment): solve multiple client side races, and deployed state management issues (#4502)
- improvement(tables): extract TablesDetail wrapper, ship trigger followups (#4476)

## Bug Fixes

- fix(tables): inline editing center alignment in table cells (#4538)
- fix(uploads): write workspaceFiles row when issuing presigned URL (#4537)
- fix(tables): fix bulk ops truncation for tables larger than one page (#4532)
- fix(security): enforce workspace scope on workflow middleware and validate shopify shop domain (#4535)
- fix(uploads): allow images/video/audio in mothership presigned route (#4534)
- fix(mothership): misc ui bugs (#4528)
- fix(logs): include subfolders when filtering logs by folder (#4525)
- fix(table): fix table boolean, add dynamic row number col size, search & replace imporvements (#4515)
- fix(tables): optimistic updates for column delete/update (#4512)
- fix(hunter): align tools, block, and outputs with Hunter.io v2 API spec (#4511)
- fix(md-render): inline code inherits heading size in mothership/templates/changelog (#4504)
- fix(redis): drop cached client and restart PING loop after forced reconnect (#4501)
- fix(table): trigger cascade race fixes, polling, workflow column flag (#4499)
- fix(auth): Redirect to login if user session doesn't exist (#4497)
- fix(files): skip zip and return plain .md when no embedded images (#4498)
- fix(revenuecat): align tools and block with REST v1 API spec (#4488)
- fix(logs): relax fileSchema so execution logs with files render again (#4495)
- fix(billing): drop transaction wrapper in recordUsage to relieve pool contention (#4494)

## Other Changes

- chore(deps): audit and clean up dependencies (#4531)
- revert(ci): drop turbopackFileSystemCacheForBuild and restore actions/cache (#4500)
- Merge pull request #4496 from simstudioai/staging

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.71...v0.6.72)

---

## v0.6.73

_Released 2026-05-09 · commit `dcaf3e98`_

## Improvements

- improvement(deps): remove unused remark deps (#4542)

## Bug Fixes

- fix(script): biome format wrap (#4541)
- fix(zustand): v5 selector stability issues (#4539)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.72...v0.6.73)

---

## v0.6.74

_Released 2026-05-12 · commit `6aeb9819`_

_Release v0.6.74 — no release body on GitHub; commit has no details._

---

## v0.6.75

_Released 2026-05-12 · commit `3e9849b2`_

## Improvements

- improvement(scheduler): raise per-tick claim budget to drain backlog (#4567)
- improvement(helm): helm chart updates with security, ESO, and docs overhaul (#4565)
- improvement(mothership): align markdown blockquote, img, em, del with design tokens (#4566)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.74...v0.6.75)

---

## v0.6.76

_Released 2026-05-12 · commit `64d855a4`_

## Features

- feat(mothership): Add conversationId to mship block (#4577)
- feat(execution):  payload size bottlenecks with lazy execution value hydration, safer materialization, and batched parallel execution (#4560)

## Improvements

- improvement(grafana): align tools and block with Grafana API spec (#4574)
- improvement(workflow-block): support manual workflow ID via advanced mode (#4573)

## Bug Fixes

- fix(event-buffer): re-compact the event with preserveUserFileBase64: false (#4579)
- fix(mothership): reconcile stuck conversation_id against Redis lock to clear stuck-yellow task tiles (#4556)
- fix(console): match child-workflow inner blocks by instanceId when reconciling dropped SSE events (#4575)
- fix(security): harden findings — path traversal, SSRF, IDOR, file auth, credential access (#4571)
- fix(docs): restore media centering and full-width intro image (#4570)
- fix(helm): preserve STS serviceName + networkPolicy.egress back-compat (#4569)

## Contributors

- @Sg312
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.75...v0.6.76)

---

## v0.6.77

_Released 2026-05-13 · commit `ab156b5d`_

## Features

- feat(observability): export Trigger.dev telemetry to Grafana Cloud OTLP (#4583)
- feat(mothership): add files to mship block (#4584)
- feat(mothership): pin tasks to keep them at the top of the sidebar (#4582)

## Improvements

- improvement(mothership): allow mship to send function execute timeout (#4581)

## Bug Fixes

- fix(otel): address staging pr comments for trigger otel (#4586)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.76...v0.6.77)

---

## v0.6.78

_Released 2026-05-13 · commit `c09a2c92`_

## Improvements

- improvement(file-block): add get operation (#4588)

## Bug Fixes

- fix(mothership): persist @-mentioned resources across send (#4587)
- fix(file-block): fix get op (#4590)

## Contributors

- @Sg312
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.77...v0.6.78)

---

## v0.6.79

_Released 2026-05-14 · commit `6a5eebcf`_

## Improvements

- improvement(billing): move overage calculations out of txes (#4595)
- improvement(db): reduce connection saturation and egress hotspots (#4594)

## Bug Fixes

- fix(vfs): make copilot message ordering deterministic via WITH ORDINALITY (#4597)
- fix(tables): eliminate checkbox flicker on rapid cell toggle (#4592)
- fix(rate-limit): close rate-limit bypass and tighten public route limits (#4591)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.78...v0.6.79)

---

## v0.6.80

_Released 2026-05-14 · commit `4efe9997`_

## Features

- feat(cloudwatch): add mute and unmute alarm operations (#4602)

## Improvements

- improvement(gmail): replace custom html-to-text regex with library (#4613)
- improvement(scheduler): drain due schedules in chunks (#4578)
- Revert "improvement(db): add session statement/lock timeouts; simplify KB doc tx (#4593)" (#4593)
- improvement(db): add session statement/lock timeouts; simplify KB doc tx (#4593)

## Bug Fixes

- fix(gmail): send emails as multipart/alternative so they render full-width (#4611)
- fix(date-picker): eliminate infinite re-render crash on re-open with existing selection (#4609)
- fix(security): supabase rpc path validation, ssh stream byte cap, storage quota coverage (#4605)
- fix(security): harden file access controls, webhook auth, and input bounds (#4601)
- fix(integrations): gdrive trashed search, slack blocks-with-file, slack get_message ts (#4600)
- fix(seo): use canonical SITE_URL for robots and sitemap (#4598)

## Other Changes

- chore(deps): bump next to 16.2.5 for CVE-2026-44578 SSRF fix (#4606)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.79...v0.6.80)

---

## v0.6.81

_Released 2026-05-15 · commit `f69a9a01`_

## Features

- feat(mship): make mship block stream output (#4626)
- feat(wait): Async toggle, chained-wait resume fix, execution status API (#4514)
- feat(files): folders, multiselect, vfs update (#4572)

## Improvements

- improvement(executor): faster, more responsive workflow cancellation (#4630)
- improvement(copilot): trim copilot_chats reads to lean projections (#4629)
- improvement(redis): strip idempotency body and cap mothership stream zsets (#4625)
- improvement(providers): align attachment dispatch to vendor SDK types (#4619)
- improvement(files): validations (#4620)
- improvement(agent, file-block): files in agent block, file block v4 (#4610)

## Bug Fixes

- fix(workflows): exclude block locked from diff detection (#4631)
- fix(mcp): map validation and conflict orchestration errors to 400/409 (#4628)
- fix(cloudwatch): use PutAlarmMuteRule for mute/unmute with duration window (#4621)
- fix(files): fixed resource spacing on files directories pages (#4618)
- fix(logs,workspace): prevent cancelled status overwrite on race and move impersonation banner (#4617)

## Other Changes

- chore(utils): migrate to shared random/ID utilities and add enforcement linting (#4623)
- chore(deps): bump mermaid to 11.15.0 for GHSA-ghcm-xqfw-q4vr (#4615)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.80...v0.6.81)

---

## v0.6.82

_Released 2026-05-16 · commit `db7f1c1b`_

## Bug Fixes

- fix(migrations): remove duplicate column add (#4632)

## Contributors

- @Sg312

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.81...v0.6.82)

---

## v0.6.83

_Released 2026-05-16 · commit `dbe8e513`_

## Features

- feat(redis): TLS SNI override for IP-based REDIS_URL + zod schema fixes (#4635)

## Contributors

- @TheodoreSpeaks

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.82...v0.6.83)

---

## v0.6.84

_Released 2026-05-16 · commit `11bcb8f9`_

## Improvements

- improvement(copilot): drop unused columns from mothership chat detail reads (#4640)

## Bug Fixes

- fix(security): KB fileUrl LFI, MCP/Agiloft SSRF pinning, form OTP, KB authz (#4639)
- fix(redis): apply TLS SNI override to pub/sub clients (#4638)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.83...v0.6.84)

---

## v0.6.85

_Released 2026-05-18 · commit `d14af04d`_

## Features

- feat(google_docs): opt-in Markdown formatting for create operation (#4656)
- feat(findymail): add Findymail B2B contact data integration (#4654)
- feat(prospeo): add Prospeo integration for B2B contact enrichment and search (#4653)

## Improvements

- improvement(workspace): fix resource table column proportions and toast stacking (#4655)
- improvement(memory): replace unbounded server caches with lru-cache to fix heap growth (#4652)
- improvement(workspace): allocate more space to name column in resource tables (#4645)
- improvement(mothership): abort path race preventing persistence (#4647)
- improvement(redis-cleanup): schedule, async workflow, hitl base64 cache cleanup (#4646)

## Bug Fixes

- fix(tables): type-aware SQL casts for range filters on date columns (#4657)
- fix(knowledge): preserve scroll position when toggling tokenizer in chunk viewer (#4643)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.84...v0.6.85)

---

## v0.6.86

_Released 2026-05-19 · commit `e6b3ccea`_

## Features

- feat(integrations): add Gong incident.io Railway and New Relic (#4663)
- feat(azure-devops): block and trigger (#4664)
- feat(wiza): add Wiza integration for B2B prospect enrichment and search (#4662)
- feat(models): add gemini 3.5 flash (#4660)

## Improvements

- improvement(media-blocks): new versions of image and video gen with latest models + fixes (#4667)
- improvement(workflow-search): include block names in in-workflow search (#4668)
- improvement(cleanup): cleanup refs along in logs cleanup job (#4661)
- improvement(execution): memory usage for aggregated results (#4650)

## Bug Fixes

- fix(blocks): preserve agent block color (#4671)
- fix(workflow-search): unclip block-name highlight shadow on the left (#4670)
- fix(branding): align auth and deploy UI colors (#4669)
- fix(docker): restore NEXT_PUBLIC_APP_URL build arg with dummy fallback (#4665)
- fix(security): remove localhost CORS origin, consolidate CORS in proxy (#4658)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.85...v0.6.86)

---

## v0.6.87

_Released 2026-05-21 · commit `fde70e2b`_

## Features

- feat(tables): virtualize data grid with bounded copy and chunked delete (#4693)

## Improvements

- perf(db): reduce read/write fanout across hot paths (#4704)

## Bug Fixes

- fix(logs-cleanup): listing active workspaces into mem + download time streaming lims (#4692)
- fix(sidebar): pass showDelete to hide delete menu for non-admin members (#4697)
- fix(mcp): cache result of discoverServerTools to prevent post-OAuth refetch storm (#4701)
- fix(copilot): default SIM_AGENT_API_URL to www.copilot.sim.ai to avoid redirect path drop (#4700)
- fix(table): derive typewriter slice from elapsed time (no full-text flash) (#4694)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @minijeong-log
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.86...v0.6.87)

---

## v0.6.88

_Released 2026-05-21 · commit `e9ee351b`_

## Features

- feat(mailer): add AWS SES and SMTP providers with auto-detect fallback (#4710)

## Improvements

- improvement(mcp): per-server tool queries + negative cache (#4715)
- improvement(kb-connectors): multi-select fields + Slack bot/app message extraction (#4711)
- improvement(search-replace): pass down to subblocks (#4712)
- improvement(hubspot): OAuth-native polling trigger replacing webhook flow (#4705)
- improvement(oauth): coalesce token refresh + cache terminal failures (#4706)

## Bug Fixes

- fix(oauth): follower last-chance read after poll deadline (#4718)
- fix(files): RFC 5987 encode Content-Disposition filenames (#4713)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.87...v0.6.88)

---

## v0.6.89

_Released 2026-05-22 · commit `b5b2d835`_

## Improvements

- improvement(kb-connectors): align connector modal controls (#4730)
- improvement(kb-connectors): align connector UI surfaces (#4728)
- improvement(mcp): post-merge hardening — protocol negotiation + distributed OAuth lock + typed errors (#4722)
- perf(copilot): narrow getAccessibleCopilotChat projection (#4720)
- improvement(branding): dark og image matching landing surface (#4719)

## Bug Fixes

- fix(landing): remove cursor lerp causing laggy tracking in collaboration section (#4727)
- fix(large-refs): cleanup based on table read (#4716)
- fix(db): disable statement_timeout for migrations (#4714)
- fix(tools): pin resolved IP in DB connectors to prevent DNS-rebinding SSRF (#4725)
- fix(hubspot): selector fetchOptions default + credentialId validation (#4723)
- fix(combobox): show selected values in multi-select trigger label (#4721)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.88...v0.6.89)

---

## v0.6.90

_Released 2026-05-23 · commit `f6c99981`_

## Improvements

- improvement(media-gen): retire vision block, add hosted key for fal ai for image/video gen, search visibility in cmd-k (#4684)

## Bug Fixes

- fix(files): never dedup external URL fetches by path filename (#4733)
- fix(resource): prevent permission-gated breadcrumb items from flashing on load (#4732)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.89...v0.6.90)

---

## v0.6.91

_Released 2026-05-26 · commit `e532e0a6`_

## Features

- feat(hosted-keys): add Hunter.io and People Data Labs hosted key support (#4742)
- feat(litellm): add LiteLLM as AI gateway provider (#4739)
- feat(zoom): add KB connector for cloud recording transcripts, fix refresh token rotation (#4735)

## Improvements

- improvement(api): use HttpError base class for typed-error status mapping (#4746)
- improvement(executor): subflows, hitl handling cleanup (#4604)

## Bug Fixes

- fix(connectors): repair broken Zoom icon rendering (#4747)
- fix(zoom): iteratively strip tags in transcript parser to close incomplete-sanitization gap (#4745)
- fix(files): attach wheel listener before paint and guard SVG src (#4744)
- fix(files): zoom file viewer content, not the browser page (#4741)
- fix(api): classify access-denied and sandbox user-code errors with correct HTTP status (#4740)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.90...v0.6.91)

---

## v0.6.92

_Released 2026-05-27 · commit `fd194709`_

## Features

- feat(tables): Add enrichment table column type (#4752)
- feat(tools): queue hosted-key tool calls instead of failing with 429 (#4416)

## Improvements

- improvement(schedules): jitter scheduled execution starts by 0-30s (#4750)
- log(db): Add db failure cause log message (#4749)

## Bug Fixes

- fix(tables): workflow-column run fixes + bounded run-N-rows (#4754)

## Contributors

- @TheodoreSpeaks

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.91...v0.6.92)

---

## v0.6.93

_Released 2026-05-27 · commit `856182bd`_

## Features

- feat(instantly): block, trigger (#4763)

## Improvements

- improvement(cron): fire-and-forget for cron-invoked endpoints (#4764)
- improvement(integrations): tighten sixtyfour, agentmail, agentphone outputs (#4765)
- improvement(mcp): bound MCP memory and lifecycle concurrency (#4751)
- improvement(schedules): retries, concurrency limits (#4755)
- improvement(agentphone): update logo and bgcolor (#4753)

## Bug Fixes

- fix(tables): coerce row values to column types on write instead of failing (#4761)
- fix(rate-limiter): hosted-key queue follow-up fixes (#4762)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @modi2meet
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.92...v0.6.93)

---

## v0.6.94

_Released 2026-05-28 · commit `6bf9e960`_

## Features

- feat(integrations): add RB2B integration (#4784)
- feat(slack): scope private channel visibility to installing user (#4779)
- feat(integrations): add ZoomInfo, align Wiza, audit Apollo, refresh docs (#4776)
- feat(copilot): add copilot_messages table with dual-write rollout (#4726)
- feat(providers): add Claude Opus 4.8 model (#4771)

## Improvements

- improvement(logs): raise execution log size limits to 3MB / 512KB (#4778)
- improvement(billing): migrate hot path writes away from user_stats (#4768)
- improvement(auth): suffix-match BLOCKED_SIGNUP_DOMAINS to catch subdomain rotation (#4773)
- improvement(integrations): tighten resend, azure_devops icon, loops trim (#4772)

## Bug Fixes

- fix(auth): return 403 instead of 500 for blocked sign-in/sign-up attempts (#4783)
- fix(workflows): default workflow color when none provided on create (#4782)
- fix(slack): only parse scoped user id for oauth credentials (#4781)
- fix(mothership): persist queued messages, edit-in-place preserves order (#4769)

## Other Changes

- chore(auth): upgrade better-auth 1.3.12 → 1.6.11 (#4766)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.93...v0.6.94)

---

## v0.6.95

_Released 2026-05-28 · commit `503432c0`_

## Features

- feat(block): Add data enrichment block (#4774)

## Bug Fixes

- fix(schema) Make workflow description nullable (#4785)

## Contributors

- @TheodoreSpeaks

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.94...v0.6.95)

---

## v0.6.96

_Released 2026-05-29 · commit `a8dcdd50`_

## Features

- feat(slack): add install + privacy section to integration landing page (#4799)
- feat(integrations): hosted API keys for Findymail, Prospeo, and Wiza (#4777)
- feat(access-control): add per-model denylist to permission groups (#4794)
- feat(slack): request channels:manage and groups:write for conversation ops (#4792)
- feat(copilot): add seq ordinal to copilot_messages for order-preserving reads (#4791)
- feat(tables): pinned columns (#4770)

## Improvements

- improvement(enrichments): align enrichments sidebar with design system (#4801)
- improvement(providers): harden OpenAI-compatible providers + add tests (#4796)
- improvement(logs): object storage backed tracespans (#4787)

## Bug Fixes

- fix(misc): upgrade path change for new better-auth version, billing issue for workflow block agent usage (#4803)
- fix(tables): reduce column header chevron size and fix sidebar shadow bleed (#4800)
- fix(tables): resource-cell icons, embedded filters, run-state + UI fixes (#4789)
- fix(auth): block signup spam by denylisting shared MX backends (#4790)

## Other Changes

- chore(copilot): deprecate mcp server (#4797)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.95...v0.6.96)

---

## v0.6.97

_Released 2026-05-29 · commit `2f1f633d`_

## Bug Fixes

- fix(copilot): seq migration (#4804)

## Contributors

- @icecrasher321

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.96...v0.6.97)

---

## v0.6.98

_Released 2026-05-30 · commit `e32699d9`_

## Features

- feat(google-sheets): add row filtering to read with numeric operators (#4822)

## Improvements

- improvement(enrichments): limit company-info to fields both providers return (#4817)
- improvement(integrations): validate and expand devin, cursor, and greptile (#4820)
- perf(copilot): read chat transcripts from copilot_messages (R+1 cutover) (#4808)

## Bug Fixes

- fix(sso): re-check domain conflict before write and reject IP-address domains (#4825)
- fix(selectors): fetch all pages for paginated dropdown list routes (#4823)
- fix(files): don't reject external URLs containing '..' in file parse validation (#4821)
- fix(search-replace): don't auto-navigate when content edits invalidate the active match (#4819)
- fix(security): block private/reserved IPs for hosted 1Password Connect SSRF (#4818)
- fix(security): harden SSO domain registration, webhook path isolation, and CSV export (#4813)
- fix(wait): resume live/draft async waits and preserve cell context on chained waits (#4814)
- fix(tables): serialize schema mutations to prevent parallel column clobber (#4812)
- fix(icons): repair broken integration icon rendering (#4810)
- fix(tables): right-align run/stop in embedded toolbar; workflow cells format like normal cells (#4806)

## Other Changes

- chore(db): drop redundant idx_webhook_on_workflow_id_block_id index (#4809)

## Contributors

- @TheodoreSpeaks
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.97...v0.6.98)

---

## v0.6.99

_Released 2026-06-01 · commit `12ada0ce`_

## Features

- feat(tables): add PostHog events for table-workflow run/stop gestures (#4839)
- feat(linq): add Linq iMessage/SMS/RCS integration (34 tools, block, attachment upload) (#4831)
- feat(providers): add Together AI, Baseten, and Ollama Cloud model providers (#4830)
- feat(tables): expand filter operators (not-contains, starts/ends-with, not-in, empty) (#4827)

## Improvements

- improvement(kbs): ownership bindings (#4833)
- improvement(copilot): stop persisting tool-call result outputs in transcripts (#4829)
- improvement(copilot): make copilot_messages the sole transcript store, remove JSONB dual-write (#4826)

## Bug Fixes

- fix(tables): reliable stop-all, accurate "X running", and rate/usage gating for cell runs (#4838)
- fix(misc): keep block-tool params selected across store replace, perms parity for delete (#4840)
- fix(tables): enforce plan limits in mothership user_table tool (#4832)
- fix(deps): upgrade vitest to ^4.1.0 to patch critical Vitest UI advisory (GHSA-5xrq-8626-4rwp) (#4837)
- fix(table): preserve workflow groups on CSV column-add and dispatch after tx commit (#4503)

## Other Changes

- chore(access): helper cleanup (#4842)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.98...v0.6.99)

---

## v0.6.100

_Released 2026-06-02 · commit `e8f09ae6`_

## Features

- feat(apify): add run task, get dataset items, and get run tools (#4851)
- feat(landing): add AI-generated content disclaimer to integration landing page (#4845)

## Bug Fixes

- fix(tables): count dispatcher pre-stamps in "X running" during active dispatch (#4850)
- fix(mothership): connect integrations from chat without `state_mismatch` (#4848)
- fix(hubspot): remove unused scopes (#4846)
- fix(mothership): scope mothership block tool permissions to the executing user (#4843)

## Other Changes

- chore(auth): remove deprecated OAuth MCP provider plugin and backing tables (#4847)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.99...v0.6.100)

---

## v0.6.101

_Released 2026-06-02 · commit `3ba86685`_

## Features

- feat(connectors): add 11 knowledge base connectors (#4849)

## Bug Fixes

- fix(fathom): skip getDocument when header cache is missing instead of emitting a degraded, un-refreshable record (#4859)
- fix(slack): request reactions:read in OAuth URL, drop im:history (#4856)
- fix(auth): show "account already exists" on duplicate email signup (#4855)
- fix(schedules): count usage lim error schedule as failed run (#4853)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.100...v0.6.101)

---

## v0.6.102

_Released 2026-06-03 · commit `1192e20e`_

## Features

- feat(gitlab): sync repository files (code/docs) (#4864)
- feat(storage): support S3-compatible endpoints (R2, MinIO, B2) for file storage (#4865)

## Bug Fixes

- fix(tables): surface real error causes on cell-execution failures (diagnostics) (#4868)
- fix(storage): percent-encode object key in multipart fallback URL (#4872)
- fix(gitlab): pin pagination cursor to configured host + consolidate isSameOrigin (#4873)
- fix(dev): use globalThis for singleton state to prevent HMR memory leaks (#4869)
- fix(mothership): run client-routed workflow tools server-side in headless execution (#4870)
- fix(auth): link SSO sign-in to existing same-email accounts (#4866)
- fix(env): schema treatment of empty string (#4862)
- fix(background): recategorize user/recovery failures as errors, not trigger faults (#4860)

## Other Changes

- docs(slack): remove archival reference from Download files per Slack Marketplace guidelines (#4867)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.101...v0.6.102)

---

## v0.6.103

_Released 2026-06-05 · commit `1ce8e922`_

## Features

- feat(tables): fractional order keys for O(log n) row insert/delete (flag-gated, default off) (#4890)
- feat(tables): workflow version selection (live/deployed) and not-found/no-output badges (#4889)
- feat(metrics): emit hosted-key metrics to Grafana via OTel (#4885)
- feat(integrations): add ClickHouse block and expand Dagster + Tinybird tools (#4883)
- feat(connectors): add 7 knowledge base connectors (Google Forms, Typeform, Azure DevOps, YouTube, JSM, S3, Sentry) (#4880)
- feat(tables): background import for large CSVs with live progress (#4861)

## Improvements

- refactor(tables): consolidate row data-access in service.ts (#4881)

## Bug Fixes

- fix(clickhouse): harden read-only query enforcement and centralize WHERE-clause validation (#4895)
- fix(otel): make service.instance.id unique per process (#4891)
- fix(autolayout): relocate notes that overlap blocks after layout (#4888)
- fix(polling-tools): pass plan execution timeout to internal polling tool routes (#4884)
- fix(mcp): enforce tool name validation in deploy modal (#4879)
- fix(security): chat attachment XSS, MCP OAuth SSRF guards, Teams clientState verification (#4877)

## Other Changes

- chore(db): drop legacy copilot_chats.messages JSONB column (#4886)
- chore(skills): mirror model/enrichment/hosted-key/council skills into .agents/skills and expand add-model touchpoints (#4882)
- chore(readme): refresh demo GIFs from docs, lead with Mothership (#4878)
- chore(api-key): remove legacy scan+decrypt auth fallback (#4876)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.102...v0.6.103)

---

## v0.7.0

_Released 2026-06-09 · commit `0c2df1eb`_

## Features

- feat(slack): assistant thread ops, paginated history/replies, and permalink (#4934)
- feat(integrations): add AWS AppConfig integration with tools, block, and docs (#4928)
- feat(integrations): expand tool coverage, audit integrations, regen docs (#4920)
- feat(models): add Claude Fable 5 (#4921)
- feat(tables): stable column ids for metadata-only rename (#4898)
- feat(emcn/toast): toast redesign — intent variants, stacking, hover reveal, dismiss-all (#4909)
- feat(sendblue): add Sendblue iMessage/SMS integration with tools and triggers (#4917)
- feat(auth): dynamic signup/login ban lists via AWS AppConfig (#4911)
- feat(integrations): suggest curated skills per integration with one-click add (#4912)
- feat(enrichment): add ZeroBounce, NeverBounce, and MillionVerifier email verification (#4854)
- feat(tables): row-gutter drag-select, Cmd+F find, and select-all polish (#4901)

## Improvements

- improvement(tools): validate integrations, add Gong activity tools, regenerate docs (#4937)
- improvement(emcn): consolidate chip chrome, enforce ChipModalField, paint real chrome in loading fallbacks (#4935)
- improvement(mothership): v0.2 (#4923)
- refactor(emcn): make ChipModal footer/header props-driven and migrate all consumers (#4905)
- improvement(metrics): emit hosted-key metrics to CloudWatch instead of OTel (#4914)
- refactor(mothership-chats): rename task feature to chat, move route, add redirect (#4910)
- improvement(perms): member removal reassignment policies (#4906)
- improvement(platform): remove tour, simplify sidebar/header, drop loading skeletons (#4354)

## Bug Fixes

- fix(mothership): clear chat input after sending a message mid-conversation (#4936)
- fix(agent): unique tool ids for multi-instance tools + icon updates (#4933)
- fix(tables): key filter UI by stable column id; show column name in delete confirm (#4930)
- fix(modal): preserve spacing in workspace delete confirmation label (#4929)
- fix(tables): route large CSV imports to the background job instead of 413 (#4927)
- fix(terminal): truncate console values by size and cycles, not nesting depth (#4924)
- fix(tables): stop insert-row flicker and return order_key from rows list (#4918)
- fix(home,integrations): optical-center home input + integrations page render fix (#4916)
- fix(user-input): atomic chip selection, modifier-key handling, and stale overlay ghost (#4902)
- fix(tables): compare order_key bytewise (COLLATE "C") to stop insert collation errors (#4908)
- fix(security): SSRF pinning, Twilio webhook auth, copilot token leak, audit-log tenant scoping (#4899)

## Other Changes

- chore(tables): own fractional-indexing in-house, drop runtime dep (#4900)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @andresdjasso
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.6.103...v0.7.0)

---

## v0.7.1

_Released 2026-06-10 · commit `7ffc495f`_

## Features

- feat(codepipeline): add AWS CodePipeline integration with tools and block (#4945)
- feat(workflows): sim trigger, logs v2 block, toolbar renaming (#4941)
- feat(realtime): preflight schema-compatibility check on startup (#4940)

## Improvements

- improvement(mothership): smooth streamed text reveal + dropdown z-index fix (#4947)
- improvement(chat-voice): modernize ElevenLabs TTS to Flash v2.5 (#4943)

## Bug Fixes

- fix(billing): prevent deadlock with timeout (#4949)
- fix(file-preview): gate streaming animation to prevent file patch issue with scroll based re-render (#4946)
- fix(security): authz, IDOR, and abuse-prevention fixes (#4944)
- fix(secrets): keep readonly secret names legible instead of dimming them (#4942)
- fix(db): serialize concurrent migrations with a Postgres advisory lock (#4939)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.0...v0.7.1)

---

## v0.7.2

_Released 2026-06-10 · commit `d4722f9d`_

## Improvements

- refactor(ui): eliminate prop drilling in editor, home, sidebar, and logs dashboard (#4950)

## Bug Fixes

- fix(attribution): workspace id attr should be best-effort for self hosted users (#4953)
- fix(security): neutralize CSV formula injection in logs export (#4952)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.1...v0.7.2)

---

## v0.7.3

_Released 2026-06-10 · commit `f4d22ff2`_

## Features

- feat(ci): run db migrations from github ci with environment-scoped secrets (#4957)

## Improvements

- improvement(docs): align docs UI with the platform emcn design system (#4962)
- improvement(mship): contract update (#4961)
- improvement(docs): builder-first IA reorganization of the English docs (#4896)
- improvement(db): opt-in read-replica client + migration runner hardening (#4955)

## Bug Fixes

- fix(oauth): drop ungrantable JSM Forms scopes from Jira scope list (#4960)
- fix(table): translate column name-keyed wire data for workflow tool calls on internal row routes (#4958)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @ouiliame
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.2...v0.7.3)

---

## v0.7.4

_Released 2026-06-11 · commit `a48b4a15`_

## Features

- feat(integrations): add Daytona integration with sandbox lifecycle, code execution, and file tools (#4987)
- feat(integrations): add Quartr integration with company, event, document, audio, and live event tools (#4986)
- feat(integrations): add Convex integration with function execution and data export tools (#4981)
- feat(integrations): add Brex integration (#4983)
- feat(latex): add LaTeX integration with PDF compilation tool, block, and docs (#4972)
- feat(temporal): add Temporal integration with workflow, schedule, and task queue tools (#4976)
- feat(integrations): add Trigger.dev integration (#4974)
- feat(auth): enforce domain and account bans on sign-in and workflow executions (#4948)
- feat(persona): add Persona identity verification integration (#4967)
- feat(byok): support multiple keys per provider with round-robin rotation (#4963)

## Improvements

- improvement(integrations): overhaul landing FAQs for SEO/GEO and fix dynamic OG images (#4985)
- improvement(sockets): make offline mode recoverable and stop transient races tripping it (#4980)
- improvement(db): route additional staleness-tolerant reads to the read replica (#4966)
- improvement(logs): add copy raw trace button to trace view header (#4968)

## Bug Fixes

- fix(mothership): re-arm smooth-text reveal timer every render so streamed text can't freeze mid-sentence (#4994)
- fix(files): support Safari < 17.4 in PDF preview (#4992)
- fix(db): close optional-executor contract traps (#4989)
- fix(mship): add tool watchdog (#4991)
- fix(providers): correct pricing, deprecations, and capabilities across model catalog (#4990)
- fix(docker): logger import (#4988)
- fix(db-part-1): eliminate pool self-deadlock from nested checkouts inside transactions (#4975)
- fix(modal): center full-size modals against the viewport instead of the content area (#4984)
- fix(deps): dedupe radix focus-scope/dismissable-layer so in-modal dropdowns open (#4977)
- fix(integrations): stop browser autofilling the service account API token field (#4973)
- fix(workflow): show Remove from Subflow for unconnected blocks pasted into subflows (#4971)
- fix(workflow-block): exclude trigger-advanced subblocks from canvas preview outside trigger mode (#4969)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.3...v0.7.4)

---

## v0.7.5

_Released 2026-06-12 · commit `79d98b39`_

## Features

- feat(mailer): gate outbound email on AppConfig access-control ban list (#5018)
- feat(deployments): add v1 deployment endpoints and Deployments block (#5009)
- feat(integrations): add Documentation link to service-account connect modals (#5004)
- feat(integrations): add Vanta integration with compliance, evidence file, people, vendor, vulnerability, and risk tools (#4993)
- feat(tables): background jobs (delete/export/backfill on trigger.dev) + tenant-scoped query performance (#4915)

## Improvements

- Revert "improvement(auth): layer disposable-email-domains into signup email validation (#5010)" (#5010)
- refactor(deployments): consolidate version reads, status mapping, and v1 auth prologue (#5013)
- improvement(auth): layer disposable-email-domains into signup email validation (#5010)
- improvement(organization): invite validation experience (#5008)
- improvement(files): fit-width previews and chip-chrome viewer controls (#5002)
- improvement(billing): self-heal null usage limits and debounce api-key last-used writes (#5000)
- improvement(emcn): show per-chip error tooltips on invalid email chips (#4998)
- improvement(tables): migrate inputs to emcn chip components and clean up tables feature (#4995)

## Bug Fixes

- fix(mothership): tenant-check outputTable writes and route them through replaceTableRows (#5011)
- fix(tables): heartbeat export job before upload so the stale janitor can't kill a live finalize (#5017)
- fix(jira): add classic JSM scopes to close granular scope-set gap (#5005)
- fix(tables): header "T…" flicker — emcn barrel Table component shadowed the Table icon in loading fallbacks (#5007)
- fix(tables): scope optimistic stop-cancel to the active filtered view (#4996)
- fix(tables): align sidebar dividers, disclosure spacing, and header height with the editor and page header (#5003)
- fix(integrations): resolve OAuth connect UI by service id instead of display name (#5001)
- fix(tables): per-batch delete-job commits, real trigger.dev retries, post-index ANALYZE guard (#4997)

## Other Changes

- chore(providers): remove claude-fable-5 model (#5020)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.4...v0.7.5)

---

## v0.7.6

_Released 2026-06-14 · commit `e6587ca6`_

## Features

- feat(scheduled-tasks): pause/resume, mutation toasts, submit guards, empty state (#5044)
- feat(scheduled-tasks): minute-granular calendar + user timezone preference (#5038)
- feat(billing): gate programmatic workflow execution behind a paid plan (#5036)
- feat(hubspot): add notes, emails, properties & associations tools (#5037)
- feat(scheduled-tasks): calendar views + persisted, runnable tasks (#4979)
- feat(blocks): add external-service url to block metadata (#5032)

## Improvements

- improvement(settings): right-align timezone picker, order by popularity, drop tooltip (#5043)
- improvement(salesforce): align tools + block with Salesforce API and harden CRUD/analytics (#5040)
- improvement(perms): followup to org scoping of permission groups
- improvement(permissions): permission groups scoped to organization level (#5035)
- improvement(sim-trigger): change execution terminology to run (#5033)
- improvement(react-query): codebase-wide audit — server-state hooks, webhook coherence, resume migration (#5024)
- perf(mothership): virtualize chat transcript and isolate input from stream re-renders (#5019)

## Bug Fixes

- fix(chat): fail closed when embed gate cannot resolve workspace (#5046)
- fix(mothership): streaming completion-flash fix + Tavily brand icon (#5030)
- fix(db-part-4): enforce consistent cross-resource lock ordering (#5027)
- fix(chat): escape attachment filename and validate file URL scheme to prevent XSS (#5028)
- fix(skills): reuse shared upload field in skill import modal; logo-only Quartr icon (#5026)
- fix(db): correct misleading error message when DATABASE_REPLICA_URL is malformed (#5023)
- fix(db-part-3):  bound cross-request shared promises against pool wedge (#5021)

## Contributors

- @TheodoreSpeaks
- @emir-karabeg
- @icecrasher321
- @salarkhannn
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.5...v0.7.6)

---

## v0.7.7

_Released 2026-06-15 · commit `8c3706e4`_

## Features

- feat(square): add Square integration with 34 commerce operations (#5053)
- feat(context-dev): add Context.dev web + brand data integration (#5048)

## Improvements

- refactor(sim): consolidate record guards + pure utils into @sim/utils (#5061)
- improvement(mship): add enrichment tool, clean up dead tools (#5058)
- Revert "improvement(mship): clean up dead tools, add enrichments (#5056)" (#5056)
- improvement(mship): clean up dead tools, add enrichments (#5056)
- improvement(scheduled-tasks): move recurrence into modal body as a section (#5054)
- refactor(providers,executor): deepen three shallow modules (#5052)

## Bug Fixes

- Revert "fix(execute): block cross-origin session-authenticated workflow runs (#5062)" (#5062)
- fix(access-control): exempt legacy blocks (#5063)
- fix(execute): block cross-origin session-authenticated workflow runs (#5062)
- fix(billing): deploy modal gates on workspace entitlement, not viewer plan (#5055)
- Revert "fix(realtime): re-validate socket role and evict revoked collaborator…" (#5051)
- fix(realtime): re-validate socket role and evict revoked collaborators (#5050)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @emir-karabeg
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.6...v0.7.7)

---

## v0.7.8

_Released 2026-06-15 · commit `59d94960`_

## Features

- feat(scheduled-tasks): migrate jobs agent to scheduled tasks agent (#5090)
- feat(google-calendar): wire freebusy, align tools with API v3, add calendar + sharing tools (#5084)
- feat(feature-flags): migrate 3 env-flags to AppConfig-backed runtime flags (#5086)
- feat(grafana): validate integration and add folder, health, and contact-point tools (#5082)
- feat(feature-flags): AppConfig-backed gated feature flags (#5059)
- feat(ci): mship companion pr check (#5079)
- feat(db): zero-downtime migration safety lint + db-migrate skill (#5041)
- feat(auth): OAuth-only signup with Microsoft provider (#5073)
- feat(jsm): add Atlassian Assets (Insight/CMDB) tools for asset management (#5072)
- feat(copilot): server-side mothership tool/vfs/file metrics (#5071)

## Improvements

- improvement(perm-groups): allow workspace filter for permission groups (#5070)
- refactor(connectors): split client metadata from server runtime (#5076)
- improvement(ci): fix companion regex (#5083)
- improvement(ci): rename companion tags to be more descriptive (#5081)
- refactor(table): split the 5.3k-line service.ts god-file into per-concern modules (#5069)

## Bug Fixes

- fix(scheduled-tasks): fix scheduled tasks schema validation (#5091)
- fix(providers): allow HTTP for self-hosted vLLM endpoints (#5078)
- fix(providers): pin vLLM provider endpoint to validated IP (#5077)
- fix(webhooks): cap request body size on public webhook receivers (#5075)
- fix(uploads): authorize internal file URLs before download (#5049)
- fix(credential-sets): stop leaking open-invite tokens to all users (#5074)
- fix(providers): pin Azure OpenAI/Anthropic endpoints to validated IP (#5060)
- fix(execute): reject only cross-site session execution (CSRF guard) (#5068)

## Other Changes

- chore(deps): bump js-yaml to 4.2.0 and nodemailer to 8.0.9 in apps/sim (#5067)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.7...v0.7.8)

---

## v0.7.9

_Released 2026-06-16 · commit `56a88a2a`_

## Features

- feat(providers): support large agent-block attachments via Files APIs and remote URLs (#5092)

## Improvements

- improvement(providers): tighten Gemini and vLLM agent-attachment ceilings (#5095)

## Bug Fixes

- fix(kb): canonicalize knowledge-base upload keys (#5096)
- fix(realtime): re-check workspace role on mutating socket events (#5080)
- fix(chat): autoscroll follow-ups — re-engage threshold + keep end-of-turn options in view (#5094)
- fix(chat): keep autoscroll pinned when the virtualizer re-scrolls during streaming (#5093)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.8...v0.7.9)

---

## v0.7.10

_Released 2026-06-17 · commit `db47da58`_

## Features

- feat(files): stream large CSV previews and add import-as-table (#5125)
- feat(connectors): use resource selectors for KB connector config (#5116)
- feat(google): Maps Pollen/Solar, Custom Search expansion, and live-API fixes across Google integrations (#5113)
- feat(search): actions, fuzzy matching, and highlighting in cmd+k palette (#5110)
- feat(integrations): hosted email-enrichment providers + cascade wiring (#5087)
- feat(file): add Compress and Decompress operations to the File block (#5100)

## Improvements

- improvement(mothership): user_table speed parity — limit bounds, background import/delete/update jobs (#5012)
- improvement(knowledge): align connected-sources rows and move source chip left of filter/sort (#5117)
- improvement(tables): versioned CSV snapshot cache for table mounts + parallel multipart uploader (#5108)
- improvement(supabase): add Edge Functions tool; correct storage output shapes + harden tools (#5112)
- improvement(search): align cmd+k action icons + highlight with the design system (#5114)
- improvement(integrations): validate BigQuery/Forms/PageSpeed + regenerate integration docs (#5109)
- perf(db): logs-list index, drop redundant indexes, replica routing, hot-path write cleanups (#5105)
- improvement(models): add DeepSeek V4 + Mistral Medium 3.5, fix Codestral context window (#5103)
- improvement(execution, connectors): offload large function inputs, increase connector limits + better error propagation (#5089)
- perf(execution): parallelize preflight gates, cache deployed state, memoize Anthropic client (#5098)
- improvement(models): sort model dropdown by latest release date within each provider (#5099)

## Bug Fixes

- fix(tables): enforce row limits against the current plan, not a frozen per-table cap (#5120)
- fix(resource): left-align table filter/sort when there's no search (#5128)
- fix(copilot): mount input tables with display-name CSV headers, not column IDs (#5121)
- fix(azure): replace Azure DevOps icon with Azure icon and remove AzureDevOpsIcon (#5118)
- fix(realtime): debounce the reconnecting toast to stop transient-blip flashes (#5111)
- fix(locks): enforce workflow/folder locks on the agent + close manual-UI create gaps (#5107)
- fix(sidebar): prefetch chats + workflows so cold loads don't flash skeletons (#5104)
- fix(input-format): field not editable race condition (#5102)

## Other Changes

- chore(deps): remove unused dependencies and harden CI supply chain (#5119)

## Contributors

- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.9...v0.7.10)

---

## v0.7.11

_Released 2026-06-21 · commit `8df34a36`_

## Features

- feat(triggers): add GitLab, PagerDuty, and Zendesk webhook triggers (#5150)
- feat(connectors): add Google Meet knowledge base connector (#5149)
- feat(scheduled-tasks): expose Google Calendar-style recurrence options (#5146)
- feat(pii): gate data retention PII redaction behind feature flag (#5144)
- feat(files): inline rich markdown editor (#5133)
- feat(files): password, email-OTP, and SSO auth for public file shares (#5140)
- feat(vfs): add lazy vfs + remove dynamic fields for prompt caching hits (#5138)
- feat(enrichment): add enrichment details sidebar with cost + provider cascade (#5139)
- feat(logs): redact PII from workflow logs via configurable rules (#5136)
- feat(tables): raise per-plan table limits (free 5/50k, pro 100/100k, max 1k/500k) (#5135)
- feat(files): public share links for workspace files (#5130)
- feat(mship): add parallel subagents, improve streaming performance (#5122)

## Improvements

- improvement(path): append, patch snapshot based streaming (#5161)
- improvement(scheduled-tasks): render prompt chips in task details and align weekday picker (#5159)
- improvement(rich-md-editor): stabilize bubble-menu plugin key + comment cleanup (#5158)
- improvement(rich-md-editor): streaming, performance, minor bugfixes (#5148)
- improvement(auth): make Microsoft emailVerified derivation total (#5157)
- improvement(access-controls): default workspace experience includes all members (#5153)
- improvement(access-controls): docs, terminology, fix delete bug (#5141)
- improvement(governance): derived access (#5134)
- improvement(workspaces): auto-add without invite if part of organization (#5132)
- improvement(block): table empty-state filter/sort builders + upsert conflict-column selection (#5123)
- improvement(misc): add more sportmonks tools, improvestreaming ux (#5129)

## Bug Fixes

- fix(files): render embedded workspace images in markdown (#5162)
- fix(rich-md-editor): stop the editor flashing during an agent rewrite (#5160)
- fix(auth): close nOAuth account takeover via email-based OAuth linking (#5156)
- fix(uploads): close multipart storage-quota bypass via quota-exempt contexts (#5155)
- fix(file-decompress): enforce decompression caps on inflated stream, not declared zip size (#5154)
- fix(executor): stop HITL error edges from firing on successful resume (#5152)
- fix(files): only show Share in context menu for files, not folders (#5147)
- fix(mship): add folder rename tools and locked workflow status (#5126)

## Contributors

- @Sg312
- @TheodoreSpeaks
- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.10...v0.7.11)

---

## v0.7.12

_Released 2026-06-21 · commit `aaca7505`_

## Features

- feat(url-state): adopt nuqs for type-safe URL query-param state (#5163)

## Bug Fixes

- fix(state): align server/client state with best practices (query-key bugs, persist hygiene, useState) (#5166)
- fix(mcp): missing isDeployed in contract breaking settings, parameter overrides lack of clarity (#5164)

## Contributors

- @icecrasher321
- @waleedlatif1

[View changes on GitHub](https://github.com/simstudioai/sim/compare/v0.7.11...v0.7.12)

---

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
