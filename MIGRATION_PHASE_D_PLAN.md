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

### Next — Phase G (remaining sub-renderers)

Each entry is one commit. The pattern is uniform: expose a typed
`get<Thing>Data(state, ...)` bridge that returns structured data,
write a JSX component in `src/campaign/tabs/` that maps that data
to markup with direct onClick handlers, swap the consumers from
HTML-bridge to JSX, delete the closure-private `_render*` helper
and any sub-helpers it owned exclusively.

- [ ] **G.8 — `_renderSequenceNode` (7 variants).** Discriminated
  union: `choice` (per-choice eligibility + alignment hint),
  `stat_check` (pass/fail), `combat` (queue battle / manual win/lose,
  replay aware), `minigame` (play / manual clear/fail), `scenario`
  (start / continue / abort), `end` (Complete), default narration
  (continue with `condition→sequence-resolve` or `ops→Apply&Continue`
  label rewrites). Ported alongside this drops `_renderActiveSequence`
  too — the wrapper already moved in G.7 but still calls the node
  helper.
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

### Then — Phase H (delete campaign-ui.js)

Once every G.* entry above is ported, the closure in
`js/campaign/campaign-ui.js` retains only:

- The bridge surface: `enableReactShell`, `init`, all `get*Data`
  functions, the chrome setters (`setActiveMode/Tab/Panel`).
- The action dispatcher (`_handleAction` + supporting closures for
  every `data-campaign-action` string).
- The vanilla render fallback for non-React mode.

Phase H removes both halves:

- [ ] **H.1 — Port `_handleAction`** to a typed reducer in TypeScript.
  Each case becomes either a typed action wrapper in
  `src/campaign/actions.ts` or a slot in a CampaignActions registry.
  The `dispatchCampaignAction` bridge becomes a direct map lookup.
- [ ] **H.2 — Remove the vanilla render fallback.** With React shell
  always enabled and every tab/sub-panel JSX, `render()` and
  `_renderMain` are dead; the chrome events route through `onClick`
  + the bridge setters; the drawer is React-portaled.
- [ ] **H.3 — Migrate `getXxxData` bridge functions** to TypeScript.
  Move them into `src/campaign/bridge/` modules grouped by domain
  (chrome, tabs, panels). The CampaignState typed surface gets the
  fields these readers touch, so the bridge no longer depends on
  closure-private helpers.
- [ ] **H.4 — Delete `js/campaign/campaign-ui.js` + `js/campaign/ui/`**
  (cui-controls / cui-equipment / cui-log / cui-modals / cui-options
  / cui-portraits / cui-utils / cui-tabs/* / cui-react-bridge).
  Their stable helpers (`Utils.esc`, `Log.logKind`, etc.) move to
  TypeScript util modules.
- [ ] **H.5 — Rewrite `test_campaign_ui_bootstrap.js`** against the
  React tree. The bridge surface test (`test_campaign_shell_bridge.js`)
  becomes a TypeScript unit test, also exercised in vitest if added.

## Phase I — Performance (after H)

With campaign-ui.js gone, the React tree owns every render path.
Now optimizations that were impossible while HTML strings ran the
show become tractable:

- [ ] **I.1 — `React.memo` boundaries.** Every shared sub-panel
  (QuestRow, EventResultPanel, SoloNoticePanel, etc.) takes its
  typed snapshot as a prop. Wrap them in `memo` so a tab re-render
  doesn't re-render unrelated cards. The shell's `tick` re-render
  already passes the same panel data when nothing changed, so memo
  is a clean win.
- [ ] **I.2 — Selector hooks.** `useCampaignState()` currently
  returns the entire snapshot. Replace consumers with selector
  hooks (`useCampaignSelector(s => s.eventLog.entries)`) backed by
  `useSyncExternalStore` so only components whose slice actually
  changed re-render.
- [ ] **I.3 — Virtualize long lists.** Quest list, event ledger,
  log entries panel, save slots — each can pass 100+ rows. Add
  `react-window` or a tiny custom virtualizer.
- [ ] **I.4 — Defer heavy panels.** The Story Director support
  grid (clues / queue / truths / pressure board) and the Hub
  family's inner grids are not visible on first paint. Wrap with
  `Suspense` + `React.lazy` so each panel ships only when active.
- [ ] **I.5 — Service worker fine-tune.** Today the PWA precaches
  every chunk on first visit. With domain-split chunks (combat /
  campaign / minigames / qte / media), shift to a runtime-cache
  policy keyed by mode so a Story-Mode-only player never downloads
  the combat chunk's grid renderer.
- [ ] **I.6 — Image / asset budget.** Audit the `assets/` and
  `images/` trees against bundle size. Move large story-mode VN
  art behind a per-world dynamic import; cap thumbnail sizes;
  expose a build-time check in `tools/` that fails CI on regressions.
- [ ] **I.7 — Re-baseline build sizes.** Add `tools/build-size-check.mjs`
  that compares `dist/assets/*.js` chunks to a committed baseline and
  fails CI when any chunk grows >5% without an explicit baseline
  bump. Run on every PR.

## Phase J — AI-friendly authoring (after H, parallel with I)

The migration's other goal: make the codebase easy to extend with
AI-generated content (skills, monsters, story files, events, items,
worlds). Phase E set up the compact-index foundation; Phase J
finishes the authoring loop:

- [ ] **J.1 — Author/generator schemas extend.** `data/schemas/*`
  today covers core entries. Add schemas for the remaining types
  (campaignQuests, eventTables, oracleTables, worldActivityPacks,
  travelMaps, storyDirector packs). Each schema is the canonical
  contract — both the engine and the AI generator read it.
- [ ] **J.2 — Authoring CLI.** `tools/author/<type>.mjs` scripts
  scaffold a new entry, validate it against the schema, and write
  it into the right `data/` directory. AI generators call the same
  script with JSON on stdin so the validation runs identically.
- [ ] **J.3 — AI-context bundles.** `tools/build-ai-index.mjs`
  already ships compact indices. Add per-type "AI brief" markdown
  files in `data/ai-briefs/` (one per content type) describing
  exactly the contract the schema enforces, with a 200-token
  example. AI generators read the brief + the compact index for
  their context, not the full data tree.
- [ ] **J.4 — Patch-and-validate flow.** `tools/content-lint.mjs
  --patch <file>` already exists; widen it to support multi-file
  patches and to report which downstream content is affected (e.g.
  a new skill changes monster skill kits). Output a diff summary
  an AI agent can react to.
- [ ] **J.5 — Hot-reload authoring.** When `data/` files change,
  the dev server invalidates DataStore caches in place so the
  React tabs re-read the new content without a page reload. Today
  every content change requires a refresh.
- [ ] **J.6 — Slash-command authoring agent.** Add a Claude Code
  agent definition (`.claude/agents/content-author.md`) whose
  prompt embeds the AI brief + compact index for a type, and whose
  workflow ends with `npm run content:lint -- --patch` before
  committing. This lets `/content-author skill new ice_lance` go
  end-to-end without manual hand-holding.

## Phase K — Stretch goals

- [ ] **K.1 — Storybook (optional).** Now that every panel is a
  typed JSX component reading a typed snapshot, mocking a snapshot
  in Storybook costs ~10 lines. Useful for UI review and AI agents
  that want a visual preview without booting the engine.
- [ ] **K.2 — Visual regression harness.** Render every tab against
  a fixed CampaignState fixture, snapshot the DOM tree, fail CI on
  unexpected differences.
- [ ] **K.3 — Replace the legacy hub / party / world-map tabs.**
  These tabs still mount HTML strings from `cui-hub-tab.js` /
  `cui-party-tab.js` / `cui-world-map-tab.js`. They follow the same
  Phase G pattern: typed bridge + JSX component. Lower priority
  because their bodies are stable; Phase H targets the closure
  helpers in campaign-ui.js first.

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

Cumulative Phase F+G: 641 KB → 576 KB. Every closure-private
`_render*` sub-renderer in campaign-ui.js is now JSX. The remaining
~576 KB is the `_handleAction` dispatcher, the `get*Data` bridges,
the vanilla render fallback, and the legacy hub/party/world-map tab
HTML paths the React shell still wraps. Phase H removes the
campaign-ui.js render/dispatch halves; Phases I/J pivot from "remove
HTML strings" to "optimize the React tree + open the authoring
loop for AI generators."

## Done-when gate

For every tab/panel migration commit:

- `npm test` is green (currently 901 assertions across 12 files).
- `npm run typecheck` is clean.
- `npm run build` succeeds.
- The migrated tab/panel renders identical content to the vanilla
  version for the same `CampaignState` snapshot.
- Vanilla helpers that become unreachable after the port are deleted
  (no dead code).
- No new behaviour, no new feature, no new abstractions — behaviour
  parity only.

## Architecture invariants (do not break)

These are the contracts every Phase F+G+H commit upholds:

1. **One bridge boundary.** All cross-language reads go through
   `CampaignUI.get<X>Data(state)` in campaign-ui.js. Components in
   `src/campaign/` never reach into `window.CJS.*` modules
   directly except via the typed bridge file in
   `src/campaign/shell/bridge.ts` or per-tab data files in
   `src/campaign/tabs/data/`.
2. **Direct onClick > data attribute.** Migrated buttons use
   `onClick={() => dispatchCampaignAction(name, payload)}` or a
   typed wrapper in `src/campaign/actions.ts`. Stamping
   `data-campaign-action` into JSX is reserved for the legacy
   bubble-delegated path that ports later.
3. **JSX > dangerouslySetInnerHTML.** Every JSX component that
   still uses `dangerouslySetInnerHTML` carries a comment naming
   the closure helper it's bridging to, and the comment names the
   Phase G entry that ports it.
4. **No new HTML-string renderers.** Adding a new panel ships as
   JSX from day one, with a typed `get<X>Data` bridge if it needs
   data the React tree can't compute. campaign-ui.js gains no new
   `_render*` helpers.
5. **Tests track contracts.** `test_campaign_shell_bridge.js` lists
   every bridge function the React shell consumes. Adding a
   `get<X>Data` adds an entry. Adding a JSX shell component adds
   a presence check.
