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
campaign shell is React-owned at the entry point. The remaining work
moves each `_render*` body OUT of the campaign-ui closure into its own
TypeScript port, in any order:

- [ ] Port `cui-party-tab.js::renderRosterMember` (slot views, known
  skill / passive rows, status badges) to per-section React
  components inside `CampaignRosterTab.tsx`. Drop the
  `dangerouslySetInnerHTML` mount once everything is JSX.
- [ ] Port `CampaignWorldMap.renderTravelMap` SVG to a `WorldMap.tsx`
  component reading the same state shape.
- [ ] Port the hub-family inner renderers (`renderSideForge`,
  `renderOracleForge`, …) to JSX inside `CampaignHubTabs.tsx`.
- [ ] Port the external-module renderers (CampaignInventory,
  CampaignEconomy.renderShops, PocketHaven.renderCraft/Cook/Farm,
  RelationshipsTab.render) to JSX inside the matching
  `CampaignExternalTabs.tsx` components.
- [ ] Promote the closure-private `_render*` functions
  (`_renderWorldGate`, `_renderStoryHome`, …) out of campaign-ui.js
  into their own TypeScript modules consumed by the matching React
  components.
- [ ] Migrate the shell parts that still live in campaign-ui.js
  (`_renderHeader`, `_renderModeBar`, `_renderSubTabs`,
  `_renderRecentLogStrip`, `_renderCommandRail`, `_panelLayer`) into
  a top-level `CampaignShell.tsx`. The vanilla `render()` becomes
  the React render. At that point `campaign-ui.js` is just data
  loading + action dispatch, and the file can be split.
- [ ] Drop `js/campaign/campaign-ui.js` and `js/campaign/ui/`.
  Rewrite `test_campaign_ui_bootstrap.js` against the React tree.

## Done-when gate

For every tab migration commit:

- `npm test` is green.
- The migrated tab renders identical content to the vanilla version for
  the same `CampaignState` snapshot.
- Vanilla helpers for the migrated tab are deleted (no dead code).
- No new behaviour, no new feature, no new abstractions — behaviour
  parity only.
