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
  - [x] **Roster member hero + vitals ported.** `getRosterData` +
    `PartyTab.rosterMemberData` produce typed hero / identity / rank /
    persona pill / job chip / vitals / stats / affinities;
    `CampaignRosterTab.tsx` renders the active/bench panels and every
    hero / gameplay / GM action as JSX onClick. `renderRosterMember`
    stays as a thin HTML formatter over the same typed data for the
    party-sheet modal (one source of truth).
  - [x] **Roster detail row** (skills / passives / statuses / equipment
    cards) — **accepted as a permanently-bridged island**, not a TODO.
    These cards are icon-heavy (`Portraits.icon` / `_icon` emit HTML with
    no JSX precedent) and as complex as the bridged external-module tabs,
    so they are treated the same way: kept as one `detailCardsHtml` HTML
    body whose `data-campaign-action` buttons route through the shell
    `<main>` forwarder (and the party-sheet modal's own delegate) →
    `dispatchCampaignAction` / `_handleAction`. As of H.3 their action
    surface (equip / unequip / unlearn skill+passive, unequip-item,
    party-available, bench/activate) is **TS-registry-backed** — the
    forwarder/delegate now resolve those names to typed handlers in
    `action-handlers/roster.ts` + `actions.ts`, not the vanilla switch.
    A future step can swap the HTML for per-card JSX once an
    icon-as-data path exists, but parity + integration are complete; it
    is not required for H.4 (the bridged body, like the external-module
    tabs, survives the campaign-ui.js deletion as a forwarded island).
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
- [~] **H.4 — Migrate `get*Data` bridges to TS** under
  `src/campaign/bridge/` (chrome, tabs, panels), backed by the typed
  CampaignState surface, then **delete `js/campaign/campaign-ui.js` +
  `js/campaign/ui/`**. Stable leaf helpers (`Utils.esc`, `Log.logKind`,
  `Controls.actionBtn`, etc.) move to TS util modules first.
  The roster detail row and external-module tabs stay bridged HTML
  islands across the deletion (forwarded, like today).

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
- [ ] **H.5 — Rewrite `test_campaign_ui_bootstrap.js`** against the
  React tree; fold `test_campaign_shell_bridge.js` into a TS unit test.
  **Blocked on H.4** (the bootstrap test loads `js/campaign/ui/`, which
  H.4 deletes). When it lands, a Node-importable test can exercise the
  registry directly — the `action-handlers/` rename (vs the old
  `actions/` dir that clashed with `actions.ts`) was done so Node's ESM
  resolver can import these modules without an `ERR_*_DIR_IMPORT`.

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

Cumulative Phase F+G+K.3+H-so-far: 641 KB → 354 KB. **Phase H.3 is
complete**: 246/246 actions live in the TS registry, and the
`_handleAction` switch is empty (kept as a defensive no-op with
the port history in comments). **Phase H.4 in progress** —
chrome state, every leaf util helper, the tab registry, the
React-bridge tab list, the world-map stub, the chrome data builder,
and **every `get*Data` bridge** are all TS. The seven
`js/campaign/ui/cui-*.js` files and three `js/campaign/ui/tabs/cui-*`
small files were deleted (cui-utils, cui-portraits, cui-log,
cui-controls, cui-modals, cui-options, cui-equipment,
cui-tabs-registry, cui-world-map-tab, cui-react-bridge — 10 files
deleted, 11 TS modules created under `src/campaign/util/` + 1 under
`src/campaign/`).

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
vanilla external-module tabs + maps tab. Still in JS: the big
modal builder bodies (`_openManualEventBuilder` 266 lines,
`_openQuestModal` 475 lines, `_gmOverride` 174 lines,
`_openManualSceneBuilder` 127 lines) — bridge-wrapped from TS so
the action contract is registry-backed even though the bodies
share many sub-helpers with the still-JS data builders.

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
2. Port the big modal builder bodies (`_openManualEventBuilder` 266
   lines, `_openQuestModal` 475 lines, `_gmOverride` 174 lines,
   `_openManualSceneBuilder` 127 lines) and their shared helpers —
   currently bridge-wrapped from TS.
3. Port the still-JS bridges that wrap legacy render code:
   `renderStoryDirectorCardHtml`, `renderQuestRunTaskHtml`,
   `renderPartySheetHtml`, `getMainBody`, `renderDrawerBody`. Each
   either ports its renderer to JSX or stays as a permanent island.
4. Delete `js/campaign/campaign-ui.js` once all the above lands.
   Then H.5 (test rewrite). Phases I/J
pivot from "remove HTML strings" to "optimize the React tree +
open the authoring loop for AI generators."

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
