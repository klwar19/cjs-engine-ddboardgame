// campaign-ui.js
// Main Campaign Mode rendering and browser interaction binding.

window.CJS = window.CJS || {};

window.CJS.CampaignUI = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;
  const CM = () => window.CJS.ContentManager;
  const UI = () => window.CJS.UI;
  const CS = () => window.CJS.CampaignState;
  const Ops = () => window.CJS.CampaignOps;
  const Save = () => window.CJS.CampaignSave;
  const Runner = () => window.CJS.ScenarioRunner;
  const Bridge = () => window.CJS.CampaignCombatBridge;
  const Side = () => window.CJS.CampaignSideContent;
  const SD = () => window.CJS.CampaignStoryDirector;
  const QP = () => window.CJS.CampaignQuestPulse;
  const Gen = () => window.CJS.CampaignScenarioGenerator;
  const Chat = () => window.CJS.CampaignPartyChat;
  const C = () => window.CJS.CONST;
  const Icons = () => window.CJS.UIIcons;
  // Phase H.4 — the story-context cache + AI story-prompt builder moved to
  // `src/campaign/story-context.ts`. init/render/subscribe prime the async
  // cache through this surface; TS consumers import the readers directly.
  const StoryCtx = () => window.CJS.CampaignStoryContext;

  // Leaf utilities live in `src/campaign/util/cui-utils.ts` (Phase H.4).
  // The TS module installs `window.CJS.CampaignUIInternal.Utils` so the
  // rest of this IIFE reads the same surface as before.
  const _CUIUtils = window.CJS.CampaignUIInternal.Utils;
  const _esc = _CUIUtils.esc;
  const _escAttr = _CUIUtils.escAttr;
  const _label = _CUIUtils.label;
  const _safe = _CUIUtils.safe;
  const _truncate = _CUIUtils.truncate;
  const _currencyLabel = _CUIUtils.currencyLabel;
  const _recordName = _CUIUtils.recordName;
  const _lootLine = _CUIUtils.lootLine;
  const _formatBundleText = _CUIUtils.formatBundleText;
  const _cssVarAssetUrl = _CUIUtils.cssVarAssetUrl;

  // Portrait + icon helpers live in `src/campaign/util/cui-portraits.ts`.
  const _CUIPortraits = window.CJS.CampaignUIInternal.Portraits;
  const _icon = _CUIPortraits.icon;
  const _memberPortrait = _CUIPortraits.memberPortrait;
  const _memberPortraitFocus = _CUIPortraits.memberPortraitFocus;
  const _focusAttrStyle = _CUIPortraits.focusAttrStyle;

  // Modal + picker primitives live in `src/campaign/util/cui-modals.ts`.
  const _CUIModals = window.CJS.CampaignUIInternal.Modals;
  const _desc = _CUIModals.desc;
  const _pickerItem = _CUIModals.pickerItem;
  const _sortOptionLabel = _CUIModals.sortOptionLabel;
  const _formLabel = _CUIModals.formLabel;
  const _formModal = _CUIModals.formModal;
  const _opPickerModal = _CUIModals.opPickerModal;
  const _textareaModal = _CUIModals.textareaModal;
  const _numberModal = _CUIModals.numberModal;

  // Option builders live in `src/campaign/util/cui-options.ts`.
  const _CUIOptions = window.CJS.CampaignUIInternal.Options;
  const _bucketOptions = _CUIOptions.bucketOptions;
  const _statusOptions = _CUIOptions.statusOptions;
  const _seedOptions = _CUIOptions.seedOptions;
  const _worldOptions = _CUIOptions.worldOptions;
  const _tentOptions = _CUIOptions.tentOptions;

  // HTML control builders live in `src/campaign/util/cui-controls.ts`.
  const _CUIControls = window.CJS.CampaignUIInternal.Controls;
  const _purposeTone = _CUIControls.purposeTone;
  const _purposeKeyForCard = _CUIControls.purposeKeyForCard;
  const _renderInlinePurpose = _CUIControls.renderInlinePurpose;
  const _impactLegendItem = _CUIControls.impactLegendItem;
  const _controlGroup = _CUIControls.controlGroup;
  const _actionMenu = _CUIControls.actionMenu;
  const _actionBtn = _CUIControls.actionBtn;
  const _renderTownActionButton = _CUIControls.renderTownActionButton;

  // Log rendering helpers live in `src/campaign/util/cui-log.ts`.
  const _CUILog = window.CJS.CampaignUIInternal.Log;
  const _logKind = _CUILog.logKind;
  const _formatLogTime = _CUILog.formatLogTime;
  const _logMeta = _CUILog.logMeta;
  const _renderLogEntry = _CUILog.renderLogEntry;

  // Equipment helpers live in `src/campaign/util/cui-equipment.ts`.
  const _CUIEquipment = window.CJS.CampaignUIInternal.Equipment;
  const _cleanType = _CUIEquipment.cleanType;
  const _inferType = _CUIEquipment.inferType;
  const _weaponType = _CUIEquipment.weaponType;
  const _armorType = _CUIEquipment.armorType;
  const _accessoryType = _CUIEquipment.accessoryType;
  const _allowedTypes = _CUIEquipment.allowedTypes;
  const _memberCanUseWeapon = _CUIEquipment.memberCanUseWeapon;
  const _memberCanUseArmor = _CUIEquipment.memberCanUseArmor;
  const _equipmentKind = _CUIEquipment.equipmentKind;
  const _equipmentType = _CUIEquipment.equipmentType;
  const _weaponSummary = _CUIEquipment.weaponSummary;
  const _effectSummary = _CUIEquipment.effectSummary;
  const _equipmentDesc = _CUIEquipment.equipmentDesc;
  const _delta = _CUIEquipment.delta;
  const _slotKind = _CUIEquipment.slotKind;
  const _slotLabel = _CUIEquipment.slotLabel;
  const _normalizeEquipmentSlots = _CUIEquipment.normalizeEquipmentSlots;
  const _equipmentChangeDescription = _CUIEquipment.equipmentChangeDescription;
  const _equipmentOptions = _CUIEquipment.equipmentOptions;
  const _equipmentPickerItem = _CUIEquipment.equipmentPickerItem;

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
  // `js/campaign/ui/tabs/cui-party-tab.js`. These delegators keep the
  // shell's existing closure callers (command rail panel, party sheet
  // modal) working with a single import.
  function _renderParty(state) {
    return window.CJS.CampaignUIInternal.PartyTab.renderParty(state, _tabHelpers());
  }

  function _renderRosterMember(id, member) {
    return window.CJS.CampaignUIInternal.PartyTab.renderRosterMember(id, member, _tabHelpers());
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
      const html = Tabs.render(_activeTab, state, _tabHelpers());
      if (html != null) return html;
    }
    return '<div class="campaign-empty">Tab body is JSX-only. Run with the React shell enabled.</div>';
  }

  // Frozen helper bundle passed to every registered tab. Built lazily
  // on first render so all the closure-private helpers below have been
  // defined by the time we capture them. Tab modules call into this
  // bundle for shell-only math (member rank, equipment loadout, persona
  // pill, etc.) and for cross-tab interactions like rendering the solo
  // hook notice on the hub.
  let _tabHelpersCache = null;
  function _tabHelpers() {
    if (_tabHelpersCache) return _tabHelpersCache;
    _tabHelpersCache = Object.freeze({
      // Member math + sheet helpers (party tab)
      memberBase: _memberBase,
      memberRankInfo: _memberRankInfo,
      renderRankBar: _renderRankBar,
      memberStats: _memberStats,
      renderResistances: _renderResistances,
      renderEquipmentLoadout: _renderEquipmentLoadout,
      memberSkillEntries: _memberSkillEntries,
      memberPassives: _memberPassives,
      memberLearnedSkillIds: _memberLearnedSkillIds,
      renderJobChip: _renderJobChip,
      renderPersonaPill: _renderPersonaPill,
      statName: _statName,
      skillMeta: _skillMeta,
      skillEntryId: _skillEntryId,
      statusDef: _statusDef,
      // Hub tab — solo hook notice + pending card
      renderSoloNotice: _renderSoloNotice,
      pendingSoloHookCard: _pendingSoloHookCard
    });
    return _tabHelpersCache;
  }

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

  function _renderStoryDirectorCard(card, options = {}) {
    const cardClass = ['campaign-panel', 'campaign-side-card', 'campaign-result-card', 'campaign-story-card'];
    cardClass.push('campaign-story-dialogue');
    if (options.modal) cardClass.push('is-modal');
    const kind = _label(card.kind || 'story');
    return `
      <section class="${cardClass.join(' ')}">
        <div class="campaign-story-dialogue-head">
          <div>
            <h3>${_esc(card.title || card.id)}</h3>
            <div class="campaign-muted">${_esc(card.stageName || card.stageId || '')} | ${_esc(kind)}</div>
          </div>
          <span class="campaign-risk ${Side().riskClass(card.canonRisk)}">${_esc(card.canonRisk || 'green')}</span>
        </div>
        <div class="campaign-story-dialogue-box">
          <div class="campaign-story-speaker">${_esc(kind)}</div>
          ${card.prompt ? `<p>${_esc(card.prompt)}</p>` : ''}
          ${card.text ? `<p>${_esc(card.text)}</p>` : ''}
          ${card.summary ? `<p class="campaign-muted">${_esc(card.summary)}</p>` : ''}
        </div>
        ${card.gmNote ? `<div class="campaign-warning">${_esc(card.gmNote)}</div>` : ''}
        ${card.tags?.length ? `<div class="campaign-chip-row">${card.tags.map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('')}</div>` : ''}
        ${_renderStoryRouteChoices(card, options)}
        ${options.modal ? '' : `
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'story-open-last', label: 'Open Popup', hint: 'Show this beat in a decision window again', kind: 'story' })}
            ${_actionMenu('Beat Options', `
              ${_actionBtn({ action: 'story-save-beat', label: 'Hold For Later', hint: 'Queue this for later without applying it', kind: 'manual' })}
              ${_actionBtn({ action: 'story-copy-prompt', label: 'Copy GM Prompt', hint: 'Copy this beat and current context', kind: 'manual' })}
              ${_actionBtn({ action: 'story-reject-beat', label: 'Skip Roll', hint: 'Save as skipped and clear it', kind: 'danger' })}
            `)}
          </div>
        `}
      </section>
    `;
  }

  function _renderStoryRouteChoices(card, options = {}) {
    const choices = card.suggestedChoices || [];
    const branchChoices = choices.length ? choices : [{
      label: 'Accept as story note',
      ops: [{ op: 'log', text: card.prompt || card.text || card.summary || card.title || 'Story beat accepted.' }]
    }];
    return `
      <div class="campaign-story-route-map">
        <div class="campaign-section-title">Route Choices</div>
        ${branchChoices.map((choice, index) => {
          const buttonAttrs = options.modal
            ? `data-story-modal-choice="${index}"`
            : `data-campaign-action="story-apply-choice" data-id="${_escAttr(card.id)}" data-choice="${index}"`;
          return `
            <div class="campaign-story-route ${index === 0 ? 'is-recommended' : ''}">
              <div class="campaign-story-route-head">
                <span>Route ${String(index + 1).padStart(2, '0')}</span>
                <strong>${_esc(choice.label || `Choice ${index + 1}`)}</strong>
                ${index === 0 ? '<small>Suggested</small>' : ''}
              </div>
              ${_renderConsequencePreview(choice.ops || [], {
                title: choice.label || `Choice ${index + 1}`,
                emptyTitle: choice.label || `Choice ${index + 1}`,
                emptyText: 'Story-only route. Choose it if it fits the current scene.'
              })}
              <button class="campaign-action ${index === 0 ? 'primary' : 'quest'}" ${buttonAttrs} title="Choose this route and commit its listed consequences">
                Choose Route ${index + 1}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

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

  function _openRumors(hubState) {
    return window.CJS.CampaignUIInternal.HubTab.openRumors(hubState);
  }

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
  function _cardChoiceOps(card = {}) {
    return window.CJS.CampaignUIInternal.HubTab.cardChoiceOps(card);
  }

  function _renderConsequencePreview(ops = [], options = {}) {
    return window.CJS.CampaignUIInternal.HubTab.renderConsequencePreview(ops, options);
  }

  function _renderFlavorTrail(entry = {}) {
    return window.CJS.CampaignUIInternal.HubTab.renderFlavorTrail(entry);
  }

  function _consequenceSummary(ops = [], options = {}) {
    return window.CJS.CampaignUIInternal.HubTab.consequenceSummary(ops, options);
  }

  // _impactLegendItem, _controlGroup, _actionMenu, _actionBtn live in
  // src/campaign/util/cui-controls.ts (bound as aliases at the top).

  function _renderSoloNotice(state) {
    const card = _pendingSoloHookCard(state);
    if (!card) return '';
    const kind = state.pendingSoloHook?.kind || card.type || 'hook';
    const risk = Side().risk(card.canonRisk);
    const prompt = card.prompt || card.summary || card.gmHook || card.notes || '';
    const ops = _cardChoiceOps(card);
    const summary = _consequenceSummary(ops, { hasText: !!prompt });
    const firstChoice = card.suggestedChoices?.[0];
    const choiceLabel = firstChoice?.label || 'Apply the first suggested choice';
    const isQuestOffer = !!(card.questTemplate || card.questChainTemplateId || card.type === 'quest_offer');
    const acceptHint = isQuestOffer
      ? 'Add quest to tracker and auto-start its map run'
      : (ops.length ? `Apply: ${Ops().describe(ops).join('; ')}` : 'Create a quest from this story-only hook');
    return `
      <section class="campaign-panel campaign-solo-notice campaign-result-card is-${_escAttr(summary.tone)} ${risk === 'red' ? 'risk-red' : ''}">
        <div class="campaign-panel-head">
          <div>
            <h2>Immediate Roll Result</h2>
            <div class="campaign-muted">${_esc(_label(kind))} | Suggested: ${_esc(choiceLabel)}</div>
          </div>
          <div class="campaign-impact-row">
            <span class="campaign-impact-badge is-${_escAttr(summary.tone)}">${_esc(summary.label)}</span>
            <span class="campaign-risk ${Side().riskClass(risk)}">${_esc(risk)}</span>
          </div>
        </div>
        ${_renderInlinePurpose(kind === 'rumor_offer' ? 'rumor' : _purposeKeyForCard(card))}
        <strong>${_esc(card.title || card.name || card.id)}</strong>
        ${prompt ? `<p>${_esc(prompt)}</p>` : ''}
        ${_renderConsequencePreview(ops, {
          emptyTitle: 'Flavor only',
          emptyText: 'No mechanical change yet. Save it as text, make it a rumor, or turn it into a quest.'
        })}
        ${_renderFlavorTrail(card)}
        <div class="campaign-control-help">Pick one: <b>Accept</b> commits the suggested choice. <b>Make Quest</b> only adds it to the Quest Tracker when possible. <b>Make Rumor</b> plants it in the hub lead bank. <b>Save</b> stores the card as a saved idea. <b>Ignore</b> drops it.</div>
        <div class="campaign-action-grid">
          ${_actionBtn({ action: 'accept-solo-hook', label: ops.length ? 'Accept & Apply' : 'Accept as Quest', hint: acceptHint, kind: 'primary' })}
          ${_actionBtn({ action: 'solo-hook-quest', label: 'Make Quest', hint: 'Add to Quest Tracker, no map run yet' })}
          ${_actionBtn({ action: 'solo-hook-rumor', label: 'Make Rumor', hint: 'Add as a hub rumor / lead bank item' })}
          ${_actionBtn({ action: 'save-solo-hook', label: 'Save Text', hint: 'Store in Saved Ideas to use later' })}
          ${_actionBtn({ action: 'ignore-solo-hook', label: 'Ignore', hint: 'Discard this hook', kind: 'danger' })}
        </div>
      </section>
    `;
  }

  // _renderScenarioSummary — Phase G.5 port. Body moved to
  // `src/campaign/tabs/ResultPanels.tsx`. Typed bridge
  // `getScenarioSummaryData(state)` produces the data. `_runQuestPill`,
  // `_renderQuestRunTask`, and `_scenarioObjectiveMeta` stay (the
  // bridge calls them).

  function _renderQuestRunTask(state, run, scenario) {
    const questId = _activeRunQuestId(run, scenario);
    const quest = questId ? state.quests?.[questId] : null;
    if (!quest) return '';
    if (_isQuestResolved(quest)) {
      return `
        <div class="campaign-quest-phase campaign-scenario-task">
          <span>Quest Resolved</span>
          <strong>${_esc(quest.title || quest.id)}</strong>
          <small>End scenario when ready</small>
        </div>
      `;
    }
    const objectives = quest.objectives || [];
    const nextObjective = _questNextObjective(quest);
    const idx = Math.max(0, objectives.findIndex((entry) => entry.id === nextObjective?.id));
    const phase = objectives.length ? `Phase ${idx + 1}/${objectives.length}` : 'Quest Task';
    const task = _questTaskDescriptor(quest, scenario);
    return `
      <div class="campaign-quest-phase campaign-scenario-task">
        <span>${_esc(phase)}</span>
        <strong>${_esc(nextObjective?.label || task.label || 'Follow the quest route')}</strong>
        <small>${_esc(task.location || 'Use the map branches to resolve it')}</small>
      </div>
    `;
  }

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

  function _triggerLabel(trigger = {}) {
    const bits = [];
    if (trigger.outcome) bits.push(_label(trigger.outcome));
    if (trigger.skillIds?.length) bits.push(trigger.skillIds.map(_label).join(' / '));
    if (trigger.statusIds?.length) bits.push(`Status ${trigger.statusIds.map(_label).join(' / ')}`);
    if (trigger.defeatedTypes?.length) bits.push(`Defeat ${trigger.defeatedTypes.map(_label).join(' / ')}`);
    if (trigger.defeatedMonsterIds?.length) bits.push(`Defeat ${trigger.defeatedMonsterIds.map(_label).join(' / ')}`);
    const tags = trigger.requiresTags || trigger.requiresAnyTags || trigger.anyTags || [];
    if (tags.length) bits.push((Array.isArray(tags) ? tags : [tags]).map(_label).join(' / '));
    if (trigger.onlyPlayerActionTags?.length) bits.push(`Only ${trigger.onlyPlayerActionTags.map(_label).join(' / ')}`);
    return bits.length ? `Auto: ${bits.join(' + ')}` : 'Auto progress available';
  }

  // `_renderPendingBattleContext` and `_renderCombatPulseSummary`
  // moved to `resultPanels.ts` in Phase H.4 alongside the data builders
  // that consume them.

  function _questNextObjective(quest = {}) {
    const objectives = quest.objectives || [];
    return objectives.find((entry) => !_questObjectiveDone(entry)) || objectives[0] || null;
  }

  // `_scenarioObjectiveMeta` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/scenarioShared.ts`).

  // `_questMiniGameObjective` and `_questStatusClass` moved to TS in
  // Phase H.4 (`src/campaign/util/state-helpers.ts`). No remaining JS
  // callers (the only one was JS `getQuestRowData`, also ported).

  function _questObjectiveDone(obj = {}) {
    return Number(obj.current || 0) >= Math.max(1, Number(obj.required || 1));
  }

  function _isQuestResolved(quest = {}) {
    return ['complete', 'completed', 'failed'].includes(String(quest.status || 'active'));
  }

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

  function _openManualEventBuilder(prefill = {}) {
    const state = CS().getState() || {};
    const run = state.activeScenarioRun || null;
    const currentMap = CS().getActiveMap?.();
    const currentNode = Runner()?.findCurrentNode?.();
    const rumorOptions = _manualEventRumorOptions();
    const battleOptions = _manualEventBattleOptions();
    const layerOptions = _manualEventLayerOptions();
    const characterOptions = _manualEventCharacterOptions();
    const bank = _manualKeywordBank();
    const runLine = run
      ? `Active run: ${currentMap?.name || run.mapId || run.scenarioId || 'map'} / ${currentNode?.name || currentNode?.label || run.currentNode || 'current point'}`
      : 'No active run. Map notes are saved to a freeform map bucket until you start a run.';

    const body = document.createElement('div');
    body.className = 'campaign-manual-event-builder';
    body.innerHTML = `
      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>1</span>
          <div>
            <h3>Seed</h3>
            <small>Oracle, rumor, keywords, AI draft, or your own note.</small>
          </div>
        </div>
        <div class="campaign-row-actions">
          <button type="button" class="campaign-action primary" id="manual-roll-oracle">Roll Oracle</button>
          <button type="button" class="campaign-action" id="manual-use-rumor" ${rumorOptions.length ? '' : 'disabled'}>Use Rumor</button>
          <button type="button" class="campaign-action" id="manual-roll-keywords">Roll Keywords</button>
          <button type="button" class="campaign-action" id="manual-clear-seed">Clear</button>
        </div>
        <div class="campaign-builder-grid">
          <label class="form-label">Source
            <select id="manual-source">
              <option value="manual" ${prefill.source === 'manual' || !prefill.source ? 'selected' : ''}>Manual</option>
              <option value="oracle" ${prefill.source === 'oracle' ? 'selected' : ''}>Oracle</option>
              <option value="rumor">Rumor</option>
              <option value="keywords">Keywords</option>
              <option value="ai_draft" ${prefill.source === 'ai_draft' ? 'selected' : ''}>AI Draft</option>
            </select>
          </label>
          <label class="form-label">Open Rumor
            <select id="manual-rumor">
              <option value="">No rumor selected</option>
              ${rumorOptions.map((rumor) => `<option value="${_escAttr(rumor.value)}">${_esc(rumor.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <textarea id="manual-seed" placeholder="Seed, oracle line, rumor, or outside AI draft.">${_esc(prefill.seed || '')}</textarea>
        <details class="campaign-builder-details">
          <summary>Keyword bank</summary>
          <div class="campaign-builder-grid">
            <label class="form-label">Adjectives<input id="manual-kw-adj" type="text" value="${_escAttr(bank.adjectives)}"></label>
            <label class="form-label">Nouns<input id="manual-kw-noun" type="text" value="${_escAttr(bank.nouns)}"></label>
            <label class="form-label">Verbs<input id="manual-kw-verb" type="text" value="${_escAttr(bank.verbs)}"></label>
            <label class="form-label">Twists<input id="manual-kw-twist" type="text" value="${_escAttr(bank.twists)}"></label>
          </div>
        </details>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>2</span>
          <div>
            <h3>Scene</h3>
            <small>Short record first, longer prose optional.</small>
          </div>
        </div>
        <div class="campaign-builder-grid">
          <label class="form-label">Title<input id="manual-title" type="text" placeholder="Event title" value="${_escAttr(prefill.title || '')}"></label>
          <label class="form-label">Scope
            <select id="manual-scope">
              <option value="event" ${!prefill.scope || prefill.scope === 'event' ? 'selected' : ''}>Event / table beat</option>
              <option value="quest" ${prefill.scope === 'quest' ? 'selected' : ''}>Quest support</option>
              <option value="main_story" ${prefill.scope === 'main_story' ? 'selected' : ''}>Main story</option>
              <option value="hub" ${prefill.scope === 'hub' ? 'selected' : ''}>Hub / town</option>
            </select>
          </label>
        </div>
        <label class="form-label">Very Short Event Summary
          <textarea id="manual-short" placeholder="One sentence: what happened at the table?">${_esc(prefill.short || '')}</textarea>
        </label>
        <label class="form-label">Scene / Conversation / Hook
          <textarea id="manual-scene" placeholder="Dialogue, hook, clue, obstacle, or GM note.">${_esc(prefill.scene || '')}</textarea>
        </label>
        <label class="form-label">Main Story Summary (separate)
          <textarea id="manual-main" placeholder="Only the main-plot meaning, if any. Leave blank for side or farming events.">${_esc(prefill.mainStory || '')}</textarea>
        </label>
        <label class="form-label">Event Tags
          <input id="manual-tags" type="text" placeholder="comma-separated tags" value="${_escAttr((prefill.tags || []).join(', '))}">
        </label>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>3</span>
          <div>
            <h3>Turn Into</h3>
            <small>Choose only the pieces you want to commit.</small>
          </div>
        </div>
        <div class="campaign-builder-checks">
          <label><input id="manual-save-rumor" type="checkbox">Save as rumor</label>
          <label><input id="manual-event-log" type="checkbox" checked>Add to event log</label>
          <label><input id="manual-add-quest" type="checkbox">Build quest</label>
          <label><input id="manual-map-note" type="checkbox" ${run ? 'checked' : ''}>Write map event/trap</label>
          <label><input id="manual-queue-battle" type="checkbox">Queue battle</label>
          <label><input id="manual-save-plot" type="checkbox" checked>Save plot hook</label>
          <label><input id="manual-character" type="checkbox">Add character beat</label>
          <label><input id="manual-move" type="checkbox">Move / return marker</label>
        </div>

        <div class="campaign-builder-grid">
          <label class="form-label">Quest Title<input id="manual-quest-title" type="text" placeholder="Defaults to event title"></label>
          <label class="form-label">Quest Objective<input id="manual-quest-objective" type="text" placeholder="Resolve the hook"></label>
          <label class="form-label">Map Note Type
            <select id="manual-map-kind">
              <option value="event">Event</option>
              <option value="trap">Trap</option>
              <option value="clue">Clue</option>
              <option value="shortcut">Shortcut</option>
              <option value="reward">Reward</option>
            </select>
          </label>
          <label class="form-label">Map Layer
            <select id="manual-map-layer">
              ${layerOptions.map((layer) => `<option value="${_escAttr(layer.value)}">${_esc(layer.label)}</option>`).join('')}
            </select>
          </label>
          <label class="form-label">Battle
            <select id="manual-battle">
              <option value="">No set battle</option>
              <option value="custom">Custom/manual battle</option>
              ${battleOptions.map((battle) => `<option value="${_escAttr(battle.value)}">${_esc(battle.label)}</option>`).join('')}
            </select>
          </label>
          <label class="form-label">Battle Label<input id="manual-battle-label" type="text" placeholder="Ambush, duel, defense, etc."></label>
          <label class="form-label">Related Character
            <select id="manual-character-id">
              <option value="">No character selected</option>
              ${characterOptions.map((character) => `<option value="${_escAttr(character.value)}">${_esc(character.label)}</option>`).join('')}
            </select>
          </label>
          <label class="form-label">Bond Change<input id="manual-bond" type="number" value="0" step="1"></label>
          <label class="form-label">Return / New Place<input id="manual-return" type="text" placeholder="Return to guild, lower layer, old shrine..."></label>
          <label class="form-label">Quick Reward / Consequence
            <select id="manual-consequence">
              <option value="none">None</option>
              <option value="gain_gold">Gain gold</option>
              <option value="lose_gold">Lose gold</option>
              <option value="give_jp">Gain JP</option>
              <option value="take_jp">Lose JP</option>
              <option value="damage_party">Damage party</option>
              <option value="heal_party">Heal party</option>
              <option value="add_status_cold">Cold status on party</option>
              <option value="danger">Danger change</option>
            </select>
          </label>
          <label class="form-label">Gold Amount<input id="manual-gold" type="number" value="25" step="1"></label>
          <label class="form-label">JP Amount<input id="manual-jp" type="number" value="5" step="1"></label>
          <label class="form-label">Danger / HP Amount<input id="manual-amount" type="number" value="1" step="1"></label>
        </div>
        <label class="form-label">Map Event / Trap Text
          <textarea id="manual-map-text" placeholder="${_escAttr(runLine)}"></textarea>
        </label>
        <label class="form-label">Character Beat
          <textarea id="manual-character-note" placeholder="What changed with this character, companion, rival, or party member?"></textarea>
        </label>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>4</span>
          <div>
            <h3>Summary</h3>
            <small>Copy this for writing outside the app. Apply later if the ops look right.</small>
          </div>
        </div>
        <div id="manual-ops-preview" class="campaign-preview"></div>
        <label class="form-label">Event Summary<textarea id="manual-summary-event" readonly></textarea></label>
        <label class="form-label">Main Story Summary<textarea id="manual-summary-main" readonly></textarea></label>
        <label class="form-label">Full Export<textarea id="manual-summary-full" readonly></textarea></label>
      </section>
    `;

    const footer = document.createElement('div');
    footer.className = 'campaign-builder-footer';
    footer.innerHTML = `
      <button class="btn" id="manual-cancel">Cancel</button>
      <button class="btn" id="manual-copy">Copy Summary</button>
      <button class="btn btn-primary" id="manual-use">Use Event</button>
    `;
    const overlay = UI().openModal({ title: 'Manual Event Builder', content: body, footer, width: '860px' });
    const $ = (sel) => body.querySelector(sel);

    function refresh() {
      const draft = _manualEventDraftFromBody(body, { rumorOptions, battleOptions, characterOptions });
      const ops = _manualEventOps(draft);
      $('#manual-summary-event').value = _eventShortSummary(draft);
      $('#manual-summary-main').value = draft.mainStory || '';
      $('#manual-summary-full').value = _manualEventSummaryText(draft, ops);
      const descriptions = Ops().describe(ops).filter(Boolean);
      $('#manual-ops-preview').innerHTML = descriptions.length
        ? `<b>Changes if applied:</b><br>${descriptions.map(_esc).join('<br>')}`
        : '<b>Changes if applied:</b><br>Story-only event. No automatic mechanics yet.';
    }

    $('#manual-roll-oracle').onclick = () => {
      const oracle = window.CJS.CampaignOracle?.roll?.();
      if (!oracle) return UI().toast('No oracle table available', 'info');
      $('#manual-source').value = 'oracle';
      $('#manual-seed').value = oracle.text || oracle.prompt || '';
      if (!$('#manual-title').value.trim()) $('#manual-title').value = 'Oracle Event';
      if (!$('#manual-short').value.trim()) $('#manual-short').value = _truncate(oracle.text || oracle.prompt || '', 140);
      refresh();
    };
    $('#manual-use-rumor').onclick = () => {
      const picked = rumorOptions.find((rumor) => rumor.value === $('#manual-rumor').value) || rumorOptions[0];
      if (!picked) return UI().toast('No open rumor selected', 'info');
      $('#manual-rumor').value = picked.value;
      $('#manual-source').value = 'rumor';
      $('#manual-seed').value = picked.text || picked.label || '';
      $('#manual-save-rumor').checked = false;
      if (!$('#manual-title').value.trim()) $('#manual-title').value = `Rumor: ${_truncate(picked.text || picked.label || '', 48)}`;
      if (!$('#manual-short').value.trim()) $('#manual-short').value = picked.text || picked.label || '';
      refresh();
    };
    $('#manual-roll-keywords').onclick = () => {
      $('#manual-source').value = 'keywords';
      const text = _manualKeywordPrompt({
        adjectives: $('#manual-kw-adj').value,
        nouns: $('#manual-kw-noun').value,
        verbs: $('#manual-kw-verb').value,
        twists: $('#manual-kw-twist').value
      });
      $('#manual-seed').value = text;
      if (!$('#manual-title').value.trim()) $('#manual-title').value = `Keyword Event: ${text.split(';')[0] || 'Hook'}`;
      if (!$('#manual-short').value.trim()) $('#manual-short').value = text;
      refresh();
    };
    $('#manual-clear-seed').onclick = () => {
      $('#manual-seed').value = '';
      $('#manual-source').value = 'manual';
      refresh();
    };
    body.querySelectorAll('input, textarea, select').forEach((el) => {
      el.addEventListener('input', refresh);
      el.addEventListener('change', refresh);
    });
    footer.querySelector('#manual-cancel').onclick = () => UI().closeModal(overlay);
    footer.querySelector('#manual-copy').onclick = () => {
      const draft = _manualEventDraftFromBody(body, { rumorOptions, battleOptions, characterOptions });
      const ops = _manualEventOps(draft);
      window.CJS.CampaignCopy.copyPlainText('Manual Event Summary', _manualEventSummaryText(draft, ops), 'Manual event summary copied');
    };
    footer.querySelector('#manual-use').onclick = () => {
      const draft = _manualEventDraftFromBody(body, { rumorOptions, battleOptions, characterOptions });
      const event = _manualEventFromDraft(draft);
      CS().mutate((next) => { next.lastEvent = event; }, { source: 'event_custom' });
      UI().closeModal(overlay);
      render();
      UI().toast('Manual event ready. Review the summary and apply when you want it committed.', 'success');
    };

    refresh();
  }

  function _manualEventDraftFromBody(body, context = {}) {
    const $ = (sel) => body.querySelector(sel);
    const bool = (sel) => !!$(sel)?.checked;
    const battleValue = $('#manual-battle')?.value || '';
    const characterId = $('#manual-character-id')?.value || '';
    const selectedBattle = (context.battleOptions || []).find((battle) => battle.value === battleValue) || null;
    const selectedRumor = (context.rumorOptions || []).find((rumor) => rumor.value === $('#manual-rumor')?.value) || null;
    const selectedCharacter = (context.characterOptions || []).find((character) => character.value === characterId) || null;
    return {
      title: $('#manual-title')?.value.trim() || 'Manual Event',
      source: $('#manual-source')?.value || 'manual',
      seed: $('#manual-seed')?.value.trim() || '',
      scope: $('#manual-scope')?.value || 'event',
      short: $('#manual-short')?.value.trim() || '',
      scene: $('#manual-scene')?.value.trim() || '',
      mainStory: $('#manual-main')?.value.trim() || '',
      customTags: _tagList($('#manual-tags')?.value || ''),
      selectedRumor,
      selectedBattle,
      battleValue,
      battleLabel: $('#manual-battle-label')?.value.trim() || '',
      selectedCharacter,
      characterId,
      bondAmount: Number($('#manual-bond')?.value || 0),
      characterNote: $('#manual-character-note')?.value.trim() || '',
      questTitle: $('#manual-quest-title')?.value.trim() || '',
      questObjective: $('#manual-quest-objective')?.value.trim() || '',
      mapKind: $('#manual-map-kind')?.value || 'event',
      mapLayer: $('#manual-map-layer')?.value || '',
      mapText: $('#manual-map-text')?.value.trim() || '',
      returnPlace: $('#manual-return')?.value.trim() || '',
      consequence: $('#manual-consequence')?.value || 'none',
      goldAmount: Math.abs(Number($('#manual-gold')?.value || 0)),
      jpAmount: Math.abs(Number($('#manual-jp')?.value || 0)),
      amount: Number($('#manual-amount')?.value || 0),
      saveRumor: bool('#manual-save-rumor'),
      logEvent: bool('#manual-event-log'),
      addQuest: bool('#manual-add-quest'),
      mapNote: bool('#manual-map-note'),
      queueBattle: bool('#manual-queue-battle'),
      savePlot: bool('#manual-save-plot'),
      character: bool('#manual-character'),
      move: bool('#manual-move')
    };
  }

  function _manualEventFromDraft(draft = {}) {
    const ops = _manualEventOps(draft);
    const short = _eventShortSummary(draft);
    const prompt = [
      draft.seed ? `Seed: ${draft.seed}` : '',
      draft.scene,
      draft.mapText ? `Map note: ${draft.mapText}` : '',
      draft.characterNote ? `Character: ${draft.characterNote}` : ''
    ].filter(Boolean).join('\n\n') || short;
    return {
      id: `manual_event_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      title: draft.title || 'Manual Event',
      prompt,
      gmHook: draft.scene || draft.seed || '',
      suggested: ops,
      tableName: 'Manual Builder',
      type: draft.scope || 'event',
      source: draft.source || 'manual',
      rolledAt: new Date().toISOString(),
      manualSummary: {
        short,
        main: draft.mainStory || '',
        full: _manualEventSummaryText(draft, ops),
        tags: _manualEventTags(draft)
      }
    };
  }

  function _manualEventOps(draft = {}) {
    const state = CS().getState() || {};
    const world = state.currentWorld;
    const run = state.activeScenarioRun || null;
    const mapId = run?.mapId || 'freeform';
    const nodeId = run?.currentNode || run?.currentCell || 'freeform';
    const short = _eventShortSummary(draft);
    const title = draft.title || 'Manual Event';
    const ops = [];

    ops.push({ op: 'log', text: `Manual event: ${short}` });

    if (draft.logEvent) {
      ops.push({
        op: 'event_log_add',
        entry: {
          title,
          summary: short,
          source: draft.source || 'manual',
          scope: draft.scope || 'event',
          tags: _manualEventTags(draft),
          consequences: []
        }
      });
    }

    if (draft.saveRumor) {
      ops.push({
        op: 'add_rumor',
        hubId: window.CJS.CampaignHub?.getCurrentHubId?.(),
        text: draft.seed || short,
        canonRisk: 'green',
        tags: _manualEventTags(draft),
        source: 'manual_event'
      });
    }

    if (draft.addQuest) {
      const questId = `manual_quest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      ops.push({
        op: 'add_quest',
        quest: {
          id: questId,
          title: draft.questTitle || title,
          status: 'active',
          summary: short,
          notes: [draft.seed, draft.scene].filter(Boolean).join('\n\n'),
          objectives: [{
            id: 'obj_1',
            label: draft.questObjective || 'Resolve the event hook',
            current: 0,
            required: 1
          }],
          rewards: [],
          tags: _manualEventTags(draft)
        }
      });
    }

    if (draft.mapNote) {
      ops.push({
        op: 'map_note',
        mapId,
        nodeId,
        title,
        kind: draft.mapKind || 'event',
        layer: draft.mapLayer || run?.mapLayer || null,
        text: draft.mapText || draft.scene || short
      });
    }

    if (draft.move && draft.mapLayer) {
      ops.push({ op: 'map_layer_set', layer: draft.mapLayer });
    }
    if (draft.move && draft.returnPlace) {
      ops.push({ op: 'log', text: `Manual movement marker: ${draft.returnPlace}.` });
    }

    if (draft.queueBattle) {
      const battle = draft.selectedBattle?.battle || {};
      ops.push({
        op: 'start_battle',
        encounterId: battle.encounterId || null,
        battleSetId: battle.battleSetId || null,
        monsterIds: battle.monsterIds || [],
        label: draft.battleLabel || battle.label || `Manual battle: ${title}`,
        source: 'manual_event',
        rewardOps: battle.rewardOps || [],
        // _battleDefeatFields / _battleMapForArea ported to
        // action-handlers/battle-pool.ts; reached via the shared runtime
        // export until this manual event builder ports to TS.
        ...window.CJS.CampaignBattlePool.battleDefeatFields(battle),
        objective: battle.objective || draft.questObjective || '',
        notes: battle.notes || draft.scene || short,
        battleMap: battle.battleMap || window.CJS.CampaignBattlePool.battleMapForArea(CS().getActiveScenario?.()?.setting || 'outdoor')
      });
    }

    if (draft.savePlot) {
      ops.push({
        op: 'side_idea_save',
        status: 'saved',
        contentCard: {
          id: `manual_plot_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          type: draft.scope === 'main_story' ? 'main_story_hook' : 'plot_hook',
          title,
          summary: short,
          prompt: draft.scene || draft.seed || '',
          canonRisk: draft.scope === 'main_story' ? 'yellow' : 'green',
          source: 'manual_event',
          tags: _manualEventTags(draft)
        },
        setLast: false
      });
    }

    if (draft.character) {
      const characterName = draft.selectedCharacter?.label || draft.characterId || 'character';
      if (draft.characterNote) {
        ops.push({
          op: 'side_idea_save',
          status: 'saved',
          contentCard: {
            id: `manual_character_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
            type: 'character_beat',
            title: `${title}: ${characterName}`,
            summary: draft.characterNote,
            prompt: draft.scene || draft.seed || '',
            canonRisk: 'green',
            source: 'manual_event',
            tags: [..._manualEventTags(draft), 'character']
          },
          setLast: false
        });
      }
      if (draft.characterId && draft.bondAmount) {
        ops.push({ op: 'bond_change', npcId: draft.characterId, amount: draft.bondAmount, field: 'value' });
      }
    }

    if (draft.mainStory || draft.scope === 'main_story') {
      ops.push({
        op: 'story_beat_save',
        status: 'manual',
        beat: {
          id: `manual_story_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
          type: 'manual_event_main_story',
          kind: 'manual',
          title,
          summary: draft.mainStory || short,
          prompt: draft.scene || draft.seed || '',
          tags: [..._manualEventTags(draft), 'main_story']
        }
      });
    }

    ops.push(..._manualRewardOps(draft, world));
    return ops;
  }

  function _manualRewardOps(draft = {}, world) {
    const currency = `${world || 'haven'}_gold`;
    const amount = Math.abs(Number(draft.amount || 0)) || 1;
    switch (draft.consequence) {
      case 'gain_gold': return [{ op: 'give_money', currency, amount: Math.abs(Number(draft.goldAmount || 0)) || 25 }];
      case 'lose_gold': return [{ op: 'take_money', currency, amount: Math.abs(Number(draft.goldAmount || 0)) || 15 }];
      case 'give_jp': return [{ op: 'give_jp', amount: Math.abs(Number(draft.jpAmount || 0)) || 5 }];
      case 'take_jp': return [{ op: 'take_jp', amount: Math.abs(Number(draft.jpAmount || 0)) || 5 }];
      case 'damage_party': return [{ op: 'damage_party', amount: amount || 5 }];
      case 'heal_party': return [{ op: 'heal_party', amount: amount || 10 }];
      case 'add_status_cold': return [{ op: 'add_status', target: 'party', status: 'cold', duration: 'scenario' }];
      case 'danger': return [{ op: 'danger', amount: Number(draft.amount || 1) }];
      default: return [];
    }
  }

  function _manualEventSummaryText(draft = {}, ops = []) {
    const lines = [
      'Manual Event Summary',
      '',
      `Title: ${draft.title || 'Manual Event'}`,
      `Source: ${_label(draft.source || 'manual')}`,
      `Scope: ${_label(draft.scope || 'event')}`,
      '',
      'Event short summary:',
      _eventShortSummary(draft),
      ''
    ];
    if (draft.seed) lines.push('Seed:', draft.seed, '');
    if (draft.scene) lines.push('Scene / hook:', draft.scene, '');
    if (draft.customTags?.length) lines.push('Tags:', draft.customTags.join(', '), '');
    lines.push('Main story summary:', draft.mainStory || '(none)', '');
    lines.push('Event log:', draft.logEvent ? 'yes' : 'no', '');
    if (draft.addQuest) lines.push('Quest:', `${draft.questTitle || draft.title || 'Manual Quest'} - ${draft.questObjective || 'Resolve the event hook'}`, '');
    if (draft.mapNote) lines.push('Map:', `${_label(draft.mapKind || 'event')} - ${draft.mapText || draft.scene || _eventShortSummary(draft)}`, '');
    if (draft.queueBattle) lines.push('Battle:', draft.battleLabel || draft.selectedBattle?.label || `Manual battle: ${draft.title || 'Event'}`, '');
    if (draft.character) {
      lines.push('Character:', `${draft.selectedCharacter?.label || draft.characterId || 'Character'}${draft.characterNote ? ` - ${draft.characterNote}` : ''}`, '');
    }
    if (draft.move && (draft.mapLayer || draft.returnPlace)) {
      lines.push('Move / return:', [draft.mapLayer ? `Layer: ${draft.mapLayer}` : '', draft.returnPlace ? `Return/place: ${draft.returnPlace}` : ''].filter(Boolean).join(' | '), '');
    }
    const descriptions = Ops().describe(ops).filter(Boolean);
    lines.push('Applied changes preview:');
    lines.push(...(descriptions.length ? descriptions.map((line) => `- ${line}`) : ['- Story-only event.']));
    return lines.join('\n');
  }

  function _eventShortSummary(draft = {}) {
    const text = draft.short || draft.scene || draft.seed || draft.mapText || draft.mainStory || draft.title || 'Manual event happened.';
    return _truncate(String(text).replace(/\s+/g, ' ').trim(), 180) || 'Manual event happened.';
  }

  function _manualKeywordBank() {
    return {
      adjectives: 'hidden, urgent, broken, tender, absurd, cursed, rival, lost, glittering, forbidden, overdue, suspicious',
      nouns: 'letter, contract, shrine, mirror, debt, festival, bridge, relic, witness, map, recipe, monster trail',
      verbs: 'betrays, protects, vanishes, returns, accuses, demands, interrupts, awakens, bargains, follows, fractures, remembers',
      twists: 'someone is lying, the reward has a cost, the map is wrong, an ally recognizes the sign, it connects to a rumor, the safe route is blocked'
    };
  }

  function _manualKeywordPrompt(source = {}) {
    const pick = (text) => {
      const list = String(text || '').split(',').map((item) => item.trim()).filter(Boolean);
      return list.length ? list[Math.floor(Math.random() * list.length)] : '';
    };
    const adjective = pick(source.adjectives);
    const noun = pick(source.nouns);
    const verb = pick(source.verbs);
    const twist = pick(source.twists);
    return [
      [adjective, noun].filter(Boolean).join(' '),
      verb ? `action: ${verb}` : '',
      twist ? `twist: ${twist}` : ''
    ].filter(Boolean).join('; ');
  }

  function _manualEventRumorOptions() {
    const hubState = window.CJS.CampaignHub?.getCurrentHubState?.();
    return _openRumors(hubState).map((rumor) => ({
      value: rumor.id,
      label: _truncate(rumor.text || rumor.id, 90),
      text: rumor.text || rumor.id,
      rumor
    }));
  }

  function _manualEventBattleOptions() {
    const scenario = CS().getActiveScenario?.();
    const setBattles = (scenario?.setBattles || []).map((battle, index) => ({
      value: `scenario_${battle.id || battle.encounterId || index}`,
      label: battle.label || battle.name || battle.encounterId || battle.battleSetId || `Set Battle ${index + 1}`,
      battle: {
        ...battle,
        label: battle.label || battle.name || battle.encounterId || battle.battleSetId || `Set Battle ${index + 1}`
      }
    }));
    const fallback = window.CJS.CampaignBattlePool.fallbackBattlePool().slice(0, 10).map((battle, index) => ({
      value: `pool_${battle.id || battle.encounterId || battle.battleSetId || index}`,
      label: battle.label || battle.name || battle.encounterId || battle.battleSetId || `Battle ${index + 1}`,
      battle
    }));
    const seen = new Set();
    return [...setBattles, ...fallback].filter((entry) => {
      if (seen.has(entry.value)) return false;
      seen.add(entry.value);
      return true;
    });
  }

  function _manualEventLayerOptions() {
    const run = CS().getState()?.activeScenarioRun;
    const map = CS().getActiveMap?.();
    const layers = (map?.layers || []).map((layer) => ({
      value: layer.id,
      label: layer.name || layer.id
    }));
    if (layers.length) return [{ value: '', label: `Stay on ${run?.mapLayer || layers[0].label || 'current layer'}` }, ...layers];
    return [
      { value: '', label: 'Stay on current layer' },
      { value: 'surface', label: 'Surface / town layer' },
      { value: 'underground', label: 'Underground layer' },
      { value: 'upper', label: 'Upper layer' },
      { value: 'dream', label: 'Dream / memory layer' },
      { value: 'return_route', label: 'Return route' }
    ];
  }

  function _manualEventCharacterOptions() {
    const state = CS().getState() || {};
    const seen = new Set();
    const options = [];
    for (const [id, member] of Object.entries(state.party || {})) {
      const base = DS().get('characters', member.baseCharacterId || id);
      const label = member.name || base?.name || id;
      if (!seen.has(id)) {
        seen.add(id);
        options.push({ value: id, label: `${label} (party)` });
      }
    }
    const source = CM()?.getVisibleItems?.('characters') || DS().getAllAsArray('characters');
    for (const character of source.slice(0, 80)) {
      if (!character.id || seen.has(character.id)) continue;
      seen.add(character.id);
      options.push({ value: character.id, label: character.name || character.id });
    }
    return options.sort(_sortOptionLabel);
  }

  function _tagList(text = '') {
    return String(text || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  function _manualEventTags(draft = {}) {
    return ['manual_event', draft.scope || 'event', draft.source || 'manual']
      .concat(draft.customTags || [])
      .concat(draft.selectedRumor ? ['rumor'] : [])
      .filter((tag, index, arr) => tag && arr.indexOf(tag) === index);
  }

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

  // _pendingSoloHookCard stays — the data builders (Story / Quest /
  // Overview render code) still read this shape inline.
  function _pendingSoloHookCard(state = CS().getState()) {
    const id = state?.pendingSoloHook?.cardId;
    if (!id) return null;
    return state.sideContent?.generatedIdeas?.[id]
      || (state.lastSideContentCard?.id === id ? state.lastSideContentCard : null);
  }

  // _clearPendingSoloHook stays — still-JS handlers (the manual quest
  // builder, scenario discard) call it; the TS solo handlers duplicate
  // the one-line mutation rather than depend on this closure (matches
  // the established H.3 pattern for tiny mutators).
  function _clearPendingSoloHook() {
    CS().mutate((state) => { state.pendingSoloHook = null; }, { source: 'solo_hook' });
  }

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

  const DEFAULT_QUEST_MINIGAME_CONTEXT = {
    contextText: 'This mini-game room is attached to the current quest. Clearing it advances the tracker and applies the training bonus.',
    conversation: [
      { speaker: 'Quest Giver', text: 'This counts for the job. Clear the room and I can mark the bonus.' },
      { speaker: 'Bin', text: 'Good. Then it is work, not a distraction.' }
    ],
    bonusText: 'Clear bonus: quest progress, room buff, and JP payout apply on success.'
  };

  function _questBuilderMiniGame(base = {}) {
    const mini = base || {};
    const conversation = Array.isArray(mini.conversation) && mini.conversation.length
      ? mini.conversation
      : DEFAULT_QUEST_MINIGAME_CONTEXT.conversation.map((line) => ({ ...line }));
    return {
      ...mini,
      contextText: mini.contextText || mini.context || DEFAULT_QUEST_MINIGAME_CONTEXT.contextText,
      conversation,
      bonusText: mini.bonusText || DEFAULT_QUEST_MINIGAME_CONTEXT.bonusText
    };
  }

  function _parseMiniGameConversation(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function _randomizedQuestTemplate(template = {}) {
    const variants = [
      {
        label: 'weather turn',
        summary: 'A weather shift changes the approach and adds a small travel complication.',
        objective: 'Handle the weather complication',
        tag: 'weather',
        mapType: 'outdoor'
      },
      {
        label: 'rival claim',
        summary: 'Another party, clerk, or local rival wants credit for the same job.',
        objective: 'Deal with the rival claim',
        tag: 'rival',
        mapType: 'urban'
      },
      {
        label: 'strange trace',
        summary: 'The job leaves behind one odd clue that can stay rumor-only unless promoted.',
        objective: 'Decide what the strange trace means',
        tag: 'mystery',
        mapType: 'ruins'
      },
      {
        label: 'resource bonus',
        summary: 'The route has better materials than expected, but one extra obstacle guards them.',
        objective: 'Secure the bonus materials',
        kind: 'harvest',
        required: 2,
        tag: 'materials',
        mapType: 'forest'
      },
      {
        label: 'challenge room',
        summary: 'The job includes a tiny dungeon mechanism resolved by the mini-game module or a manual check.',
        objective: 'Clear the mini-game room',
        kind: 'minigame',
        required: 1,
        tag: 'minigame',
        mapForm: 'grid_map',
        mapType: 'dungeon',
        minigame: _questBuilderMiniGame({ gameId: 'push_box', difficulty: 1, theme: 'ruins' })
      },
      {
        label: 'hub errand',
        summary: 'A local hub event becomes part of the request before the fieldwork can be closed.',
        objective: 'Run one hub event',
        kind: 'hub_event',
        required: 1,
        tag: 'hub',
        mapType: 'urban'
      },
      {
        label: 'Character request',
        summary: 'A nearby character asks for a small extra favor while the party is already out.',
        objective: 'Answer the extra request',
        kind: 'talk',
        required: 1,
        tag: 'npc',
        mapType: 'urban'
      }
    ];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const next = CS().clone(template || {});
    next.randomVariant = _label(variant.label);
    next.title = `${template.title || template.id || 'Quest'} (${next.randomVariant})`;
    next.summary = [template.summary || '', `Variant: ${variant.summary}`].filter(Boolean).join(' ');
    next.tags = Array.from(new Set([...(template.tags || []), variant.tag, 'randomized']));
    const variantObjective = {
      id: `variant_${_safe(variant.label)}`,
      kind: variant.kind || 'custom',
      label: variant.objective,
      current: 0,
      required: Math.max(1, Number(variant.required || 1))
    };
    if (variant.minigame) variantObjective.minigame = variant.minigame;
    next.objectives = [
      ...(template.objectives || []),
      variantObjective
    ];
    if (!template.mapType || template.mapType === 'any') next.mapType = variant.mapType;
    if (!template.mapForm && variant.mapForm) next.mapForm = variant.mapForm;
    return next;
  }

  // Library of objective archetypes for the structured quest builder.
  const QUEST_OBJECTIVE_PRESETS = [
    { kind: 'defeat',      label: 'Defeat targets',      template: 'Defeat the {what}',         icon: '⚔', required: 1 },
    { kind: 'recover',     label: 'Recover item',        template: 'Recover the {what}',        icon: '📦', required: 1 },
    { kind: 'reach',       label: 'Reach location',      template: 'Reach the {what}',          icon: '📍', required: 1 },
    { kind: 'escort',      label: 'Escort someone',      template: 'Escort {what} safely',      icon: '🛡', required: 1 },
    { kind: 'investigate', label: 'Investigate / clue',  template: 'Investigate the {what}',    icon: '🔍', required: 1 },
    { kind: 'talk',        label: 'Talk to a character', template: 'Speak with {what}',         icon: '💬', required: 1 },
    { kind: 'survive',     label: 'Survive waves',       template: 'Hold the {what} for 3 turns', icon: '⏳', required: 3 },
    { kind: 'gather',      label: 'Gather materials',    template: 'Gather {what}',             icon: '🌿', required: 3 },
    { kind: 'craft',       label: 'Craft / deliver',     template: 'Craft and deliver {what}',  icon: '🛠', required: 1 },
    { kind: 'custom',      label: 'Custom',              template: '',                          icon: '✎', required: 1 }
  ];

  QUEST_OBJECTIVE_PRESETS.splice(1, 0,
    { kind: 'defeat_count', label: 'Kill X monsters', template: 'Defeat {what} monsters', icon: 'x', required: 3 }
  );
  QUEST_OBJECTIVE_PRESETS.splice(QUEST_OBJECTIVE_PRESETS.findIndex((p) => p.kind === 'craft'), 0,
    { kind: 'harvest', label: 'Harvest', template: 'Harvest {what}', icon: 'H', required: 3 },
    { kind: 'hub_event', label: 'Run hub event', template: 'Run {what} hub event', icon: 'E', required: 1 },
    { kind: 'minigame', label: 'Mini-game room', template: 'Clear {what} mini-game room', icon: 'M', required: 1, minigame: _questBuilderMiniGame({ gameId: 'push_box', difficulty: 1, theme: 'ruins' }) }
  );

  const QUEST_REWARD_PRESETS = [
    { op: 'give_money', label: 'Gold', defaultAmount: 50 },
    { op: 'give_jp',    label: 'JP',   defaultAmount: 25 },
    { op: 'add_xp',     label: 'XP (party)', defaultAmount: 100, broadcast: true }
  ];

  const QUEST_CONSEQUENCE_PRESETS = [
    { op: 'take_money',      label: 'Lose Gold',         defaultAmount: 50 },
    { op: 'reputation_change', label: 'Reputation -1',   defaultAmount: -1 },
    { op: 'hub_problem_add', label: 'Trigger Hub Problem', defaultAmount: 0 }
  ];

  function _openQuestModal(prefill = {}) {
    const templates = Object.values(CS().getContent().campaignQuests).flatMap((record) => record.templates || []);
    const body = document.createElement('div');
    body.className = 'campaign-quest-builder';
    const mapTypeOptions = Gen()?.options?.().mapSettings || Gen()?.options?.().mapTypes || ['any', 'urban', 'outdoor', 'forest', 'dungeon', 'cave', 'ruins', 'temple'];
    body.innerHTML = `
      <div class="campaign-control-help">
        Build a quest from scratch, fill from a template, or roll a random one. Edit any field before
        committing. <b>Add Quest</b> only adds it to the tracker. <b>Add &amp; Start Run</b> also auto-starts the map run.
      </div>
      <div class="campaign-quest-builder-row">
        <label class="form-label">Template (optional)</label>
        <div class="campaign-row-actions">
          <select id="campaign-quest-template" class="campaign-grow">
            <option value="">Custom quest (blank)</option>
            ${templates.map((quest) => `<option value="${_escAttr(quest.id)}">${_esc(quest.title || quest.id)}</option>`).join('')}
          </select>
          <button type="button" class="campaign-action" id="campaign-quest-roll" ${templates.length ? '' : 'disabled'}>🎲 Roll Random</button>
          <button type="button" class="campaign-action" id="campaign-quest-clear">Clear</button>
        </div>
      </div>
      <label class="form-label">Title</label>
      <input id="campaign-quest-title" type="text" placeholder="Quest title">
      <label class="form-label">Summary <small class="campaign-muted">— shown to players in Quest Tracker</small></label>
      <textarea id="campaign-quest-summary" placeholder="One-paragraph hook describing what the party is asked to do."></textarea>
      <div class="campaign-quest-builder-grid">
        <label class="form-label">Giver <small class="campaign-muted">— optional character name</small>
          <input id="campaign-quest-giver" type="text" placeholder="e.g. Captain Reed">
        </label>
        <label class="form-label">Tags <small class="campaign-muted">— comma separated</small>
          <input id="campaign-quest-tags" type="text" placeholder="e.g. forest, escort">
        </label>
      </div>

      <div class="campaign-quest-section">
        <div class="campaign-quest-section-title">
          <span>Objectives</span>
          <small class="campaign-muted">Each row becomes a tracker step. The first objective marks the map's primary node.</small>
        </div>
        <div class="campaign-objective-presets" id="campaign-objective-presets">
          ${QUEST_OBJECTIVE_PRESETS.map((preset) => `
            <button type="button" class="campaign-action campaign-objective-preset"
                    data-preset-kind="${_escAttr(preset.kind)}"
                    title="${_escAttr(preset.template || 'Custom objective')}">
              ${preset.icon} ${_esc(preset.label)}
            </button>
          `).join('')}
        </div>
        <div class="campaign-objective-list" id="campaign-objective-list"></div>
      </div>

      <div class="campaign-quest-section">
        <div class="campaign-quest-section-title">
          <span>Rewards on Resolve</span>
          <small class="campaign-muted">Granted when you mark the quest complete.</small>
        </div>
        <div class="campaign-objective-presets">
          ${QUEST_REWARD_PRESETS.map((preset, idx) => `
            <button type="button" class="campaign-action" data-reward-add="${idx}">+ ${_esc(preset.label)}</button>
          `).join('')}
          <button type="button" class="campaign-action" data-reward-add-item>+ Item</button>
        </div>
        <div class="campaign-reward-list" id="campaign-reward-list"></div>
      </div>

      <div class="campaign-quest-section">
        <div class="campaign-quest-section-title">
          <span>Failure Consequences</span>
          <small class="campaign-muted">Optional. Applied if you mark the quest Failed.</small>
        </div>
        <div class="campaign-objective-presets">
          ${QUEST_CONSEQUENCE_PRESETS.map((preset, idx) => `
            <button type="button" class="campaign-action" data-conseq-add="${idx}">+ ${_esc(preset.label)}</button>
          `).join('')}
          <button type="button" class="campaign-action" data-conseq-add-note>+ Note Only</button>
        </div>
        <div class="campaign-reward-list" id="campaign-consequence-list"></div>
      </div>

      <div class="campaign-quest-builder-grid">
        <label class="form-label">Map movement <small class="campaign-muted">node or square grid</small>
          <select id="campaign-quest-map-form">
            <option value="node_map">Node Map</option>
            <option value="grid_map">Grid Map</option>
          </select>
        </label>
        <label class="form-label">Setting / context <small class="campaign-muted">visual theme and encounter pool</small>
          <select id="campaign-quest-map-type">
            ${mapTypeOptions.map((type) => `<option value="${type}">${_esc(_label(type))}</option>`).join('')}
          </select>
        </label>
        <label class="form-label">Map size <small class="campaign-muted">scenario length — grid sizes shown after slash</small>
          <select id="campaign-quest-map-size">
            <option value="tiny">Tiny (~5 nodes / 5×5 grid)</option>
            <option value="small" selected>Small (~7 nodes / 6×6 grid)</option>
            <option value="medium">Medium (~9 nodes / 8×6 grid)</option>
            <option value="large">Large (~12 nodes / 10×8 grid)</option>
            <option value="huge">Huge (~16 nodes / 14×11 grid)</option>
            <option value="massive">Massive (~22 nodes / 20×15 grid)</option>
          </select>
        </label>
      </div>
      <div class="campaign-preview" id="campaign-quest-preview" hidden></div>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn" id="campaign-add-quest-back">Cancel</button>
      <button class="btn" id="campaign-add-quest-commit">Add Quest</button>
      <button class="btn btn-primary" id="campaign-add-quest-start">Add &amp; Start Run</button>
    `;
    const overlay = UI().openModal({ title: 'Add Quest', content: body, footer, width: '680px' });

    const $ = (sel) => body.querySelector(sel);
    const previewBox = $('#campaign-quest-preview');
    const objList = $('#campaign-objective-list');
    const rewardList = $('#campaign-reward-list');
    const consequenceList = $('#campaign-consequence-list');
    let currentTemplateVariant = null;
    let objSeq = 0;

    function objectiveRow({ id, kind = 'custom', label = '', required = 1, minigame = null } = {}) {
      objSeq += 1;
      const rowId = id || `obj_${objSeq}`;
      const row = document.createElement('div');
      row.className = 'campaign-objective-row';
      row.dataset.rowId = rowId;
      const mini = minigame ? _questBuilderMiniGame(minigame) : null;
      if (mini?.gameId) row.dataset.minigameGameId = mini.gameId;
      if (mini?.levelId) row.dataset.minigameLevelId = mini.levelId;
      if (mini?.difficulty) row.dataset.minigameDifficulty = mini.difficulty;
      if (mini?.theme) row.dataset.minigameTheme = mini.theme;
      if (mini?.contextText) row.dataset.minigameContextText = mini.contextText;
      if (Array.isArray(mini?.conversation) && mini.conversation.length) row.dataset.minigameConversation = JSON.stringify(mini.conversation);
      if (mini?.bonusText) row.dataset.minigameBonusText = mini.bonusText;
      row.innerHTML = `
        <select class="campaign-objective-kind">
          ${QUEST_OBJECTIVE_PRESETS.map((p) => `<option value="${p.kind}" ${p.kind === kind ? 'selected' : ''}>${p.icon} ${_esc(p.label)}</option>`).join('')}
        </select>
        <input class="campaign-objective-label" type="text" value="${_escAttr(label)}" placeholder="Objective label (use {what} to replace)">
        <input class="campaign-objective-count" type="number" min="1" max="99" value="${Math.max(1, Number(required) || 1)}" title="Required count">
        <button type="button" class="campaign-icon-btn campaign-objective-remove" aria-label="Remove">×</button>
      `;
      row.querySelector('.campaign-objective-remove').onclick = () => { row.remove(); refreshPreview(); };
      row.querySelectorAll('select,input').forEach((el) => el.addEventListener('input', refreshPreview));
      return row;
    }

    function addObjective(opts = {}) {
      objList.appendChild(objectiveRow(opts));
      refreshPreview();
    }

    function rewardRow({ op = 'give_money', label = 'Gold', amount = 50, itemId = '' } = {}) {
      const row = document.createElement('div');
      row.className = 'campaign-reward-row';
      const isItem = op === 'give_item' || op === 'give_material' || op === 'give_quest_item';
      row.innerHTML = `
        <span class="campaign-pill">${_esc(label)}</span>
        ${isItem
          ? `<input class="campaign-reward-id" type="text" placeholder="item_id" value="${_escAttr(itemId)}">`
          : ''}
        <input class="campaign-reward-amount" type="number" value="${Number(amount) || 0}" min="0">
        <button type="button" class="campaign-icon-btn campaign-reward-remove" aria-label="Remove">×</button>
      `;
      row.dataset.op = op;
      row.dataset.label = label;
      row.querySelector('.campaign-reward-remove').onclick = () => { row.remove(); refreshPreview(); };
      row.querySelectorAll('input').forEach((el) => el.addEventListener('input', refreshPreview));
      return row;
    }

    function consequenceRow({ op = 'take_money', label = 'Lose Gold', amount = 50, text = '' } = {}) {
      const row = document.createElement('div');
      row.className = 'campaign-reward-row';
      const isNote = op === 'log';
      row.innerHTML = `
        <span class="campaign-pill is-danger">${_esc(label)}</span>
        ${isNote
          ? `<input class="campaign-reward-text" type="text" placeholder="Note text" value="${_escAttr(text)}">`
          : `<input class="campaign-reward-amount" type="number" value="${Number(amount) || 0}">`}
        <button type="button" class="campaign-icon-btn campaign-reward-remove" aria-label="Remove">×</button>
      `;
      row.dataset.op = op;
      row.dataset.label = label;
      row.querySelector('.campaign-reward-remove').onclick = () => { row.remove(); refreshPreview(); };
      row.querySelectorAll('input').forEach((el) => el.addEventListener('input', refreshPreview));
      return row;
    }

    function readObjectives() {
      return Array.from(objList.querySelectorAll('.campaign-objective-row')).map((row, idx) => {
        const kind = row.querySelector('.campaign-objective-kind').value;
        const label = row.querySelector('.campaign-objective-label').value.trim();
        const required = Math.max(1, Number(row.querySelector('.campaign-objective-count').value) || 1);
        const objective = {
          id: row.dataset.rowId || `obj_${idx + 1}`,
          label: label || `Objective ${idx + 1}`,
          kind,
          current: 0,
          required
        };
        if (kind === 'minigame') {
          objective.minigame = _questBuilderMiniGame({
            gameId: row.dataset.minigameGameId || 'push_box',
            difficulty: Number(row.dataset.minigameDifficulty || 1),
            theme: row.dataset.minigameTheme || 'ruins',
            levelId: row.dataset.minigameLevelId || '',
            contextText: row.dataset.minigameContextText || '',
            conversation: _parseMiniGameConversation(row.dataset.minigameConversation),
            bonusText: row.dataset.minigameBonusText || ''
          });
          if (!objective.minigame.levelId) delete objective.minigame.levelId;
        }
        return objective;
      });
    }

    function readRewards() {
      return Array.from(rewardList.querySelectorAll('.campaign-reward-row')).map((row) => {
        const op = row.dataset.op;
        const amount = Number(row.querySelector('.campaign-reward-amount')?.value || 0);
        if (op === 'give_item' || op === 'give_material' || op === 'give_quest_item') {
          const id = row.querySelector('.campaign-reward-id')?.value.trim() || '';
          return { op, id, amount };
        }
        if (op === 'add_xp') return { op, amount, broadcast: true };
        return { op, amount };
      }).filter((entry) => entry.amount > 0 || (entry.op?.startsWith('give_') && entry.id));
    }

    function readConsequences() {
      return Array.from(consequenceList.querySelectorAll('.campaign-reward-row')).map((row) => {
        const op = row.dataset.op;
        if (op === 'log') {
          const text = row.querySelector('.campaign-reward-text')?.value.trim() || '';
          return text ? { op: 'log', text } : null;
        }
        if (op === 'hub_problem_add') {
          return { op: 'hub_problem_add', label: 'Quest failed' };
        }
        const amount = Number(row.querySelector('.campaign-reward-amount')?.value || 0);
        return { op, amount };
      }).filter(Boolean);
    }

    function applyTemplate(template) {
      currentTemplateVariant = template?.randomVariant ? template : null;
      $('#campaign-quest-title').value = template?.title || '';
      $('#campaign-quest-summary').value = template?.summary || '';
      $('#campaign-quest-giver').value = template?.giver || '';
      $('#campaign-quest-tags').value = (template?.tags || []).join(', ');
      objList.innerHTML = '';
      (template?.objectives || []).forEach((obj) => addObjective({
        id: obj.id,
        kind: obj.kind || _inferObjectiveKind(obj.label || ''),
        label: obj.label || obj.id || '',
        required: Math.max(1, Number(obj.required || 1)),
        minigame: obj.minigame || obj.miniGame || null
      }));
      if (!objList.children.length) addObjective({ kind: 'reach', label: 'Reach the destination', required: 1 });
      rewardList.innerHTML = '';
      (template?.rewards || template?.rewardOps || []).forEach((reward) => {
        if (!reward?.op) return;
        const preset = QUEST_REWARD_PRESETS.find((p) => p.op === reward.op);
        rewardList.appendChild(rewardRow({
          op: reward.op,
          label: preset?.label || _label(reward.op),
          amount: reward.amount || preset?.defaultAmount || 0,
          itemId: reward.id || ''
        }));
      });
      consequenceList.innerHTML = '';
      (template?.failureConsequences || template?.failureOps || []).forEach((entry) => {
        if (!entry?.op) return;
        const preset = QUEST_CONSEQUENCE_PRESETS.find((p) => p.op === entry.op);
        consequenceList.appendChild(consequenceRow({
          op: entry.op,
          label: preset?.label || _label(entry.op),
          amount: Math.abs(entry.amount || preset?.defaultAmount || 0),
          text: entry.text || ''
        }));
      });
      const mapType = template?.mapType || _questMapType(template || {});
      const sel = $('#campaign-quest-map-type');
      if (sel && Array.from(sel.options).some((opt) => opt.value === mapType)) sel.value = mapType;
      const formSel = $('#campaign-quest-map-form');
      const mapForm = template?.mapForm || _questMapForm(template || {});
      if (formSel && Array.from(formSel.options).some((opt) => opt.value === mapForm)) formSel.value = mapForm;
      const sizeSel = $('#campaign-quest-map-size');
      if (sizeSel && template?.mapSize && Array.from(sizeSel.options).some((opt) => opt.value === template.mapSize)) {
        sizeSel.value = template.mapSize;
      }
      refreshPreview();
    }

    function buildQuest() {
      const templateId = $('#campaign-quest-template').value;
      const rawTemplate = templates.find((q) => q.id === templateId);
      const template = currentTemplateVariant || rawTemplate;
      const title = $('#campaign-quest-title').value.trim();
      const summary = $('#campaign-quest-summary').value.trim();
      const giver = $('#campaign-quest-giver').value.trim();
      const tags = $('#campaign-quest-tags').value.split(',').map((t) => t.trim()).filter(Boolean);
      const objectives = readObjectives();
      const rewards = readRewards();
      const failureConsequences = readConsequences();
      const base = template ? CS().clone(template) : {
        id: `quest_${Date.now()}`,
        title: title || 'New Quest',
        status: 'active',
        summary,
        objectives: [],
        rewards: []
      };
      if (rawTemplate) {
        base.templateId = rawTemplate.id;
        base.id = `quest_${_safe(rawTemplate.id)}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      } else {
        base.id = base.id || `quest_${Date.now()}`;
      }
      base.status = 'active';
      if (title) base.title = title;
      if (summary) base.summary = summary;
      if (giver) base.giver = giver;
      if (tags.length) base.tags = tags;
      base.objectives = objectives.length
        ? objectives
        : [{ id: 'obj_1', kind: 'reach', label: 'Reach the destination', current: 0, required: 1 }];
      base.rewards = rewards;
      if (failureConsequences.length) base.failureConsequences = failureConsequences;
      else delete base.failureConsequences;
      const mapType = $('#campaign-quest-map-type').value;
      if (mapType) base.mapType = mapType;
      const mapForm = $('#campaign-quest-map-form').value;
      if (mapForm) base.mapForm = mapForm;
      const mapSize = $('#campaign-quest-map-size').value;
      if (mapSize) base.mapSize = mapSize;
      // If the user picked a map movement that disagrees with the template's
      // linked scenario, drop the linked scenario fields so the quest runs a
      // freshly generated map of the chosen kind. Without this, picking
      // "Grid Map" on a node-mapped template still ran the linked node scenario.
      const templateMapForm = String(template?.mapForm || template?.travelMode || '').toLowerCase();
      const chosenMapForm = String(mapForm || '').toLowerCase();
      if (template && chosenMapForm && templateMapForm && chosenMapForm !== templateMapForm) {
        delete base.linkedScenario;
        delete base.linkedMapNodes;
        delete base.linkedMapCells;
        delete base.scenarioId;
        delete base.scenario;
        base.forceGeneratedMap = true;
      }
      // Quests built from the manual quest builder default to the lightweight
      // narrative flow: a single begin and end narrative box instead of a
      // fullscreen visual novel at every node. Authored templates can opt
      // back into the full VN by setting `quickNarrative: false` explicitly.
      if (base.quickNarrative !== false) base.quickNarrative = true;
      return base;
    }

    function refreshPreview() {
      const quest = buildQuest();
      const lines = [];
      lines.push(`<b>${_esc(quest.title || 'Untitled quest')}</b>`);
      if (quest.summary) lines.push(_esc(quest.summary));
      if (quest.objectives?.length) {
        lines.push(`<b>Objectives:</b> ${quest.objectives.map((o) => `${_esc(o.label)} (0/${o.required})`).join(' · ')}`);
      }
      if (quest.rewards?.length) {
        lines.push(`<b>Rewards:</b> ${quest.rewards.map((r) => `${_label(r.op)} ${r.amount || r.id || ''}`).join(' · ')}`);
      }
      if (quest.failureConsequences?.length) {
        lines.push(`<b>On fail:</b> ${quest.failureConsequences.map((r) => `${_label(r.op)} ${r.amount || r.text || ''}`).join(' · ')}`);
      }
      lines.push(`<b>Map movement:</b> ${quest.mapForm === 'grid_map' ? 'Grid Map' : 'Node Map'}`);
      lines.push(`<b>Setting/context:</b> ${_esc(_label(quest.mapType || 'any'))}`);
      if (quest.giver) lines.push(`<b>Giver:</b> ${_esc(quest.giver)}`);
      if (quest.tags?.length) lines.push(`<b>Tags:</b> ${quest.tags.map(_esc).join(', ')}`);
      if (quest.randomVariant) lines.push(`<b>Variant:</b> ${_esc(quest.randomVariant)}`);
      previewBox.innerHTML = lines.join('<br>');
      previewBox.hidden = false;
    }

    $('#campaign-quest-template').addEventListener('change', (ev) => {
      const tpl = templates.find((q) => q.id === ev.target.value);
      currentTemplateVariant = null;
      applyTemplate(tpl || null);
    });
    body.querySelectorAll('input:not(.campaign-objective-label):not(.campaign-objective-count):not(.campaign-reward-amount):not(.campaign-reward-id):not(.campaign-reward-text), textarea, select').forEach((el) => {
      if (el.id !== 'campaign-quest-template') el.addEventListener('input', refreshPreview);
    });

    body.querySelectorAll('[data-preset-kind]').forEach((btn) => {
      btn.onclick = () => {
        const preset = QUEST_OBJECTIVE_PRESETS.find((p) => p.kind === btn.dataset.presetKind);
        if (!preset) return;
        addObjective({
          kind: preset.kind,
          label: preset.template.replace('{what}', '...') || preset.label,
          required: preset.required,
          minigame: preset.minigame || null
        });
      };
    });
    body.querySelectorAll('[data-reward-add]').forEach((btn) => {
      btn.onclick = () => {
        const preset = QUEST_REWARD_PRESETS[Number(btn.dataset.rewardAdd)];
        if (!preset) return;
        rewardList.appendChild(rewardRow({ op: preset.op, label: preset.label, amount: preset.defaultAmount }));
        refreshPreview();
      };
    });
    body.querySelector('[data-reward-add-item]').onclick = () => {
      rewardList.appendChild(rewardRow({ op: 'give_item', label: 'Item', amount: 1, itemId: '' }));
      refreshPreview();
    };
    body.querySelectorAll('[data-conseq-add]').forEach((btn) => {
      btn.onclick = () => {
        const preset = QUEST_CONSEQUENCE_PRESETS[Number(btn.dataset.conseqAdd)];
        if (!preset) return;
        consequenceList.appendChild(consequenceRow({ op: preset.op, label: preset.label, amount: preset.defaultAmount }));
        refreshPreview();
      };
    });
    body.querySelector('[data-conseq-add-note]').onclick = () => {
      consequenceList.appendChild(consequenceRow({ op: 'log', label: 'Note Only', text: 'Quest failed.' }));
      refreshPreview();
    };

    $('#campaign-quest-roll').onclick = () => {
      if (!templates.length) return;
      const tpl = _randomizedQuestTemplate(templates[Math.floor(Math.random() * templates.length)]);
      $('#campaign-quest-template').value = tpl.id;
      applyTemplate(tpl);
    };
    $('#campaign-quest-clear').onclick = () => {
      $('#campaign-quest-template').value = '';
      currentTemplateVariant = null;
      applyTemplate(null);
    };
    footer.querySelector('#campaign-add-quest-back').onclick = () => UI().closeModal(overlay);
    footer.querySelector('#campaign-add-quest-commit').onclick = () => {
      const quest = buildQuest();
      Ops().apply({ op: 'add_quest', quest }, { source: 'ui' });
      UI().closeModal(overlay);
      UI().toast(`Quest added: ${quest.title}`, 'success');
    };
    footer.querySelector('#campaign-add-quest-start').onclick = () => {
      if (CS().getState()?.activeScenarioRun) {
        UI().toast('Finish the active scenario before starting a new run', 'info');
        return;
      }
      const quest = buildQuest();
      Ops().apply({ op: 'add_quest', quest }, { source: 'ui' });
      UI().closeModal(overlay);
      UI().toast(`Quest added: ${quest.title}. Starting run…`, 'success');
      // _startQuestScenario ported to action-handlers/quest-launcher.ts (H.3);
      // route this internal caller through the launcher's window.CJS surface.
      window.CJS.CampaignQuestLauncher?.startQuestScenario(quest.id, {
        quest,
        mapForm: _questMapForm(quest),
        mapType: quest.mapType || _questMapType(quest),
        size: quest.mapSize || 'small',
        forceGenerated: !!quest.forceGeneratedMap
      });
    };

    if (prefill && prefill.template) {
      const tpl = templates.find((q) => q.id === prefill.template) || null;
      $('#campaign-quest-template').value = prefill.template;
      applyTemplate(tpl);
    } else {
      applyTemplate(null);
    }
    refreshPreview();
  }

  // Guess an objective kind from free-form label text.
  function _inferObjectiveKind(label = '') {
    const s = String(label).toLowerCase();
    if (/kill \d|kill|cull|slay \d|defeat \d/.test(s)) return 'defeat_count';
    if (/defeat|slay|kill|fight|battle|hunt/.test(s)) return 'defeat';
    if (/recover|retrieve|find|fetch|bring/.test(s)) return 'recover';
    if (/reach|arrive|enter|explore/.test(s)) return 'reach';
    if (/escort|protect|guard/.test(s)) return 'escort';
    if (/investigate|clue|inspect|search/.test(s)) return 'investigate';
    if (/talk|speak|negotiate|ask/.test(s)) return 'talk';
    if (/survive|hold|defend|withstand/.test(s)) return 'survive';
    if (/harvest|forage|reap/.test(s)) return 'harvest';
    if (/hub event|town event|guild pulse|tavern pulse/.test(s)) return 'hub_event';
    if (/challenge|puzzle|maze|trial|mechanism/.test(s)) return 'check';
    if (/gather|collect|mine/.test(s)) return 'gather';
    if (/craft|deliver|build|forge/.test(s)) return 'craft';
    return 'custom';
  }

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
  // _questTaskDescriptor / _questCellFromRef stay in JS (render-side):
  // the launcher has its own TS copies, but `_renderQuestRunTask` (the
  // still-in-JS scenario task strip) reads the same shape for display.
  // These collapse into the launcher's TS module when the renderer
  // ports (H.4).

  function _questTaskDescriptor(quest = {}, scenario = null) {
    const objectives = quest.objectives || [];
    const objective = _questNextObjective(quest);
    const objectiveIndex = Math.max(0, objectives.findIndex((entry) => entry.id === objective?.id));
    const map = (scenario?.mapId && CS().getScenarioMapById?.(scenario.mapId)) || CS().getActiveMap?.();
    const nodeId = Array.isArray(quest.linkedMapNodes)
      ? (quest.linkedMapNodes[objectiveIndex] || quest.linkedMapNodes[quest.linkedMapNodes.length - 1])
      : null;
    if (nodeId) {
      const node = Runner().findNode?.(map, nodeId);
      return {
        label: objective?.label || quest.title || 'Quest task',
        objectiveId: objective?.id || null,
        nodeId,
        location: node?.title || _label(nodeId)
      };
    }

    const linkedCells = Array.isArray(quest.linkedMapCells) ? quest.linkedMapCells : [];
    const cellRef = linkedCells[objectiveIndex] || linkedCells[linkedCells.length - 1] || null;
    const cell = _questCellFromRef(map, cellRef);
    if (cell) {
      return {
        label: objective?.label || quest.title || 'Quest task',
        objectiveId: objective?.id || null,
        cell: { x: Number(cell.x), y: Number(cell.y) },
        location: cell.title || `${cell.x},${cell.y}`
      };
    }

    const success = (scenario?.successConditions || [])[0];
    if (success?.type === 'reach_node') {
      const node = Runner().findNode?.(map, success.nodeId);
      return {
        label: objective?.label || quest.title || 'Quest task',
        objectiveId: objective?.id || null,
        nodeId: success.nodeId,
        location: node?.title || _label(success.nodeId)
      };
    }
    if (success?.type === 'reach_cell') {
      const found = Runner().findCell?.(map, success.x, success.y);
      return {
        label: objective?.label || quest.title || 'Quest task',
        objectiveId: objective?.id || null,
        cell: { x: Number(success.x), y: Number(success.y) },
        location: found?.title || `${success.x},${success.y}`
      };
    }
    return {
      label: objective?.label || quest.title || 'Quest task',
      objectiveId: objective?.id || null,
      location: ''
    };
  }

  function _questCellFromRef(map, ref) {
    if (!map || ref == null) return null;
    if (Array.isArray(ref)) return Runner().findCell?.(map, ref[0], ref[1]) || { x: ref[0], y: ref[1] };
    if (typeof ref === 'object') {
      if (ref.id) return (map.cells || []).find((cell) => cell.id === ref.id) || null;
      if (ref.x != null && ref.y != null) return Runner().findCell?.(map, ref.x, ref.y) || ref;
    }
    if (typeof ref === 'string') return (map.cells || []).find((cell) => cell.id === ref) || null;
    return null;
  }

  // _questHubEvent / _questHarvest ported to action-handlers/quest.ts (H.3).

  // _questMiniGame ported to action-handlers/minigame.ts (H.3).

  function _questObjectiveByKinds(quest = {}, kinds = []) {
    const set = new Set(kinds);
    return (quest.objectives || []).find((objective) => !_questObjectiveDone(objective) && set.has(objective.kind)) || null;
  }

  // _questHarvestLoot ported to action-handlers/quest.ts (H.3).

  // _questCheck / _questHandIn / _questAnswer ported to
  // action-handlers/quest.ts (H.3).

  function _activeQuestById(questId) {
    const quest = CS().getState()?.quests?.[questId];
    return quest && !_isQuestResolved(quest) ? quest : null;
  }

  function _activeRunQuestId(run, scenario) {
    return run?.questId || scenario?.source?.questId || null;
  }

  function _questMapForm(quest = {}) {
    const explicit = String(quest.mapForm || quest.travelMode || '').toLowerCase();
    if (explicit === 'grid_map' || explicit === 'grid') return 'grid_map';
    if (explicit === 'node_map' || explicit === 'node') return 'node_map';
    const text = [quest.movement, quest.mapMode, quest.title, quest.summary, ...(quest.tags || []), ...(quest.contextTags || [])]
      .filter(Boolean).join(' ').toLowerCase();
    if (/grid|tile|square|board|tactical|crawl|maze/.test(text)) return 'grid_map';
    return 'node_map';
  }

  function _questMapType(quest = {}) {
    const explicit = String(quest.mapSetting || '').toLowerCase();
    if (explicit && explicit !== 'any') return explicit;
    const text = [quest.mapType, quest.setting, quest.location, quest.title, quest.summary, ...(quest.tags || [])]
      .filter(Boolean).join(' ').toLowerCase();
    if (/town|city|street|market|guild|urban/.test(text)) return 'urban';
    if (/forest|grove|wood|pine/.test(text)) return 'forest';
    if (/dungeon|crypt|vault/.test(text)) return 'dungeon';
    if (/cave|hollow|den/.test(text)) return 'cave';
    if (/sewer|canal|drain/.test(text)) return 'sewer';
    if (/ruin|relic/.test(text)) return 'ruins';
    if (/temple|shrine|holy/.test(text)) return 'temple';
    if (/house|home|hut/.test(text)) return 'house';
    if (/tavern|inn/.test(text)) return 'tavern';
    if (/castle|keep|tower/.test(text)) return 'castle';
    if (/mountain|ridge|summit|ice|snow/.test(text)) return 'mountain';
    if (/arena|training|spar/.test(text)) return 'arena';
    if (/outdoor|road|trail|field|wild/.test(text)) return 'outdoor';
    return 'any';
  }

  // _ownedInventoryOptions / _takeOpForBucket ported to
  // action-handlers/quest.ts (H.3).

  // Roster GM stat modals (_charNumberOp / _charMpModal / _charStatusModal
  // → damage/heal/level-char, mp-char, status-char) ported to
  // src/campaign/action-handlers/roster-modals.ts (H.3).

  // _partySheetModal ported to action-handlers/roster-modal-pickers.ts
  // (H.3 — party-sheet). The TS handler reads
  // _renderPortraitHero + _renderRosterMember via the new
  // CampaignUI.renderPartySheetHtml bridge (one HTML body for both),
  // and routes the body's data-campaign-action buttons through the
  // action runtime via a local click delegate.

  function _renderPortraitHero(id, member) {
    const initial = (member.name || id || '?').trim().charAt(0).toUpperCase() || '?';
    const portraitSrc = _memberPortrait(member, id);
    const portraitFocus = _memberPortraitFocus(member, id);
    const portrait = portraitSrc
      ? `<img src="${_escAttr(portraitSrc)}" alt="${_escAttr(member.name || id)}" style="${_escAttr(_focusAttrStyle(portraitFocus))}">`
      : `<div class="fallback">${_esc(initial)}</div>`;
    const lvl = member.level || 1;
    const rank = member.rank || 'F';
    const klass = member.class || member.archetype || '';
    return `
      <div class="campaign-portrait-hero">
        <div class="campaign-portrait-frame is-large">${portrait}</div>
        <div class="campaign-portrait-meta">
          <h2>${_esc(member.name || id)}</h2>
          <div class="campaign-portrait-sub">${_esc(klass || 'Adventurer')} · Lv ${lvl} · Rank ${_esc(rank)}</div>
          <div class="campaign-chip-row">
            ${(member.tags || []).slice(0, 6).map((t) => `<span class="campaign-chip">${_esc(t)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }

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

  function _gmOverride(defaultTarget = '') {
    const GM_OPS = [
      { value: 'give_money', label: 'Give Money', kind: 'money' },
      { value: 'take_money', label: 'Take Money', kind: 'money' },
      { value: 'give_jp', label: 'Give JP', kind: 'jp' },
      { value: 'take_jp', label: 'Take JP', kind: 'jp' },
      { value: 'give_item', label: 'Give Item', kind: 'inv', bucket: 'items' },
      { value: 'take_item', label: 'Take Item', kind: 'inv', bucket: 'items' },
      { value: 'give_material', label: 'Give Material', kind: 'inv', bucket: 'materials' },
      { value: 'take_material', label: 'Take Material', kind: 'inv', bucket: 'materials' },
      { value: 'give_food', label: 'Give Food', kind: 'inv', bucket: 'food' },
      { value: 'take_food', label: 'Take Food', kind: 'inv', bucket: 'food' },
      { value: 'damage_character', label: 'Damage Character', kind: 'char' },
      { value: 'heal_character', label: 'Heal Character', kind: 'char' },
      { value: 'add_xp', label: 'Add Character XP', kind: 'charxp' },
      { value: 'add_level', label: 'Add Level', kind: 'level' },
      { value: 'add_rank_points', label: 'Add Rank Points', kind: 'rank_points' },
      { value: 'rank_up_member', label: 'Force Rank Up', kind: 'rank' },
      { value: 'change_stat', label: 'Change Stat', kind: 'stat' },
      { value: 'unlock_job', label: 'Unlock Job', kind: 'job' },
      { value: 'set_job', label: 'Set Job', kind: 'job' },
      { value: 'gain_job_xp', label: 'Add Job XP', kind: 'jobxp' },
      { value: 'recruit_character', label: 'Recruit Character', kind: 'recruit' },
      { value: 'learn_skill', label: 'Learn Skill', kind: 'skill' },
      { value: 'learn_passive', label: 'Learn Passive', kind: 'passive' },
      { value: 'add_status', label: 'Add Status', kind: 'status' },
      { value: 'remove_status', label: 'Remove Status', kind: 'status' },
      { value: 'set_flag', label: 'Set Flag', kind: 'flag' },
      { value: 'clear_flag', label: 'Clear Flag', kind: 'flag' },
      { value: 'log', label: 'Log Note', kind: 'log' },
      { value: 'custom', label: 'Custom JSON', kind: 'custom' }
    ];

    const body = document.createElement('div');
    body.appendChild(_formLabel('Operation'));
    const opSelect = UI().createSelect({
      options: GM_OPS.map((o) => ({ value: o.value, label: o.label })),
      value: defaultTarget ? 'add_xp' : 'give_money',
      onChange: () => renderFields()
    });
    body.appendChild(opSelect);

    const fields = document.createElement('div');
    body.appendChild(fields);

    const partyOptions = () => Object.entries(CS().getState()?.party || {})
      .map(([id, m]) => ({ value: id, label: m.name || id }));
    const defaultPartyTarget = () => {
      const opts = partyOptions();
      return opts.some((entry) => entry.value === defaultTarget) ? defaultTarget : (opts[0]?.value || '');
    };
    const jobOptions = () => (DS().getAllAsArray('jobs') || [])
      .filter((entry) => entry?.id)
      .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry.rank ? `Rank ${entry.rank}` : 'Job' }))
      .sort(_sortOptionLabel);

    let active = {};

    function renderFields() {
      fields.innerHTML = '';
      active = {};
      const def = GM_OPS.find((o) => o.value === opSelect.value) || GM_OPS[0];

      if (def.kind === 'money') {
        fields.appendChild(_formLabel('Currency'));
        const wid = CS().getState().currentWorld;
        const currencyOptions = [
          { value: `${wid}_gold`, label: `${wid} gold` },
          { value: 'jp', label: 'JP' }
        ];
        active.currency = UI().createSelect({ options: currencyOptions, value: `${wid}_gold` });
        fields.appendChild(active.currency);
        fields.appendChild(_formLabel('Amount'));
        active.amount = UI().createNumberSlider({ value: 10, min: 1, max: 9999, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'jp') {
        fields.appendChild(_formLabel('Amount'));
        active.amount = UI().createNumberSlider({ value: 1, min: 1, max: 999, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'inv') {
        const opts = _bucketOptions(def.bucket);
        fields.appendChild(_formLabel(def.bucket === 'materials' ? 'Material' : def.bucket === 'food' ? 'Food' : 'Item'));
        active.id = UI().createSearchableSelect({ options: opts, placeholder: 'Search…' });
        fields.appendChild(active.id);
        fields.appendChild(_formLabel('Quantity'));
        active.qty = UI().createNumberSlider({ value: 1, min: 1, max: 99, step: 1 });
        fields.appendChild(active.qty);
      } else if (def.kind === 'char') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Amount'));
        active.amount = UI().createNumberSlider({ value: 5, min: 1, max: 999, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'charxp') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('XP'));
        active.amount = UI().createNumberSlider({ value: 25, min: 1, max: 9999, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'level') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Levels'));
        active.amount = UI().createNumberSlider({ value: 1, min: 1, max: 20, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'rank_points') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Rank Points'));
        active.amount = UI().createNumberSlider({ value: 5, min: 1, max: 999, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'rank') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Target Rank'));
        active.rank = UI().createSelect({
          options: (C()?.RANKS || ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SR', 'SSR']).map((rank) => ({ value: rank, label: rank })),
          value: 'E'
        });
        fields.appendChild(active.rank);
      } else if (def.kind === 'stat') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Stat'));
        active.stat = UI().createSelect({
          options: (C()?.STATS || ['S', 'P', 'E', 'C', 'I', 'A', 'L']).map((value) => ({ value, label: `${value} - ${_statName(value)}` })),
          value: 'S'
        });
        fields.appendChild(active.stat);
        fields.appendChild(_formLabel('Change'));
        active.amount = UI().createNumberSlider({ value: 1, min: -20, max: 20, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'recruit') {
        active.character = UI().createSearchableSelect({ options: _characterOptions(), placeholder: 'Search characters...', renderItem: _pickerItem });
        fields.appendChild(active.character);
      } else if (def.kind === 'job' || def.kind === 'jobxp') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Job'));
        active.job = UI().createSearchableSelect({ options: jobOptions(), placeholder: 'Search jobs...', renderItem: _pickerItem });
        fields.appendChild(active.job);
        if (def.kind === 'jobxp') {
          fields.appendChild(_formLabel('Job XP'));
          active.amount = UI().createNumberSlider({ value: 25, min: 1, max: 9999, step: 1 });
          fields.appendChild(active.amount);
        }
      } else if (def.kind === 'skill') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Skill'));
        active.skill = UI().createSearchableSelect({ options: _skillOptions(active.target.value), placeholder: 'Search skills...', renderItem: _pickerItem });
        fields.appendChild(active.skill);
      } else if (def.kind === 'passive') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Passive'));
        active.passive = UI().createSearchableSelect({ options: _passiveOptions(active.target.value), placeholder: 'Search passives...', renderItem: _pickerItem });
        fields.appendChild(active.passive);
      } else if (def.kind === 'status') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: defaultPartyTarget() });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Status'));
        active.status = UI().createSearchableSelect({ options: _statusOptions(), placeholder: 'Search statuses…' });
        fields.appendChild(active.status);
        if (def.value === 'add_status') {
          fields.appendChild(_formLabel('Duration'));
          active.duration = UI().createSelect({
            options: [
              { value: 'manual', label: 'Manual' },
              { value: 'scene', label: 'Scene' },
              { value: 'scenario', label: 'Scenario' },
              { value: '3', label: '3 turns' },
              { value: '5', label: '5 turns' }
            ],
            value: 'manual'
          });
          fields.appendChild(active.duration);
        }
      } else if (def.kind === 'flag') {
        fields.appendChild(_formLabel('Flag name'));
        active.flag = document.createElement('input');
        active.flag.type = 'text';
        active.flag.placeholder = 'flag_id';
        active.flag.style.width = '100%';
        fields.appendChild(active.flag);
        if (def.value === 'set_flag') {
          fields.appendChild(_formLabel('Value (text or true)'));
          active.value = document.createElement('input');
          active.value.type = 'text';
          active.value.placeholder = 'leave blank for true';
          active.value.style.width = '100%';
          fields.appendChild(active.value);
        }
      } else if (def.kind === 'log') {
        fields.appendChild(_formLabel('Log text'));
        active.text = document.createElement('textarea');
        active.text.style.width = '100%';
        active.text.style.minHeight = '90px';
        fields.appendChild(active.text);
      } else if (def.kind === 'custom') {
        fields.appendChild(_formLabel('Custom JSON op'));
        active.json = document.createElement('textarea');
        active.json.style.width = '100%';
        active.json.style.minHeight = '120px';
        active.json.placeholder = '{"op":"give_material","id":"haven_wolf_pelt","qty":2}';
        fields.appendChild(active.json);
      }
    }

    renderFields();

    _formModal({
      title: 'GM Override',
      body,
      width: '560px',
      primaryLabel: 'Apply',
      onSubmit: () => {
        try {
          const def = GM_OPS.find((o) => o.value === opSelect.value) || GM_OPS[0];
          let op;
          if (def.kind === 'money') {
            op = { op: def.value, currency: active.currency.value, amount: active.amount._getValue() };
          } else if (def.kind === 'jp') {
            op = { op: def.value, amount: active.amount._getValue() };
          } else if (def.kind === 'inv') {
            const id = active.id._getValue();
            if (!id) { UI().toast('Pick an item', 'error'); return false; }
            op = { op: def.value, id, qty: active.qty._getValue() || 1 };
          } else if (def.kind === 'char') {
            op = { op: def.value, target: active.target.value, amount: active.amount._getValue() };
          } else if (def.kind === 'charxp') {
            op = { op: def.value, target: active.target.value, amount: active.amount._getValue() || 0 };
          } else if (def.kind === 'level') {
            op = { op: def.value, target: active.target.value, amount: active.amount._getValue() || 1 };
          } else if (def.kind === 'rank_points') {
            op = { op: def.value, target: active.target.value, amount: active.amount._getValue() || 0 };
          } else if (def.kind === 'rank') {
            op = { op: def.value, target: active.target.value, toRank: active.rank.value, force: true, source: 'gm_override' };
          } else if (def.kind === 'stat') {
            op = { op: def.value, target: active.target.value, stat: active.stat.value, amount: active.amount._getValue() || 0 };
          } else if (def.kind === 'recruit') {
            const characterId = active.character._getValue();
            if (!characterId) { UI().toast('Pick a character', 'error'); return false; }
            op = { op: def.value, characterId };
          } else if (def.kind === 'job' || def.kind === 'jobxp') {
            const jobId = active.job._getValue();
            if (!jobId) { UI().toast('Pick a job', 'error'); return false; }
            op = { op: def.value, target: active.target.value, jobId, force: true };
            if (def.kind === 'jobxp') op.amount = active.amount._getValue() || 0;
          } else if (def.kind === 'skill') {
            const skillId = active.skill._getValue();
            if (!skillId) { UI().toast('Pick a skill', 'error'); return false; }
            op = { op: def.value, target: active.target.value, skillId };
          } else if (def.kind === 'passive') {
            const passiveId = active.passive._getValue();
            if (!passiveId) { UI().toast('Pick a passive', 'error'); return false; }
            op = { op: def.value, target: active.target.value, passiveId };
          } else if (def.kind === 'status') {
            const status = active.status._getValue();
            if (!status) { UI().toast('Pick a status', 'error'); return false; }
            op = { op: def.value, target: active.target.value, status };
            if (def.value === 'add_status') op.duration = active.duration.value || 'manual';
          } else if (def.kind === 'flag') {
            const flag = active.flag.value.trim();
            if (!flag) { UI().toast('Flag name required', 'error'); return false; }
            op = { op: def.value, flag };
            if (def.value === 'set_flag') op.value = active.value.value.trim() || true;
          } else if (def.kind === 'log') {
            op = { op: 'log', text: active.text.value.trim() };
          } else if (def.kind === 'custom') {
            op = JSON.parse(active.json.value.trim() || '{}');
          }
          Ops().apply(op, { source: 'gm_override' });
        } catch (error) {
          UI().toast(error.message || 'Invalid override', 'error');
          return false;
        }
      }
    });
  }

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

  function _memberBase(id, member = {}) {
    return DS().get('characters', member.baseCharacterId || id) || {};
  }

  // Adventurer rank summary for a member. Effective rank reflects the
  // current world's ceiling cap so the player sees the cap at a glance.
  // RP progress shows the gap to the next-rank threshold.
  function _memberRankInfo(member = {}) {
    const F = window.CJS.Formulas;
    const adv = member.adventurer || { rank: member.rank || 'F', rankPoints: 0, trialPending: false };
    const rank = adv.rank || 'F';
    const world = DS().get('worlds', CS().getState()?.currentWorld) || {};
    const ceiling = world.ceiling || null;
    const effective = F?.effectiveRank ? F.effectiveRank(rank, ceiling) : rank;
    const capped = ceiling && effective !== rank;
    const next = F?.nextRank ? F.nextRank(rank) : null;
    const threshold = next && F?.rpThresholdFor ? F.rpThresholdFor(next) : 0;
    const rp = Math.max(0, Number(adv.rankPoints || 0));
    const pct = threshold > 0 ? Math.max(0, Math.min(100, Math.round((rp / threshold) * 100))) : 0;
    return {
      rank,
      effective,
      capped,
      ceiling,
      label: capped ? `${rank} (eff ${effective})` : rank,
      next,
      threshold,
      rp,
      pct,
      atMax: !next,
      trialPending: !!adv.trialPending
    };
  }

  function _renderRankBar(info) {
    if (!info || info.atMax) {
      return '<div class="campaign-muted" style="font-size:0.72rem">Rank maxed (SSR)</div>';
    }
    if (info.threshold <= 0) return '';
    return `<div class="campaign-bar" style="margin-top:4px"><span class="mp" style="width:${info.pct}%"></span><b>RP ${info.rp}/${info.threshold} → ${_esc(info.next)}</b></div>`;
  }

  function _memberStats(id, member = {}) {
    const base = _memberBase(id, member);
    const stats = { ...(base.stats || {}) };
    for (const [stat, amount] of Object.entries(member.statOverrides || {})) {
      stats[stat] = Number(stats[stat] || 0) + Number(amount || 0);
    }
    const ordered = {};
    for (const stat of C()?.STATS || Object.keys(stats)) ordered[stat] = stats[stat] || 0;
    return ordered;
  }

  function _renderResistances(base, member, stats) {
    const F = window.CJS.Formulas;
    const weak = [...(base.weak || []), ...(member.weak || [])].filter((v, i, a) => a.indexOf(v) === i);
    const resist = [...(base.resist || []), ...(member.resist || [])].filter((v, i, a) => a.indexOf(v) === i);
    const immune = [...(base.immune || []), ...(member.immune || [])].filter((v, i, a) => a.indexOf(v) === i);

    const elements = C()?.ELEMENTS || ['Physical', 'Fire', 'Water', 'Lightning', 'Earth', 'Wind', 'Nature', 'Light', 'Dark', 'Chaos'];

    let html = '<div class="campaign-affinity-grid">';

    for (const el of elements) {
      const slug = String(el).toLowerCase();
      let stateClass = 'is-neutral';
      let stateText = '<span class="campaign-affinity-state">--</span>';
      if (immune.includes(el)) { stateClass = 'is-immune'; stateText = '<strong class="campaign-affinity-state">Nu</strong>'; }
      else if (resist.includes(el)) { stateClass = 'is-resist'; stateText = '<strong class="campaign-affinity-state">Rs</strong>'; }
      else if (weak.includes(el)) { stateClass = 'is-weak'; stateText = '<strong class="campaign-affinity-state">Wk</strong>'; }

      html += `<div class="campaign-affinity-pill el-${slug} ${stateClass}" data-element="${slug}" title="${_escAttr(el + ': ' + (immune.includes(el) ? 'Immune (Nu)' : resist.includes(el) ? 'Resists (Rs)' : weak.includes(el) ? 'Weak (Wk)' : 'Neutral'))}">
        <span class="campaign-affinity-name">${_esc(el)}</span>
        ${stateText}
      </div>`;
    }
    html += '</div>';

    const physDR = F?.calcPhysicalDR ? F.calcPhysicalDR(stats) : 0;
    const magDR = F?.calcMagicDR ? F.calcMagicDR(stats) : 0;
    const chaosDR = F?.calcChaosDR ? F.calcChaosDR(stats) : 0;

    html += '<div class="campaign-affinity-subheading">Damage Reduction</div>';
    html += `<div class="campaign-dr-row">
      <span class="campaign-dr-chip" title="Reduces incoming Physical damage"><b class="campaign-dr-icon">🗡</b><span class="campaign-dr-label">Phys</span><b class="campaign-dr-value">${physDR}</b></span>
      <span class="campaign-dr-chip" title="Reduces incoming Magical damage"><b class="campaign-dr-icon">✨</b><span class="campaign-dr-label">Magic</span><b class="campaign-dr-value">${magDR}</b></span>
      <span class="campaign-dr-chip" title="Reduces incoming Chaos damage"><b class="campaign-dr-icon">🌀</b><span class="campaign-dr-label">Chaos</span><b class="campaign-dr-value">${chaosDR}</b></span>
    </div>`;

    return html;
  }

  function _renderEquipmentLoadout(memberId, member = {}) {
    const slots = _normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    const weaponTypes = _allowedTypes(member, 'allowedWeaponTypes').map(_label).join(', ') || 'Any';
    const armorTypes = _allowedTypes(member, 'allowedArmorTypes').map(_label).join(', ') || 'Any';
    const rows = ['weapon', 'armor', 'accessory1', 'accessory2'].map((slot) => {
      const itemId = slots[slot];
      const item = DS().get('items', itemId);
      const itemName = item?.name || itemId || 'Empty';
      const type = item ? _equipmentType(item) : '';
      const meta = item ? [type, item.rarity].filter(Boolean).join(' | ') : 'Empty';
      const slotKind = _slotKind(slot) || 'item';
      const iconHtml = item
        ? _icon(item, { kind: slotKind, size: 'md', alt: itemName })
        : `<span class="cjs-icon cjs-icon-md cjs-icon-${slotKind}" style="opacity:.4">+</span>`;
      return `
        <div class="campaign-equipment-line">
          <div class="campaign-equipment-icon">${iconHtml}</div>
          <div>
            <strong>${_esc(_slotLabel(slot))}</strong>
            <small>${_esc(itemName)}${meta ? ` | ${_esc(meta)}` : ''}</small>
            ${item ? `<p>${_esc(_equipmentDesc(item))}</p>` : ''}
          </div>
          <div class="campaign-row-actions">
            <button class="campaign-icon-btn" data-campaign-action="equip-item" data-id="${_escAttr(memberId)}" data-slot="${_escAttr(slot)}">Equip</button>
            ${item ? `<button class="campaign-icon-btn danger" data-campaign-action="unequip-item" data-id="${_escAttr(memberId)}" data-slot="${_escAttr(slot)}">-</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
    return `
      <div class="campaign-equipment-proficiency">Weapons: ${_esc(weaponTypes)} | Armor: ${_esc(armorTypes)} | Accessories: any two different types</div>
      ${rows}
    `;
  }

  // Equipment helpers (_cleanType, _inferType, _weaponType, _armorType,
  // _accessoryType, _allowedTypes, _memberCanUseWeapon, _memberCanUseArmor,
  // _equipmentKind, _equipmentType, _weaponSummary, _effectSummary,
  // _equipmentDesc, _delta, _slotKind, _slotLabel, _normalizeEquipmentSlots,
  // _equipmentChangeDescription, _equipmentOptions, _equipmentPickerItem)
  // live in src/campaign/util/cui-equipment.ts (bound as aliases at the top).

  function _memberSkillEntries(id, member = CS().getState()?.party?.[id] || {}) {
    const base = _memberBase(id, member);
    const out = [];
    const seen = new Set();
    for (const entry of [...(base.skills || []), ...(member.learnedSkills || [])]) {
      const skillId = _skillEntryId(entry);
      if (!skillId || seen.has(skillId)) continue;
      seen.add(skillId);
      out.push(typeof entry === 'string' ? { skillId } : entry);
    }
    return out;
  }

  function _memberLearnedSkillIds(id) {
    const member = CS().getState()?.party?.[id] || {};
    return (member.learnedSkills || []).map(_skillEntryId).filter(Boolean);
  }

  function _skillEntryId(entry) {
    return typeof entry === 'string' ? entry : entry?.skillId || null;
  }

  function _memberPassives(id, member = {}) {
    const base = _memberBase(id, member);
    return Array.from(new Set([...(base.innatePassives || []), ...(member.learnedPassives || [])].filter(Boolean)));
  }

  function _characterOptions() {
    const state = CS().getState();
    const current = new Set(Object.keys(state?.party || {}));
    const source = CM()?.getVisibleItems?.('characters') || DS().getAllAsArray('characters');
    return source
      .filter((entry) => entry?.id && !current.has(entry.id) && (entry.team || 'player') !== 'enemy')
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: `${entry.rank || 'F'} | ${(entry.skills || []).length} skills`,
        description: _desc(entry),
        tags: entry.tags || []
      }))
      .sort(_sortOptionLabel);
  }

  function _skillOptions(memberId) {
    const known = new Set(_memberSkillEntries(memberId).map(_skillEntryId));
    const source = CM()?.getVisibleItems?.('skills') || DS().getAllAsArray('skills');
    return source
      .filter((entry) => entry?.id && !known.has(entry.id))
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: _skillMeta(entry),
        description: _desc(entry),
        tags: entry.tags || []
      }))
      .sort(_sortOptionLabel);
  }

  function _passiveOptions(memberId) {
    const member = CS().getState()?.party?.[memberId] || {};
    const known = new Set(_memberPassives(memberId, member));
    const passiveSource = CM()?.getVisibleItems?.('passives') || DS().getAllAsArray('passives');
    const passiveOptions = passiveSource.map((entry) => ({
      value: entry.id,
      label: entry.name || entry.id,
      sub: 'Passive',
      description: _desc(entry),
      tags: entry.tags || []
    }));
    const passiveTriggers = new Set(['stat_mod', 'dr_mod', 'element_mod', 'crit_mod', 'evasion_mod', 'accuracy_mod', 'ap_mod', 'movement_mod', 'range_mod', 'cost_mod', 'cooldown_mod', 'damage_mod', 'hp_mod', 'mp_mod', 'status_resist_mod', 'double_action', 'triple_action']);
    const effectOptions = DS().getAllAsArray('effects')
      .filter((entry) => passiveTriggers.has(entry.trigger))
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: `Effect | ${entry.trigger || ''}`,
        description: _desc(entry),
        tags: entry.tags || []
      }));
    return [...passiveOptions, ...effectOptions]
      .filter((entry) => entry.value && !known.has(entry.value))
      .sort(_sortOptionLabel);
  }

  function _statusDef(statusId) {
    const custom = DS().get('statuses', statusId);
    if (custom) return custom;
    const builtins = C()?.STATUS_DEFINITIONS || {};
    return builtins[statusId] ? { id: statusId, ...builtins[statusId] } : null;
  }

  function _renderJobChip(memberId, member = {}) {
    const F = window.CJS.Formulas;
    const jobId = member.currentJob || null;
    if (!jobId) return `<span class="campaign-muted">No job</span>`;
    const job = DS().get('jobs', jobId);
    if (!job) return `<span class="campaign-muted">Unknown job: ${_esc(jobId)}</span>`;
    const prog = member.jobProgress?.[jobId] || { xp: 0, level: 1 };
    const cap = F?.getJobMaxLevel ? F.getJobMaxLevel(job) : 10;
    const level = Math.max(1, Number(prog.level || 1));
    const xp = Number(prog.xp || 0);
    const xpToNext = F?.calcJobXpToNextLevel ? F.calcJobXpToNextLevel(job, xp, level) : null;
    const meta = level >= cap ? `(max)` : (xpToNext != null ? `(${xpToNext} XP to next)` : '');
    const personaChip = _renderPersonaChip(memberId, member);
    const personaSuffix = personaChip ? ` <span class="campaign-muted">·</span> ${personaChip}` : '';
    return `${_icon(job, { kind: 'job', size: 'xs' })} ${_esc(job.name || jobId)} Lv ${level}/${cap} | XP ${xp} ${meta}${personaSuffix}`;
  }

  function _renderPersonaChip(memberId, member = {}) {
    const personaId = member.activePersona || null;
    if (!personaId) return '';
    const persona = DS().get('personas', personaId);
    if (!persona) return `<span class="campaign-muted" title="Unknown persona">${_esc(personaId)}</span>`;
    const state = CS().getState();
    const outOfWorld = persona.world && state?.currentWorld && persona.world !== state.currentWorld;
    const worldChip = persona.world ? (DS().get('worlds', persona.world)?.displayName || persona.world) : '';
    const tooltip = outOfWorld
      ? `${persona.name} (${worldChip}) — out of world. Damage dealt ×${Number(persona.crossWorldPenalty?.damageDealtMultiplier ?? 1)}, taken ×${Number(persona.crossWorldPenalty?.damageTakenMultiplier ?? 1)}.`
      : `${persona.name}${worldChip ? ` (${worldChip})` : ''}`;
    const style = outOfWorld ? ' style="color:#f59e0b"' : '';
    return `<span title="${_escAttr(tooltip)}"${style}>${_esc(persona.icon || '🎭')} ${_esc(persona.name)}${outOfWorld ? ' ⚠' : ''}</span>`;
  }

  // Compact pill next to the name. Shows "<world> <PersonaName> | Job/Branch"
  // when meaningful, or "Out of world ⚠" when the persona doesn't match.
  function _renderPersonaPill(memberId, member = {}) {
    const personaId = member.activePersona || null;
    if (!personaId) return '';
    const persona = DS().get('personas', personaId);
    if (!persona) return '';
    const state = CS().getState();
    const outOfWorld = persona.world && state?.currentWorld && persona.world !== state.currentWorld;
    const worldName = persona.world ? (DS().get('worlds', persona.world)?.displayName || persona.world) : '';
    const jobShort = member.currentJob ? (DS().get('jobs', member.currentJob)?.name || member.currentJob) : '';
    const tooltip = outOfWorld
      ? `${persona.name} (${worldName}) — out of world. ⚠`
      : `${persona.name} (${worldName})`;
    const cls = outOfWorld ? 'campaign-pill is-blocked' : 'campaign-pill';
    const label = jobShort ? `${persona.name} · ${jobShort}` : persona.name;
    return `<span class="${cls}" title="${_escAttr(tooltip)}" data-campaign-action="change-persona" data-id="${_escAttr(memberId)}" style="cursor:pointer">${_esc(persona.icon || '🎭')} ${_esc(label)}${outOfWorld ? ' ⚠' : ''}</span>`;
  }

  function _skillMeta(skill = {}, entry = {}) {
    const parts = [];
    if (skill.ap != null) parts.push(`${skill.ap} AP`);
    if (skill.mp != null) parts.push(`${skill.mp} MP`);
    if (skill.range != null) parts.push(`Range ${skill.range}`);
    if (skill.power != null) parts.push(`Power ${skill.power}`);
    const requiredWeapons = _skillWeaponTypes(skill);
    if (requiredWeapons.length) parts.push(`Weapon ${requiredWeapons.map(_label).join('/')}`);
    if (entry.level) parts.push(`Lv ${entry.level}`);
    return parts.join(' | ') || skill.category || skill.type || '';
  }

  function _statName(stat) {
    return C()?.STAT_NAMES?.[stat] || stat;
  }

  function _skillWeaponTypes(skill = {}) {
    const raw = skill.requiredWeaponTypes || skill.requiredWeaponType || skill.weaponTypeRequired || [];
    return (Array.isArray(raw) ? raw : [raw]).map(_cleanType).filter(Boolean);
  }

  // _desc, _pickerItem, _sortOptionLabel, _formLabel, _formModal live in
  // src/campaign/util/cui-modals.ts (bound as aliases at the top of this IIFE).

  // _bucketOptions, _statusOptions, _seedOptions, _worldOptions, _tentOptions
  // live in src/campaign/util/cui-options.ts (bound as aliases at the top of this IIFE).

  // _opPickerModal, _textareaModal, _numberModal live in
  // src/campaign/util/cui-modals.ts (bound as aliases at the top of this IIFE).

  // Leaf utilities (_esc, _escAttr, _label, _safe, _truncate, _lootLine,
  // _currencyLabel, _recordName, _formatBundleText) live in
  // src/campaign/util/cui-utils.ts (Phase H.4) and are bound as aliases
  // at the top of this IIFE via window.CJS.CampaignUIInternal.Utils.

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
  function _sideCardData(card = {}, options = {}) {
    const compact = !!options.compact;
    const choices = card.suggestedChoices || [];
    const primaryOps = _cardChoiceOps(card);
    const summary = _consequenceSummary(primaryOps, { hasText: !!(card.prompt || card.text || card.summary) });
    return {
      id: String(card.id || ''),
      title: String(card.title || card.name || card.id || ''),
      subtitle: `${card.type || 'side content'} | ${card.source || ''} | ${card.status || 'idea'}`,
      tone: String(summary.tone || 'flavor'),
      toneLabel: String(summary.label || ''),
      canonRisk: String(card.canonRisk || 'green'),
      canonRiskClass: Side().riskClass(card.canonRisk),
      compact,
      purposeHtml: compact ? '' : _renderInlinePurpose(_purposeKeyForCard(card)),
      prompt: String(card.prompt || ''),
      text: String(card.text || ''),
      summary: (!compact && card.summary) ? String(card.summary) : '',
      flavorTrailHtml: compact ? '' : _renderFlavorTrail(card),
      gmKeywords: (!compact && Array.isArray(card.gmKeywords)) ? card.gmKeywords.map(String) : [],
      gmNote: compact ? '' : String(card.gmNote || ''),
      choiceStackHtml: (!compact && choices.length)
        ? choices.map((choice, index) => _renderConsequencePreview(choice.ops || [], {
            title: choice.label || `Choice ${index + 1}`,
            emptyTitle: choice.label || `Choice ${index + 1}`,
            emptyText: 'Flavor choice only. Save it as text or use it to steer the next scene.'
          })).join('')
        : '',
      choiceButtons: choices.map((choice, index) => ({
        index,
        label: String(choice.label || `Choice ${index + 1}`)
      })),
      showDismiss: !compact
    };
  }

  function _rumorRowData(rumor = {}, options = {}) {
    const hubId = window.CJS.CampaignHub?.getCurrentHubId?.() || '';
    return {
      id: String(rumor.id || ''),
      hubId: String(hubId),
      text: String(rumor.text || rumor.id || ''),
      statusLabel: String(rumor.status || 'active'),
      riskLabel: _label(rumor.canonRisk || 'green'),
      canonRisk: String(rumor.canonRisk || 'green'),
      canonRiskClass: Side().riskClass(rumor.canonRisk),
      compact: !!options.compact
    };
  }

  // `getSideForgeData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/hub.ts`). The shared `_sideCardData` and
  // `_rumorRowData` helpers ported earlier in the same phase.

  // `getOracleForgeData` moved to TS in Phase H.4
  // (`src/campaign/tabs/data/hub.ts`). The shared `_sideCardData` and
  // `_rumorRowData` helpers also moved alongside; `getSideForgeData` +
  // `getTownSnapshotData` still call the JS originals until they port.

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
    // Exposes the frozen helper bundle that vanilla tab modules consume
    // (memberBase, memberStats, renderEquipmentLoadout, etc.). React tabs
    // call into these for the closure-private math + sub-renderers that
    // would be invasive to port one-by-one to TypeScript right now.
    getTabHelpers: () => _tabHelpers(),
    // Returns the HTML body string for any closure-private vanilla
    // renderer the React-tab bridge wraps.
    renderTabBody,
    // Story-director beat modal still needs the closure-private card HTML
    // (G.11b kept this renderer as HTML). Exposed for action-handlers/
    // story-director-modals.ts; goes away when the renderer ports.
    renderStoryDirectorCardHtml: (card, options) => _renderStoryDirectorCard(card, options),
    // ScenarioSummary's questRunTask uses _questTaskDescriptor (still in JS —
    // reads CampaignState.getScenarioMapById + ScenarioRunner.findNode/findCell
    // against the active scenario map) to produce one HTML block per active
    // run. The TS data builder (`src/campaign/tabs/data/resultPanels.ts`)
    // embeds it via this bridge; goes away when the descriptor ports.
    renderQuestRunTaskHtml: (state, run, scenario) => _renderQuestRunTask(state, run, scenario) || '',
    // `getShapePillsData` removed in Phase H.4 — the TS port at
    // `src/campaign/tabs/data/scenarioShared.ts::shapePillsData` is now
    // the single source of truth. The inspect-scenario action handler
    // imports it directly.
    // `getWorldMenuDef` removed in Phase H.4 — `worldMenuDef` ported to
    // `src/campaign/tabs/data/worldGate.ts`; the travel-world-card TS
    // action handler imports it directly.
    // Roster option builders (still-JS closures shared between modal
    // handlers + the still-JS GM override modal). Exposed for
    // action-handlers/roster-modal-pickers.ts (recruit-character,
    // learn-skill, learn-passive). The H.4 data builders take these.
    rosterCharacterOptions: () => _characterOptions(),
    rosterSkillOptions: (memberId) => _skillOptions(memberId),
    rosterPassiveOptions: (memberId) => _passiveOptions(memberId),
    // Skill meta text generator (used by the skill-detail modal's
    // header line). Reads the same fields the still-JS render code
    // does so the modal stays in sync.
    skillMetaText: (skill, entry) => _skillMeta(skill, entry),
    // Generic icon HTML emitter (Portraits.icon). Used by the skill-
    // detail modal header inline icon. The still-JS roster renders
    // also use this — keeping a single bridge entry point keeps the
    // icon styling consistent.
    recordIconHtml: (record, opts) => _icon(record, opts),
    // Member rank info (effective rank, RP, threshold, %, gates).
    // Also read by cui-party-tab.js render code — keeping a single
    // source of truth lets the rank-up-apply modal show the exact
    // same numbers the party tab does.
    memberRankInfo: (member) => _memberRankInfo(member),
    // Party sheet body HTML — portrait hero + full roster member card.
    // Used by the party-sheet modal in TS. Built here so the portrait
    // helpers (Portraits.memberPortrait / .memberPortraitFocus /
    // .focusAttrStyle) and the still-JS PartyTab.renderRosterMember
    // stay private — the modal handler only knows the HTML body shape.
    renderPartySheetHtml: (id, member) =>
      _renderPortraitHero(id, member) + _renderRosterMember(id, member),
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
    // Big modal builders that still live in JS (each is 100–500 lines
    // with many closure-private sub-helpers — render-side data builders
    // also depend on them). The TS action handlers in
    // action-handlers/manual-builders.ts wrap these as thin dispatchers
    // so the action contract is registry-backed even while the modal
    // implementation stays JS. H.4 ports the bodies + their data
    // builders together.
    openManualEventBuilder: (prefill) => _openManualEventBuilder(prefill || {}),
    openQuestModal: (prefill) => _openQuestModal(prefill || {}),
    openGmOverride: (defaultTarget) => _gmOverride(defaultTarget || ''),
    // `openManualSceneBuilder` bridge removed in Phase H.4 — the scene
    // builder ported to `src/campaign/action-handlers/scene-builder.ts`;
    // the story-manual-note handler calls it directly.
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
