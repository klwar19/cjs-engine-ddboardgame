# Migration Phase D + Phase B AI fixes — Plan and progress

This file tracks the React migration of the Campaign UI (Phase D) and the
combat AI fixes (Phase B follow-up). Update as work lands.

## Strategy

The campaign UI (`js/campaign/campaign-ui.js` 10,857 lines plus
`js/campaign/ui/`, 13,371 lines total) is too large to rewrite as one
commit without regressing real features. We migrate it incrementally:

1. The React shell renders the OUTER chrome (header, mode bar, sub-tabs,
   command rail, log strip, modal mount) once.
2. Each TAB's body is initially still rendered by the vanilla
   `CampaignUI._render*` helpers into a mount node owned by React. The
   vanilla code stops calling `_root.innerHTML = ...` for the shell.
3. Tabs migrate one at a time. Each migrated tab replaces its `_render*`
   helper. The vanilla helper is removed when the React tab proves out.
4. When every tab is migrated, `campaign-ui.js` and `js/campaign/ui/`
   are deleted; `test_campaign_ui_bootstrap.js` is dropped or rewritten
   against the React tree.

This keeps the app functional at every commit. Tests must stay green at
each step (`npm test`).

## Status

### Remaining Work (not done yet)

The campaign React migration is structurally complete. Historical notes below
still mention `campaign-ui.js` while describing completed migration steps; that
file is deleted and is no longer an active bridge or extension point.

**Genuinely open work:**

- [ ] **Phase B Engine TS.** Plan and execute the engine conversion as its own
  phase: TS module first, `window.CJS.*` compatibility wrapper second, tests
  third, JS deletion last. Order: core/data-store/content-validator, effects,
  combat engine, AI, grid/QTE, then campaign systems. This is by far the largest
  remaining effort: ~50k lines of engine JS still live in `js/` (campaign-ops
  ~3.4k, scenario-runner ~2.9k, campaign-state ~1.3k, …); `src/engine/` is
  currently only ~150 lines of type stubs, so the conversion is barely started.
- [x] **Full `data-campaign-action` removal + `<main>` forwarder deleted.** The
  typed registry is done (246/246 actions in `src/campaign/action-handlers/`) and
  **nothing in the repo emits `data-campaign-action` any more.** The last emitters
  were two dead helpers in `util/cui-controls.ts` (`actionBtn` /
  `renderTownActionButton`, zero callers); removing them means a React-rendered
  button can only reach the dispatcher through a typed `onClick`. The shell
  `<main>` click/change forwarder (`forwardBridgedClick` / `forwardBridgedChange`)
  is **deleted**: nothing emits `-mode`/`-tab`/`-panel`, `campaign-map` binds its
  own private click listener, and the one change-driven island (the farm seed
  `<select>`) moved to the Farm tab wrapper (`CampaignExternalTabs.tsx`). The
  drawer's parallel `data-campaign-action` fallback is gone too (no drawer body
  emits it). `test_actions_bridge` locks in "no `src` emitter"; the
  `test_campaign_shell_live` bridged-island assertion was retargeted to the real
  production marker path.

  Plan-text corrections (these were stale): `util/cui-hub-tab.ts` emits **no**
  actions — it is display-only HTML (consequence preview / flavor trail) + pure
  tone math, consumed via `dangerouslySetInnerHTML` by the typed data bridges;
  the maps tab (`CampaignMapsTab.tsx`) is **already** JSX with typed `onClick`;
  `action-handlers/story-director-card.ts` emits `data-story-modal-choice`
  (wired by the imperative beat modal `story-director-modals.ts`, **not** either
  forwarder — and a JSX path already exists in `StoryDirectorPanels.tsx`).

- [x] **Delete the drawer's `htmlIslandActions.ts` (gated on the feature-module
  port).** ✅ DONE — all six external-island tabs (inventory / shops /
  relationships / craft / cook / farm) are now real JSX with typed onClick, the
  drawer inventory/notes bodies moved to React, and `htmlIslandActions.ts` +
  `CampaignExternalTabs.tsx` are deleted. Per-step detail below.
  This was the one surviving forwarder, and it was NOT a
  `data-campaign-action` router: it translated local, typed semantic markers
  (`data-shop-buy`, `data-farm-*`, `data-inventory-*`, `data-haven-*`,
  `data-craft-recipe-id`, `data-cook-food-id`, `data-rel-activity-*`,
  `data-add-note`, …) into typed dispatch and returns `closesPanel` for the
  drawer tab-switch actions. Those markers are emitted by the still-vanilla
  feature modules behind the external-module tabs — `campaign-inventory.js`
  (105), `campaign-economy.js` (136), `pocket-haven.js` (424),
  `relationships-tab.js` (323), and `farming-mode.js` (1,295 — a stateful
  tile-grid + QTE system) — plus the drawer body builders in `boot.ts`. Deleting
  `htmlIslandActions.ts` therefore requires React-porting those ~2,300 lines (the
  "per-tab JSX ports land later" note in `CampaignExternalTabs.tsx`): it is its
  own incremental migration phase, not island cleanup. Until then the markers
  stay routed through this single typed helper, which is a far safer surface for
  AI-generated UI than a free-form `data-campaign-action` string was (it returns
  a typed result and only matches a fixed marker set).

  **Next steps to retire `htmlIslandActions.ts` (its own phase, one module per
  commit). The helper can only be DELETED once the last marker emitter is gone,
  so it shrinks across commits and is removed in the final one:**

  1. **Inventory** ✅ DONE. (`js/campaign/campaign-inventory.js`, 105) →
     `CampaignInventoryTab` JSX (`src/campaign/tabs/CampaignInventoryTab.tsx` +
     typed `tabs/data/inventory.ts` record-lookup builder). Markers retired:
     `data-inventory-delta-bucket`, `data-inventory-add-bucket`,
     `data-open-inventory-tab`, `data-add-note` (NOT `data-add-pocket-note` —
     that one is emitted by `pocket-haven.js`, retired in step 4). The drawer
     inventory + notes panels moved to React too (CampaignShell `DrawerBody`
     renders `CampaignInventoryTab` for the inventory panel and a new
     `shell/NotesPanel` for notes; `renderInventorySnapshot` / `renderNotesPanel`
     deleted from `boot.ts`). `js/campaign/campaign-inventory.js` deleted, its
     `main.tsx` import + `boot.ts` `CampaignInventory` surface removed. Gated:
     `npm test` + `tsc` + `build` + `size:check` all green (campaign initial JS
     354.2 → 353.5 KB gz).
  2. **Economy** ✅ DONE. (`campaign-economy.js`, 136) → `CampaignShopsTab` JSX
     (`src/campaign/tabs/CampaignShopsTab.tsx` + typed `tabs/data/shops.ts`
     builder that ports `_renderShop` / `_shopOpen` / `_canBuy` / `_hasBundle` /
     `_formatBundle` / `_recordName`). Markers retired: `data-shop-buy`,
     `data-shop-sell`, `data-full-rest`, `data-camp-rest`. Module deleted, import
     + `CampaignEconomy` surface removed. Gate green; campaign initial JS
     353.5 → 352.3 KB gz.
  3. **Relationships** ✅ DONE. (`js/ui/relationships-tab.js`, 323) →
     `CampaignRelationshipsTab` JSX (`src/campaign/tabs/CampaignRelationshipsTab.tsx`
     + a faithful `tabs/data/relationships.ts` port of the tier / simple-stats /
     activity / character-event / acts-banner logic). Markers retired:
     `data-rel-activity-*`, `data-sequence-start-id`. The shared `ACTIVITIES`
     table moved into `tabs/data/relationships.ts`; `action-handlers/downtime.ts`
     now imports it directly (TS) instead of reading `window.CJS.RelationshipsTab`,
     so the module could be deleted cleanly. Gate green; campaign initial JS
     352.3 → 351.1 KB gz (entry chunk 275.9 → 271.5 KB).
  4. **Pocket Haven craft/cook** ✅ DONE. (`pocket-haven.js`, 424) →
     `CampaignCraftTab` / `CampaignCookTab` JSX (`tabs/CampaignCraftCookTabs.tsx`
     + shared `tabs/data/recipes.ts` porting `_renderRecipeRow` /
     `_renderIngredientLine` / `_renderOutputLine` / `_bundleAvailable`). Retired
     `data-craft-recipe-id`, `data-cook-food-id`. **Audit finding:** the
     `renderPocket` / `renderFacilities` / `renderMiniGames` / `renderFishing`
     panels (which emit `data-haven-*`, `data-haven-play-minigame`,
     `data-haven-open-trivia`, `data-open-fishing`, `data-add-pocket-note`) had
     **no consumers** — there is no pocket/haven tab in the registry — so they were
     dead code; deleted outright (markers retired without a JSX port). The
     matching registry actions stay (still covered) but were already unreachable.
     `pocket-haven.js` shrank 424 → ~120 lines, keeping `renderFarm` (the still-
     vanilla Farm tab uses it until step 5) + the handler-invoked ops
     `plantSeed` / `harvestPlot` / `openFishing` (+ `_detectBiome`). Farm markers
     (`data-farm-*`, `data-harvest-plot`, `data-plant-seed-plot`) stay for step 5.
     Gate green; campaign initial JS 351.1 → 348.5 KB gz (entry 271.5 → 270.4 KB).
  5. **Farming** ✅ DONE. (`farming-mode.js`, 1,295 — HARDEST) → `CampaignFarmTab`
     JSX (`tabs/CampaignFarmTab.tsx` + `tabs/data/farm.ts`, a faithful read-side
     port of renderFarm + the tile/tool/tile-menu/QTE/detail sub-renderers and
     the tile/crop/slot read helpers). Retired all the farm markers
     (`data-farm-*`, `data-farm-qte-*`, `data-farm-tile-action`,
     `data-farm-select-tool`, `data-farm-tile-menu-close`, `data-harvest-plot`,
     `data-plant-seed-plot`) and the seed `<select>` onChange (now a direct
     FarmingMode.selectSeed call in the tab). Keyboard controls moved from
     `bindControls` into a component `useEffect` (boot.ts no longer binds them).
     **De-risked:** all stateful ops, QTE-hit timing, growth ticks and
     `normalizeFarm` stay in `farming-mode.js` (invoked via the farm.ts action
     handlers) — only rendering + keyboard moved. The QTE bar is CSS-animated
     (`--qte-duration`), so the static view is enough. `farming-mode.js` pruned
     1,295 → 881 lines (render-only helpers removed, ops verified intact);
     `pocket-haven.js` lost its now-dead `renderFarm`. VR: a normalized farm
     fixture drives `tab-farm` (tiles / tools / tile-menu / detail) + a new
     `leaf-farm-qte` snapshot (the QTE lane). `test_campaign_shell_live` now
     renders the JSX farm and asserts a tile's typed onClick reaches
     handleAction. **Still recommended:** a real-browser smoke (QTE visual
     timing, keyboard movement, growth tick) — automated coverage is DOM-backed,
     not a pixel browser.
  6. **Delete `htmlIslandActions.ts`** ✅ DONE (folded into step 5, since the Farm
     tab was the last `safeWrap` consumer — splitting would leave a broken
     intermediate). Deleted `htmlIslandActions.ts` + `CampaignExternalTabs.tsx`
     (the whole `safeWrap`) and removed the drawer onClick island branch in
     `CampaignShell` (now close-button only). `test_actions_bridge` asserts both
     forwarders are gone (file-not-exists); `test_campaign_shell_live` swapped its
     island-marker assertion for the JSX-farm render + typed-dispatch check.

  Each step keeps the app working at every commit: port the tab body to JSX with
  typed `onClick` / `dispatchCampaignAction`, delete the vanilla module, drop the
  now-unused marker branches from `htmlIslandActions.ts`, then `npm test` + `tsc
  --noEmit` + `npm run build` + `npm run size:check` before committing.

  **Independent, lower-value cleanup (no action strings involved) — NOT YET DONE,
  deliberately deferred as a cohesive unit.** The remaining display-only
  HTML-string islands could move to JSX for consistency — `cui-hub-tab.ts`
  (`renderConsequencePreview` / `renderFlavorTrail`), `cui-controls.ts`
  (`renderInlinePurpose`), and the story-director beat modal
  (`story-director-modals.ts` + `renderStoryDirectorCardHtml`, wired by
  `data-story-modal-choice`). This is purely cosmetic: none emit
  `data-campaign-action`, so it does NOT affect the action-string / forwarder
  surface (Part A above already fully retired both forwarders).

  **Consumer audit (why this is all-or-nothing):**
  - `renderInlinePurpose` and `renderFlavorTrail` are **React-only** (consumed as
    `*Html` fields by `tabs/data/hub.ts` + `tabs/data/resultPanels.ts`, rendered
    via `dangerouslySetInnerHTML` in the panels). Cleanly portable on their own.
  - `renderConsequencePreview` is **shared**: the same React data bridges AND the
    **imperative** beat modal (`action-handlers/story-director-card.ts`
    `renderStoryDirectorCardHtml` → `story-director-modals.ts`, plus the manual
    event builder) consume its HTML. So it can't become a pure JSX component
    without also React-ifying those imperative modals (the third bullet).
  - Because all three fields render side-by-side in `ResultPanels` /
    `StoryDirectorPanels` / `HubTabs` / `SideContent`, porting only the React-only
    two would leave a sibling field still on `dangerouslySetInnerHTML` — messier
    than today's uniform HTML-string seam. Recommended as one focused commit:
    add `<ConsequencePreview>` / `<FlavorTrail>` / `<InlinePurpose>` JSX, have the
    `tabs/data/*` builders emit their structured props instead of `*Html`, convert
    the consuming panels, React-ify the beat modal + manual-event builder to a
    portal that reuses the existing `StoryDirectorPanels` card JSX, then delete the
    HTML helpers. Verify via VR snapshot parity (the rendered DOM should be
    byte-identical) + a real-browser pass on the story/quest/event panels.
- [~] **Live browser regression.** PARTIAL — `test_campaign_shell_live.js`
  (Tier 0) now mounts the REAL `<CampaignShell/>` into happy-dom with
  react-dom/client and drives the live wiring: boot, chrome render, sub-tab
  switch + body swap, the createPortal drawer open/close, a typed onClick →
  handleAction, and a still-vanilla external-tab island marker →
  dispatchHtmlIslandAction → handleAction (19 assertions, in `npm test`). This is
  DOM-backed, not a real
  pixel browser (no Playwright/Chromium dep — matches `test_launcher_live.js`),
  and the engine is the bounded VR stub. Still open: a true running-browser
  pass (real layout/paint/canvas) over index/campaign/editor/combat that also
  verifies the combat grid renders and PWA paths return 200 over HTTP.

**Performance opportunities surfaced (now budgeted, reductions deferred):**

- [~] **Shrink the campaign initial *download* (not just the entry chunk).**
  PARTIAL (Tier 1). The entry chunk meets the < 300 KB target (~282 KB raw),
  but `campaign.html` eagerly `modulepreload`ed the whole engine. **Done:**
  `cjs-minigames` + `cjs-qte` are deferred behind `lazy-minigames.ts` (warmed
  after boot, awaited by the minigame/QTE/fishing launch handlers), dropping
  the campaign initial JS from **377 → 356 KB gz** (preload chunks 22 → 20).
  **Still open:** `cjs-campaign-generators` / `-scenario-runner` / `-maps` are
  bigger but more entangled — `campaign-scenario-generator` feeds the core
  scenarios tab's render path (defensively, but with downstream `genOptions`
  usage that needs the live-browser check above), so those are left for that
  pass rather than deferred blind. The per-page `initialJsGzipKB` ceiling
  guards the whole metric from regressing.
- [ ] **Render-blocking CSS.** `campaign.css` is ~541 KB raw / ~167 KB gz — the
  single largest first-paint cost, now budgeted by the per-page `initialCssGzipKB`
  ceiling. Note: rolldown-vite's CSS minifier under-performs here (emitted output
  is *larger* than the source concat). A Lightning CSS post-bundle pass was tried
  and **rejected** — it shrinks clean *source* (484→355 KB) but does ~nothing to
  the already-emitted bytes (541→541), so adopting it would have been a no-op
  dependency. A real reduction needs either a fix to the rolldown CSS pipeline or
  deferring the feature sheets (visual-novel / minigames / l2d-avatar) off the
  critical path; both need the live-browser visual check above, so they ride with
  it.

**Completed in this pass (were previously mislisted here as not-done):**

- [x] **Persistence migrations + IndexedDB.** `src/persistence/migrations.ts`
  (versioned v0→v1 save + AI-draft migrations, future-version rejection,
  no-mutation tests) and `src/persistence/indexedDb.ts` (`idb`-backed
  saves/drafts/meta stores + a one-time, gated localStorage→IndexedDB migration)
  shipped. `campaign-save.js` / `save-manager.js` are IndexedDB-primary with a
  localStorage fallback; small settings (active-slot id, GitHub config) stay in
  localStorage. `idb` is a dependency; `test_persistence_migrations.js` is wired
  into `npm test`. (This section had stalely tracked both as open.)
- [x] **PNG PWA icons.** `tools/make-pwa-icons.mjs` (uses `sharp`; a dev tool,
  not a build/runtime dependency — same posture as `optimize-art.py` + Pillow)
  rasterizes `public/icon.svg` into committed `icon-192.png`, `icon-512.png`,
  and a full-bleed `icon-maskable-512.png`. `pwa.config.mjs` lists all four (SVG
  `any` + the three PNGs + a `maskable`); `vite.config.mjs` `includeAssets`
  precaches them; `test_pwa_config.js` asserts the manifest entries AND that each
  referenced file exists in `public/`.
- [x] **Hard bundle targets + CSS budget.** `tools/build-size-check.mjs` now
  enforces absolute, non-re-baselineable per-page ceilings (`PAGE_BUDGETS`) on
  three honest metrics: entry-chunk raw (campaign < 300 / combat < 200 / editor
  < 150 KB), initial-JS gzip (entry + modulepreload closure — the real
  download), and initial-CSS gzip. Parsed from the built HTML's
  entry/modulepreload/stylesheet tags. Runs in the existing `size:check`
  (CI on every PR via `ci.yml`, and on main via `deploy.yml`).

### Done

- [x] **Phase B AI fix — multi-cell movement candidate ring.**
  `_tryMoveToward` now expands candidate anchors by the attacker's
  footprint, so 2x2/3x3 units (snow bear, chimera, etc.) consider all
  valid melee anchor positions, not just the 1-ring around the target.
  Filter rejects anchors whose footprint would overlap the target.
- [x] **Phase B AI fix — weapon requirement gate.** `_tryUseSkill` now
  short-circuits when the unit doesn't meet the skill's weapon
  requirement, so the AI doesn't pick a skill that ActionHandler will
  reject (which previously ended the turn).
- [x] **Phase B AI fix — ultimate skill meter gate.** `_canUseSkill` now
  rejects ultimate-flagged skills when the unit doesn't have enough
  ultimate meter, preventing the same "AI burns turn on invalid
  decision" failure mode for player-controlled units running on auto.
- [x] **Phase B AI fix — empty-AoE rejection + LoS on AoE.**
  `bestAoECell` only returns a cell that hits at least one enemy and
  honours `skill.requiresLoS`.
- [x] **Phase B AI fix — getValidMoves fallback for hemmed-in units.**
  If every melee-anchor stepToward is null, `_tryMoveToward` falls back
  to the unit's actual reachable cells and picks the closest to the
  target, so the snow bear closes ground even when surrounded.
- [x] **D.1 foundation — `src/campaign/store.ts`.** Typed `useCampaignState`
  hook that subscribes to `CJS.CampaignState`. Re-renders on every state
  emit; returns a stable snapshot.
- [x] **D.1 — React-tab bridge.** `cui-react-bridge.js` registers each
  migrated tab in the existing `CampaignUIInternal.Tabs` registry,
  returning a stable mount-point div. Vanilla `render()` dispatches
  `campaign:rendered` after every shell rebuild; the new
  `CampaignReactTabs.tsx` listens and re-portals migrated tabs into
  their freshly-painted placeholder. Buttons inside React still emit
  `data-campaign-action` attributes so the legacy event delegator in
  `_bindEvents` keeps handling them — no parallel action wiring.
- [x] **D.1 — Settings tab migrated.** `CampaignSettingsTab.tsx`
  matches `_renderSaveManager` behaviour-for-behaviour (boot notice,
  build/min version line, sorted slot list, compatibility chips,
  load/export/delete buttons). `_renderSettings`/`_renderSaveManager`
  removed from `campaign-ui.js`; `CampaignUI.getBootIncompatibleNotice`
  exposes the only piece of internal state React needs.
- [x] **D.1 — Logs tab migrated.** `CampaignLogsTab.tsx` re-uses
  `CampaignUIInternal.Log.logKind`/`logMeta` for parity with the
  recent-log header strip, which is still vanilla-rendered. The drawer
  side-panel keeps using `_renderLogFallback` for the compact variant.
- [x] **D.1 — bootstrap smoke test updated.** Asserts both new tabs
  register and emit `data-react-tab` mount markers.

- [x] **Phase B AI fix — character-AI emergency heal.** Player
  characters on auto-mode now run an emergency-heal pass before the
  basic-attack branch when an ally drops below 30% HP. Scoped to units
  without an authored `behaviorAI` plus explicit support / summoner
  archetypes so monster behaviour stays as authored.
- [x] **Phase B AI fix — auto-detected support archetype.**
  `_inferSupportKit` flips the default archetype to `support` when a
  unit's equipped skill kit is 50%+ heal / shield / buff. Support /
  summoner archetypes also close the gap to allies (lowest_hp_ally)
  when they have no in-range action, so a cleric on auto stays inside
  heal range.
- [x] **D.1 — Roster (Party) tab — hybrid migration.**
  `CampaignRosterTab.tsx` owns the active / bench panel structure in
  JSX. Each member's body is still produced by the existing
  `cui-party-tab.js::renderRosterMember`, embedded via a controlled
  `dangerouslySetInnerHTML` mount. The legacy event delegation handles
  every `data-campaign-action` inside the card unchanged.
- [x] **D.2 — World Map + World Activities tab shells migrated.**
  `CampaignWorldMapTab.tsx` wraps the existing `CampaignWorldMap`
  renderers.
- [x] **D.2 — Hub family tab shells migrated.** sideForge /
  questChains / oracleForge / battleSets / mapSeeds wrap the
  `CampaignUIInternal.HubTab` renderers.
- [x] **D.2 — External-module tab shells migrated.** inventory,
  shops, craft, cook, farm, relationships now flow through React
  wrappers around the sibling vanilla modules (CampaignInventory,
  CampaignEconomy, PocketHaven, RelationshipsTab). The old vanilla
  switch-case branches for these were deleted.
- [x] **D.2 — Closure-private vanilla renderers bridged.** Exposed
  `CampaignUI.renderTabBody(tabId, state)` so the React shell can
  host `worldGate`, `storyHome`, `storySummary`, `storyDirector`,
  `questHome`, `quests`, `eventHome`, `eventCharacter`,
  `eventSpecial`, `eventSide`, `eventLog`, `scenarios`, `maps`,
  `minigameTest`, `overview` without porting their closure-private
  bodies in one go.

### In progress / next

The structural Phase D migration is complete — every tab in the
campaign shell is React-owned at the entry point.

- [x] **Phase E — CampaignShell.tsx scaffold.** The shell now owns the
  campaign-root mount, the chrome row containers (header, mode bar,
  sub-tabs, log strip, body, command rail), and the drawer/portal layer.
  The chrome fragments still come from the vanilla
  `_render*` helpers via `CampaignUI.getShellFragments()`, but the
  React-owned wrapper divs are stable so React-tab components no
  longer get torn down + re-portaled on every state change. See
  `src/campaign/CampaignShell.tsx`. The drawer moved into a React
  portal (`createPortal` to `document.body`); the imperative
  `_drawerEl`/`_drawerBackdropEl` flow is bypassed in shell mode.

- [x] **Phase E — Typed action layer.** `src/campaign/actions.ts`
  exposes typed wrappers around `CampaignSave`, `CampaignOps`, and
  `CampaignState`. Migrated tabs (`CampaignSettingsTab`,
  `CampaignLogsTab`) call them via direct `onClick` handlers instead
  of stamping `data-campaign-action` attributes. The vanilla
  `_handleAction` switch still handles unported strings.
  `dispatchCampaignAction(name, data)` bridges the gap for buttons
  still using the legacy contract.

- [x] **Phase E — AI content contracts.** `src/content/types.ts`
  defines the canonical entry shapes. `data/schemas/*.schema.json`
  validate authored JSON. `tools/content-lint.mjs` runs the schema
  validator (and accepts an `--patch` flag so AI generators can
  validate their output before committing). Wired into `npm test`
  via `test_content_lint.js`.

- [x] **Phase E — AI compact indexes.** `tools/build-ai-index.mjs`
  produces `data/ai-index/<type>.compact.json` (skills, passives,
  statuses, items, monsters, characters, worlds, encounters) plus
  `index.json` manifest. ~70 KB total vs. several MB of full content
  — AI generators read these for context instead of paying the token
  cost of the full files.

- [x] **Phase E — Code splitting.** Vite `manualChunks` splits per
  domain (campaign / combat / minigames / qte / media / core / etc.)
  so a fix to one domain doesn't invalidate cached chunks elsewhere.
  Editor builders are `React.lazy()`'d so a panel's editor only
  ships when the user opens it.
  - Editor initial download: 235 KB → 29 KB
  - Campaign initial download: 926 KB → 33 KB (rest in per-domain
    chunks under 50–70 KB each)

### Done — Phase F

- [x] **Phase F.1 — Chrome JSX port.** The five `<ShellFragment
  dangerouslySetInnerHTML>` strips (header, mode-bar, sub-tabs,
  log-strip, rail) in `CampaignShell.tsx` are now full JSX
  components in `src/campaign/shell/`. They read typed `ChromeData`
  via `getChromeData(state)`. Buttons use direct `onClick` handlers
  via `dispatchCampaignAction` / `setActiveMode/Tab/Panel`.
- [x] **Phase F.2 — eventLog body ported** to `CampaignEventLogTab.tsx`.
- [x] **Phase F.3 — minigameTest body ported** to
  `CampaignMinigameTestTab.tsx`.
- [x] **Phase F.4 — overview body ported** to `CampaignOverviewTab.tsx`
  (with 12 shared sub-panels still bridged via
  `renderOverviewSectionHtml`).
- [x] **Phase F.5 — storySummary body ported** to
  `CampaignStorySummaryTab.tsx`.
- [x] **Phase F.6 — questHome body ported** to
  `CampaignQuestHomeTab.tsx` (zombie variant still HTML-bridged).
- [x] **Phase F.7 — event{Character,Special,Side} bodies ported** to
  a shared `CampaignEventTab.tsx`.
- [x] **Phase F.8 — scenarios body ported** to
  `CampaignScenariosTab.tsx`.
- [x] **Phase F.9 — maps body ported** to `CampaignMapsTab.tsx`.
- [x] **Phase F.10 — quests panel body ported** to
  `CampaignQuestsPanelTab.tsx`.
- [x] **Phase F.11 — storyHome body ported** to
  `CampaignStoryHomeTab.tsx`.
- [x] **Phase F.12 — worldGate body ported** to
  `CampaignWorldGateTab.tsx`.
- [x] **Phase F.13 — storyDirector body ported** to
  `CampaignStoryDirectorTab.tsx`.
- [x] **Post-Phase F cleanup.** `CampaignVanillaTabs.tsx` deleted.
  `_renderMain`'s switch + `renderTabBody` switch are empty (every
  case is now a JSX-only path in the React shell).

### Done — Phase G (shared sub-renderers, in progress)

- [x] **G.1 — Shared QuestRow.tsx.** `_renderQuestRow` produces typed
  data via `getQuestRowData`; QuestHome and QuestsPanel render the
  same `<QuestRow row={...}>` JSX. The eight-button quest-action
  menu, three conditional state pills (running/linked/generated),
  variant/objective/tag chips all in JSX. Scenario pill stays as a
  small HTML bridge.
- [x] **G.2 — EventResult + Oracle panels.** Move
  `_renderEventResult` / `_renderOracle` to typed components in
  `ResultPanels.tsx`. EventLog, EventTab, Overview, and Maps all
  render `<EventResultPanel />` / `<OraclePanel />` directly.
- [x] **G.3 — SoloNotice panel.** Move `_renderSoloNotice` to typed
  component. Five consumers (Overview, EventTab, QuestHome,
  QuestsPanel, StoryHome) now render `<SoloNoticePanel state>`.
- [x] **G.4 — Small shared panels.** `_renderPendingBattle`,
  `_renderTravelSurprise`, `_renderCombatResult`,
  `_renderLastCombatResult`, `_renderLastReport` ported to JSX
  components. Five tabs updated.
- [x] **G.5 — ScenarioSummary panel.** Shared by Overview /
  QuestHome / StoryHome. JSX component, discriminated hasRun union.
- [x] **G.6 — AdventureLegend.** Static legend body inlined in
  Overview JSX; `getAdventureLegendVisible(state)` exposes the
  visibility predicate.
- [x] **G.7 — ActiveSequence wrapper.** Shared by Story / Quest /
  Event tabs. JSX component handles VN-mode + inline-mode wrappers.
  Node body still HTML bridge.

### Done — Phase G (sub-renderers — all ported)

Every entry below was one commit. The pattern was uniform: expose a typed
`get<Thing>Data(state, ...)` bridge that returns structured data,
write a JSX component in `src/campaign/tabs/` that maps that data
to markup with direct onClick handlers, swap the consumers from
HTML-bridge to JSX, delete the closure-private `_render*` helper
and any sub-helpers it owned exclusively. G.8–G.17 are all complete.

- [x] **G.8 — `_renderSequenceNode` (7 variants).** Typed
  `SequenceNodeData` discriminated union + `SequenceNodePanel` JSX.
  `_renderActiveSequence`, `_renderSequenceNode`, `_sequenceNodeMeta`
  deleted.
- [x] **G.9 — `_renderSequenceDeliveryState`,
  `_renderSequenceActionButton`** (EventTab per-entry card). Typed
  `SequenceDelivery` + `SequenceAction`; shared `SequenceCard.tsx`.
- [x] **G.10 — `_renderSequenceShelf`** (StoryHome chapter files).
  Typed `SequenceShelfData` + `SequenceShelfPanel` JSX. The shelf
  delivery/action/meta/status helpers all deleted.
- [x] **G.11 — Story Director sub-renderers.**
  - **G.11a** — VN hero + solo guide + action deck → `StoryVn.tsx`.
  - **G.11b** — Episode rail + director card + empty card →
    `StoryDirectorPanels.tsx`. The modal-only card stays HTML.
  - **G.11c** — Support grid (pressure / side-flow / clues / queue /
    truths) → `StoryDirectorPanels.tsx`.
- [x] **G.12 — Story Home sub-renderers** → `StoryHomePanels.tsx`
  (chapter tree, choice consequence, AI story context, pipeline,
  sync summary).
- [x] **G.13 — `_renderWorldGateCard` + `_renderPressureStripMini`**
  → `WorldGateCard.tsx`. `_worldMenuDef` / `_modeForTab` stay (typed
  bridge consumers).
- [x] **G.14 — `_renderQuestChainActive`, `_renderQuestChainTemplate`**
  → `QuestChain.tsx`. HubTab keeps its own HTML chain renderers for
  the questChains tab (K.3).
- [x] **G.15 — `_renderShapePills`, `_scenarioQuestPill`,
  `_renderScenarioRunActions`, `_runQuestPill`** → `ScenarioChips.tsx`.
  Shared by Scenarios, Maps, and ScenarioSummary.
- [x] **G.16 — `_renderTownSnapshot`, `_renderTownRollFloat`** →
  `TownPanels.tsx`. Dead HubTab town renderers removed.
- [x] **G.17 — Zombie scavenge** `_renderZombieScavengeHome`,
  `_renderZombieScavengeTracker` → `ZombieScavenge.tsx`. The dead
  HTML quest-row path (`_renderQuestRow` + sub-helpers,
  `_renderGachaHomeHero`, `_worldHomeHeroStyle`,
  `_renderWorldActivityPreviewCard`) deleted.
- [x] **Phase G completion — `_questScenarioPill`** ported to typed
  `QuestPillData` reusing `<QuestPill>`. Every closure-private
  `_render*` sub-renderer in campaign-ui.js is now JSX.

### Phase H (shrink, then delete campaign-ui.js)

After Phase G, the closure in `js/campaign/campaign-ui.js` retains:

- The bridge surface: `enableReactShell`, `init`, all `get*Data`
  functions, the chrome setters (`setActiveMode/Tab/Panel`), and the
  new `handleAction` dispatcher boundary.
- The action implementation (`_handleAction` switch + ~200 closure
  functions: modals, scenario generation, story-director rolls,
  ops calls, save/log management).
- The vanilla render fallback for non-React mode
  (`render()` else-branch, `_renderMain`, `_renderHeader`,
  `_renderModeBar`, `_renderSubTabs`, `_renderRecentLogStrip`,
  `_renderCommandRail`, `_renderPanelLayer`).

- [x] **H.1 — Typed action dispatcher + registry.** `dispatchCampaignAction`
  no longer synthesizes a hidden `<button>` click; it calls the new
  public `CampaignUI.handleAction(name, data)` boundary directly.
  `src/campaign/actionNames.ts` is a `CampaignActionName` union of all
  246 action strings; `dispatchCampaignAction`'s first arg is typed
  against it (every React onClick is compile-checked). All per-tab
  action helpers + the `StoryActionButton` / `WorldGateAction` data
  shapes use `CampaignActionName`. `test_actions_bridge.js`
  cross-checks union ↔ switch parity. Also fixed two latent kebab-key
  payload bugs (`world-id`/`target-tab`, `battle-id`).

  > **Note:** H.1 deliberately keeps the `_handleAction` switch + its
  > closure functions in campaign-ui.js. They are the actual game
  > logic (modals, scenario gen, etc.), not thin wrappers — porting
  > them to TS is the bulk of H.3/H.4 and must come after K.3 (see
  > below). `handleAction` is the typed seam that lets that port
  > happen function-by-function without touching React call sites.

**Hard dependency — do K.3 before H.2–H.5.** The legacy
`cui-hub-tab.js` / `cui-party-tab.js` / `cui-world-map-tab.js` still
render their tab bodies + the drawer body as HTML strings carrying
`data-campaign-action` / `data-campaign-mode` / `data-campaign-tab`.
Those rely on the delegated `_bindEvents` click listener and the
vanilla chrome. Until K.3 ports them to JSX (typed bridge + onClick),
`_bindEvents`, `_handleAction`, and the chrome `_render*` helpers
cannot be removed. So the remaining Phase H steps are gated on K.3:

- [~] **K.3 (prerequisite) — port HubTab / PartyTab / WorldMapTab**
  tab bodies to typed bridges + JSX (same pattern as Phase G).
  - [x] **Hub family fully ported.** `battleSets` / `mapSeeds` /
    `questChains` / `sideForge` / `oracleForge` are JSX
    (`CampaignHubTabs.tsx` + `SideContent.tsx`, reusing `QuestChain.tsx`),
    reading typed `getBattleSetsData` / `getMapSeedsData` /
    `getQuestChainsData` / `getSideForgeData` / `getOracleForgeData`.
    The shared SideCard + RumorRow are JSX with onClick dispatch; the
    Town snapshot now returns structured rumors and renders `<RumorRow>`.
    `cui-hub-tab.js` collapsed to a shared side-content **primitives**
    library (no tab rendering, no `data-campaign-action`). Orphaned
    `renderRumorPurpose` dropped from `cui-controls.js`.
  - [x] **Roster member sheet fully ported.** `src/campaign/tabs/data/roster.ts`
    owns the typed member data: hero identity, rank math, persona/job data,
    vitals, stats, affinities, detail-row data, party-sheet data, drawer data,
    option builders, and pool/rank helpers. `CampaignRosterTab.tsx`,
    `RosterMember.tsx`, and the party-sheet modal render the shared member
    card as JSX with direct `dispatchCampaignAction` calls.
  - [x] **Roster detail row ported.** Skills, passives, statuses, equipment,
    portrait hero, job chip, affinity pills, and damage-reduction pills render
    from typed data and icon-as-JSX helpers. The old `renderRosterMember`,
    `renderPartySheetHtml`, `detailCardsHtml`, `portraitHtml`, `jobChipHtml`,
    and `resistancesHtml` bridges are gone.
  - [x] **World Map / World Activities ported.** `getActivitiesData`
    drives `CampaignWorldActivitiesTab` (DIV-based groups + journal +
    pressure). `getTravelMapData` drives `CampaignWorldMapTab` — React
    owns the `<section>`, `<svg>`, interactive node `<g>` wrappers
    (onClick travel), location-detail panel, and area buttons; the
    intricate inner SVG geometry (markers, labels, layers, roads, links)
    arrives as raw-SVG strings (no JSX attribute-conversion risk). All
    vanilla `renderTravelMap` / `renderActivities` + sub-renderers
    deleted; `campaign-world-map.js` emits zero `data-campaign-action`;
    `cui-world-map-tab.js` is a namespace stub.

  > **Architectural finding (refines H.2/H.3).** "Removes the *last*
  > `data-campaign-action`" was inaccurate: the bridged external-module
  > tabs (`inventory` / `shops` / `craft` / `cook` / `farm` /
  > `relationships`) and the `maps` tab (`campaign-map.js`) are
  > *intentionally* kept as vanilla HTML and also emit
  > `data-campaign-action` / `data-campaign-tab` into the **main body**,
  > where they currently bubble to `_bindEvents`. Removing `_bindEvents`
  > therefore needs a **single React main-body click forwarder** (on
  > `<main className="campaign-main">` in `CampaignShell.tsx`, mirroring
  > the existing `CampaignDrawer` forwarder) that routes every bridged
  > `data-campaign-action` / `-mode` / `-tab` / `-panel` to
  > `handleAction` / `setActive*`. With that forwarder, `_bindEvents`
  > can be deleted **without** fully JSX-porting every icon-heavy body —
  > the roster detail row and world map can stay bridged like the
  > external modules. The forwarder must land *with* the `_bindEvents`
  > deletion (H.2) to avoid double-dispatch.
- [x] **H.2 — Remove the vanilla render fallback + `_bindEvents`.** `render()`'s unreachable else-branch (`_root.innerHTML`
  vanilla chrome) and its exclusive chrome helpers (`_renderHeader`,
  `_renderModeBar`, `_renderSubTabs`, `_renderRecentLogStrip`,
  `_renderCommandRail`, `_renderScenarioHud`,
  `_renderCompactCurrencies`, `_renderWorldEventsTicker`) are deleted —
  `getChromeData` is the only chrome renderer. Also purged ~17 other
  dead `_`-private closures the React migration orphaned across D–G.
  Remaining (kept intentionally as flag-guarded defensive no-ops, all
  validated by `test_campaign_shell_bridge.js`): the `!_reactShellEnabled`
  loading clobber in `init()` and the non-React branches of
  `_openPanel`/`_closePanel`. `_renderMain` stays as the `getMainBody`
  defensive fallback (reachable only if a tab id isn't registered).
  **Done:** `_bindEvents` deleted. `CampaignShell`'s `<main>` now
  forwards every bridged-body `data-campaign-action` / `-mode` / `-tab`
  / `-panel` (external modules, maps, roster detail row, getMainBody
  fallback) to `dispatchCampaignAction` / `setActiveMode/Tab/Panel`,
  mirroring `_bindEvents` (panel → mode → tab → action). The farm-seed
  `<select>` change routes to `FarmingMode.selectSeed`; the hidden
  import-file input's change runs the new `importSaveFile` action. JSX
  tabs already dispatch via onClick (no `data-*`, so no double-fire);
  the drawer keeps its own forwarder. `handleAction` (→ `_handleAction`
  switch) is now the single action entry point for both React onClick
  and the forwarder, ready for H.3. (`_openPanel`/`_closePanel` remain
  as the flag-guarded defensive no-ops the shell-bridge test asserts.)
- [x] **H.3 — Port `_handleAction` closures to TS.** All 246 actions
  now resolve through the TS registry in `src/campaign/action-handlers/`.
  The `_handleAction` switch is empty (kept as a defensive no-op + the
  comment-history of each port); `window.CJS.CampaignActionsRuntime` is
  the only live dispatch path. `test_actions_bridge.js` asserts
  `actionNames union ⊆ registry keys` (and the switch is empty).

  **Done — the registry seam + the cleanly-separable domains (208/246):**
  - **Seam.** `src/campaign/action-handlers/registry.ts` holds the
    `Record<CampaignActionName, handler>` and installs
    `window.CJS.CampaignActionsRuntime` (`has` / `run`). The vanilla
    `_handleAction` consults that runtime *first*, falling through to the
    switch for unported cases. This is the single seam for every dispatch
    path: React onClick → `dispatchCampaignAction` → `handleAction`, the
    shell `<main>` + drawer forwarders, and internal delegated callers
    (the party-sheet modal). `action-handlers/context.ts` is the shared
    typed accessor layer (`ops`/`cs`/`ui`/`toast`/`confirmDialog`/
    `rerender`/`applyOp`/`mod<T>`). `main.tsx` imports the registry at
    boot so the runtime is installed before the first action fires.
  - **save + log** (14): new-save, save-slot, fork-save, export-save,
    import-save, push-github, load-slot, delete-slot, delete-all-saves,
    export-slot, export-log, clear-log, export-event-log, clear-event-log
    → `actions.ts` (added `exportEventLog`/`clearEventLog`). Fixed a real
    parity bug — the React save handlers now clear the boot-incompatible
    banner via the new `CampaignUI.clearBootIncompatibleNotice`.
  - **roster pure-ops** (10): bench/activate-character, unlearn-skill/
    passive, equip/unequip-skill, equip/unequip-passive, unequip-item,
    party-available → `action-handlers/roster.ts` (+ actions.ts for
    bench/activate). These back the K.3-leftover detail-row island.
  - **roster GM stat modals** (7): damage-char, heal-char, level-char,
    mp-char, status-char, grant-xp, grant-job-xp →
    `action-handlers/roster-modals.ts`. First *modal* cluster ported —
    establishes the pattern for the rest of H.3: a handler that opens a
    `CampaignUIInternal.Modals` primitive and applies a CampaignOps op on
    submit, depending only on accessible primitives. (stat-boost waits on
    `_statName` moving to a shared util.) The roster detail-row / GM
    action surface is now fully registry-backed.
  - **thin engine ops** (15): pass-phase, full-rest, review-resolve,
    resolve-hub-problem, quest-complete/-fail, quest-event +
    run-roll-event notices, shop-sell, run-tick-danger, reveal-node,
    skip-victory/-defeat, cancel-battle, ignore-combat-result →
    `action-handlers/ops.ts`.
  - **farm / Pocket Haven** (12): farm-tick + FarmingMode passthroughs +
    harvest-plot / open-fishing → `action-handlers/farm.ts`.
  - **forge** (4): save-chain, queue-battle-set, save-battle-card,
    save-map-seed → `action-handlers/forge.ts`.
  - **world map** (5): world-map-travel/-switch-map/-interaction/
    -node-action / world-activity-use → `action-handlers/worldmap.ts`.
  - **mode/tab seam** — campaign-ui.js now exposes render-free
    `setActiveModeRaw` / `setActiveTabRaw` + `modeForTab`, mirroring the
    closure-private `_activeMode`/`_activeTab` assignment that `_goto`
    does. This unblocked the handlers below that set mode/tab and render
    at the exact points the closure did (no derive+render double-fire).
    The setters collapse into a TS chrome-state slice in H.4.
  - **navigation** (20): the open-* / `_goto` cases →
    `action-handlers/nav.ts` (incl. open-world-content's
    `data.mode || modeForTab(tab)` fallback). `_goto`/`_modeForTab` stay
    in JS (many unported closures call them).
  - **sequence runner** (12): sequence-start/next/resolve/choice/pass/
    fail/queue-battle/win/lose/abort/complete/open-vn →
    `action-handlers/sequence.ts`. `_playSequenceMiniGame` stays in JS
    (mini-game session machinery); its win/lose follow-ups route back
    through the registry.
  - **story director** (5): story-save-beat/-reject-beat/-apply-choice/
    -set-stage/-sync-sidequests → `action-handlers/story-director.ts`.
    The roll + beat-modal cases stay (they build `_renderStoryDirectorCard`
    HTML); the modal's follow-ups route through the registry.
  - **oracle** (6): roll-oracle, pick-oracle, custom-oracle, oracle-note,
    oracle-event-log, roll-forge-oracle → `action-handlers/oracle.ts`.
    (oracle-to-quest / -to-event-builder / -add-tags share the manual
    quest/event/tag modal machinery with the event domain — kept.)
  - **quest chains** (4) + **card copy** (2): advance/complete/fail/
    promote-chain → `action-handlers/quest-chain.ts`; copy-battle-card /
    copy-map-seed → `forge.ts`. (start-chain / chain-scenario /
    chain-battle reach the scenario-launch closures — kept.)
  - **scenario map** (4): move-node, move-cell, map-layer, clear-node →
    `action-handlers/map.ts`. **Pocket Haven ops** (3): haven-build-/
    upgrade-facility, haven-ranch-collect → `action-handlers/haven.ts`.
    **end-scenario** → `ops.ts`.
  - **side content** (7): apply-side-choice (red-risk confirm),
    save-/reject-/dismiss-/copy-side-card, import-/export-side-pack →
    `action-handlers/side.ts` (the tiny `_sideCardById` /
    `_clearCurrentSideCard` helpers ported alongside).
  - **hub pulse + rumors** (4): roll-hub-pulse, resolve-rumor,
    rumor-to-quest, rumor-to-problem -> `action-handlers/rumor.ts` (the
    `_rumorById` lookup ported alongside). The solo-hook handlers stay
    (shared `_pendingSoloHookCard` state helpers + `_startQuestRunFromOffer`).
  - **inventory / shop / craft / seed / notes** (7): inventory-delta,
    quick-add-inventory, shop-buy, craft-recipe, plant-seed, add-pocket-note,
    add-note -> `action-handlers/economy.ts`. Introduces the shared typed
    modal / widget / option accessor layer (`action-handlers/modals.ts`) the
    remaining modal-driven clusters reuse instead of re-declaring the
    `CampaignUIInternal.Modals` / `.Options` / `window.CJS.UI` shapes per
    module. (The pre-existing `roster-modals.ts` keeps its local interfaces;
    H.4 folds it into the shared layer.)
  - **haven facility + activity + cooking** (5): haven-train-skill,
    haven-ranch-assign, haven-open-trivia -> `action-handlers/haven.ts`;
    haven-open-cooking, cook-food -> `action-handlers/cooking.ts` (both share
    `openCookingMinigame`). Added `getAllAsArray` to the typed DataStore
    accessor. (haven-play-minigame stays — it needs `_applyMiniGameResult`
    + the mini-game session machinery.)
  - **combat execution / resolution** (5): run-battle, apply-combat-result,
    manual-battle, run-next-beat, roll-travel-surprise ->
    `action-handlers/combat.ts` (engine-module-only: CampaignCombatBridge /
    ScenarioRunner / CampaignSave / CampaignCombatPopup + CampaignOps). The
    battle-*selection* actions (run-roll / -pick / -queue-set-battle,
    battle-reroll / -override) stay — they share `_battleDefeatFields` /
    `_battleMapFor*` / `_fallbackBattlePool` with the manual event builder,
    so they port with that cluster. Widened the toast-kind type with
    "warning".
  - **downtime** (2): rel-activity (+ its relationship-narrative modal),
    camp-rest -> `action-handlers/downtime.ts`. Added the shared
    `utils()` / `esc()` accessor to `modals.ts`. **Also fixed a latent
    integration bug:** `_questHubEvent` still called the deleted
    `_rollHubPulse` closure (ported earlier to rumor.ts), which threw on
    quest-hub-event; it now routes through `window.CJS.CampaignActionsRuntime`,
    matching the established internal-caller pattern.
  - **battle selection + shared battle-pool** (5): run-roll-battle,
    run-pick-battle, run-queue-set-battle, battle-reroll, battle-override
    extend `action-handlers/combat.ts`; the shared pool helpers
    (`battleDefeatFields` / `battleMapForArea` / `battleMapForCard` /
    `fallbackBattlePool` / `pickContextualBattle` / `battleContext*`) port to
    a new `action-handlers/battle-pool.ts` and are installed on
    `window.CJS.CampaignBattlePool` for the still-in-JS manual event builder
    (`_manualEventOps` / `_manualEventBattleOptions`). The `_questBattle`
    internal caller of `_runRollBattle` now routes through the runtime.
    Adds `getActiveScenario` to the typed CampaignState accessor.
  - **event / oracle resolution + shared event builders** (14):
    roll-event, pick-event, apply-event, edit-event, event-to-quest,
    event-log-only, event-add-tags, copy-event-summary, note-event,
    ignore-event, pin-plot-seed, event-to-oracle, oracle-to-quest,
    oracle-add-tags -> `action-handlers/events.ts` (with the shared
    `addQuestFromPrompt` / `tagPromptModal` / `opsModal` / `eventSummary` /
    `eventChoices` builders). Adds `action-handlers/copy.ts`
    (`copyPlainText` / `openCopyTextModal`) installed on
    `window.CJS.CampaignCopy` for the still-in-JS manual event builder copy
    + story-prompt copy. Adds `getCurrentCampaign` + `Ops.describe` to the
    typed accessors. custom-event + oracle-to-event-builder stay pending the
    266-line `_openManualEventBuilder` port.
  - **scenario lifecycle + mg-test play** (6): start-scenario,
    cancel-scenario, discard-scenario -> `action-handlers/scenario.ts`;
    mg-test-play, mg-test-random, mg-test-random-any ->
    `action-handlers/mg-test.ts`. `_inspectScenario`'s internal "Start Run"
    caller routes through the start-scenario action. generate-scenario +
    inspect-scenario stay (form `_root.querySelector` reads + shared
    `_shapePillsData`); mg-test-pick stays (closure `_root.dataset`
    selection state, deferred to H.4).
  - **solo-hook offers + dismiss** (5): solo-surprise, random-rumor-offer,
    manual-rumor, save-solo-hook, ignore-solo-hook ->
    `action-handlers/solo.ts`. `_setPendingSoloHook` ports along (no other
    callers); `_clearPendingSoloHook` / `_pendingSoloHookCard` stay in JS
    (still-JS scenario-coupled handlers and render/data still call them; TS
    handlers inline the same tiny mutate/lookup).
    random-quest-offer / accept-solo-hook / solo-hook-quest / solo-hook-rumor
    stay pending the `_startQuestRunFromOffer` launcher port.
  - **story-director rolls + beat modal** (5): story-roll-scene,
    story-roll-peri, story-roll-memory, story-pressure-tick, story-open-last
    -> `action-handlers/story-director-modals.ts`. Adds one bridge method
    `CampaignUI.renderStoryDirectorCardHtml` so the modal reads the
    closure-private `_renderStoryDirectorCard` markup (G.11b keeps the
    renderer in JS). The route / save / reject buttons route through the
    runtime to the existing story-director.ts handlers.
    story-manual-note / story-copy-prompt / story-help stay (scene-builder
    + prompt + help generators).
  - **quest pure-ops** (6): quest-progress, quest-hub-event, quest-harvest,
    quest-check, quest-hand-in, quest-answer -> `action-handlers/quest.ts`
    with TS copies of the small shared quest helpers (the JS originals stay
    because render/data still call them). quest-hub-event routes
    roll-hub-pulse through the runtime. quest-scenario / quest-battle /
    quest-minigame stay pending their launchers.
  - **mini-game session machinery + 3 handlers** (3): the cohesive session
    cluster (miniGameConfig, openMiniGameSession, miniGameStoryContext,
    applyMiniGameResult, showMiniGameBriefing + conversation/context
    helpers) and the three actions that drive it (sequence-play-minigame,
    haven-play-minigame, quest-minigame) port to
    `action-handlers/minigame.ts`. Adds `questMiniGameObjective` to quest.ts.
    Removes the bridge export `CampaignUI.playSequenceMinigame` (the VN
    sequence module now routes through `CampaignActionsRuntime`).
  - **small roster pickers** (8): remove-character, level-up-skill,
    rank-up-passive, unlock-job-from-tree, switch-job-from-tree,
    grant-skill-ap, pick-equip-skill, pick-equip-passive ->
    `action-handlers/roster-pickers.ts` (confirm / number modal / PartyTab
    delegations). The bigger modal-heavy roster handlers (party-sheet,
    recruit-character, learn-skill / -passive, equip-item, stat-boost,
    change-job, show-job-tree, change-persona, rank-up-apply,
    show-skill-detail, gm-override, gm-member-override) stay pending their
    option / render-helper ports.
  - **travel-world + party-availability** (2): travel-world collapses to
    `Nav.goto('world', 'worldGate')` (the closure was just that, plus dead
    code after the unconditional return); party-availability ->
    `action-handlers/roster-pickers.ts`.

  Every ported handler was verified for behaviour parity at the unit
  level via esbuild-bundled seam harnesses (routing + the exact module
  calls / op payloads / toast branches), on top of `npm test` +
  `npm run typecheck` + `npm run build` green at each commit.
  `test_actions_bridge.js` asserts union == (switch ∪ registry), the two
  are disjoint, and the runtime install + consultation are wired.

  **Tail completed — Phase H.3 done (208 → 246).** The follow-on
  commits ported the deep-shared-helper tail in the recommended order:

  1. **Scenario-gen + inspect-scenario (8).** The React
     `CampaignScenariosTab` switched to controlled `useState` form
     fields and dispatches the values in the `generate-scenario` /
     `generate-quest-scenario` payload. `generateScenario(payload)` +
     `inspectScenario(scenarioId)` ported to `scenario.ts`;
     `_shapePillsData` exposed via the typed `CampaignUI.getShapePillsData`
     bridge for the inspect modal pill row.
  2. **Quest launchers (2).** quest-scenario / quest-battle moved to
     `quest-launcher.ts` with the full launcher chain
     (`startQuestScenario`, `startExistingQuestScenario`,
     `linkedScenarioMatches`, `annotateQuestRun`). `questMapForm` /
     `questMapType` / `activeRunQuestId` added as TS copies in
     `quest.ts`. The module installs
     `window.CJS.CampaignQuestLauncher` for still-in-JS callers
     (`_startQuestChainScenario`, `_startQuestRunFromOffer`,
     `_openQuestModal`'s "starting run" branch).
  3. **Chain launchers + solo-hook accept/quest/rumor (7).** start-chain /
     chain-scenario / chain-battle ported to `quest-chain.ts` with
     `ensureQuestChainQuest`. random-quest-offer / accept-solo-hook /
     solo-hook-quest / solo-hook-rumor ported to `solo.ts` with
     `startQuestRunFromOffer`, `questFromOfferCard`,
     `randomQuestOfferCard`, `questTemplateWeight`.
  4. **travel-world-card (1).** Ported to `travel.ts` with the full
     cluster (`completeWorldTravel`, `defaultTravelLanding`,
     `evaluateTravelRankGate`, `hasMeaningfulPersonaChoice`,
     `openPreTravelPersonaPicker`). `_worldMenuDef` stays in JS
     (chrome data also reads it); resolved via the new
     `CampaignUI.getWorldMenuDef` bridge.
  5. **Roster modal cluster (12).** recruit-character / learn-skill /
     learn-passive / show-skill-detail / equip-item / stat-boost /
     change-job / change-persona / show-job-tree / rank-up-apply /
     party-sheet ported to `roster-modal-pickers.ts`. Option builders
     (`_characterOptions` / `_skillOptions` / `_passiveOptions`),
     `_skillMeta`, `_icon`, `_memberRankInfo`, `_renderPortraitHero` +
     `_renderRosterMember` stay in JS (shared with the GM override
     modal + cui-party-tab.js); each reached via a typed
     `CampaignUI.*` bridge. **show-job-tree fixes a pre-existing bug**:
     the closure modal had no click delegate (since H.2 deleted
     `_bindEvents`), so the unlock / switch buttons silently did
     nothing — the TS port adds a local click delegate routing
     through `CampaignActionsRuntime`.
  6. **Story tools (2).** story-help (static info modal) + story-copy-prompt
     (clipboard + fallback) ported to `story-tools.ts`. `_storyPromptText`
     + `_ensureStoryContext` stay in JS (share helpers with AI-story-context
     data builder); reached via `CampaignUI.computeStoryPromptText` /
     `.ensureStoryContext` bridges.
  7. **mg-test-pick (1).** Ported to `mg-test.ts`; the selected-game
     state still lives on `_root.dataset.mgTestGame` (read by
     `getMinigameTestData`) and the TS handler writes it via the new
     `CampaignUI.setMinigameTestGame` bridge. The state migration to
     `CampaignState` happens in H.4 alongside the data builder.
  8. **Manual builders (6).** custom-event, oracle-to-event-builder,
     add-quest, gm-override, gm-member-override, story-manual-note
     ported to `manual-builders.ts` as **bridge-wrapped** action
     handlers. The big modal bodies stay in JS
     (`_openManualEventBuilder` 266 lines, `_openQuestModal` 475
     lines, `_gmOverride` 174 lines, `_openManualSceneBuilder` 127
     lines) because the render-side data builders still share their
     14+ sub-helpers; H.4 ports the bodies + their data builders
     together and the bridge entries become redundant. The action
     contract is registry-backed even while the implementation
     stays JS — same pattern as `renderStoryDirectorCardHtml`,
     `renderPartySheetHtml`, etc.
- [x] **H.4 — `get*Data` bridges to TS + `campaign-ui.js` DELETED.**
  Every `get*Data` bridge, the chrome state + data builder, all leaf util
  helpers, the render-bridge islands (quest-run-task → JSX, story-director
  card → TS, roster cluster → cui-party-tab.js), and finally the shell
  orchestration (`src/campaign/shell/boot.ts`) are TS. `campaign-ui.js`
  (10,857 lines originally) is gone — boot.ts installs the same
  `window.CJS.CampaignUI` surface so the React shell + the 3 JS callers are
  unchanged. The two surviving JS islands (`cui-party-tab.js`,
  `cui-hub-tab.js`) stay bridged, as do the external-module tabs + maps +
  roster detail row (forwarded). See items 1-4 in the H.4 detail below.

  **Step 1 — Chrome state migration (done).** The closure-private
  `_activeMode` / `_activeTab` / `_activePanel` move to
  `src/campaign/chrome-state.ts` as the canonical TypeScript source of
  truth. The JS file keeps the variables as read-only mirrors synced
  via `subscribe`; every write goes through `_Chrome().set*`. Constants
  `APP_MODES` / `APP_MODE_TABS` / `APP_UTILITY_TABS`, the world-UI
  profile lookup, and the helpers `worldUiProfile` / `tabsForMode` /
  `defaultTabForMode` / `appModesForWorld` / `normalizeForWorld` /
  `modeForTab` are exported from the TS module; the vanilla helpers
  become thin delegates. Dead pre-H constants `MODES` / `MODE_TABS` /
  `UTILITY_TABS` / `TAB_TO_MODE` removed. TS context layer
  (`action-handlers/context.ts`) now reaches the chrome slice directly
  instead of round-tripping through `window.CJS.CampaignUI`.

  **Step 2 — Leaf util helpers ported to TS (done).** The seven
  closure-internal util modules under `js/campaign/ui/` (cui-utils,
  cui-portraits, cui-log, cui-controls, cui-modals, cui-options,
  cui-equipment) move to `src/campaign/util/*.ts`. Each TS module
  installs the same `window.CJS.CampaignUIInternal.<Namespace>` surface
  so the still-JS callers (campaign-ui.js + cui-hub-tab + cui-party-tab
  + the action handlers + the React tabs) see no observable change.
  All seven JS files deleted.

  **Step 3 — Tab registry + React-bridge + world-map-tab stub ported
  to TS (done).** The three thin tabs files under `js/campaign/ui/tabs/`
  move to TS: `cui-tabs-registry.ts` (the Map-backed registry installed
  on `CampaignUIInternal.Tabs`), `cui-world-map-tab.ts` (empty
  namespace stub for the bootstrap test's `WorldMapTab namespace
  exposed` assertion), and `cui-react-bridge.ts` (registers placeholder
  mount points for every React-owned tab). The master list of React
  tab ids now lives in `cui-react-bridge.ts` (paired with
  `CampaignShell.tsx::REACT_TAB_COMPONENTS`).

  **Still in JS under js/campaign/ui/tabs/:** `cui-party-tab.js` (742
  lines — the roster detail row's icon-heavy HTML body; the action
  surface is already registry-backed) and `cui-hub-tab.js` (162 lines
  — shared side-content primitives). Both stay as bridged HTML islands
  across the campaign-ui.js deletion per the plan note above.

  **Remaining H.4 work:** port the ~30 `get*Data` bridges in
  campaign-ui.js to TS modules under `src/campaign/bridge/` (chrome,
  panel defs, per-tab data), then delete campaign-ui.js. The big modal
  builder bodies (`_openManualEventBuilder`, `_openQuestModal`,
  `_gmOverride`, `_openManualSceneBuilder`) port alongside their data
  builders.
- [x] **H.5 — Test surface retargeted to the React/boot tree.**
  `test_campaign_shell_bridge.js` rewritten to assert the `boot.ts`
  install surface + chrome-state single-source-of-truth + the React tab
  coverage (139 assertions). `test_actions_bridge.js` updated: dispatch is
  registry-only now (no `_handleAction` switch), and it asserts boot.ts's
  `handleAction` routes through `CampaignActionsRuntime`.
  `test_campaign_ui_bootstrap.js` still passes as-is — it only loads the
  two surviving JS islands (`cui-party-tab.js` / `cui-hub-tab.js`) + the
  registry, none of which H.4 deleted. (A future pass can fold these
  source-grep tests into Node-importable unit tests now that the modules
  are ESM-importable, but the contract coverage is in place.)

## Phase I — Performance (after H)

With campaign-ui.js gone, the React tree owns every render path.
Now optimizations that were impossible while HTML strings ran the
show become tractable:

> **Equality reality (informs all of Phase I).** `js/core/state-tools.js`
> `produce` does a full deep clone (`structuredClone` / JSON) on every
> mutation — NOT Immer-style structural sharing. So no slice of the engine
> state keeps a stable identity across a change; reference equality is
> useless for "did this slice change?". Every Phase I memo/selector decision
> therefore compares by VALUE (`deepEqual` / `shallowEqual`,
> `src/campaign/util/equality.ts`) on the SELECTED slice, never on raw state.

- [x] **I.2 — Selector store + hooks.** `src/campaign/store.ts` is now a
  single `CampaignStore` mirroring `src/combat/store.ts`: a stable
  `subscribe` / `getSnapshot` pair, a `queueMicrotask` commit that
  coalesces a burst of signals (a mutation's direct `CampaignState` emit +
  the `render()`-driven `state-tick` that follows) into one notification,
  and `useSyncExternalStore` hooks. `useCampaignState()` keeps its exact
  `{ state, tick }` contract; the new `useCampaignSelector(selector,
  isEqual = shallowEqual)` adds value-equality slice subscriptions — the
  campaign variant of `useCombatStore`, with equality added because the
  snapshot carries the deep-cloned engine state (reference equality never
  reports a slice unchanged). The store listens to `campaign:state-tick` /
  `:rendered` on document in the CAPTURE phase (the superset signal: data
  AND chrome changes) plus `CampaignState.subscribe` (bounded retry, parity
  + seed). `CampaignShell` dropped its redundant `renderTick` listener (the
  store covers it). `test_selector_store.js` exercises the equality helpers
  with real transpiled logic + the store/shell/memo contracts (63
  assertions; wired into `npm test`, now 13 files / 967 assertions).
- [x] **I.1 — `React.memo` boundaries.** `memoDeep` (`util/memo.ts`) wraps a
  component in `React.memo` with the `deepEqual` comparator — plain
  `React.memo` never skips here (fresh prop objects every render, per the
  equality reality above). `CampaignShell` reads chrome via
  `useCampaignSelector(selectChrome, deepEqual)`, so a body-only change
  returns the SAME `ChromeData` reference and every memoized chrome strip
  skips via its `Object.is` fast path; a chrome change re-renders only the
  strips whose slice differs. Wrapped: the 5 always-mounted chrome strips
  (Header, ModeBar, SubTabs, RecentLog, CommandRail) and the list-item /
  panel components rendered many times (QuestRow, WorldGateCard,
  SequenceNodePanel, SequenceShelfPanel). The `ResultPanels` family was
  handled separately in I.2b (it takes the whole `state`, so memoizing on
  `state` would deep-compare the full tree — it self-subscribes instead).
- [x] **I.2b — Self-subscribing shared panels.** The nine `ResultPanels`
  that derive from a state slice (EventResult, Oracle, SoloNotice,
  TravelSurprise, CombatResult, LastCombatResult, LastReport, PendingBattle,
  ScenarioSummary) now read their data via
  `useCampaignSelector(selX, deepEqual)` and are wrapped in `memo`, so a
  parent tab re-render keeps the previous reference and skips the panel
  unless its own slice changed by value — a real win for the panel-dense
  Overview tab. This gives `useCampaignSelector` its per-slice consumers
  beyond the chrome (the I.2 goal). `ActiveSequencePanel` stays prop-driven
  on purpose: its selector depends on the `scopes` prop, which the
  version-keyed cache can't memoize safely. All 31 call sites dropped the
  `state=` prop (typecheck-enumerated; JSX bodies untouched, verified by
  diff). `test_selector_store.js` +23 assertions (86 total).
- [x] **I.3 — Virtualize long lists.** A tiny, dependency-free virtualizer
  (`src/campaign/util/VirtualList.tsx`, with the pure windowing math split
  into `util/virtual.ts`) now backs the four lists the plan flagged: session
  log (`CampaignLogsTab`), event ledger (`CampaignEventLogTab`), quest list —
  active + the long resolved list — (`CampaignQuestsPanelTab`), and save slots
  (`CampaignSettingsTab`). Rows are VARIABLE height (quest cards nest
  objectives, log/event lines wrap), so the component measures each rendered
  row via `ResizeObserver`, keys the measurements by ITEM key (so a
  measurement survives the append/reorder of a deep-cloned state tick), and
  renders only the rows intersecting a bounded scroll viewport (+ overscan) at
  their measured offsets inside a full-height spacer. Below a 40-row threshold
  it renders the ORIGINAL inline markup (same `listClassName`, no scroll box,
  no windowing hooks) so the common short-list case is byte-for-byte unchanged
  — virtualization engages only where it pays. The per-row `memoDeep` (e.g.
  `QuestRow`) is preserved: the virtualizer decides WHICH rows mount,
  memoization decides whether a mounted row re-renders. `react-window` was
  rejected — it would add a chunk and wants a known `itemSize` these
  content-driven rows don't have (`VirtualList.js` is a hoisted 2.6 KB shared
  chunk). The pure geometry (`buildOffsets` / `findIndexForOffset` /
  `computeWindow`) is unit-tested by transpiling the TS (like `equality.ts`),
  incl. a viewport-coverage property across a 200-row variable-height scroll;
  the adoption is grep-contracted — `test_virtual_list.js`, 50 assertions.
- [x] **I.4 — Lazy tab bodies (defer off-screen panels).** Every entry in
  `CampaignShell`'s `REACT_TAB_COMPONENTS` map is now `React.lazy(() =>
  import("./tabs/X"))` instead of an eager import, wrapped in a single
  `<Suspense fallback>` + an `ErrorBoundary` (keyed by active tab) in the
  `<main>` body. This realizes the vite config's stated "campaign tab
  families via React.lazy" intent and mirrors the editor's lazy-builder
  split (Phase E). Result: the campaign **entry chunk 457 KB → 263 KB
  (−42%)**; each tab is its own chunk and the four multi-export files
  (WorldMap / Hub / External / Event) resolve to ONE shared family chunk
  each; vite further hoisted shared async deps (ResultPanels, ZombieScavenge,
  StoryVn, QuestChain, SequenceCard) into their own on-demand chunks. Total
  bundle +0.4% (chunk-boundary overhead, within the I.7 budget). The new
  `ErrorBoundary` (`util/ErrorBoundary.tsx`) keeps a failed chunk (stale hash
  after a deploy, or a throwing tab) from blanking the whole shell — the new
  failure mode lazy loading introduces — showing Retry / Reload instead.
  The Story Director support grid + Hub inner grids ride along inside their
  now-lazy tab chunks; a finer per-panel `Suspense` split can follow if a
  single tab chunk ever gets too big.
- [x] **I.5 — Service-worker runtime caching.** The Workbox policy moved to
  `pwa.config.mjs` — a single, testable data structure `vite.config.mjs`
  imports. Precache dropped from "every chunk" (`globPatterns:
  **/*.{js,...}` → 128 entries / 2.96 MB, so a first visit to ANY page
  background-downloaded combat + editor + minigames) to the app SHELL only:
  HTML/CSS/SVG/manifest + the universal React runtime (`react-vendor` + vite's
  loader shims) — **56 entries / 1.17 MB, of which just 4 are JS**. Every
  domain chunk is now fetched ON DEMAND into a per-mode `CacheFirst` bucket
  (`cjs-code-combat` / `-minigames` / `-campaign` / `-shared`), keyed on the
  stable `manualChunks` name prefixes. Hashed chunk names are immutable, so
  `CacheFirst` is correct (a new build emits a new name → cache miss → fresh
  fetch; superseded names age out via the `maxEntries` caps). Net: a
  Story-Mode-only player's SW never requests `cjs-combat` / `cjs-grid`. The
  multi-page `navigateFallback: null` + the embed/cachebust
  `ignoreURLParametersMatching` are unchanged, and the precache route is still
  registered first so the universal chunks are served from precache (not
  double-stored by the shared `.js` catch-all). `test_pwa_config.js` (40
  assertions) imports the real config and runs its actual urlPattern RegExps —
  plus a small glob matcher — against real emitted chunk names to prove both
  the per-mode routing and the precache exclusions.
- [x] **I.6 — Image / asset budget.**
  - [x] **Build-time guard (done).** `build-size-check.mjs` now covers a
    second domain: the copied media payload (`dist/images`, `dist/audio`,
    `dist/assets/live2d`, `dist/data` — was **239.71 MB / 1,908 files** vs.
    2.84 MB of code). It enforces a total-asset budget (5%), reports the
    per-group breakdown, and lists every asset ≥ 2 MB so outliers are
    visible in CI. The audit it surfaced was stark: a **23 MB** 8192px
    live2d texture, a **22 MB** moc3, and ~9 MB character PNGs
    (`haven_mitia.png` 9.4 MB, etc.). Same baseline / re-baseline / CI
    wiring as I.7.
  - [x] **Art optimization (done).** `tools/optimize-art.py` (Pillow)
    downscales a curated manifest (`tools/art-budget.json` — the single
    source of truth) of the oversized, safe-to-downscale art IN PLACE, same
    path + format so NO `<img>` / CSS / data-JSON / live2d reference has to
    change: live2d textures (the 8192px `peri` atlas → 2048; `peri-v2`'s
    nineteen 4096px textures → 2048 — Cubism samples textures by NORMALIZED
    UVs, so a uniform downscale only lowers resolution and the `.moc3` rig is
    untouched), character portraits (→ 1280px long edge; the 9 MB
    `haven_mitia` class, now ~2 MB), and story-mode backgrounds (→ 1920px;
    several double as world-gate banners). Sprite sheets / tile atlases
    (hardcoded pixel cells in the grid/minigame renderers) and `.moc3` rigs
    are deliberately EXCLUDED. Result: the media payload **239.71 MB →
    124.03 MB (−48%)**; the size baseline was re-captured. The optimizer is
    idempotent (only files over their cap are touched, so a re-run is a no-op)
    and re-runnable via `npm run art:optimize` (needs `pip install Pillow` — a
    dev tool, not an npm/build dependency). `test_art_budget.js` (68
    assertions; reads dimensions straight from PNG/JPEG headers, no Pillow at
    test time) guards every budgeted image against its `maxEdge` so a re-added
    HD asset fails CI. The plan's other half — per-world lazy art — is already
    realized by the architecture: art is referenced by runtime string paths
    (never statically imported/bundled), the world switch fetches only the
    active world's data, and I.5's runtime image cache means a player only
    downloads the art they actually view (reinforced now the world-gate
    banners are ~half their former weight). Documented future lever: re-encode
    the opaque backgrounds to JPEG/WebP for a further cut — deferred because it
    needs the per-reference path updates (and quality call) the guard makes
    safe to attempt later.
- [x] **I.7 — Build-size budget guard.** `tools/build-size-check.mjs`
  compares every `dist/assets/*.{js,css}` chunk (hash stripped to a stable
  logical key) to the committed `tools/build-size-baseline.json` and exits
  non-zero when a chunk grows past 5% + a 1 KB floor, or the total grows
  past 5%, without an explicit baseline bump. New / removed chunks are
  reported (not failed). `npm run size:check` verifies; `npm run
  size:baseline` re-baselines after an intended change. Wired into CI:
  `deploy.yml` runs it after `npm run build` (main), and a new
  `.github/workflows/ci.yml` runs the full gate (typecheck + test + build
  + size:check) on every pull request — previously PRs had no CI at all.
  Baseline captured post-I.1/I.2 (52 chunks, ~2.85 MB; campaign entry
  457 KB). This is a regression guard only; explicit campaign/editor/combat
  bundle ceilings are tracked in Remaining Work.

- [x] **I.8 - Launcher switching hardening.** The unified launcher now keeps
  mode switching rules in small typed helpers (`src/launcher/switching.ts`):
  hash parsing, last-mode storage, path/query-preserving history URLs, and
  bounded visited-frame tracking. The iframe URL builder now handles existing
  query strings, stale `embed` values, absolute paths, and hash fragments
  without ad hoc string concatenation. The launcher uses a stable visited-ref
  for prefetch decisions, passes real collapsed state into the sidebar, and
  exposes `getLauncherVisibility` / `onLauncherVisibilityChange` from the
  shared embed bridge so future mode code can pause work cleanly when hidden.
  `test_launcher_switching.js` now transpiles and exercises the real helpers
  (70 assertions) in addition to the DOM/iframe source contracts.
  Follow-up hardening wires that visibility contract into the combat canvas
  renderer and campaign combat-return poll: inactive launcher frames stop the
  combat RAF loop and skip the campaign's 750 ms result poll until the frame is
  visible again. Stored-mode restores now replace the initial URL hash while
  preserving path/query, so refresh/bookmark/back behavior stays predictable.

## Phase J — AI-friendly authoring (after H, parallel with I)

The migration's other goal: make the codebase easy to extend with
AI-generated content (skills, monsters, story files, events, items,
worlds). Phase E set up the compact-index foundation; Phase J
finishes the authoring loop:

- [x] **J.1 — Author/generator schemas extend.** Added six draft-07
  schemas for the campaign-side collections the lint never covered:
  `campaignQuests`, `campaignEvents` (event tables), `oracleTables`,
  `travelMaps`, `worldActivityPacks`, `storyDirectorPacks`. Each is the
  canonical contract derived from the **actual shipping data** (key-union
  + deep-shape analysis, then verified by linting the real tree to 0
  errors — e.g. `event.check.fail` is an op array, `activity.conditions.any`
  is an OR-group, `sideQuestFlow.keep/promote/retire` are `{id,title,reason}`
  refs). Integration points:
  - **Category resolution.** Campaign files all declare
    `format: "cjs-collection"` and distinguish by `_file.category`, so
    `content-lint.mjs` gained `CATEGORY_TO_SCHEMA` + a `schemaNameFor`
    resolver (format → category → filename precedence) and now **walks
    `data/campaigns/`** (previously entirely unlinted). `--patch` accepts
    a category as its `format` and stamps the synthetic envelope so
    generators can validate a campaign upsert. The unschematized campaign
    categories (questChains / battleSets / mapSeeds / hubs / scenarios /
    maps / profiles / rules) report `info … skipped`, not errors.
  - **TypeScript twins.** `src/content/types.ts` gained the matching
    interfaces (QuestTemplateSet, EventTable, OracleTable, TravelMap,
    WorldActivityPack, StoryDirectorPack + their nested shapes), plus the
    shared `CampaignOp` (typed `op`, free payload — the engine's CampaignOps
    registry stays the authority for verbs) and `CanonRisk`.
  - **Compact indexes.** `build-ai-index.mjs` reads campaign content by
    category and emits six new compact files (campaignQuests / campaignEvents
    / oracleTables / travelMaps / worldActivities / storyDirector) so
    generators see existing ids + cross-refs (quest→linkedScenario, travel
    node ids, story arc shape) without the full tree. Committed index is now
    14 files / 316 entries.
  - `test_content_lint.js` (+13 assertions → 31): schema files exist,
    category-based patch validation (good + broken campaignQuests patch),
    a real campaign file lints by category, new compact files present.
    `npm test` (16 files) + `typecheck` + `build` green.
- [x] **J.2 — Authoring CLI.** `tools/author/index.mjs` (a `<type>
  <command>` dispatcher, `npm run author`) scaffolds, validates, and
  writes authored content. `scaffold` prints a schema-valid starter doc;
  `validate` checks stdin/`--in` JSON (no writes); `add` upserts each
  entry by `id` into the target file. AI generators pipe an entry on
  stdin and get the **same verdict** the lint gives, because the validator
  was extracted to a shared module:
  - **Shared validator.** `tools/lib/content-schema.mjs` now owns the
    format/category→schema maps, the draft-07 validator, schema
    resolution (`schemaNameFor`), and `validateDocument`. `content-lint.mjs`
    is a thin consumer of it (parity verified — full tree still 0 errors).
    One validator, used by both the linter and the author CLI.
  - **Manifest-aware writes.** The engine is manifest-first
    (`data/_manifest.json` lists every file it loads and cross-checks
    scope/world), so `add` also registers a new file's
    `{ path, scope, category, world? }` entry (idempotent). Covers all 15
    schematized types (9 core/system + the 6 campaign collections), with a
    correct `_file` envelope per scope. `--dry-run` previews without
    writing; `--no-manifest`/`--target` keep tests off the shipping tree.
  - **Drive-by lint fix.** `content-lint.mjs <path>` was ignoring its
    positional target (a `patchIdx + 1 === 0` filter bug) and always
    linting the whole tree — the README's subset-lint never worked. Fixed;
    the summary now reports "N checked" instead of a misleading
    "nothing checked" for a cleanly-validated subset.
  - `test_author_cli.js` (44 assertions): `--list`, scaffold|validate
    round-trip for **every** type, broken-entry rejection, dry-run writes
    nothing + leaves the manifest untouched, idempotent upsert, array
    input, category-mismatch refusal. Wired into `npm test` (17 files).
    `tools/author/README.md` documents the CLI.
- [x] **J.3 — AI-context bundles.** `tools/build-ai-briefs.mjs`
  generates `data/ai-briefs/<type>.md` (15 + a README) — one per
  authorable type. Briefs are **generated, not hand-written**, so they
  never drift: the required-field list is pulled straight from the schema,
  the ~200-token example IS the author scaffold (guaranteed valid), and a
  per-type guidance paragraph carries the authoring wisdom the schema
  can't express (op model, cross-ref hints, gotchas). Each brief links its
  schema + the matching compact index, so an AI generator's context for a
  type = brief + compact index, never the full data tree.
  - The type registry + scaffolds were extracted to
    `tools/lib/content-registry.mjs` (shared by the author CLI and the
    brief generator — a CLI script can't be imported without running, so
    the registry is the shared seam). `npm run content:briefs` regenerates.
  - `test_content_lint.js` (+32 → 63): build-ai-briefs runs, every type's
    brief exists, is **byte-identical to a fresh regen** (drift guard), and
    its embedded JSON example **validates through the author CLI**. Full
    suite (17 files) + typecheck green.
- [x] **J.4 — Patch-and-validate flow.** `--patch` now accepts a
  **multi-file batch** (`{ patches: [ op, … ] }`) as well as a single op,
  and reports **downstream impact** on top of schema validation:
  - **Reference graph.** `tools/lib/content-refs.mjs` builds a generic
    cross-reference index over the whole tree (every id, and where each id
    appears as a *value* — works without per-type field wiring because
    engine ids are snake_case/namespaced). `loadContentFiles` /
    `buildIdIndex` / `findReferences`.
  - **Dangling-after-remove** (the safety net): removing an id that other
    content still references is surfaced with the exact `file:entry.path`
    of each referrer (e.g. removing a skill still listed in a monster's
    skill kit). **Affected-by-change**: an upserted id's referrers are
    listed so a generator sees the blast radius. **Same-category collision**:
    an upsert whose id already lives in another file of the *same* category
    warns (the engine merges category files); a cross-category id reuse
    (skill vs monster) does not.
  - **`--json`** emits a structured `{ ok, errors, warnings, patches:[{ added,
    updated, removed, affected, dangling }] }` report an agent can act on
    (typed as `ContentPatchReport` in `src/content/types.ts`, alongside the
    new `ContentPatchBatch`). Impact is advisory — exit code still tracks
    schema validity only.
  - `test_content_lint.js` (+8 → 71): multi-file --json report shape,
    invalid-op-fails-batch, dangling-after-remove (derives a real
    monster→skill reference from shipping data), referrer naming. Full
    suite + typecheck green.
- [x] **J.5 — Hot-reload authoring.** Editing a `data/*.json` file (a hand
  edit, an import, or the authoring CLI) now updates the running dev app
  with no page reload. Two halves:
  - **Engine — in-place re-ingest.** `ContentManager.reloadFileDoc(relPath,
    doc)` re-ingests ONE file into DataStore without resetting the store:
    upserts the entries it now declares and removes entries it previously
    contributed (tracked via each record's `_origin`) that are gone — so
    add/change/**remove** all reflect. It preserves the store's dirty state
    (only re-cleans if it was clean), enforces the world-id prefix guard, and
    signals a full-reload fallback for aggregate collections (quips/quiz/
    trivia). `reloadFile(relPath)` is the async fetch wrapper the client uses.
    The resulting DataStore change events flow through the **existing**
    `CJS.DataHotReload` broadcast → the active React/combat/editor surfaces
    re-render (the in-memory-mutation half was already wired).
  - **Dev server → browser.** A serve-only Vite plugin (`cjsDataHotReload`
    in `vite.config.mjs`) watches `data/**/*.json` and pushes a custom
    `cjs:data-change` HMR event (and suppresses Vite's default full-reload
    for these non-module files). `src/dev/data-hot-reload-client.ts` (imported
    by the campaign/combat/editor mains) calls `reloadFile` on that event.
    It's **dead-code-eliminated in prod** — Vite replaces `import.meta.hot`
    with `undefined`, verified by grepping the built bundle (0 hits).
  - `test_data_hot_reload.js` (18 assertions, vm harness): first ingest,
    update-in-place, add, remove-when-gone, other-origin isolation, change
    events emitted, failure modes, prefix guard. `npm test` (18 files) +
    typecheck + build green. (A live dev-server/browser round-trip isn't
    automatable here; the ingestion core is unit-tested and prod-stripping
    is build-verified.)
- [x] **J.6 — Slash-command authoring agent.** `.claude/agents/content-author.md`
  is a focused subagent (tools: Bash/Read/Write/Edit/Grep/Glob) whose system
  prompt embeds the **workflow**, not the data: it reads the type's brief
  (`data/ai-briefs/<type>.md`) + compact index at runtime (token-cheap, always
  in sync with the schema), scaffolds, fills with real/reused ids, validates
  via the author CLI, writes with `add` (which manifest-registers), and
  confirms with `content:lint`. `.claude/commands/content-author.md` is the
  user-facing `/content-author <type> <intent> …` command — it forks
  (`context: fork`, `agent: content-author`) into that subagent, passing
  `$ARGUMENTS`, so `/content-author skill new ice_lance` runs end-to-end.
  - **Integration gap fixed (found by the end-to-end dry run).** A custom-named
    core file (the AI `--file` pattern, e.g. `skills.ai_generated.json`, plus
    the existing `job_skills.json` / `ultimates.json` / `weather_skills.json`)
    was silently **skipped** by the lint — core schema resolution was by
    canonical filename only. `CATEGORY_TO_SCHEMA` now also maps the core
    categories, so any file resolves by `_file.category`. Net: the full-tree
    lint went from 69 → 74 files checked (the 5 non-canonical core files are
    now covered, still 0 errors) and AI batches written to a custom `--file`
    validate in CI.
  - `test_content_lint.js` (+13 → 83): agent/command exist with the right
    frontmatter, reference the real CLI + brief/index paths, fork into the
    subagent; custom-named core file resolves by category. `npm test`
    (18 files) + typecheck + build green.

### Phase J — COMPLETE

The AI authoring loop is closed end-to-end:

1. **Contract** — six campaign schemas + the core ones, all resolved by
   `_file.category` (J.1), with TS twins in `src/content/types.ts`.
2. **Context** — compact indexes (J.1) + generated, never-drifting per-type
   briefs (J.3) give a generator everything it needs without the full tree.
3. **Author** — `npm run author` scaffolds/validates/writes + manifest-registers
   via one shared validator (J.2); `content-lint --patch` validates batches and
   reports downstream impact / dangling refs (J.4).
4. **Live** — editing `data/*.json` hot-reloads into the running app (J.5).
5. **Agent** — `/content-author` drives the whole loop (J.6).

A new skill/quest/event/etc. goes request → validated entry → loaded content
(and, in dev, on-screen) without hand-editing JSON or touching the engine.

## Phase K — Stretch goals

- [ ] **K.1 — Storybook (optional).** Now that every panel is a
  typed JSX component reading a typed snapshot, mocking a snapshot
  in Storybook costs ~10 lines. Useful for UI review and AI agents
  that want a visual preview without booting the engine.
- [x] **K.2 — Visual regression harness.** `tools/visual-regression/`
  renders every chrome strip + every registered tab against ONE shared,
  typed `CampaignState` fixture with `react-dom/server.renderToStaticMarkup`,
  normalizes the DOM tree, and diffs it against a committed snapshot in
  `__snapshots__/`. A diff fails CI (it rides `npm test`); intended UI
  changes re-baseline with `npm run vr:update` (mirrors `size:baseline`).
  - **No new dependency.** `load-tsx.cjs` is a recursive CJS loader that
    transpiles the project's TS/TSX in-memory with the installed `typescript`
    package (`jsx: react-jsx`, the transform vite uses) and resolves the
    import graph, delegating bare `react` / `react-dom/server` to the one
    installed package. This generalizes the existing `test_selector_store.js`
    / `test_virtual_list.js` single-file transpile pattern. No jsdom — the
    `env.cjs` `window`/`document`/`ResizeObserver` shims are inert because
    `renderToStaticMarkup` never touches the DOM.
  - **Faithful, not mocked.** Tabs pull data through the REAL typed bridges
    (`tabs/data/*.ts`) and the REAL leaf components (QuestRow, ResultPanels,
    SequenceNode, …) render inside them; only the bounded `window.CJS` engine
    surface is stubbed (`installEngine`), and the real TS util modules are
    loaded so `CampaignUIInternal.*` is the real namespace. The fixture is type-checked
    (tsconfig includes `cases.tsx`), so a `state=`/`data=` prop can't drift
    from the component contract.
  - **Deterministic across hosts.** `env.cjs` pins `toLocaleString` to
    en-US + UTC (and `TZ=UTC`) so the timestamp-bearing tabs (session log,
    event log, save slots) snapshot identically on any timezone/locale —
    verified green under `TZ=Asia/Tokyo LANG=fr_FR`.
  - **Coverage contract.** `test_visual_regression.js` (86 assertions) unit-
    tests the HTML normalizer, renders all 38 cases asserting none throw +
    all match their snapshot, and enforces that every tab in
    `CampaignShell.REACT_TAB_COMPONENTS` has a `tab-<id>` case with no orphan
    snapshots — so a new tab can't ship un-snapshotted. Scope boundaries
    (external-module island wrappers via a labeled sentinel; the world-map SVG)
    are documented in the harness README.
- [x] **K.3 — Replace the last legacy JS islands.** The *tab bodies*
  for hub / party / world-map were already JSX'd in the K.3-prerequisite
  work (Phase H). K.3.1/K.3.2 ported the two shared helper islands to
  TS/JSX, so zero campaign rendering now lives in `js/`.
  - [x] **K.3.1 — `cui-hub-tab.js` → `src/campaign/util/cui-hub-tab.ts`.**
    The shared side-content primitives (operation tone / consequence
    summary / card-choice ops / rumor open-filter + the two display-only
    HTML emitters `renderConsequencePreview` / `renderFlavorTrail`) are
    now a typed TS module that installs the **same**
    `window.CJS.CampaignUIInternal.HubTab` surface the JS IIFE did — so
    every consumer (the typed React data bridges `getEventResultData` /
    `getOracleData` / `getSideForgeData` / `getTownSnapshotData` /
    `getStoryDirectorData`, plus the imperative beat modal
    `story-director-card.ts` and the manual event builder
    `event-builder.ts`) keeps working unchanged. This is the
    single-source-of-truth move (the primitives feed both the React tree
    AND two imperative HTML modals), matching the H.4 leaf-helper ports
    (cui-utils / cui-controls / cui-modals / …). Byte-identical HTML
    output — the VR snapshots pass with zero diffs. `main.tsx`, the VR
    harness, and `test_campaign_ui_bootstrap.js` updated; the JS file is
    deleted. The remaining party island is retired in K.3.2.
  - [x] **K.3.2 — Icon-as-JSX foundation + party island retirement.**
    - [x] **Icon foundation.** `src/campaign/util/icon.ts` (typed token
      seam over `UIIcons.normalize`/`iconSource` + className/alt helpers)
      and `src/campaign/util/IconView.tsx` (the JSX twin of
      `UIIcons.renderIcon`; image variant uses a React `onError` instead of
      the inline `onerror=`). `test_icon.js` (26 assertions) renders the
      REAL engine `ui-icons.js` and asserts byte-parity for glyph / letter /
      default sources, structural parity for images.
    - [x] **Detail row → JSX (tab).** `src/campaign/tabs/data/rosterDetail.ts`
      (typed `RosterDetailData` mirroring the island's slot / pool /
      known-row / equipment logic) + `src/campaign/tabs/RosterDetail.tsx`
      (`<RosterDetailRow>` with `<Icon>` + onClick dispatch). The roster
      TAB (`CampaignRosterTab.tsx`) now renders the JSX detail row instead
      of the `detailCardsHtml` `dangerouslySetInnerHTML` island; `roster.ts`
      carries typed `detail` on `RosterMemberData`. `test_roster_detail.js`
      started as the parity oracle the VR fixture couldn't be: it rendered
      the JSX and compared it to the live island output (action attributes
      normalized away) for an EMPTY member (VR-fixture parity) AND a RICH
      member (filled slots, known rows + perks, status, equipped item).
      The VR roster snapshot re-baselined
      (the only diff: `status-char`/`equip-item` buttons dropping
      `data-campaign-action`/`-id`/`-slot` for onClick). The island's detail
      renderers stay TEMPORARILY as the party-sheet modal's source (and the
      parity reference) until the next step.
    - [x] **Party-sheet modal → React; island detail/sheet renderers
      deleted.** The full member sheet is one shared `<RosterMemberCard>`
      (`src/campaign/tabs/RosterMember.tsx`) rendered by BOTH the roster tab
      and the party-sheet modal. The modal now mounts `<PartySheet>`
      (portrait hero + member card) via `createRoot` — the editor-picker
      pattern, with `onClose` unmount; every button dispatches via onClick,
      so the modal needs no click delegate. `getPartySheetData` /
      `getPortraitHeroData` / `getRosterMemberData` added to `roster.ts`.
      This let the icon-heavy island HTML renderers go: `renderPartySheetHtml`,
      `renderRosterMember`, `_renderPortraitHero`, `_rosterDetailCardsHtml`,
      the slot / pool / known-row renderers (`renderSkillSlotView` /
      `renderPassiveSlotView` / `renderSkillPoolList` / `renderPassivePoolList`
      / `renderKnownSkill` / `renderKnownPassive` / `renderKnownStatus` /
      `renderKnownRecord` / `renderSelectionBudgetBadge`), `_renderEquipmentLoadout`,
      and the now-orphaned `_memberLearnedSkillIds` / `_statusDef` / pool-count
      helpers — all deleted (no external consumers; verified by grep +
      typecheck). `rosterMemberData` no longer emits `detailCardsHtml`. The
      tab-JSX/modal-HTML duplication is GONE — the detail row renders only
      from `rosterDetail.ts` now. `test_roster_detail.js` became an
      island-independent golden guard (data-builder + component vs committed
      golden, the proven-correct output captured before deletion). **Net code
      −16 KB** (`cjs-campaign-core` −18 KB; the shared `RosterMember.js` 14 KB
      replaces the inline tab card + the deleted island HTML). `cui-party-tab.js`
      shrank 1112 → ~600 lines.
    - [x] **Remaining island retired.** `cui-party-tab.js` is deleted.
      `src/campaign/tabs/data/roster.ts` now owns member math, roster member
      data, option builders, passive rank helpers, and drawer-party data.
      `RosterMember.tsx` renders the portrait / job chip / affinities as JSX
      from typed data, `shell/PartyDrawer.tsx` renders the command-rail party
      drawer as JSX, and `roster-pickers.ts` owns the imperative pool-picker
      modals. `src/campaign/util/cui-party-tab.ts` keeps only a tiny
      compatibility namespace for older `CampaignUIInternal.PartyTab` callers.

## Size progression (cjs-campaign-core chunk)

| Step | Size (KB) |
| --- | --- |
| Pre-Phase F (after E) | 641 |
| After F.1 (chrome) | 640 |
| After F.13 (all tab bodies) | 615 |
| After post-F cleanup | 614 |
| After G.1 (QuestRow) | 615 |
| After G.2 (EventResult/Oracle) | 611 |
| After G.3 (SoloNotice) | 612 |
| After G.4 (5 small panels) | 608 |
| After G.5 (ScenarioSummary) | 605 |
| After G.6 (AdventureLegend) | 604 |
| After G.7 (ActiveSequence wrapper) | 602 |
| After G.8 (sequence node) | 599 |
| After G.9 (sequence card delivery/action) | 599 |
| After G.10 (sequence shelf) | 597 |
| After G.11a (Story VN hero/guide/deck) | 594 |
| After G.11b (Story episode rail + card) | 594 |
| After G.11c (Story support grid) | 592 |
| After G.12 (Story Home sub-panels) | 587 |
| After G.13 (World Gate cards) | 586 |
| After G.14 (quest chains) | 589 |
| After G.15 (scenario chips) | 588 |
| After G.16 (town snapshot/roll float) | 585 |
| After G.17 (zombie scavenge + dead-code purge) | 576 |
| After H.1 (typed dispatcher; logic-only) | 576 |
| After orphan-closure cleanup (D–G dead code) | 576 |
| After H.2 render-fallback removal | 569 |
| After K.3 hub (battleSets + mapSeeds) | 568 |
| After K.3 hub (questChains) | 560 |
| After K.3 hub (sideForge + oracleForge) | 551 |
| After K.3 roster hero + vitals | 552 |
| After K.3 world activities + travel map | 552 (maps chunk 61→56) |
| After H.2 forwarder + `_bindEvents` delete | 550 |
| After H.3 save + log registry | 547 |
| After H.3 roster pure-ops | 546 |
| After H.3 thin-ops + farm + forge + world-map | 543 |
| After H.3 roster GM stat modals | 541 |
| After H.3 navigation | 540 |
| After H.3 sequence runner | 537 |
| After H.3 story-director logic | 536 |
| After H.3 oracle + end-scenario | 534 |
| After H.3 quest-chain + card-copy | 533 |
| After H.3 scenario-map + haven ops | 532 |
| After H.3 side content | 529 |
| After H.3 hub pulse + rumors | 528 |
| After H.3 economy (inventory/shop/craft/seed/notes) | 526 |
| After H.3 haven + cooking | 523 |
| After H.3 combat execution/resolution | 521 |
| After H.3 downtime (rel-activity + camp-rest) | 519 |
| After H.3 battle selection + battle-pool | 512 |
| After H.3 event/oracle resolution + copy.ts | 506 |
| After H.3 scenario lifecycle + mg-test play | 503 |
| After H.3 solo-hook offers + dismiss | 501 |
| After H.3 story-director rolls + beat modal | 499 |
| After H.3 quest pure-ops | 495 |
| After H.3 mini-game session machinery | 487 |
| After H.3 small roster pickers | 484 |
| After H.3 travel-world + party-availability | 483 |
| After H.3 scenario-gen + inspect | 479 |
| After H.3 quest launchers | 475 |
| After H.3 chain launchers + solo offers | 470 |
| After H.3 travel-world-card | 465 |
| After H.3 recruit/learn/skill-detail | 462 |
| After H.3 equip-item + stat-boost | 461 |
| After H.3 change-job/persona + job-tree | 454 |
| After H.3 rank-up-apply | 451 |
| After H.3 party-sheet | 451 |
| After H.3 mg-test-pick | 451 |
| After H.3 story-help + copy-prompt | 449 |
| After H.3 manual builders (complete 246/246) | 449 |
| After H.4 chrome state to TS | 447 |
| After H.4 leaf helpers (utils + portraits + log) to TS | 443 |
| After H.4 cui-controls + cui-modals to TS | 435 |
| After H.4 cui-options + cui-equipment to TS | 427 |
| After H.4 tabs-registry + react-bridge + world-map stub to TS | 424 |
| After H.4 travelSurprise + lastReport data builders to TS | 424 |
| After H.4 combat / battle / pendingBattle data builders to TS | 420 |
| After H.4 getEventLogData + cssVarAssetUrl to TS | 419 |
| After H.4 battleSets + mapSeeds data builders to TS | 418 |
| After H.4 oracleForge + side-card / rumor-row helpers to TS | 418 |
| After H.4 town snapshot + roll float data builders to TS | 416 |
| After H.4 getOracleData to TS | 416 |
| After H.4 getSoloNoticeData to TS | 415 |
| After H.4 getSideForgeData to TS | 412 |
| After H.4 getAdventureLegendVisible to TS | 412 |
| After H.4 getRosterData to TS | 412 |
| After H.4 getQuestRowData to TS | 411 |
| After H.4 getQuestHomeData + getQuestPanelData + zombie to TS | 405 |
| After H.4 getEventResultData to TS | 404 |
| After H.4 getScenarioSummaryData + runQuestPill + scenarioObjectiveMeta to TS | 403 |
| After H.4 getRunData + getScenariosData + scenarioShared to TS | 398 |
| After H.4 sequence + eventTab + questChain + activeSequence to TS | 387 |
| After H.4 getWorldGateData + worldMenuDef to TS | 383 |
| After H.4 getMinigameTestData to TS | 382 |
| After H.4 getChromeData + panel defs to TS | 379 |
| After H.4 getStoryHomeData + getStoryDirectorData + story helpers to TS | 366 |
| After H.4 story-context cache + AI story-prompt cluster to TS | 354 |
| After H.4 manual scene + branch builder to TS | 348 |
| After H.4 GM override modal to TS | 338 |
| After H.4 manual event builder to TS | 316 |
| After H.4 manual quest builder to TS | 293 |
| After H.4 quest-run-task → JSX (item B) | 290 |
| After H.4 storyDirector card + dead solo cluster (item C) | 284 |
| After H.4 roster cluster → cui-party-tab.js (item A) | 282 |
| After H.4 shell owner boot.ts; **campaign-ui.js deleted** | 271 |

Cumulative Phase F+G+K.3+H: 641 KB → 271 KB. **Phase H is COMPLETE.**
H.3: 246/246 actions in the TS registry. **H.4: `campaign-ui.js` is
deleted** — every `get*Data` bridge, the chrome state + data builder,
all leaf util helpers, the render-bridge islands (quest-run-task → JSX,
story-director card → TS, the roster member-math cluster →
`cui-party-tab.js`), and the shell orchestration (boot + render loop,
combat-result return flow, drawer body, quest narrative modal, the
action + chrome dispatch seam) all live in TypeScript.
`src/campaign/shell/boot.ts` installs the `window.CJS.CampaignUI`
surface so the React shell + the three JS callers (pocket-haven /
scenario-runner / data-hot-reload) are unchanged. H.5: the bridge /
actions tests retargeted at the boot + registry surface. The only
remaining campaign JS islands are the two intentional ones
(`cui-party-tab.js` 1k lines — icon-heavy roster detail row +
member-math; `cui-hub-tab.js` 162 lines — side-content primitives) plus
the external-module tabs + maps + the world-map SVG, all forwarded
through the React shell. Next: Phases I (performance) + J (AI authoring).

**Data builders ported to TS so far:** travelSurprise, lastReport,
combatResult, lastCombatResult, pendingBattle, eventLog, battleSets,
mapSeeds, oracleForge, townSnapshot, townRollFloat, oracle, soloNotice,
sideForge, adventureLegendVisible, roster, questRow, questHome,
questPanel (+ zombie scavenge home/tracker), eventResult, scenarioSummary,
run, scenarios, sequence (shelf + delivery + per-entry), eventTab,
questChain (active/template/resolved + side story flow guide),
activeSequence (with discriminated node snapshot), worldGate (with
worldMenuDef + per-card data), minigameTest, chrome (header / mode bar
/ scenario hud / recent log / command rail / currency / panel defs),
storyHome (chapter tree, story pipeline, sync summary, choice
consequence), storyDirector (stage rail, director card, pressure
board, clues panel, queue panel, truths panel, side flow),
storyContext (`aiStoryContextData` AI-context panel snapshot +
`storyPromptText` full AI story-prompt builder, both reading the
async `story-context.ts` cache). Only `getMainBody` +
`renderDrawerBody` stay as JS bridges (they wrap still-JS render-side
helpers — `_renderMain`'s defensive fallback + the drawer body).

**Shared helpers ported to TS:** `sideCardData`, `rumorRowData`,
`pendingSoloHookCard`, `isQuestResolved`, `questObjectiveDone`,
`questNextObjective`, `questMiniGameObjective`, `questStatusClass`,
`activeRunQuestId`, `cssVarAssetUrl`, `runQuestPill`,
`scenarioObjectiveMeta`, `shapePillsData`, `beatIcon`,
`scenarioRunActionsData`, `scenarioQuestPillData`, `sequenceDeliveryData`,
`sequenceActionData`, `sequenceShelfEntryData`, `questChainStepData`,
`questChainStakesData`, `questChainVnPanelData`, `questChainActiveData`,
`questChainTemplateData`, `sideStoryFlowGuideData`, `questChainResolvedData`,
`worldMenuDef`, `panelDefsForState`, `panelOrder`, `currencyAmounts`,
`setMinigameTestGame`, `storyTheme`, `storyVnHeroData`,
`storyActionBtnData`, `storyNextStepData`, `videoTypeFromPath`,
`storyNextStep`, `storyStageRailData`, `storyDirectorCardData`,
`storyPressureBoardData`, `storyCluesPanelData`, `storyQueuePanelData`,
`storyTruthsPanelData`, `storySideFlowData`, `chapterTreeData`,
`chapterTreeNodeData`, `storyPipelineSnapshot`, `storyPipelinePanelData`,
`syncSummaryData`, `shortenPanelLabel`, `choiceConsequenceData`,
`storySummaryEntries`.

Every closure-private `_render*` sub-renderer in
campaign-ui.js is JSX, the hub-family tab bodies + roster hero are
JSX, and the action contract is fully registry-backed for every
dispatch path. Still bridged HTML: the roster detail row
(`cui-party-tab.js`, 742 lines — icon-heavy, action surface
registry-backed), the shared side-content primitives
(`cui-hub-tab.js`, 162 lines), the world map SVG, the intentionally-
vanilla external-module tabs + maps tab. **All four big modal builders
are now TS** (Phase H.4): the manual event builder
(`action-handlers/event-builder.ts`), manual quest builder
(`quest-builder.ts`), GM override (`gm-override.ts`), and manual scene
builder (`scene-builder.ts`). `manual-builders.ts` is now a pure set of
thin TS dispatchers — no CampaignUI modal bridge remains.

**Remaining H.4 work:**
1. [x] **Story-context cache + AI story-prompt cluster → TS (done).**
   `src/campaign/story-context.ts` owns the four async loads
   (`_storyContextCache`, `_ensureStoryContext`, `_loadStoryContextFile`,
   `_loadStoryContextJson`), the snapshot reader (`_storyContextFor`),
   the AI-story-context panel data (`_aiStoryContextData`), and the full
   AI story-prompt builder (`_storyContextPromptText`,
   `_storyContextIndexPromptText`, `_worldStoryContextPromptText`,
   `_liveGmStoryPromptText`, `_storyPromptText`, `_markdownPromptExcerpt`,
   `_compactPromptLine`, `_storyChapterText`). The module installs
   `window.CJS.CampaignStoryContext.ensureStoryContext` so the still-JS
   init/render/subscribe prime the cache; TS consumers
   (`action-handlers/story-tools.ts`, `tabs/data/storyHome.ts`) import
   `storyPromptText` / `ensureStoryContext` / `aiStoryContextData`
   directly (no CampaignUI bridge hop). The three
   `computeStoryPromptText` / `ensureStoryContext` /
   `renderAiStoryContextData` bridges are gone. Also removed the
   orphaned `_storySummaryEntries` / `_storySummaryTextFromRecord`
   (dead since `getStorySummaryData` ported).
2. [x] **Port the big modal builder bodies and their shared helpers
   (done).** All four moved to `src/campaign/action-handlers/` and call
   directly from `manual-builders.ts` (no CampaignUI bridge remains).
   - [x] **Manual scene + branch builder (done).**
     `_openManualSceneBuilder` (127) + `_saveAsManualNote` →
     `src/campaign/action-handlers/scene-builder.ts`. `story-manual-note`
     calls `openManualSceneBuilder` directly; the bridge entry is gone.
   - [x] **GM override modal (done).** `_gmOverride` (174) →
     `src/campaign/action-handlers/gm-override.ts`. `gm-override` /
     `gm-member-override` call `openGmOverride` directly; the bridge entry
     is gone. Still reads the shared roster option builders
     (`_characterOptions` / `_skillOptions` / `_passiveOptions`) through
     the `CampaignUI.rosterCharacterOptions/SkillOptions/PassiveOptions`
     bridges; `statName` is the small local copy (same as
     roster-modal-pickers.ts).
   - [x] **Manual event builder (done).** `_openManualEventBuilder`
     (266) + its 14 sub-helpers (draft/from-body, ops, reward ops,
     summary text, short summary, keyword bank/prompt,
     rumor/battle/layer/character options, tag list, event tags) →
     `src/campaign/action-handlers/event-builder.ts`. `custom-event` /
     `oracle-to-event-builder` call `openManualEventBuilder` directly;
     the bridge entry is gone. Imports the already-TS battle pool
     (`battle-pool.ts`) + clipboard (`copy.ts`) directly; rumor list via
     `CampaignUIInternal.HubTab.openRumors`. The dead `_openRumors`
     wrapper was removed too.
   - [x] **Manual quest builder (done).** `_openQuestModal` (475) + its
     4 helpers (`_questBuilderMiniGame`, `_parseMiniGameConversation`,
     `_randomizedQuestTemplate`, `_inferObjectiveKind`) + the preset
     tables → `src/campaign/action-handlers/quest-builder.ts`. `add-quest`
     calls `openQuestModal` directly; the bridge entry is gone. Imports
     `questMapForm` / `questMapType` from `quest.ts` (the canonical TS
     copies); the dead JS `_questMapForm` / `_questMapType` were removed.
After items 1+2, `campaign-ui.js` is down to ~2.4k lines (from 4.6k at
the start of this pass; 10.8k originally). What remains is the hard core,
in three clusters — these are the item-3/4 work:

3. **Render-bridge cluster (HTML islands).** Each is a typed bridge the
   React tree consumes via `dangerouslySetInnerHTML` or an imperative
   modal. Port the renderer to JSX (Phase-G style: typed `get*Data` +
   JSX component) OR keep as a permanent island moved into a TS module
   that still emits the HTML string. Inventory:
   - [x] `renderStoryDirectorCardHtml` → **ported to TS** (Phase H.4).
     `_renderStoryDirectorCard` + `_renderStoryRouteChoices` became
     `renderStoryDirectorCardHtml` in
     `src/campaign/action-handlers/story-director-card.ts` (HTML-string
     island — the beat modal in `story-director-modals.ts` wires the
     `data-story-modal-choice` buttons imperatively). Only the modal
     render path survived (the non-modal action-grid branch was dead).
     The shared HubTab consequence/flavor/summary delegators
     (`_cardChoiceOps` / `_renderConsequencePreview` / `_renderFlavorTrail` /
     `_consequenceSummary`) were removed too — their only other consumer
     was the now-deleted dead `_renderSoloNotice` (G.3's JSX
     `SoloNoticePanel` replaced it). `_pendingSoloHookCard` /
     `_clearPendingSoloHook` + the orphaned `Side`/`Ops`/`Runner`/`SD`/`QP`/
     `Gen`/`Icons` accessors + the whole `cui-controls` alias block went
     with them.
   - [x] `renderQuestRunTaskHtml` → **ported to TS** (Phase H.4). The
     `_renderQuestRunTask` HTML emitter + `_questTaskDescriptor` /
     `_questCellFromRef` became `buildQuestRunTask` / `questTaskDescriptor`
     / `questCellFromRef` in `tabs/data/resultPanels.ts`; the
     ScenarioSummary panel renders the typed `questRunTask` discriminated
     union as JSX (no more `dangerouslySetInnerHTML` for it). The shared
     predicates reuse `state-helpers.ts` (`activeRunQuestId` /
     `isQuestResolved` / `questNextObjective` / `questObjectiveDone`). Dead
     orphans removed alongside: `_questObjectiveByKinds`, `_activeQuestById`,
     `_triggerLabel`. (`_renderQuestMini` belongs to the drawer cluster.)
   - [x] `renderPartySheetHtml` + the whole **roster shared cluster** →
     **consolidated into `cui-party-tab.js`** (Phase H.4). The 14
     member-math helpers (`_memberBase` / `_memberRankInfo` /
     `_renderRankBar` / `_memberStats` / `_renderResistances` /
     `_renderEquipmentLoadout` / `_memberSkillEntries` / `_memberPassives` /
     `_memberLearnedSkillIds` / `_renderJobChip` / `_statName` /
     `_skillMeta` / `_skillEntryId` / `_statusDef`) + `_renderPersonaChip` +
     `_skillWeaponTypes` + `_renderPortraitHero` + the option builders
     (`_characterOptions` / `_skillOptions` / `_passiveOptions`) moved into
     the roster island that consumes them. It now owns its `_tabHelpers()`
     bundle (defaulted on every render entry point) and exposes
     `PartyTab.{getTabHelpers, memberRankInfo, skillMetaText,
     characterOptions, skillOptions, passiveOptions, renderPartySheetHtml}`.
     TS consumers (`roster.ts`, `roster-modal-pickers.ts`, `gm-override.ts`)
     read `CampaignUIInternal.PartyTab` / `.Portraits.icon` directly — the
     8 CampaignUI roster bridges + the whole portrait/modal/option/equipment
     alias block are gone from campaign-ui.js (2146 → 1719 lines).
   - [x] `getMainBody` / `renderDrawerBody` → **ported to TS in `boot.ts`**
     (Phase H.4, item 4). `_renderMain` (defensive unregistered-tab
     fallback) + `_renderDrawerBody` (+ `_renderQuestsFallback` /
     `_renderLogFallback` / `_renderInventorySnapshot` / `_renderNotesPanel`
     / `_renderQuestMini`) are TS HTML islands consumed by the React
     `CampaignDrawer` / `VanillaBody`. The 'party' body delegates to
     `PartyTab.renderParty`; the dead `_renderQuestPanel` ternary collapsed
     to the fallback.
   - [x] Roster shared cluster — **consolidated into `cui-party-tab.js`**
     (item A above); stays a bridged JS island.

4. [x] **Shell-orchestration cluster + `campaign-ui.js` DELETED**
   (Phase H.4). The whole remaining IIFE moved to
   `src/campaign/shell/boot.ts`, a TS module that installs the same
   `window.CJS.CampaignUI` surface — so the React shell + the three JS
   callers (pocket-haven / scenario-runner / data-hot-reload) are unchanged
   (drop-in). main.tsx imports `./shell/boot` instead of the IIFE.
   - boot + render loop: `init`, `render`, `enableReactShell`. World-UI
     normalize calls `normalizeForWorld` from `../chrome-state` directly;
     the thin `_worldUiProfile`/`_defaultTabForMode`/`_appModesForState`/
     `_tabsForMode` delegates were dropped (no callers — the TS chrome
     slice + chromeData own them).
   - combat-result return flow: `flashOnNewEncounter`, `bindRunPanel`,
     `bindCombatResultListener`, `storeCombatResult`, `bindCombatReturnEvents`,
     `combatResultKey`, `consumeCombatResult` — all ported 1:1.
   - panel/drawer layer: only the reachable Escape-to-close path survives
     (`bindEscapeForPanels` → `closePanel`). The imperative drawer DOM
     (`_openPanel` / `_renderPanelLayer` / `_tearDownDrawer` /
     `_panelDefsForState` / `PANEL_DEFS` / `RAIL_ORDER`) was **fully
     orphaned** (nothing called `_openPanel`) once the React `CampaignDrawer`
     took over — deleted, not ported.
   - chrome setters + dispatch seam: `setActiveMode/Tab/Panel` (write the
     chrome slice + render), `handleAction` (→ `CampaignActionsRuntime`).
     `setActiveModeRaw/TabRaw` + `modeForTab` + `getActive*` are re-exported
     straight from `../chrome-state` onto the install surface. `_goto` /
     `_modeForTab` JS helpers dropped (TS callers use chrome-state).
   - leftover data: `showQuestNarrative` ported; the dead
     `_pendingSoloHookCard` / `_clearPendingSoloHook` were removed with the
     solo-notice cluster (item C). `renderTabBody` kept as an empty stub.

   `campaign-ui.js` (10,857 lines originally) is **deleted**. **H.5** done
   alongside: `test_campaign_shell_bridge.js` rewritten to assert the boot.ts
   surface + chrome-state single-source + the React tab coverage (139
   assertions); `test_actions_bridge.js` updated (dispatch is registry-only,
   boot.ts handleAction routes through the runtime); `test_campaign_ui_bootstrap.js`
   continues to exercise the TS helper namespaces + the registry. Phases I/J pivot from "remove HTML strings"
   to "optimize the React tree + open the authoring loop for AI generators."

## Done-when gate

For every tab/panel migration commit:

- `npm test` is green (the suite is now 23 test files — see the `test`
  script in `package.json`; each file prints its own assertion tally).
- `npm run typecheck` is clean.
- `npm run build` succeeds.
- The migrated tab/panel renders identical content to the vanilla
  version for the same `CampaignState` snapshot.
- Vanilla helpers that become unreachable after the port are deleted
  (no dead code).
- No new behaviour, no new feature, no new abstractions — behaviour
  parity only.

## Architecture invariants (do not break)

These are the current contracts for future campaign work:

1. **No `campaign-ui.js` bridge.** `campaign-ui.js` is deleted. Historical
   mentions above are migration log entries, not an active integration point.
   Cross-language reads must go through the TS shell bridge, boot surface, or
   per-tab data files (`src/campaign/shell/bridge.ts`,
   `src/campaign/shell/boot.ts`, `src/campaign/tabs/data/`). Components in
   `src/campaign/` should not reach into `window.CJS.*` directly except
   through those typed boundaries or action-handler context helpers.
2. **Direct onClick > data attribute.** New or migrated buttons use
   `onClick={() => dispatchCampaignAction(name, payload)}` or a typed wrapper
   in `src/campaign/actions.ts`. Existing `data-campaign-action` markup is
   compatibility-only for the remaining vanilla / HTML islands listed in
   Remaining Work; do not add new JSX that emits it.
3. **JSX > dangerouslySetInnerHTML.** Every remaining `dangerouslySetInnerHTML`
   use must identify the current island it is hosting and the removal path.
   Do not introduce new bridges to deleted campaign UI closure helpers.
4. **No new HTML-string renderers.** Adding a new panel ships as JSX from day
   one, with typed data builders if it needs data the React tree cannot compute.
   Do not recreate `campaign-ui.js` or add new `_render*` HTML-string helpers.
5. **Tests track contracts.** `test_campaign_shell_bridge.js` lists every
   bridge function the React shell consumes. Adding a `get<X>Data` adds an
   entry. Adding a JSX shell component adds a presence check.
