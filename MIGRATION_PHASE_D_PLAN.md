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

### In progress / next

- [ ] **D.1 — migrate Party tab (roster).** 689 lines in
  `cui-party-tab.js` plus the sidebar `_renderParty` adapter. Strategy:
  use the same bridge pattern, port `renderRoster` to JSX first, then
  the sidebar variant. Keep `openSkillPoolPicker` /
  `openPassivePoolPicker` modal helpers in vanilla for now (they create
  full-screen modal overlays via the `UI` module; React will trigger
  them by calling the existing exports).

### Later (D.2)

- [ ] World Map tab (`cui-world-map-tab.js` is a 47-line adapter; the
  real renderer is `CampaignWorldMap` — likely the lightest of the
  remaining tabs).
- [ ] Story tab (`_renderStoryHome`, `_renderStoryDirector`,
  `_renderStorySummary` — branchy).
- [ ] Hub / Activities tab (`cui-hub-tab.js`, 808 lines).
- [ ] Quest / Scavenge tab (`_renderQuestHome`,
  `_renderZombieScavengeHome`).
- [ ] Drop `js/campaign/campaign-ui.js` and `js/campaign/ui/`. Drop or
  rewrite `test_campaign_ui_bootstrap.js`.

## Done-when gate

For every tab migration commit:

- `npm test` is green.
- The migrated tab renders identical content to the vanilla version for
  the same `CampaignState` snapshot.
- Vanilla helpers for the migrated tab are deleted (no dead code).
- No new behaviour, no new feature, no new abstractions — behaviour
  parity only.
