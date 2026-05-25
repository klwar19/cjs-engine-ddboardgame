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
- [x] **Phase B AI fix — skill range fallback.** When a single-target
  skill targets `most_clustered` or other AoE-ish strategies, fall back
  to in-range strategies if the original prefs find no target. Adds a
  final `nearest_enemy` pass so we never abandon a usable skill because
  the preferred-strategy target wasn't in range.
- [x] **Phase B AI fix — LoS validated on AoE.** `bestAoECell` now
  honours `skill.requiresLoS` even for AoE skills.
- [x] **D.1 foundation — `src/campaign/store.ts`.** Typed `useCampaignState`
  hook that subscribes to `CJS.CampaignState`. Re-renders on every state
  emit; returns a stable snapshot.

### In progress / next

- [ ] **D.1 — `CampaignShell.tsx`.** Header, world switcher, mode bar,
  sub-tabs, log strip, command rail mount, tab body mount. Initial
  implementation delegates each tab's body to the vanilla
  `CampaignUI._render*` helper via a new `renderTabBody(mount, tabId,
  state)` entry point on the vanilla side. Replace the inline-script
  bootstrap in `CampaignPage.tsx` with the shell.
- [ ] **D.1 — migrate Settings tab.** First React tab. Hand-port the
  settings panel from `campaign-ui.js`.
- [ ] **D.1 — migrate Logs tab.** Reads `state.logs`, renders entries
  with the existing `cui-log` formatters (which become a pure module).
- [ ] **D.1 — migrate Party tab.** Subscribe to party slice, render
  roster cards, dispatch through `CampaignOps`.

### Later (D.2)

- [ ] World Map tab.
- [ ] Story tab.
- [ ] Hub / Activities tab.
- [ ] Quest / Scavenge tab.
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
