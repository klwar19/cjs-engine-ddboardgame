// campaign-ui.js
// Main Campaign Mode rendering and browser interaction binding.

window.CJS = window.CJS || {};

window.CJS.CampaignUI = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CM = () => window.CJS.ContentManager;
  const UI = () => window.CJS.UI;
  const CS = () => window.CJS.CampaignState;
  const Save = () => window.CJS.CampaignSave;
  const Bridge = () => window.CJS.CampaignCombatBridge;
  const Chat = () => window.CJS.CampaignPartyChat;
  const C = () => window.CJS.CONST;
  // (Ops / Runner / Side / SD / QP / Gen / Icons accessors removed in
  //  Phase H.4 — their last closure consumers ported to TS. The engine
  //  modules are still installed on window.CJS; TS callers reach them
  //  through their own typed accessors.)
  // Phase H.4 — the story-context cache + AI story-prompt builder moved to
  // `src/campaign/story-context.ts`. init/render/subscribe prime the async
  // cache through this surface; TS consumers import the readers directly.
  const StoryCtx = () => window.CJS.CampaignStoryContext;

  // Leaf utilities live in `src/campaign/util/cui-utils.ts` (Phase H.4).
  // The TS module installs `window.CJS.CampaignUIInternal.Utils`. Only the
  // two still used by the remaining shell/drawer code are aliased now (the
  // roster + result/story HTML clusters that used the rest have ported).
  const _CUIUtils = window.CJS.CampaignUIInternal.Utils;
  const _esc = _CUIUtils.esc;
  const _recordName = _CUIUtils.recordName;

  // Portrait / Modal / Option / Equipment alias blocks removed in Phase
  // H.4 — their consumers (the roster member-math cluster) moved into the
  // cui-party-tab.js island. TS callers import those leaf modules directly.

  // Log rendering helpers live in `src/campaign/util/cui-log.ts`. Only
  // `renderLogEntry` (the drawer log fallback) is still used here.
  const _CUILog = window.CJS.CampaignUIInternal.Log;
  const _renderLogEntry = _CUILog.renderLogEntry;

  // Phase H.4 — canonical chrome state lives in `src/campaign/chrome-state.ts`
  // (installed on window.CJS.CampaignChrome before this IIFE runs). The
  // closure-private `_activeMode` / `_activeTab` / `_activePanel` below are
  // **read-only mirrors** kept in sync via the bridge's subscribe callback;
  // every write goes through `_Chrome.set*` so the TS slice stays the single
  // source of truth. Direct assignments to these three variables are not
  // allowed — the bridge wrappers + helper writes preserve the invariant.
  const _Chrome = () => window.CJS.CampaignChrome;
  let _root = null;
  let _activeMode = 'story';
  let _activeTab = 'storyHome';
  let _booted = false;
  // When the React shell takes ownership of the chrome, this flag stops
  // `render()` from clobbering _root.innerHTML on every mutate. The
  // shell still gets notified via the `campaign:state-tick` event so it
  // can re-read getChromeData() and re-render the JSX chrome strips.
  // See `src/campaign/CampaignShell.tsx` for the consumer side.
  let _reactShellEnabled = false;
  let _combatResultUnsub = null;
  let _combatReturnEventsBound = false;
  let _lastCombatResultKey = '';
  let _activePanel = null;

  // Sync local mirrors from the TS slice. Initial snapshot first so any
  // pre-IIFE writes are picked up; then subscribe for ongoing changes.
  (() => {
    const ch = _Chrome();
    if (!ch) return;
    const snap = ch.getSnapshot();
    _activeMode = snap.mode;
    _activeTab = snap.tab;
    _activePanel = snap.panel;
    ch.subscribe((next) => {
      _activeMode = next.mode;
      _activeTab = next.tab;
      _activePanel = next.panel;
    });
  })();
  let _lastFocus = null;
  let _escBound = false;
  let _lastPendingBattleKey = '';
  let _drawerEl = null;
  let _drawerBackdropEl = null;
  let _bootIncompatibleNotice = null;
  // _mgTestLevels moved to TS module-level state in
  // src/campaign/tabs/data/minigameTest.ts (Phase H.4).
  // `_storyContextCache` + the `_ensureStoryContext` async loader cluster
  // moved to `src/campaign/story-context.ts` (Phase H.4); primed below via
  // StoryCtx().ensureStoryContext.

  // Chrome constants moved to `src/campaign/chrome-state.ts`. Read through
  // the bridge so there's exactly one source of truth between TS and JS.
  // (The pre-Phase H `MODES`/`MODE_TABS`/`UTILITY_TABS`/`TAB_TO_MODE`
  // constants were dead code from before the `APP_*` rename and have been
  // removed.)
  const APP_MODES = _Chrome().APP_MODES;
  const APP_MODE_TABS = _Chrome().APP_MODE_TABS;
  const APP_UTILITY_TABS = _Chrome().APP_UTILITY_TABS;

  // World UI profile + chrome tab/mode resolution moved to
  // `src/campaign/chrome-state.ts`. These thin wrappers keep the closure
  // call sites (chrome data builder, panel defs) unchanged so the move
  // stays minimal — drop them once those callers are ported to TS.
  function _worldUiProfile(worldId = CS().getState()?.currentWorld) {
    return _Chrome().worldUiProfile(worldId);
  }

  function _defaultTabForMode(mode, state = CS().getState()) {
    return _Chrome().defaultTabForMode(mode, state?.currentWorld);
  }

  function _appModesForState(state = CS().getState()) {
    return _Chrome().appModesForWorld(state?.currentWorld);
  }

  function _tabsForMode(mode, state = CS().getState()) {
    return _Chrome().tabsForMode(mode, state?.currentWorld);
  }

  function _normalizeActiveWorldUi(state = CS().getState()) {
    _Chrome().normalizeForWorld(state?.currentWorld);
  }

  async function init(root) {
    _root = root;
    // The loading placeholder is owned by React when the React shell is
    // enabled — skip the clobber to keep the React-rendered DOM intact.
    if (!_reactShellEnabled) {
      _root.innerHTML = '<div class="campaign-loading">Loading Campaign Mode...</div>';
    }

    try {
      await CM().loadDefaultData();
      await Chat()?.load?.();
      CS().loadContentFromDataStore();
      const loadResult = Save().loadActive();
      if (!loadResult) {
        CS().createNewSave(Object.values(CS().getContent().campaigns)[0]?.id);
        Save().saveCurrent();
      } else if (loadResult && loadResult.incompatible) {
        _bootIncompatibleNotice = {
          slotName: loadResult.save?.slotName || loadResult.save?.saveId || 'Previous Save',
          reason: loadResult.reason || 'This save was made by an older build.',
          slotId: loadResult.save?.saveId || ''
        };
        CS().createNewSave(Object.values(CS().getContent().campaigns)[0]?.id);
        Save().saveCurrent();
      }
      await window.CJS.CampaignSequences?.loadWorld?.(CS().getState()?.currentWorld || 'haven');
      await StoryCtx()?.ensureStoryContext?.(CS().getState()?.currentWorld || 'haven');
      // _bindEvents() removed (Phase H.2): the React shell forwards every
      // bridged-body data-campaign-action / -mode / -tab / -panel through
      // its <main> click/change forwarder (and the drawer's own forwarder),
      // routing to handleAction / setActive* — no campaign-root delegate.
      _bindEscapeForPanels();
      _bindCombatResultListener();
      _bindCombatReturnEvents();
      window.CJS.CampaignObjectiveBanner?.init?.();
      CS().subscribe(() => {
        Save().saveCurrent();
        StoryCtx()?.ensureStoryContext?.(CS().getState()?.currentWorld || 'haven').catch(() => {});
        render();
      });
      _booted = true;
      _consumeCombatResult();
      render();
    } catch (error) {
      console.error(error);
      if (_reactShellEnabled) {
        // React owns the chrome — surface the error through the same
        // state-tick event so CampaignShell can render its boot-error
        // banner. We stash the message on the closure so the bridge
        // surface can read it back.
        _bootIncompatibleNotice = _bootIncompatibleNotice || {
          slotName: 'Campaign Mode',
          reason: (error && error.message) || String(error),
          slotId: ''
        };
        try {
          _root.dispatchEvent(new CustomEvent('campaign:state-tick', {
            bubbles: false,
            detail: { bootError: true, message: (error && error.message) || String(error) }
          }));
        } catch (e) { /* ignore */ }
      } else {
        _root.innerHTML = `<div class="campaign-error">Campaign Mode failed to load: ${_esc(error.message || error)}</div>`;
      }
    }
  }

  function render() {
    if (!_root || !CS().getState()) return;
    const state = CS().getState();
    const campaign = CS().getCurrentCampaign();
    StoryCtx()?.ensureStoryContext?.(state.currentWorld || 'haven').catch(() => {});
    _normalizeActiveWorldUi(state);

    if (_reactShellEnabled) {
      // React owns the chrome. Skip the innerHTML clobber and let the
      // CampaignShell read fresh data via getChromeData() on the next
      // state-tick. The shell still listens for `campaign:rendered`
      // for backward compatibility with the legacy portal bridge.
      try {
        _root.dispatchEvent(new CustomEvent('campaign:state-tick', {
          bubbles: false,
          detail: { activeTab: _activeTab, activeMode: _activeMode, activePanel: _activePanel }
        }));
      } catch (e) { /* CustomEvent unsupported in some test envs — ignore */ }
      // The drawer + encounter flash + farm bind still run; React reads
      // the panel state but the drawer DOM is React-owned now so we don't
      // call `_renderPanelLayer` here. Farm and run-panel bindings run
      // after React mounts the body — same setTimeout trick.
      _flashOnNewEncounter(state);
      setTimeout(() => {
        const mapRegion = _root.querySelector('#campaign-map-region');
        if (mapRegion) window.CJS.CampaignMap.render(mapRegion);
        _bindRunPanel();
        window.CJS.CampaignStoryScenes?.openPendingNodeEntry?.();
        if (_activeTab === 'farm') window.CJS.FarmingMode?.bindControls?.(_root);
      }, 0);
      return;
    }
  }

  function _flashOnNewEncounter(state = {}) {
    const battle = state?.pendingBattle;
    if (!battle) {
      _lastPendingBattleKey = '';
      return;
    }
    const key = `${battle.source || ''}:${battle.threatId || ''}:${battle.encounterId || ''}:${battle.battleSetId || ''}:${battle.label || ''}`;
    if (key === _lastPendingBattleKey) return;
    _lastPendingBattleKey = key;
    // Any source that represents an automatic in-game trigger gets the flash
    // + popup treatment. Manual "Run Battle" clicks (source 'manual') are
    // intentionally excluded — the user already pressed a button. Sequence
    // combat nodes set source = 'sequence:<nodeId>', so we match the prefix.
    const source = String(battle.source || '');
    const autoTriggered =
      source === 'moving_threat' ||
      source === 'random' ||
      source === 'random_monster_pool' ||
      source === 'node' ||
      source === 'progress_trigger' ||
      source === 'beat' ||
      source.startsWith('sequence:') ||
      source.startsWith('quest:');
    if (!autoTriggered) return;
    const flash = document.createElement('div');
    flash.className = 'campaign-encounter-flash';
    flash.setAttribute('aria-hidden', 'true');
    document.body.appendChild(flash);
    setTimeout(() => {
      if (flash.parentNode) flash.parentNode.removeChild(flash);
    }, 720);
    // Throw the combat popup directly into the player's face. The popup
    // pauses everything underneath via body.combat-popup-open until the
    // player chooses Engage (which navigates to combat.html) or Hold.
    if (window.CJS.CampaignCombatPopup && !document.body.classList.contains('combat-popup-open')) {
      window.CJS.CampaignCombatPopup.show(battle, {
        onEngage: (b) => {
          try { Save()?.saveCurrent?.(); } catch (_) {}
          Bridge()?.openBattle?.(b);
        }
      });
    }
  }

  function _bindRunPanel() {
    const beatList = _root.querySelector('#campaign-beat-list');
    if (!beatList) return;
    beatList.querySelectorAll('[data-beat-id]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.beatId;
        const scenario = CS().getActiveScenario();
        const idx = (scenario?.beats || []).findIndex((b) => b.id === id);
        if (idx < 0) return;
        CS().mutate((state) => {
          const run = state.activeScenarioRun;
          if (run) run.currentBeatIndex = idx;
        }, { source: 'beat_jump' });
      });
    });
  }

  function _bindCombatResultListener() {
    if (_combatResultUnsub || !Bridge()?.onResult) return;
    _combatResultUnsub = Bridge().onResult((result) => {
      if (_storeCombatResult(result)) Bridge().clearResult?.();
    });
  }

  function _storeCombatResult(result) {
    if (!result) return false;
    const state = CS().getState();
    if (result.saveId && state?.saveId && result.saveId !== state.saveId) return false;
    const key = _combatResultKey(result);
    if (key && (key === _lastCombatResultKey || key === state?.lastCombatResultKey)) return true;
    _lastCombatResultKey = key;
    _Chrome().setActiveModeRaw('quest');
    _Chrome().setActiveTabRaw('maps');
    Bridge().applyResult(result);
    UI()?.toast?.(`Combat ${result.result || 'result'} applied to campaign.`, 'success');
    return true;
  }

  function _bindCombatReturnEvents() {
    if (_combatReturnEventsBound) return;
    _combatReturnEventsBound = true;
    const consume = () => _consumeCombatResult();
    window.addEventListener('focus', consume);
    window.addEventListener('pageshow', consume);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) consume();
    });
    window.setInterval(() => {
      const state = CS().getState?.();
      if (state?.pendingBattle || Bridge().readResult?.()) consume();
    }, 750);
  }

  function _combatResultKey(result) {
    return [
      result?.requestId,
      result?.saveId,
      result?.scenarioRunId,
      result?.encounterId,
      result?.completedAt,
      result?.result
    ].filter(Boolean).join('|');
  }

  // `_currencyAmounts` moved to TS in Phase H.4
  // (`src/campaign/shell/chromeData.ts`). No remaining JS callers.

  // _renderWorldGate — Phase F.12 port. Body moved to
  // `src/campaign/tabs/CampaignWorldGateTab.tsx`. Typed data flows
  // through `getWorldGateData(state)`. Per-world cards still come
  // through `_renderWorldGateCard` (kept here because the bridge calls
  // it) until the per-card banner / button logic ports.

  // `_worldGateCardData`, `_worldGateActionData`, `_pressureStripChips`,
  // and `_worldMenuDef` (with the per-world card table) moved to TS in
  // Phase H.4 (`src/campaign/tabs/data/worldGate.ts`). The TS port owns
  // the canonical world card config; `action-handlers/travel.ts`
  // imports `worldMenuDef` directly so the `travel-world-card` handler
  // can resolve a world's default tab without going through CampaignUI.

  function _modeForTab(tabId) {
    return _Chrome().modeForTab(tabId);
  }

  function _goto(mode, tab) {
    _Chrome().setActiveModeRaw(mode);
    _Chrome().setActiveTabRaw(tab);
    render();
  }

  // Party / roster rendering lives in
  // `js/campaign/ui/tabs/cui-party-tab.js`, which now owns its member-math
  // helper bundle (defaulted internally). `_renderParty` is the only
  // remaining shell caller (the command-rail drawer 'party' panel). The
  // party-sheet modal reads `PartyTab.renderPartySheetHtml` directly.
  function _renderParty(state) {
    return window.CJS.CampaignUIInternal.PartyTab.renderParty(state);
  }

  // Pool pickers + passive rank math live in
  // `js/campaign/ui/tabs/cui-party-tab.js`. The shell keeps thin
  // delegators because the action handler (`pick-equip-skill`,
  // `pick-equip-passive`) and the rank-up modal call them directly
  // from closure.
  // _openSkillPoolPicker / _openPassivePoolPicker / _passiveRankInfo /
  // _passiveRankCostText ported to action-handlers/roster-pickers.ts (H.3).

  // _renderSelectionBudgetBadge, _renderSkillPoolList, _renderPassivePoolList,
  // _renderSkillSlotView, _renderPassiveSlotView, _memberSkillPoolCount,
  // _memberPassivePoolCount, _renderKnownSkill, _renderKnownPassive,
  // _passivePerkRank, _renderKnownStatus, _renderKnownRecord all live in
  // `js/campaign/ui/tabs/cui-party-tab.js` and are only used from the
  // party tab's render pipeline now. _renderKnownItem was unused and was
  // dropped during the move.

  // Tab body delegate. The tab registry owns extracted tabs (party,
  // hub, world map); anything not in the registry falls back to the
  // shell's switch case below so migration can land tab-by-tab.
  function _renderMain(state) {
    // The vanilla render() path is only reachable when the React shell
    // is NOT enabled. In that case the Tabs registry holds the React
    // mount placeholders + the legacy per-domain renderers (party,
    // hub, world map). For tabs whose body has fully migrated to JSX
    // (Phase F), `_renderMain` returns the registry placeholder when
    // a registry entry exists, or an empty notice otherwise.
    const Tabs = window.CJS.CampaignUIInternal.Tabs;
    if (Tabs?.has?.(_activeTab)) {
      const html = Tabs.render(_activeTab, state);
      if (html != null) return html;
    }
    return '<div class="campaign-empty">Tab body is JSX-only. Run with the React shell enabled.</div>';
  }

  // The `_tabHelpers` member-math bundle moved into cui-party-tab.js in
  // Phase H.4 (the roster island owns + defaults it). Registered tabs are
  // React mount placeholders that ignore the old helpers arg, so
  // `_renderMain` no longer threads one.

  // _renderStoryHome — Phase F.11 port. Body moved to
  // `src/campaign/tabs/CampaignStoryHomeTab.tsx`. Typed data flows
  // through `getStoryHomeData(state)`. The VN hero, chapter tree,
  // choice consequence panel, AI context panel, sequence shelf,
  // pipeline, sync summary, and shared sub-panels still render as
  // HTML strings via that bridge until each helper ports.

  // _renderChoiceConsequencePanel removed in Phase G.12. Typed
  // `_choiceConsequenceData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/storyHome.ts`).

  // _renderStorySummary — Phase F.5 port. Body moved to
  // `src/campaign/tabs/CampaignStorySummaryTab.tsx`. Typed data flows
  // through `getStorySummaryData(state)`. `_storySummaryEntries` and
  // `_storySummaryTextFromRecord` stay (the bridge calls them).

  // _renderQuestHome — Phase F.6 port. Body moved to
  // `src/campaign/tabs/CampaignQuestHomeTab.tsx`. The non-zombie data
  // flows through `getQuestHomeData(state)`; the zombie variant still
  // renders via `_renderZombieScavengeHome` (returned as one HTML
  // string in the bridge data) until its own JSX port.

  // _zombieScavengeHomeData / _zombieScavengeTrackerData /
  // _worldActivitiesFor / _worldActivityPreviewData / _questPaperKind
  // moved to TS in Phase H.4 (`src/campaign/tabs/data/zombie.ts` +
  // `src/campaign/tabs/data/questHome.ts`). The zombie Quest Home + Quests
  // tracker now read their typed data directly from
  // `getQuestHomeData(state).zombie` / `getQuestPanelData(state).zombie`.

  // _renderMiniGameTest — Phase F.3 port. Body moved to
  // `src/campaign/tabs/CampaignMinigameTestTab.tsx`. Typed data flows
  // through `getMinigameTestData(state)`. The level cache and the
  // selected-game state (kept on `_root.dataset.mgTestGame`) still
  // live here so the legacy `mg-test-*` actions stay unchanged.

  // _mgTestPick ported to action-handlers/mg-test.ts (H.3). The TS
  // handler writes _root.dataset.mgTestGame via the new
  // CampaignUI.setMinigameTestGame bridge then rerenders.

  // _mgTestPlay ported to action-handlers/mg-test.ts (H.3).

  // _renderEventTypeTab — Phase F.7 port. Body moved to
  // `src/campaign/tabs/CampaignEventTab.tsx`. Typed data flows through
  // `getEventTabData(kind, state)`. `_renderEventHome`,
  // `_renderEventHomeClean`, and `_renderEventFileButtons` were dead
  // (only used by `_renderEventTypeTab`) and have been removed.
  // `_eventFileKind` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/eventTab.ts`).

  // _renderEventLog / _renderEventLogEntry — Phase F.2 port. The body
  // moved to `src/campaign/tabs/CampaignEventLogTab.tsx` (JSX). Typed
  // data comes through `getEventLogData(state)`. The two shared
  // sub-panels (event result, oracle) ported in Phase G.2 to typed
  // bridges `getEventResultData(state)` / `getOracleData(state)` —
  // see `src/campaign/tabs/ResultPanels.tsx`.

  // _renderActiveSequence / _renderSequenceNode / _sequenceNodeMeta
  // removed in Phase G.8. _renderSequenceShelf /
  // _renderSequenceDeliveryState / _renderSequenceActionButton /
  // _renderStorySequenceMeta / _renderStorySequenceStatus removed in
  // Phase G.10. The React `SequenceShelfPanel` + `SequenceCard`
  // (`src/campaign/tabs/SequenceCard.tsx`) own this rendering now.
  // The bridge `getSequenceShelfData` returns typed shelf data; the
  // bridge `_sequenceShelfEntryData` produces per-entry typed records.

  // `_storyChapterText` moved to `src/campaign/story-context.ts` in Phase
  // H.4 — it was used only by the AI story-prompt builder, which now lives
  // there alongside the story-context cache.

  // `_storySequenceSummary`, `_storySequenceActionLabel`,
  // `_storySequenceMetaChips`, `_storySequenceStatusLabel`,
  // `_sequenceDeliveryData`, `_sequenceActionData`,
  // `_sequenceShelfEntryData`, `getSequenceShelfData`,
  // `_sequenceDeliveryStatus`, `_sequenceDeliveryBlocked`,
  // `_sequenceDeliveryNote` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/sequence.ts`). The shelf + per-entry data
  // builders are now consumed directly by the React tabs (storyHome,
  // event tab) — no remaining JS callers.

  // `_storyPipelineSnapshot`, `_chapterTreeData`, `_chapterTreeNodeData`,
  // `_storyPipelinePanelData`, `_syncSummaryData`, `_shortenPanelLabel`
  // moved to TS in Phase H.4 (`src/campaign/tabs/data/storyHome.ts`).

  // `_storySummaryEntries` + `_storySummaryTextFromRecord` removed in Phase
  // H.4 — they were orphaned when `getStorySummaryData` ported to TS
  // (`src/campaign/tabs/data/storySummary.ts`, which carries its own
  // `storySummaryEntries`). No remaining JS callers.

  // _renderGachaHomeHero removed in Phase G.17 — its only caller, the
  // HTML _renderZombieScavengeHome, is gone. The zombie scavenge hero
  // is JSX now (`src/campaign/tabs/ZombieScavenge.tsx`); other gacha
  // heroes (Quest Home, Event tabs) were already inline JSX.

  // TOOL_PURPOSES, _renderInlinePurpose, _purposeTone, _purposeKeyForCard
  // live in src/campaign/util/cui-controls.ts (bound as aliases at the top).

  // _renderOverview — Phase F.4 port. Body moved to
  // `src/campaign/tabs/CampaignOverviewTab.tsx`. The outer dashboard
  // and Adventure Desk (3 control groups, 13 buttons) are JSX. The 12
  // shared sub-panels still come through the HTML bridge
  // `renderOverviewSectionHtml(sectionId, state)`; each one migrates
  // independently by replacing its <Section> with a JSX render.

  // _renderStoryDirector — Phase F.13 port. Body moved to
  // `src/campaign/tabs/CampaignStoryDirectorTab.tsx`. Typed data flows
  // through `getStoryDirectorData(state)`. All sub-panels (VN hero,
  // solo guide, action deck, stage rail, director card, pressure
  // board, side flow, clues, queue, truths) still render as HTML
  // strings via that bridge until each helper ports.

  // `_storyTheme`, `_storyVnHeroData`, `_storyActionBtnData`,
  // `_storyNextStepData`, `_videoTypeFromPath`, `_storyNextStep`,
  // `_storyStageRailData`, `_storyDirectorCardData` moved to TS in
  // Phase H.4 (`src/campaign/tabs/data/storyShared.ts` +
  // `src/campaign/tabs/data/storyDirector.ts`).

  // _storyThemeStyle removed in Phase G — the React story tabs set the
  // theme CSS vars (`--story-backdrop/accent/danger`) via typed
  // `themeStyleVars` style props instead of an inline style string.

  // _renderStoryVnHero removed in Phase G.11a. The React
  // `StoryVnHero` (`src/campaign/tabs/StoryDirector.tsx`) renders
  // the hero from the typed `vnHero` data produced by the TS
  // `storyVnHeroData` helper.

  // _renderStoryDirectorEmptyCard removed in Phase G.11b. The
  // React `StoryDirectorCard` falls back to an empty-card JSX
  // when `data.lastCard === null`.

  // _renderStorySoloGuide / _renderStoryActionDeck removed in Phase
  // G.11a. The React `StorySoloGuide` and `StoryActionDeck`
  // components (`src/campaign/tabs/StoryDirector.tsx`) render their
  // bodies from the typed data on `StoryDirectorData`.

  // `_renderStoryDirectorCard` + `_renderStoryRouteChoices` ported to TS in
  // Phase H.4 — see `renderStoryDirectorCardHtml` in
  // `src/campaign/action-handlers/story-director-card.ts`. The beat modal
  // (`story-director-modals.ts`) calls it directly; only the modal render
  // path survived (the non-modal action-grid branch was dead).

  // `_storyPressureBoardData`, `_storyCluesPanelData`,
  // `_storyQueuePanelData`, `_storyTruthsPanelData`,
  // `_storySideFlowData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/storyDirector.ts`).

  // `getAdventureLegendVisible` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/overview.ts`).

  // Hub tab body renderers (`sideForge`, `questChains`, `oracleForge`,
  // `battleSets`, `mapSeeds`) live in `js/campaign/ui/tabs/cui-hub-tab.js`.
  // The tab registry already routes them; no shell stubs are needed.

  // Shared hub-flavored primitives kept as closure delegators so the
  // story home, overview, event log, and manual builder can keep
  // calling them without learning about the hub tab module.
  // _renderTownSnapshot / _renderTownRollFloat removed in Phase G.16 —
  // the Overview tab now reads typed `getTownSnapshotData(state)` /
  // `getTownRollFloatData(state)` and renders JSX via
  // `src/campaign/tabs/TownPanels.tsx`.

  // `_openRumors` (a thin wrapper over CampaignUIInternal.HubTab.openRumors)
  // removed in Phase H.4 — its only caller, the manual event builder's
  // rumor-options helper, moved to `action-handlers/event-builder.ts`,
  // which calls HubTab.openRumors directly.

  // Phase G.14 — typed quest-chain data for the EventTab side-story
  // cards. The HubTab still renders chains as HTML for its own
  // questChains tab body; that path ports later (K.3). Until then,
  // these typed builders read the same chain shape and produce
  // structured data the React tree consumes.
  // `_questChainStepData`, `_questChainStepSystems`, `_questChainStakesData`,
  // `_questChainVnPanelData`, `_questChainActiveData`,
  // `_questChainTemplateData`, `_sideStoryFlowGuideData`,
  // `_questChainResolvedData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/questChain.ts`). Shared between the
  // EventTab side variant and the questChains hub tab.

  // _startQuestChainRun / _startQuestChainScenario / _questChainBattle /
  // _ensureQuestChainQuest ported to action-handlers/quest-chain.ts (H.3 —
  // start-chain / chain-scenario / chain-battle). The chain launcher
  // also feeds `_startQuestRunFromOffer` for cards carrying a
  // questChainTemplateId — that path is fully TS now via solo.ts.

  // _addQuestChainToTracker / _advanceQuestChainStep / _completeQuestChain
  // / _failQuestChain ported to action-handlers/quest-chain.ts (H.3).

  // Consequence preview, flavor trail, and card-choice-ops helpers
  // all live in `js/campaign/ui/tabs/cui-hub-tab.js`. The story home,
  // event log, manual builder, and overview keep calling them through
  // these thin closure delegators. (renderSideCard / renderChoiceConsequence
  // / operationTone delegators were removed once their last campaign-ui
  // callers ported to JSX — HubTab still owns the implementations.)
  // The consequence-preview / flavor-trail / card-choice-ops /
  // consequence-summary delegators to CampaignUIInternal.HubTab were
  // removed in Phase H.4 — their last JS consumers (`_renderStoryRouteChoices`
  // and `_renderSoloNotice`) ported / went dead. TS consumers call HubTab
  // directly (the story-director card + result/side panels in
  // `src/campaign/tabs/data/*`).

  // _impactLegendItem, _controlGroup, _actionMenu, _actionBtn live in
  // src/campaign/util/cui-controls.ts (bound as aliases at the top).

  // `_renderSoloNotice` removed in Phase H.4 — it was dead since G.3
  // replaced it with the JSX `SoloNoticePanel`
  // (`src/campaign/tabs/ResultPanels.tsx`, fed by `getSoloNoticeData`).
  // The only remaining reference was the (also-dead) `_tabHelpers` bundle
  // entry. Its `_pendingSoloHookCard` / `_clearPendingSoloHook` helpers
  // went with it; TS callers use the copies in
  // `src/campaign/util/state-helpers.ts` + `action-handlers/solo.ts`.

  // _renderScenarioSummary — Phase G.5 port. Body moved to
  // `src/campaign/tabs/ResultPanels.tsx`. Typed bridge
  // `getScenarioSummaryData(state)` produces the data (incl. the typed
  // `questRunTask`).

  // `_renderQuestRunTask` ported to TS in Phase H.4 — see
  // `buildQuestRunTask` in `src/campaign/tabs/data/resultPanels.ts`.

  // _renderPendingBattle / _renderTravelSurprise — Phase G.4 port.
  // Bodies moved to `src/campaign/tabs/ResultPanels.tsx`. Typed
  // bridges `getPendingBattleData(state)` / `getTravelSurpriseData(state)`
  // produce the data. `_battleSourceLabel`, `_renderBattlePartySummary`,
  // `_renderPendingBattleContext` stay because they're sub-renderers.

  // `_battleSourceLabel`, `_renderBattlePartySummary`,
  // `_renderCombatConsequenceNotice`, `_renderLootSummary`,
  // `_renderCombatPulseSummary`, `_renderPendingBattleContext` and the
  // matching `getCombatResultData` / `getLastCombatResultData` /
  // `getPendingBattleData` data builders ported to TS in Phase H.4
  // (`src/campaign/tabs/data/resultPanels.ts`). The pure-state-read
  // versions read CampaignCombatBridge + CampaignQuestPulse directly,
  // matching the JS originals exactly.

  // _renderEventResult / _renderManualEventSummary / _renderOracle —
  // Phase G.2 port. Bodies moved to
  // `src/campaign/tabs/ResultPanels.tsx`. Typed bridges
  // `getEventResultData(state)` / `getOracleData(state)` produce the
  // data; the JSX consumes it directly. Inline-purpose chip,
  // consequence-preview, and flavor-trail HTML chunks still come from
  // their HubTab/Controls renderers and embed via small bridges.

  // _renderLastReport — Phase G.4 port. Body moved to
  // `src/campaign/tabs/ResultPanels.tsx`. Typed bridge
  // `getLastReportData(state)` produces the data.

  function _renderInventorySnapshot(state, opts = {}) {
    const buckets = [
      ['items', 'Items'],
      ['materials', 'Materials'],
      ['food', 'Food'],
      ['questItems', 'Quest Items']
    ];
    const rows = buckets.flatMap(([bucket, label]) => Object.entries(state.inventory?.[bucket] || {})
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ bucket, label, id, qty })));
    const visible = opts.full ? rows : rows.slice(0, 8);
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Inventory</h2><button class="campaign-icon-btn" data-campaign-action="open-inventory-tab">Open Full</button></div>
        ${visible.length ? visible.map((row) => `
          <div class="campaign-log-line">
            <span>${_esc(_recordName(row.bucket, row.id))}</span>
            <small>${_esc(row.label)} x${row.qty}</small>
          </div>
        `).join('') : '<div class="campaign-empty">No inventory yet.</div>'}
      </section>
    `;
  }

  function _renderNotesPanel(state) {
    const notes = state.pinnedNotes || [];
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head">
          <h2>Pinned Notes</h2>
          <button class="campaign-icon-btn" data-campaign-action="add-note">+ Add</button>
        </div>
        ${notes.length
          ? notes.map((note) => `<div class="campaign-log-line">${_esc(note.text || note)}</div>`).join('')
          : '<div class="campaign-empty">No pinned notes yet.</div>'}
      </section>
    `;
  }

  /* ── Command Rail + Drawer Overlay System ─────────────────── */

  const PANEL_DEFS = {
    party:     { icon: '👥', label: 'Party',  title: 'Party' },
    inventory: { icon: '📦', label: 'Items', title: 'Inventory' },
    quests:    { icon: '📜', label: 'Quests', title: 'Quest Log' },
    log:       { icon: '🪶', label: 'Log',    title: 'Campaign Log' },
    notes:     { icon: '📝', label: 'Notes',  title: 'Pinned Notes' },
  };
  const RAIL_ORDER = ['party', 'inventory', 'quests', 'log', 'notes'];

  function _panelDefsForState(state = CS().getState()) {
    const profile = _worldUiProfile(state?.currentWorld);
    const hidden = new Set(profile.hiddenPanels || []);
    const out = {};
    for (const [id, def] of Object.entries(PANEL_DEFS)) {
      if (hidden.has(id)) continue;
      out[id] = { ...def, ...(profile.panelLabels?.[id] || {}) };
    }
    return out;
  }

  function _openPanel(panelId) {
    if (!_panelDefsForState()[panelId]) return;
    if (_activePanel === panelId) {
      _closePanel();
      return;
    }
    _lastFocus = document.activeElement;
    _Chrome().setActivePanelRaw(panelId);
    if (_reactShellEnabled) {
      // React owns the drawer + chrome class. Just trigger a state-tick;
      // the shell will render the drawer portal and add the has-drawer-open
      // class on its own. Focus management still runs after React mounts.
      render();
      requestAnimationFrame(() => {
        const drawer = document.querySelector('.campaign-drawer');
        const focusTarget = drawer?.querySelector('button, [tabindex], a, input, select, textarea');
        focusTarget?.focus?.();
      });
      return;
    }
    _renderPanelLayer({ rebuild: true });
    _root.querySelector('.campaign-shell')?.classList.add('has-drawer-open');
    _root.querySelectorAll('.campaign-rail-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.campaignPanel === panelId);
    });
    requestAnimationFrame(() => {
      const focusTarget = _drawerEl?.querySelector('button, [tabindex], a, input, select, textarea');
      focusTarget?.focus?.();
    });
  }

  function _closePanel() {
    if (!_activePanel) return;
    _Chrome().setActivePanelRaw(null);
    if (_reactShellEnabled) {
      render();
      if (_lastFocus && document.contains(_lastFocus)) {
        try { _lastFocus.focus(); } catch (e) { /* ignore */ }
      }
      _lastFocus = null;
      return;
    }
    _renderPanelLayer({ rebuild: true });
    _root.querySelector('.campaign-shell')?.classList.remove('has-drawer-open');
    _root.querySelectorAll('.campaign-rail-btn.is-active').forEach((btn) => btn.classList.remove('is-active'));
    if (_lastFocus && document.contains(_lastFocus)) {
      try { _lastFocus.focus(); } catch (e) { /* ignore */ }
    }
    _lastFocus = null;
  }

  function _tearDownDrawer() {
    if (_drawerBackdropEl) {
      _drawerBackdropEl.remove();
      _drawerBackdropEl = null;
    }
    if (_drawerEl) {
      _drawerEl.remove();
      _drawerEl = null;
    }
  }

  function _renderPanelLayer(opts = {}) {
    const state = CS().getState();
    if (!_activePanel) {
      _tearDownDrawer();
      return;
    }
    const def = _panelDefsForState(state)[_activePanel];
    if (!def) return;

    const activeEl = document.activeElement;
    const editing = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
    const editingInDrawer = editing && _drawerEl?.contains(activeEl);
    const sameWrapper = !opts.rebuild && _drawerEl && _drawerEl.dataset.panelId === _activePanel;
    if (sameWrapper && editingInDrawer) return;

    if (sameWrapper) {
      const body = _drawerEl.querySelector('.campaign-drawer-body');
      if (body) body.innerHTML = _renderDrawerBody(_activePanel, state);
      return;
    }

    _tearDownDrawer();

    _drawerBackdropEl = document.createElement('div');
    _drawerBackdropEl.className = 'campaign-drawer-backdrop';
    _drawerBackdropEl.addEventListener('click', (e) => {
      if (e.target === _drawerBackdropEl) _closePanel();
    });

    _drawerEl = document.createElement('aside');
    _drawerEl.className = 'campaign-drawer';
    _drawerEl.setAttribute('role', 'dialog');
    _drawerEl.setAttribute('aria-modal', 'true');
    _drawerEl.setAttribute('aria-label', def.title);
    _drawerEl.dataset.panelId = _activePanel;
    _drawerEl.innerHTML = `
      <header class="campaign-drawer-head">
        <h2>${_esc(def.title)}</h2>
        <button class="campaign-drawer-close" data-campaign-panel-close="1" aria-label="Close panel">×</button>
      </header>
      <div class="campaign-drawer-body">${_renderDrawerBody(_activePanel, state)}</div>
    `;
    _drawerEl.addEventListener('click', (e) => {
      if (e.target.closest('[data-campaign-panel-close]')) {
        _closePanel();
        return;
      }
      const action = e.target.closest('[data-campaign-action]');
      if (action) {
        e.preventDefault();
        const closesPanel = [
          'open-inventory-tab', 'open-roster-tab', 'open-scenarios-tab', 'open-maps-tab',
          'open-quests-tab', 'open-shops-tab', 'open-sideforge-tab', 'open-story-home',
          'open-quest-home', 'open-event-home', 'open-farm-tab', 'open-event-stories-tab',
          'open-event-battles-tab', 'open-event-log'
        ];
        if (closesPanel.includes(action.dataset.campaignAction)) _closePanel();
        _handleAction(action.dataset, action);
      }
    });

    document.body.appendChild(_drawerBackdropEl);
    document.body.appendChild(_drawerEl);
  }

  function _renderDrawerBody(panelId, state) {
    switch (panelId) {
      case 'party':
        return _renderParty(state);
      case 'inventory':
        try {
          const html = window.CJS.CampaignInventory?.render?.();
          if (typeof html === 'string' && html.length) return html;
        } catch (e) { /* fall through */ }
        return _renderInventorySnapshot(state, { full: true });
      case 'quests':
        return typeof _renderQuestPanel === 'function' ? _renderQuestPanel(state) : _renderQuestsFallback(state);
      case 'log':
        // Drawer side-panel keeps using the compact fallback — the React
        // Logs tab owns the main-panel variant.
        return _renderLogFallback(state);
      case 'notes':
        return _renderNotesPanel(state);
      default:
        return '<div class="campaign-empty">Panel not implemented.</div>';
    }
  }

  function _renderQuestsFallback(state) {
    const quests = Object.values(state.quests || {});
    if (!quests.length) return '<div class="campaign-empty">No quests.</div>';
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>All Quests</h2></div>
        ${quests.map(_renderQuestMini).join('')}
      </section>
    `;
  }

  function _renderLogFallback(state) {
    const log = state.log || [];
    if (!log.length) return '<div class="campaign-empty">No log entries.</div>';
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Campaign Log</h2></div>
        ${log.map((line) => _renderLogEntry(line, { compact: true })).join('')}
      </section>
    `;
  }

  function _bindEscapeForPanels() {
    if (_escBound) return;
    _escBound = true;
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !_activePanel) return;
      if (document.querySelector('.modal-overlay')) return;
      e.stopPropagation();
      _closePanel();
    });
  }

  function _renderQuestMini(quest) {
    const first = quest.objectives?.[0];
    return `
      <div class="campaign-quest-mini">
        <strong>${_esc(quest.title || quest.id)}</strong>
        <div class="campaign-muted">${first ? `${_esc(first.label)} ${first.current || 0}/${first.required || 1}` : _esc(quest.summary || '')}</div>
      </div>
    `;
  }

  // _renderScenarios — Phase F.8 port. Body moved to
  // `src/campaign/tabs/CampaignScenariosTab.tsx`. Typed data flows
  // through `getScenariosData(state)`. Per-card "run actions" and the
  // shape/quest pill HTML are still produced by the closure-private
  // helpers below (`_renderScenarioRunActions`, `_renderShapePills`,
  // `_scenarioQuestPill`); the JSX embeds them via dangerouslySetInnerHTML
  // until those helpers themselves port to typed renderers.

  // `_scenarioRunActionsData`, `_scenarioQuestPillData`, `_shapePillsData`,
  // `_beatIcon`, and the `SHAPE_*_LABELS` tables moved to TS in Phase H.4
  // (`src/campaign/tabs/data/scenarioShared.ts`). The `getShapePillsData`
  // JS export also went away — TS callers now import the helper directly.

  // _renderQuestPanel — Phase F.10 port. Body moved to
  // `src/campaign/tabs/CampaignQuestsPanelTab.tsx`. Typed data flows
  // through `getQuestPanelData(state)`. The zombie variant still
  // renders via `_renderZombieScavengeTracker` (returned as one HTML
  // string in the bridge data) until its own JSX port.

  // _worldHomeHeroStyle removed in Phase G.17 — its only caller
  // (_renderGachaHomeHero) is gone. JSX heroes read the resolved
  // backdrop URL via `_worldHomeBackdropUrl()` and set the CSS var
  // through a typed style prop.

  // `_cssVarAssetUrl` moved to `src/campaign/util/cui-utils.ts` and
  // bound as an alias at the top of this IIFE (Phase H.4).

  // _renderZombieScavengeTracker + `_zombieScavengeTrackerData` moved
  // to TS in Phase H.4 (`src/campaign/tabs/data/zombie.ts`). The zombie
  // Quests tracker reads typed `getQuestPanelData(state).zombie` and
  // renders JSX via `src/campaign/tabs/ZombieScavenge.tsx`. The legacy
  // quest rows reuse the shared typed `getQuestRowData` + `<QuestRow>`.

  // _renderQuestRow / _renderQuestObjective / _renderQuestVariant
  // removed in Phase G.17. The shared QuestRow ported to JSX in G.1
  // (`src/campaign/tabs/QuestRow.tsx` + typed `getQuestRowData`); the
  // zombie scavenge tracker (its last HTML caller) ported in G.17.

  // `_renderContextTags` moved to `resultPanels.ts` in Phase H.4 as a
  // private helper shared by the combat pulse / pending battle data
  // builders.

  // _renderObjectivePulseHint removed in Phase G.17 (its only caller,
  // the HTML _renderQuestObjective, is gone). The JSX QuestRow renders
  // objective pulse hints from `getQuestRowData`'s typed pulseHints.

  // `_triggerLabel` removed in Phase H.4 — it was orphaned once the HTML
  // quest-objective renderer ported in G.17. The TS copy is `triggerLabel`
  // in `src/campaign/tabs/data/questRow.ts` (+ `questChain.ts`).

  // `_renderPendingBattleContext` and `_renderCombatPulseSummary`
  // moved to `resultPanels.ts` in Phase H.4 alongside the data builders
  // that consume them.

  // `_questNextObjective` / `_questObjectiveDone` / `_isQuestResolved`
  // ported to TS in Phase H.4 (`src/campaign/util/state-helpers.ts` as
  // `questNextObjective` / `questObjectiveDone` / `isQuestResolved`).
  // Their last JS callers (`_renderQuestRunTask`, the dead
  // `_questObjectiveByKinds` / `_activeQuestById`) are gone too.

  // `_scenarioObjectiveMeta` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/scenarioShared.ts`).

  // `_questMiniGameObjective` and `_questStatusClass` moved to TS in
  // Phase H.4 (`src/campaign/util/state-helpers.ts`). No remaining JS
  // callers (the only one was JS `getQuestRowData`, also ported).

  // `_runQuestPill` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/scenarioShared.ts`). Shared by the TS
  // `getRunData` and `getScenarioSummaryData` builders.

  // `_questScenarioPill` moved to TS in Phase H.4 (alongside
  // `getQuestRowData` in `src/campaign/tabs/data/questRow.ts` — it was
  // the only caller).

  // The Session Log panel (`tab: logs`) and the Save Manager / Settings
  // panel (`tab: settings`) are owned by React — see
  // `src/campaign/tabs/CampaignLogsTab.tsx` and
  // `src/campaign/tabs/CampaignSettingsTab.tsx`. The vanilla shell's
  // `_renderMain` consults `CampaignUIInternal.Tabs` first, which the
  // React bridge in `js/campaign/ui/tabs/cui-react-bridge.js` populates
  // with mount-point placeholders for each migrated tab.
  //
  // `_renderLogEntry`, `_logKind`, `_logMeta`, `_formatLogTime` live in
  // `src/campaign/util/cui-log.ts` (Phase H.4); the React side reuses them
  // so categorisation stays consistent with the recent-log strip in the
  // header (which is still vanilla-rendered).
  // _bindEvents removed in Phase H.2. The campaign-root click/change
  // delegation moved into the React shell: `CampaignShell.tsx` forwards
  // every bridged-body `data-campaign-action` / `-mode` / `-tab` /
  // `-panel` (external-module tabs, maps, roster detail row) through its
  // `<main>` onClick/onChange to `handleAction` / `setActive*`, and the
  // hidden import-file input's change runs `importSaveFile`. Migrated JSX
  // tabs already dispatch via onClick. The drawer keeps its own forwarder.

  // Phase H.1 — public typed action boundary. React components call
  // `CampaignActions.dispatchCampaignAction(name, data)` which routes
  // here directly (no synthetic DOM-button click). The shell `<main>`
  // + drawer click forwarders and modal-local click delegates also
  // funnel through this entry. `data` carries camelCase keys that
  // mirror the dataset names each handler reads (id, choice, worldId,
  // targetTab, tab, mode, table, bucket, dir, tool, x, y, ...).
  function handleAction(name, data = {}) {
    return _handleAction({ campaignAction: String(name), ...data });
  }

  // Phase H.3 complete — every CampaignActionName resolves through the
  // TS registry on window.CJS.CampaignActionsRuntime. The full port
  // map (closure helper → action-handlers/<module>.ts) lives in the
  // registry source + MIGRATION_PHASE_D_PLAN.md; this function is
  // intentionally tiny. (H.4 may move it into the runtime itself.)
  function _handleAction(data) {
    const runtime = window.CJS.CampaignActionsRuntime;
    return runtime?.has?.(data.campaignAction)
      ? runtime.run(data.campaignAction, data)
      : undefined;
  }

  // Save-management handlers (_newSave / _loadSlot / _deleteSlot /
  // _deleteAllSaves / _exportSlot / _pushGitHub) ported to
  // src/campaign/actions.ts + registered in action-handlers/registry.ts (H.3).

  // _rollOracle ported to action-handlers/oracle.ts (H.3).

  // _eventChoices / _pickEvent ported to action-handlers/events.ts (H.3).

  // _customEvent ported to action-handlers/manual-builders.ts (H.3 —
  // bridge-wrapped). The TS handler calls CampaignUI.openManualEventBuilder.

  // _doRelActivity / _relationshipNarrativeModal ported to
  // action-handlers/downtime.ts (H.3).

  // `_ensureStoryContext`, `_loadStoryContextFile`, `_loadStoryContextJson`,
  // `_storyContextFor`, and `_aiStoryContextData` (+ the `_renderAiStory-
  // ContextPanel` removed back in G.12) moved to
  // `src/campaign/story-context.ts` in Phase H.4. The async cache primes
  // through `StoryCtx().ensureStoryContext` (init/render/subscribe); the
  // Story Home panel reads `aiStoryContextData` directly from the TS port.

  // The Manual Event Builder (`_openManualEventBuilder`) and its 14
  // sub-helpers (draft/from-body, ops, reward ops, summary text, short
  // summary, keyword bank/prompt, rumor/battle/layer/character options,
  // tag list, event tags) moved to
  // `src/campaign/action-handlers/event-builder.ts` in Phase H.4. The
  // custom-event / oracle-to-event-builder handlers call
  // `openManualEventBuilder` directly; the `openManualEventBuilder`
  // bridge is gone.

  // _oracleChoices / _pickOracle / _customOracle ported to
  // action-handlers/oracle.ts (H.3).

  // _battleReroll / _battleOverride ported to action-handlers/combat.ts (H.3).

  // _rollHubPulse ported to action-handlers/rumor.ts (H.3).

  // _rollSoloSurprise / _offerRandomRumor ported to action-handlers/solo.ts (H.3).

  // _offerRandomQuest / _randomQuestOfferCard / _questTemplateWeight /
  // _startQuestRunFromOffer / _questFromOfferCard ported to
  // action-handlers/solo.ts (H.3 — random-quest-offer +
  // startQuestRunFromOffer used by accept-solo-hook). Internal callers
  // that previously called these closures now share the TS path through
  // solo.ts exports.

  // _setPendingSoloHook ported to action-handlers/solo.ts (H.3).

  // `_pendingSoloHookCard` / `_clearPendingSoloHook` removed in Phase H.4 —
  // their last JS caller (`_renderSoloNotice`) went dead with G.3's JSX
  // SoloNoticePanel. TS consumers use `pendingSoloHookCard` in
  // `src/campaign/util/state-helpers.ts` and the mutation copy in
  // `action-handlers/solo.ts`.

  // _acceptSoloHook / _soloHookToQuest / _soloHookToRumor ported to
  // action-handlers/solo.ts (H.3). Red-risk confirm copy, op payloads,
  // mutation sources and mode/tab jumps mirror the deleted closures.

  // _saveSoloHook / _ignoreSoloHook ported to action-handlers/solo.ts (H.3).

  // _applySideChoice / _saveSideIdea / _rejectSideIdea / _dismissSideCard
  // / _clearCurrentSideCard ported to action-handlers/side.ts (H.3).

  // _rumorById / _resolveRumor / _rumorToQuest / _rumorToProblem ported to
  // action-handlers/rumor.ts (H.3).

  // _copySideCard ported to action-handlers/side.ts (H.3).

  // _copyBattleCard / _copyMapSeed ported to action-handlers/forge.ts (H.3).
  // _rollForgeOracle ported to action-handlers/oracle.ts (H.3).

  // _rollStoryDirector ported to action-handlers/story-director-modals.ts (H.3).

  // _playSequenceMiniGame + the mini-game session machinery
  // (_miniGameConfig / _openMiniGameSession / _miniGameStoryContext /
  // _normalizeMiniGameConversation / _asOps / _defaultMiniGameConversation /
  // _questMiniGameContextText / _miniGameContextWinOps / _showMiniGameBriefing /
  // _applyMiniGameResult) ported to action-handlers/minigame.ts (H.3).

  // _completeSequenceFromUi ported to action-handlers/sequence.ts (H.3).

  // _saveStoryDirectorBeat / _rejectStoryDirectorBeat /
  // _applyStoryDirectorChoice ported to action-handlers/story-director.ts
  // (H.3). The beat modal below routes its follow-ups via the registry.

  // _openLastStoryBeatModal / _openStoryBeatModal ported to
  // action-handlers/story-director-modals.ts (H.3). The card body still
  // comes from _renderStoryDirectorCard via the CampaignUI bridge method
  // renderStoryDirectorCardHtml (G.11b keeps the renderer in JS).

  // _manualStoryNote + the manual scene/branch builder
  // (`_openManualSceneBuilder` + `_saveAsManualNote`) moved to
  // `src/campaign/action-handlers/scene-builder.ts` in Phase H.4. The
  // `story-manual-note` action handler (manual-builders.ts) calls the TS
  // `openManualSceneBuilder` directly; the `openManualSceneBuilder` bridge
  // is gone.

  // _copyStoryPrompt ported to action-handlers/story-tools.ts (H.3).
  // The AI story-prompt builder cluster moved to
  // `src/campaign/story-context.ts` in Phase H.4:
  // `_storyContextPromptText`, `_storyContextIndexPromptText`,
  // `_worldStoryContextPromptText`, `_liveGmStoryPromptText`,
  // `_storyPromptText`, `_markdownPromptExcerpt`, `_compactPromptLine`.
  // The `story-copy-prompt` action handler imports `storyPromptText` +
  // `ensureStoryContext` directly from that module (no bridge hop).

  // _openCopyTextModal ported to action-handlers/copy.ts (H.3), exposed on
  // window.CJS.CampaignCopy for _copyStoryPrompt until the story tools port.

  // _openStoryHelpModal ported to action-handlers/story-tools.ts (H.3).
  // Static info modal — no closure dependencies, so the TS port is
  // a direct copy of the HTML body + UI.openModal call.

  // _setStoryDirectorStage / _syncStoryDirectorSideQuests ported to
  // action-handlers/story-director.ts (H.3).

  // _importSidePack / _exportSidePack / _sideCardById ported to
  // action-handlers/side.ts (H.3).

  // _saveOracleNote / _oracleToEventLog ported to
  // action-handlers/oracle.ts (H.3).

  // _oracleToQuest ported to action-handlers/events.ts (H.3).

  // _oracleToEventBuilder ported to action-handlers/manual-builders.ts
  // (H.3 — bridge-wrapped). The TS handler seeds the manual event
  // builder from state.lastOracle and calls CampaignUI.openManualEventBuilder.

  // _oracleAddTags / _applyEvent / _editEvent / _eventToQuest / _eventLogOnly /
  // _eventAddTags / _noteEvent / _ignoreEvent / _pinPlotSeed / _eventToOracle /
  // _copyEventSummary / _eventSummary / _addQuestFromPrompt / _tagPromptModal /
  // _copyPlainText ported to action-handlers/events.ts + copy.ts (H.3).

  // The Manual Quest Builder (`_openQuestModal`) + its helpers
  // (`_questBuilderMiniGame`, `_parseMiniGameConversation`,
  // `_randomizedQuestTemplate`, `_inferObjectiveKind`, the
  // DEFAULT_QUEST_MINIGAME_CONTEXT + QUEST_OBJECTIVE/REWARD/CONSEQUENCE
  // preset tables) moved to
  // `src/campaign/action-handlers/quest-builder.ts` in Phase H.4. The
  // add-quest handler (manual-builders.ts) calls `openQuestModal`
  // directly; the `openQuestModal` bridge is gone.

  // _manualRumorModal ported to action-handlers/solo.ts (H.3).

  // _generateScenario + _inspectScenario ported to
  // action-handlers/scenario.ts (H.3 — generate-scenario / inspect-scenario).
  // The React `CampaignScenariosTab` now passes the form state in the
  // dispatch payload; internal launchers (`_startQuestScenario` etc.) call
  // `window.CJS.CampaignActionsRuntime.run('generate-scenario', overrides)`
  // for the same payload-shaped contract.

  // _startScenarioFromUi / _discardGeneratedScenario / _cancelScenario
  // ported to action-handlers/scenario.ts (H.3).

  // _setMapLayer / _moveNode / _moveCell / _clearNode ported to
  // action-handlers/map.ts (H.3).

  // _runBattle / _runRollBattle / _runPickBattle / _runQueueSetBattle /
  // _runNextBeat / _manualBattleModal / _applyCombatResult ported to
  // action-handlers/combat.ts (H.3). The shared battle-pool helpers
  // (_fallbackBattlePool / _pickContextualBattle / _battleContext* /
  // _battleMapFor* / _battleDefeatFields) ported to
  // action-handlers/battle-pool.ts, exposed on window.CJS.CampaignBattlePool
  // for the still-in-JS manual event builder.

  // _shopBuy / _shopStock / _inventoryDelta / _quickAddInventory /
  // _plantSeed / _craftRecipe / _addPocketNote / _addPinnedNote ported to
  // src/campaign/action-handlers/economy.ts (H.3).

  // ── POCKET HAVEN FACILITIES ────────────────────────────────────
  // _havenBuildFacility / _havenUpgradeFacility / _havenRanchCollect
  // ported to action-handlers/haven.ts (H.3).

  // _havenTrainSkill / _havenRanchAssign ported to
  // action-handlers/haven.ts (H.3). _openCookingMinigame ported to
  // action-handlers/cooking.ts (H.3).

  // _havenPlayMinigame ported to action-handlers/minigame.ts (H.3).
  // _openGuildTrivia ported to action-handlers/haven.ts (H.3).

  // _questProgress ported to action-handlers/quest.ts (H.3).

  // _questScenario / _questBattle ported to
  // action-handlers/quest-launcher.ts (H.3 — quest-scenario / quest-battle).
  // _startQuestScenario / _startExistingQuestScenario /
  // _linkedScenarioMatches / _annotateQuestRun ported alongside as the
  // launcher's helpers; the module installs window.CJS.CampaignQuestLauncher
  // for the still-in-JS callers (`_startQuestChainScenario`,
  // `_startQuestRunFromOffer`, `_openQuestModal`'s "starting run" branch).
  // `_questTaskDescriptor` / `_questCellFromRef` ported to TS in Phase H.4
  // as `questTaskDescriptor` / `questCellFromRef` in
  // `src/campaign/tabs/data/resultPanels.ts` (alongside `buildQuestRunTask`).

  // _questHubEvent / _questHarvest ported to action-handlers/quest.ts (H.3).

  // _questMiniGame ported to action-handlers/minigame.ts (H.3).

  // `_questObjectiveByKinds` removed in Phase H.4 — orphaned (its last
  // caller ported long ago). `_questHarvestLoot` ported to quest.ts (H.3).

  // _questCheck / _questHandIn / _questAnswer ported to
  // action-handlers/quest.ts (H.3).

  // `_activeQuestById` removed in Phase H.4 — orphaned. `_activeRunQuestId`
  // ported to TS (`src/campaign/util/state-helpers.ts::activeRunQuestId`),
  // consumed by `buildQuestRunTask` + the scenario-shared run-pill builder.

  // `_questMapForm` / `_questMapType` removed in Phase H.4 — their only
  // callers (the manual quest builder) moved to TS; the canonical copies
  // are `questMapForm` / `questMapType` in action-handlers/quest.ts.

  // _ownedInventoryOptions / _takeOpForBucket ported to
  // action-handlers/quest.ts (H.3).

  // Roster GM stat modals (_charNumberOp / _charMpModal / _charStatusModal
  // → damage/heal/level-char, mp-char, status-char) ported to
  // src/campaign/action-handlers/roster-modals.ts (H.3).

  // _partySheetModal ported to action-handlers/roster-modal-pickers.ts
  // (H.3 — party-sheet). The TS handler reads the body via
  // `CampaignUIInternal.PartyTab.renderPartySheetHtml` (portrait hero +
  // roster member sheet, Phase H.4) and routes the body's
  // data-campaign-action buttons through the action runtime via a local
  // click delegate.

  // `_renderPortraitHero` + the roster member-math cluster (_memberBase,
  // _memberRankInfo, _renderRankBar, _memberStats, _renderResistances,
  // _renderEquipmentLoadout, _memberSkillEntries, _memberLearnedSkillIds,
  // _skillEntryId, _memberPassives, _characterOptions, _skillOptions,
  // _passiveOptions, _statusDef, _renderJobChip, _renderPersonaChip,
  // _renderPersonaPill, _skillMeta, _statName, _skillWeaponTypes) moved
  // into the cui-party-tab.js roster island in Phase H.4. TS reads the
  // exposed surface on CampaignUIInternal.PartyTab / .Portraits.

  // _recruitCharacterModal / _learnSkillModal / _learnPassiveModal
  // ported to action-handlers/roster-modal-pickers.ts (H.3 — recruit-
  // character / learn-skill / learn-passive).

  // _removeCharacter ported to action-handlers/roster-pickers.ts (H.3).

  // _equipItemModal / _statBoostModal ported to
  // action-handlers/roster-modal-pickers.ts (H.3 — equip-item / stat-boost).

  // _grantXpModal / _grantJobXpModal (grant-xp / grant-job-xp) ported to
  // src/campaign/action-handlers/roster-modals.ts (H.3).

  // _changePersonaModal / _changeJobModal ported to
  // action-handlers/roster-modal-pickers.ts (H.3 — change-persona /
  // change-job).

  // _grantSkillApModal / _levelUpSkillConfirm ported to
  // action-handlers/roster-pickers.ts (H.3).

  // _rankUpApplyModal ported to action-handlers/roster-modal-pickers.ts
  // (H.3 — rank-up-apply). The TS handler reads _memberRankInfo via the
  // new CampaignUI.memberRankInfo bridge (also read by cui-party-tab.js
  // render code, so the modal stays in sync with the party tab).

  // _rankUpPassiveConfirm ported to action-handlers/roster-pickers.ts (H.3).

  // _showSkillDetailModal ported to action-handlers/roster-modal-pickers.ts
  // (H.3 — show-skill-detail). The TS handler reads `_skillMeta` and
  // `_icon` through the CampaignUI.skillMetaText / .recordIconHtml
  // bridges so the modal stays in sync with the roster row.

  // _showJobTreeModal / _renderBranchColumn / _eligibilityReason / _jobLabel
  // ported to action-handlers/roster-modal-pickers.ts (H.3 — show-job-tree).
  // The TS port adds a local click delegate for the per-card unlock /
  // switch buttons (the closure modal had none, so the buttons were
  // silently broken — fixed in passing).

  // _confirmUnlockJob / _switchJob ported to
  // action-handlers/roster-pickers.ts (H.3).

  // _partyAvailabilityModal ported to action-handlers/roster-pickers.ts (H.3).
  // _travelWorld ported to action-handlers/registry.ts (travel-world).

  // _travelWorldCard / _completeWorldTravel / _defaultTravelLanding /
  // _evaluateTravelRankGate / _hasMeaningfulPersonaChoice /
  // _openPreTravelPersonaPicker ported to action-handlers/travel.ts
  // (H.3 — travel-world-card). `_worldMenuDef` stays in JS (chrome
  // data builders also read it); the TS handler resolves the
  // destination's default tab through the new `CampaignUI.getWorldMenuDef`
  // bridge.

  // _campRestModal ported to action-handlers/downtime.ts (H.3).

  // _gmOverride (the GM Override modal) moved to
  // `src/campaign/action-handlers/gm-override.ts` in Phase H.4. The
  // gm-override / gm-member-override action handlers (manual-builders.ts)
  // call the TS `openGmOverride` directly; the `openGmOverride` bridge is
  // gone. The modal still reads the shared roster option builders
  // (`_characterOptions` / `_skillOptions` / `_passiveOptions`) through the
  // CampaignUI.rosterCharacterOptions/SkillOptions/PassiveOptions bridges.

  // _opsModal ported to action-handlers/events.ts (H.3).

  // Log-management handlers (_exportLog / _clearLog / _exportEventLog /
  // _clearEventLog) ported to src/campaign/actions.ts + registered in
  // action-handlers/registry.ts (H.3 log).

  function _consumeCombatResult() {
    const result = Bridge().readResult?.() || Bridge().consumeResult();
    if (!result) return false;
    const handled = _storeCombatResult(result);
    if (handled) Bridge().clearResult?.();
    return handled;
  }

  // The roster member-math + sheet sub-render cluster (_memberBase,
  // _memberRankInfo, _renderRankBar, _memberStats, _renderResistances,
  // _renderEquipmentLoadout, _memberSkillEntries, _memberLearnedSkillIds,
  // _skillEntryId, _memberPassives, _characterOptions, _skillOptions,
  // _passiveOptions, _statusDef, _renderJobChip, _renderPersonaChip,
  // _renderPersonaPill, _skillMeta, _statName, _skillWeaponTypes) moved
  // into the cui-party-tab.js roster island in Phase H.4. It owns its own
  // helper bundle (defaulted internally); TS reads the exposed surface on
  // CampaignUIInternal.PartyTab / .Portraits.

  // The cui-modals / cui-options / cui-equipment / cui-portraits leaf
  // helpers are no longer aliased here (Phase H.4 — their last consumers,
  // the roster cluster + modal builders, ported to TS). They remain on
  // `window.CJS.CampaignUIInternal.*`; TS modules import them directly.

  // Lightweight begin/end narrative modal used by generated and user-built
  // quests. Replaces the heavyweight fullscreen visual novel for those runs;
  // authored "special" scenarios keep the full VN flow.
  function showQuestNarrative(payload = {}) {
    if (typeof document === 'undefined' || !document.body) return null;
    const phase = String(payload.phase || 'begin').toLowerCase();
    const title = payload.title || (phase === 'end' ? 'Quest complete' : 'Quest begins');
    const rawText = String(payload.text || '').trim() || (phase === 'end' ? 'The quest is over.' : 'The quest begins.');
    const body = document.createElement('div');
    body.className = 'campaign-quest-narrative ' + (phase === 'end' ? 'is-end' : 'is-begin');
    const paragraphs = rawText.split(/\n{2,}/).map((para) => {
      const p = document.createElement('p');
      p.textContent = para.trim();
      return p;
    });
    paragraphs.forEach((p) => body.appendChild(p));
    const footer = document.createElement('div');
    const continueBtn = document.createElement('button');
    continueBtn.className = 'btn btn-primary';
    continueBtn.textContent = phase === 'end' ? 'Wrap up' : 'Begin';
    footer.appendChild(continueBtn);
    const overlay = UI().openModal({
      title: '📜 ' + title,
      content: body,
      footer,
      width: '460px'
    });
    continueBtn.onclick = () => UI().closeModal(overlay);
    return overlay;
  }

  // renderTabBody — kept on the bridge for backward-compatibility.
  // Phase F migrated every tab body to JSX, so the React shell calls
  // typed `get<Tab>Data` getters rather than this. The function stays
  // exported so external callers (e.g. cui-react-bridge.js tests, or
  // future tooling that needs an HTML snapshot of a tab) still
  // resolve — it returns an empty string for every id now.
  function renderTabBody(_tabId, _state = CS().getState()) {
    return '';
  }

  // ── React Shell Bridge ─────────────────────────────────────────
  // Surface used by `src/campaign/CampaignShell.tsx` to take ownership
  // of the chrome (header, modeBar, subTabs, log strip, command rail,
  // drawer) while leaving the closure-private renderers untouched. The
  // shell reads fragment strings, the active mode/tab/panel ids, and
  // panel defs; it mutates state by calling the setters below or via
  // src/campaign/actions.ts (which uses CampaignOps directly).

  function enableReactShell() {
    _reactShellEnabled = true;
  }

  // Structured, JSX-friendly chrome data consumed by the React chrome
  // components in `src/campaign/shell/`. Returns a typed snapshot the
  // components map directly into JSX — no HTML strings. This is the
  // only chrome renderer now; the vanilla `_render{Header,ModeBar,
  // SubTabs,RecentLogStrip,CommandRail}` helpers were removed with the
  // render() fallback (the React shell is always enabled).
  // `getChromeData` and its five sub-helpers (`_chromeHeaderData`,
  // `_chromeModeBarData`, `_chromeScenarioHudData`, `_chromeRecentLogData`,
  // `_chromeCommandRailData`) moved to TS in Phase H.4
  // (`src/campaign/shell/chromeData.ts`). The TS port reads the chrome
  // slice from `src/campaign/chrome-state.ts` and the panel definitions
  // from the same module — both are the single source of truth now.

  // ── Typed tab data for Phase F/G per-tab ports ─────────────────────
  // Each `get<Tab>Data` returns a JSON-friendly snapshot the matching
  // React component reads. Heavy / shared sub-panels that haven't yet
  // ported produce HTML fragments via closure-private helpers; the
  // React component embeds them via dangerouslySetInnerHTML chunks.

  // `getEventLogData` and `_worldHomeBackdropUrl` moved to TS in
  // Phase H.4 (`src/campaign/tabs/data/eventLog.ts`). The data builder
  // reads `state.eventLog.entries` directly + the world's storyModeTheme
  // backdrop, same shape the JSX consumes.

  // HTML-string sub-panel bridges. Shared with the event{Character,
  // Special,Side} tabs that haven't migrated yet. When those tabs port,
  // these get replaced with typed getEventResultData / getOracleData
  // and JSX renderers.
  // renderEventResultHtml / renderOracleHtml removed in Phase G.2 —
  // the React shell now reads typed `getEventResultData(state)` /
  // `getOracleData(state)` and renders JSX via
  // `src/campaign/tabs/ResultPanels.tsx`.

  // Quest Home (non-zombie). The hero / quest-types panel / quest-run
  // tools render in JSX from this typed snapshot; the active-quest
  // cards and the optional active-sequence panel still go through
  // HTML bridges (renderQuestRowHtml, renderActiveSequenceHtml).
  // `getActiveSequenceData` + `_sequenceNodeSnapshot` + `_sequenceNodeMetaBits`
  // moved to TS in Phase H.4 (`src/campaign/tabs/data/resultPanels.ts`).
  // The discriminated `SequenceNodeData` union and the per-variant
  // builders consume CampaignSequences / CampaignSequenceVN /
  // CampaignAlignment directly through the typed module accessors.

  // `getScenarioSummaryData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/resultPanels.ts`). The runQuestPill +
  // scenarioObjectiveMeta helpers ported alongside to `data/scenarioShared.ts`
  // (also consumed by `getRunData` / `getScenariosData`). The render-side
  // questRunTask HTML chunk still comes from a JS bridge — see the
  // `renderQuestRunTaskHtml` export below.

  // Typed snapshots for small shared panels used across tabs.
  // `getTravelSurpriseData` and `getLastReportData` moved to TS in
  // Phase H.4 (`src/campaign/tabs/data/resultPanels.ts` — pure state
  // reads, no closure deps).

  // getCombatResultData / getLastCombatResultData / getPendingBattleData
  // moved to TS in Phase H.4 — see resultPanels.ts.

  // `getSoloNoticeData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/resultPanels.ts`). The shared TS slice
  // reads pending solo hook + side-content consequence preview via the
  // same HubTab module bridge.

  // `getEventResultData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/resultPanels.ts`). Same shape, same HubTab
  // module reads — the inline-purpose / consequence-preview / flavor-trail
  // HTML fragments come from the typed HubTab bridge there.

  // `getOracleData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/resultPanels.ts`).

  // `getQuestRowData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/questRow.ts`). The closure-private
  // helpers it depended on (`_questStatusClass`, `_questMiniGameObjective`,
  // `_activeRunQuestId`, `_triggerLabel`, `_questScenarioPill`) are
  // deleted alongside the JS getQuestPanelData / getQuestHomeData /
  // _zombieScavengeTrackerData callers (Phase H.4) — every consumer
  // now imports the typed builder directly.

  // `getStoryDirectorData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/storyDirector.ts`). All sub-helpers
  // (`storyNextStep`, `storyStageRailData`, `storyDirectorCardData`,
  // `storyPressureBoardData`, `storyCluesPanelData`,
  // `storyQueuePanelData`, `storyTruthsPanelData`, `storySideFlowData`)
  // ported alongside; the consequence-preview HTML still comes from the
  // HubTab module bridge.

  // `getWorldGateData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/worldGate.ts`). The sub-helpers + the
  // worldMenuDef config table ported alongside.

  // `getStoryHomeData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/storyHome.ts`). The chapter tree, story
  // pipeline, sync summary, and choice consequence panels all ported
  // inline. The AI story context panel reads `aiStoryContextData` from
  // `src/campaign/story-context.ts` (the async cache + prompt machinery
  // ported there in Phase H.4 too).

  // `getQuestPanelData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/questPanel.ts`). The TS port reads the same
  // CampaignState + content surface; the zombie variant routes through
  // the shared TS `getZombieScavengeTrackerData`.

  // `getRunData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/run.ts`). Uses the shared TS
  // `runQuestPill` / `shapePillsData` / `beatIcon` helpers from
  // `data/scenarioShared.ts`.

  // `getScenariosData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/scenarios.ts`). Uses the shared TS
  // `scenarioQuestPillData` / `shapePillsData` / `scenarioRunActionsData`
  // helpers from `data/scenarioShared.ts`.

  // `getEventTabData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/eventTab.ts`). The `_eventFileKind`
  // classifier ported alongside; sequence delivery/action data flows
  // through `data/sequence.ts`; quest-chain data through `data/questChain.ts`.

  // `getQuestHomeData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/questHome.ts`). The zombie variant routes
  // through the shared TS `getZombieScavengeHomeData`. The
  // closure-private helpers `_zombieScavengeHomeData`,
  // `_zombieScavengeTrackerData`, `_worldActivitiesFor`,
  // `_worldActivityPreviewData`, `_questPaperKind` are deleted alongside
  // (no remaining JS callers).

  // `getStorySummaryData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/storySummary.ts`). The TS port duplicates
  // the closure-private `_storySummaryEntries` builder (still used by
  // JS data builders that haven't ported yet).

  // Phase G.16 — typed Town Snapshot + Roll Float data for the
  // Overview tab. The HubTab still owns the underlying hub state
  // (CampaignHub.getCurrentHubDefinition / getCurrentHubState); the
  // rumor row markup stays as an HTML bridge until HubTab itself
  // ports (K.3).
  // `getTownSnapshotData` and `getTownRollFloatData` moved to TS in
  // Phase H.4 (`src/campaign/tabs/data/overview.ts`).

  // K.3 — typed bridges for the Battle Sets / Map Seeds forge tabs.
  // Replaces HubTab.renderBattleSets / renderMapSeeds (HTML strings with
  // data-campaign-action) with structured data the React tree renders as
  // JSX (src/campaign/tabs/CampaignHubTabs.tsx).
  // `getBattleSetsData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/hub.ts`).

  // `getQuestChainsData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/hub.ts`). The chain card data builders +
  // flow guide helper ported to `src/campaign/tabs/data/questChain.ts`
  // and are now shared with the EventTab side variant.

  // `getMapSeedsData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/hub.ts`).

  // K.3 — typed side-content card + rumor-row data for the Side Forge /
  // Oracle Forge tabs (and the Town snapshot rumor rows). Display-only
  // sub-pieces (inline purpose, flavor trail, choice consequence preview)
  // stay as pre-rendered HTML the JSX inserts via a <HtmlBridge> div —
  // the same display-bridge pattern ResultPanels uses; none carry
  // data-campaign-action. Only the action buttons move to JSX onClick.
  // `_sideCardData` / `_rumorRowData` removed in Phase H.4 — they were
  // orphaned when the side-content data builders ported to TS
  // (`src/campaign/tabs/data/hub.ts`, which carries the canonical
  // `sideCardData` / `rumorRowData`). No remaining JS callers.

  // `getSideForgeData` / `getOracleForgeData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/hub.ts`), along with the shared
  // `sideCardData` / `rumorRowData` helpers.

  // `getRosterData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/roster.ts`). The per-member breakdown
  // still comes through PartyTab.rosterMemberData; the typed
  // tab-helpers bundle is threaded via `CampaignUI.getTabHelpers`.

  // `getMinigameTestData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/minigameTest.ts`). The selection state
  // (previously `_root.dataset.mgTestGame`) + level cache also moved
  // to module-level variables in that file; the `mg-test-pick` action
  // handler imports `setMinigameTestGame` directly.

  // Renders the main-area body. Returns a string for vanilla tabs;
  // returns `null` if the tab is owned by a React component (the shell
  // mounts the React component directly when this returns null).
  function getMainBody(state = CS().getState()) {
    if (!state) return '';
    const Tabs = window.CJS.CampaignUIInternal?.Tabs;
    if (Tabs && Tabs.has(_activeTab)) {
      // A registered tab — could be React-owned (a cui-react-bridge
      // placeholder) or vanilla. Render and return the HTML; React will
      // mount inside any mount-point div the string contains.
      return Tabs.render(_activeTab, state, _tabHelpers()) ?? '';
    }
    return _renderMain(state);
  }

  // `getPanelDefs` + `getPanelOrder` moved to TS in Phase H.4
  // (`src/campaign/shell/chromeData.ts`). The JS closures
  // `_panelDefsForState` + `PANEL_DEFS` + `RAIL_ORDER` stay because the
  // still-JS `_openPanel`/`_closePanel`/`_renderPanelLayer` no-ops still
  // read them. Both sides hold the same values.

  function renderDrawerBody(panelId, state = CS().getState()) {
    if (!state || !panelId) return '';
    return _renderDrawerBody(panelId, state);
  }

  // Public chrome setters — thin wrappers around the canonical TS slice
  // (Phase H.4). They keep the JS bridge contract intact (render() after
  // every write) so the React shell + drawer focus management still fire.
  // The TS slice handles the mode/tab partner-derivation and the panel
  // toggle semantics; we only own the render side-effect here.
  function setActiveMode(mode, opts = {}) {
    if (!mode) return;
    _Chrome().setActiveMode(mode, {
      keepTab: !!opts.keepTab,
      worldId: CS().getState()?.currentWorld
    });
    render();
  }

  function setActiveTab(tab, opts = {}) {
    if (!tab) return;
    _Chrome().setActiveTab(tab, { keepMode: !!opts.keepMode });
    render();
  }

  // Render-free chrome setters (Phase H.3 contract preserved). The
  // legacy `_goto` and the ported nav handlers call these with no
  // derivation, then call render() themselves at the point the closure
  // rendered. Distinct from setActiveMode/setActiveTab above, which
  // derive the partner dimension + render (the chrome-forwarder contract).
  function setActiveModeRaw(mode) { _Chrome().setActiveModeRaw(mode); }
  function setActiveTabRaw(tab) { _Chrome().setActiveTabRaw(tab); }

  function setActivePanel(panelId) {
    _Chrome().setActivePanel(panelId);
    render();
  }

  return Object.freeze({
    init,
    render,
    isBooted: () => _booted,
    // playSequenceMinigame bridge removed (Phase H.3): _playSequenceMiniGame
    // ported to action-handlers/minigame.ts; campaign-sequence-vn.js routes
    // through CampaignActionsRuntime.run('sequence-play-minigame') instead.
    showQuestNarrative,
    // Bridge surface for React-owned tabs (Phase D migration). Tabs that
    // have moved to React read engine state through these getters instead
    // of reaching into closure-private state.
    getBootIncompatibleNotice: () => _bootIncompatibleNotice,
    // Phase H.3 — lets the ported save handlers clear the boot-incompatible
    // banner after the user starts fresh / loads a slot, matching the old
    // closures that reset `_bootIncompatibleNotice` inline.
    clearBootIncompatibleNotice: () => { _bootIncompatibleNotice = null; },
    // The roster member-math bundle + option builders + party-sheet body
    // + skill-meta / icon / rank-info bridges (getTabHelpers,
    // rosterCharacterOptions/SkillOptions/PassiveOptions, skillMetaText,
    // recordIconHtml, memberRankInfo, renderPartySheetHtml) were removed in
    // Phase H.4 — the roster island (cui-party-tab.js) owns them now and
    // exposes them on CampaignUIInternal.PartyTab / .Portraits, which the
    // TS roster / GM modals read directly.
    // Returns the HTML body string for any closure-private vanilla
    // renderer the React-tab bridge wraps.
    renderTabBody,
    // `renderStoryDirectorCardHtml` removed in Phase H.4 — the beat-modal
    // card renderer (`_renderStoryDirectorCard` + `_renderStoryRouteChoices`)
    // ported to TS at `src/campaign/action-handlers/story-director-card.ts`.
    // `story-director-modals.ts` calls it directly.
    // `renderQuestRunTaskHtml` removed in Phase H.4 — `_renderQuestRunTask`
    // + `_questTaskDescriptor` + `_questCellFromRef` ported to TS as
    // `buildQuestRunTask` in `src/campaign/tabs/data/resultPanels.ts`. The
    // ScenarioSummary panel renders the typed `questRunTask` data as JSX.
    // `getShapePillsData` removed in Phase H.4 — the TS port at
    // `src/campaign/tabs/data/scenarioShared.ts::shapePillsData` is now
    // the single source of truth. The inspect-scenario action handler
    // imports it directly.
    // `getWorldMenuDef` removed in Phase H.4 — `worldMenuDef` ported to
    // `src/campaign/tabs/data/worldGate.ts`; the travel-world-card TS
    // action handler imports it directly.
    // `setMinigameTestGame` removed in Phase H.4 — the selection state
    // moved to a module-level variable in
    // `src/campaign/tabs/data/minigameTest.ts`; the TS mg-test-pick
    // handler imports the setter directly.
    // `computeStoryPromptText` / `ensureStoryContext` /
    // `renderAiStoryContextData` bridges removed in Phase H.4 — the
    // story-context cache + AI story-prompt builder moved to
    // `src/campaign/story-context.ts`. TS consumers (story-tools handler,
    // Story Home data builder) import `storyPromptText` / `ensureStoryContext`
    // / `aiStoryContextData` directly; the JS init/render/subscribe prime the
    // cache via `StoryCtx().ensureStoryContext`.
    // All four big modal-builder bridges removed in Phase H.4 — the manual
    // event builder, manual quest builder, GM override, and manual scene
    // builder moved to `src/campaign/action-handlers/{event,quest,gm-override,
    // scene}-builder.ts`. Their action handlers (manual-builders.ts) call
    // those TS modules directly, so no bridge entry remains.
    // Phase E React Shell bridge. See enableReactShell() above for the
    // contract — when this is set, render() no longer clobbers _root
    // and instead emits `campaign:state-tick` events for the shell to
    // re-render against.
    enableReactShell,
    getMainBody,
    renderDrawerBody,
    handleAction,
    setActiveMode,
    setActiveTab,
    setActivePanel,
    // Phase H.3 — render-free setters + tab→mode lookup the ported nav /
    // sequence handlers use (see action-handlers/nav.ts).
    setActiveModeRaw,
    setActiveTabRaw,
    modeForTab: _modeForTab,
    getActiveTab: () => _activeTab,
    getActiveMode: () => _activeMode,
    getActivePanel: () => _activePanel
  });
})();
