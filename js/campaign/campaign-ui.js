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

  // Leaf utilities live in `js/campaign/ui/cui-utils.js`; bind short
  // aliases so the rest of this file reads the same as before.
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

  // Portrait + icon helpers live in `js/campaign/ui/cui-portraits.js`.
  const _CUIPortraits = window.CJS.CampaignUIInternal.Portraits;
  const _icon = _CUIPortraits.icon;
  const _memberPortrait = _CUIPortraits.memberPortrait;
  const _memberPortraitFocus = _CUIPortraits.memberPortraitFocus;
  const _focusAttrStyle = _CUIPortraits.focusAttrStyle;

  // Modal + picker primitives live in `js/campaign/ui/cui-modals.js`.
  const _CUIModals = window.CJS.CampaignUIInternal.Modals;
  const _desc = _CUIModals.desc;
  const _pickerItem = _CUIModals.pickerItem;
  const _sortOptionLabel = _CUIModals.sortOptionLabel;
  const _formLabel = _CUIModals.formLabel;
  const _formModal = _CUIModals.formModal;
  const _opPickerModal = _CUIModals.opPickerModal;
  const _textareaModal = _CUIModals.textareaModal;
  const _numberModal = _CUIModals.numberModal;

  // Option builders live in `js/campaign/ui/cui-options.js`.
  const _CUIOptions = window.CJS.CampaignUIInternal.Options;
  const _bucketOptions = _CUIOptions.bucketOptions;
  const _statusOptions = _CUIOptions.statusOptions;
  const _seedOptions = _CUIOptions.seedOptions;
  const _worldOptions = _CUIOptions.worldOptions;
  const _tentOptions = _CUIOptions.tentOptions;

  // HTML control builders live in `js/campaign/ui/cui-controls.js`.
  const _CUIControls = window.CJS.CampaignUIInternal.Controls;
  const _purposeTone = _CUIControls.purposeTone;
  const _purposeKeyForCard = _CUIControls.purposeKeyForCard;
  const _renderInlinePurpose = _CUIControls.renderInlinePurpose;
  const _renderRumorPurpose = _CUIControls.renderRumorPurpose;
  const _impactLegendItem = _CUIControls.impactLegendItem;
  const _controlGroup = _CUIControls.controlGroup;
  const _actionMenu = _CUIControls.actionMenu;
  const _actionBtn = _CUIControls.actionBtn;
  const _renderTownActionButton = _CUIControls.renderTownActionButton;

  // Log rendering helpers live in `js/campaign/ui/cui-log.js`.
  const _CUILog = window.CJS.CampaignUIInternal.Log;
  const _logKind = _CUILog.logKind;
  const _formatLogTime = _CUILog.formatLogTime;
  const _logMeta = _CUILog.logMeta;
  const _renderLogEntry = _CUILog.renderLogEntry;

  // Equipment helpers live in `js/campaign/ui/cui-equipment.js`.
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
  let _lastFocus = null;
  let _escBound = false;
  let _lastPendingBattleKey = '';
  let _drawerEl = null;
  let _drawerBackdropEl = null;
  let _bootIncompatibleNotice = null;
  let _mgTestLevels = {};
  const _storyContextCache = {
    globalIndex: { status: 'idle', data: null, promise: null },
    allWorld: { status: 'idle', text: '', promise: null },
    worlds: {},
    structuredWorlds: {}
  };

  const MODES = [
    ['town', 'Town', '🏠'],
    ['workshop', 'Workshop', '🛠'],
    ['scenario', 'Scenario', '⚔']
  ];

  const MODE_TABS = {
    town: [
      ['overview', 'Overview'],
      ['roster', 'Roster'],
      ['oracleForge', 'Events & Oracle'],
      ['sideForge', 'Hub Pulse'],
      ['shops', 'Shops & Rest']
    ],
    workshop: [
      ['cook', 'Cook'],
      ['craft', 'Forge'],
      ['farm', 'Farm'],
      ['inventory', 'Inventory']
    ],
    scenario: [
      ['scenarios', 'Briefing'],
      ['maps', 'Run']
    ]
  };

  const UTILITY_TABS = [
    ['quests', 'Quests'],
    ['logs', 'Logs'],
    ['settings', 'Settings']
  ];

  const TAB_TO_MODE = (() => {
    const out = {};
    for (const [mode, tabs] of Object.entries(MODE_TABS)) {
      for (const [id] of tabs) out[id] = mode;
    }
    return out;
  })();

  const APP_MODES = [
    ['world', 'World', 'WD'],
    ['story', 'Story', 'ST'],
    ['quest', 'Quest', 'QT'],
    ['event', 'Event', 'EV'],
    ['activities', 'Activities', 'AC']
  ];

  const APP_MODE_TABS = {
    world: [
      ['worldGate', 'World Gate']
    ],
    story: [
      ['storyHome', 'Story'],
      ['storySummary', 'Story Log']
    ],
    quest: [
      ['questHome', 'Quest'],
      ['quests', 'Tracker']
    ],
    event: [
      ['eventCharacter', 'Character'],
      ['eventSpecial', 'Special'],
      ['eventSide', 'Side Stories'],
      ['eventLog', 'Event Log']
    ],
    activities: [
      ['worldMap', 'World Map'],
      ['worldActivities', 'World Activities'],
      ['sideForge', 'Hub'],
      ['oracleForge', 'Oracle / Manual'],
      ['farm', 'Farm'],
      ['craft', 'Forge'],
      ['cook', 'Cook'],
      ['shops', 'Shops & Rest'],
      ['inventory', 'Inventory'],
      ['minigameTest', 'Mini-Game Test']
    ]
  };

  const APP_UTILITY_TABS = [
    ['maps', 'Current Run'],
    ['roster', 'Party'],
    ['relationships', 'Relationships'],
    ['logs', 'Logs'],
    ['settings', 'Settings']
  ];

  const APP_TAB_TO_MODE = (() => {
    const out = {};
    for (const [mode, tabs] of Object.entries(APP_MODE_TABS)) {
      for (const [id] of tabs) out[id] = mode;
    }
    return out;
  })();

  function _worldUiProfile(worldId = CS().getState()?.currentWorld) {
    const id = worldId || 'haven';
    const profiles = {
      earth: {
        hiddenModes: ['quest'],
        hiddenPanels: ['quests'],
        hiddenTabs: ['sideForge', 'oracleForge', 'farm', 'craft', 'cook', 'shops', 'minigameTest'],
        defaultMode: 'activities',
        defaultTab: 'worldMap'
      },
      bazaar: {
        hiddenModes: ['quest'],
        hiddenPanels: ['quests'],
        hiddenTabs: ['sideForge', 'oracleForge', 'farm', 'craft', 'cook', 'shops', 'minigameTest'],
        defaultMode: 'activities',
        defaultTab: 'worldMap'
      },
      zombie: {
        hiddenTabs: ['sideForge', 'oracleForge', 'farm', 'craft', 'cook', 'shops', 'minigameTest'],
        modeLabels: {
          quest: ['quest', 'Scavenge', 'SC']
        },
        tabLabels: {
          questHome: 'Scavenge Board',
          quests: 'Run Log'
        },
        panelLabels: {
          quests: { icon: 'SC', label: 'Scavenge', title: 'Scavenge Log' }
        }
      },
      haven: {
        // Haven has no travel map, so the global worldMap-first default
        // for the activities mode shows a dead "No travel map for this
        // world yet" panel. Land on the Hub Pulse instead — it's the
        // Living Hub dashboard, which matches Pocket Haven's role.
        modeDefaults: { activities: 'sideForge' }
      }
    };
    return profiles[id] || {};
  }

  function _defaultTabForMode(mode, state = CS().getState()) {
    const profile = _worldUiProfile(state?.currentWorld);
    const tabs = _tabsForMode(mode, state);
    const preferred = profile.modeDefaults?.[mode];
    if (preferred && tabs.some(([id]) => id === preferred)) return preferred;
    return tabs[0]?.[0] || null;
  }

  function _appModesForState(state = CS().getState()) {
    const profile = _worldUiProfile(state?.currentWorld);
    const hidden = new Set(profile.hiddenModes || []);
    return APP_MODES
      .filter(([id]) => !hidden.has(id))
      .map((entry) => profile.modeLabels?.[entry[0]] || entry);
  }

  function _tabsForMode(mode, state = CS().getState()) {
    const profile = _worldUiProfile(state?.currentWorld);
    const hiddenTabs = new Set(profile.hiddenTabs || []);
    return (APP_MODE_TABS[mode] || [])
      .filter(([id]) => !hiddenTabs.has(id))
      .map(([id, label]) => [id, profile.tabLabels?.[id] || label]);
  }

  function _normalizeActiveWorldUi(state = CS().getState()) {
    const profile = _worldUiProfile(state?.currentWorld);
    const hiddenModes = new Set(profile.hiddenModes || []);
    const hiddenTabs = new Set(profile.hiddenTabs || []);
    const hiddenPanels = new Set(profile.hiddenPanels || []);
    const activeOwner = APP_TAB_TO_MODE[_activeTab];
    if (hiddenModes.has(_activeMode) || hiddenModes.has(activeOwner) || hiddenTabs.has(_activeTab)) {
      _activeMode = profile.defaultMode || 'activities';
      _activeTab = profile.defaultTab || _tabsForMode(_activeMode, state)[0]?.[0] || 'worldGate';
    }
    if (hiddenPanels.has(_activePanel)) {
      _activePanel = null;
    }
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
      await _ensureStoryContext(CS().getState()?.currentWorld || 'haven');
      _bindEvents();
      _bindEscapeForPanels();
      _bindCombatResultListener();
      _bindCombatReturnEvents();
      window.CJS.CampaignObjectiveBanner?.init?.();
      CS().subscribe(() => {
        Save().saveCurrent();
        _ensureStoryContext(CS().getState()?.currentWorld || 'haven').catch(() => {});
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
    _ensureStoryContext(state.currentWorld || 'haven').catch(() => {});
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

    const isUtility = APP_UTILITY_TABS.some(([id]) => id === _activeTab);
    const subTabs = isUtility ? APP_UTILITY_TABS : _tabsForMode(_activeMode, state);

    _root.innerHTML = `
      <div class="campaign-shell ${_activePanel ? 'has-drawer-open' : ''}">
        ${_renderHeader(state, campaign)}
        ${_renderModeBar(state)}
        ${_renderSubTabs(subTabs, isUtility)}
        ${_renderRecentLogStrip(state)}
        <div class="campaign-body">
          <main class="campaign-main">${_renderMain(state)}</main>
          <aside class="campaign-rail">${_renderCommandRail(state)}</aside>
        </div>
        <input type="file" id="campaign-import-file" accept=".json" hidden>
      </div>
    `;

    // The drawer / panel-layer / encounter flash UI all live OUTSIDE
    // any React-owned tab placeholder, so they can bind immediately.
    if (_activeTab === 'farm') window.CJS.FarmingMode?.bindControls?.(_root);
    _renderPanelLayer();
    _flashOnNewEncounter(state);

    // Phase D React-tab bridge: notify any React-owned tab mounts that the
    // vanilla shell just blew away their previous DOM, so they can re-mount
    // into the freshly-rendered placeholder.
    try {
      _root.dispatchEvent(new CustomEvent('campaign:rendered', {
        bubbles: false,
        detail: { activeTab: _activeTab, activeMode: _activeMode }
      }));
    } catch (e) { /* CustomEvent unsupported in some test envs — ignore */ }

    // The remaining post-render hooks query DOM that lives INSIDE a
    // React-owned tab placeholder (#campaign-map-region inside maps,
    // #campaign-beat-list inside scenarios, the story scene entry
    // pop). React mounts the placeholder's contents in a microtask
    // after the event dispatch above; a macrotask (setTimeout 0)
    // runs after that microtask, so the queries below see the full
    // post-mount DOM. The same hooks fire for the still-vanilla
    // shell parts (header, sub-tabs) without further change.
    setTimeout(() => {
      const mapRegion = _root.querySelector('#campaign-map-region');
      if (mapRegion) window.CJS.CampaignMap.render(mapRegion);
      _bindRunPanel();
      window.CJS.CampaignStoryScenes?.openPendingNodeEntry?.();
    }, 0);
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
    _activeMode = 'quest';
    _activeTab = 'maps';
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

  function _renderHeader(state, campaign) {
    const world = CS().getCurrentWorld();
    return `
      <header class="campaign-header">
        <a class="campaign-back" href="index.html">Main Menu</a>
        <div class="campaign-title">
          <h1>${_esc(campaign?.name || 'Campaign')}</h1>
          <span>${_esc(world?.displayName || state.currentWorld)} | Chapter ${_storyChapterText(state)} | Phase ${state.phase.number}: ${_esc(state.phase.name || state.phase.type)}</span>
          ${_renderWorldEventsTicker(state)}
        </div>
        ${_renderCompactCurrencies(state)}
        <div class="campaign-header-actions">
          <button class="campaign-action primary campaign-world-gate-quick" data-campaign-action="open-world-gate">World Gate</button>
          ${_actionMenu('Save', `
            <button class="campaign-action" data-campaign-action="save-slot">Quick Save</button>
            <button class="campaign-action" data-campaign-action="new-save">New Save</button>
            <button class="campaign-action" data-campaign-action="fork-save">Fork Save</button>
          `)}
          ${_actionMenu('Transfer', `
            <button class="campaign-action" data-campaign-action="export-save">Export</button>
            <button class="campaign-action" data-campaign-action="import-save">Import</button>
            <button class="campaign-action" data-campaign-action="push-github">GitHub Sync</button>
          `)}
          ${_actionMenu('Apps', `
            <a class="campaign-action" href="editor.html">Editor</a>
            <a class="campaign-action" href="combat.html">Combat</a>
          `)}
        </div>
      </header>
    `;
  }

  function _renderWorldEventsTicker(state) {
    const WE = window.CJS.CampaignWorldEvents;
    if (!WE?.getActive) return '';
    const active = WE.getActive();
    if (!active.length) return '';
    return `
      <div class="cjs-world-event-ticker" aria-label="Active world events">
        ${active.map((ev) => `
          <span class="cjs-world-event-chip category-${_esc(ev.category || 'boon')}" title="${_esc(ev.summary || '')}">
            <span class="we-icon">${_esc(ev.icon || '✨')}</span>
            <span class="we-name">${_esc(ev.name || ev.id)}</span>
            <span class="we-remaining">${ev.remainingPhases}p</span>
          </span>
        `).join('')}
      </div>
    `;
  }

  function _renderCompactCurrencies(state) {
    const values = _currencyAmounts(state);
    return `
      <div class="campaign-stats campaign-stats-compact" aria-label="Currencies">
        <span><small>Gold</small><b>${values.gold}</b></span>
        <span title="Jester Points"><small>JP</small><b>${values.jp}</b></span>
      </div>
    `;
  }

  function _currencyAmounts(state) {
    const currencies = state.currencies || {};
    const worldGold = `${state.currentWorld || 'haven'}_gold`;
    const goldId = currencies[worldGold] != null ? worldGold
      : Object.keys(currencies).find((id) => String(id).toLowerCase().endsWith('_gold') || String(id).toLowerCase() === 'gold');
    return {
      gold: goldId ? Number(currencies[goldId] || 0) : 0,
      jp: Number(currencies.jp || currencies.jester_points || 0)
    };
  }

  function _renderRecentLogStrip(state) {
    const hasLog = (state.log || []).length > 0;
    return `
      <section class="campaign-log-strip">
        <div class="campaign-panel-head">
          <h2>Recent Log</h2>
          <div class="campaign-panel-actions">
            <button class="campaign-icon-btn" data-campaign-panel="log">All</button>
            ${hasLog ? '<button class="campaign-icon-btn danger" data-campaign-action="clear-log">Clear</button>' : ''}
          </div>
        </div>
        ${(state.log || []).slice(0, 3).map((line) => _renderLogEntry(line, { compact: true })).join('') || '<div class="campaign-empty">No log entries yet.</div>'}
      </section>
    `;
  }

  function _renderModeBar(state) {
    const modeButtons = _appModesForState(state).map(([id, label, icon]) => {
      const active = id === _activeMode && !APP_UTILITY_TABS.some(([u]) => u === _activeTab);
      return `<button class="campaign-mode-btn ${active ? 'active' : ''}" data-campaign-mode="${id}">
        <span class="campaign-mode-icon">${icon}</span><span>${label}</span>
      </button>`;
    }).join('');
    const utilityButtons = APP_UTILITY_TABS.map(([id, label]) => {
      const active = id === _activeTab;
      return `<button class="campaign-util-btn ${active ? 'active' : ''}" data-campaign-tab="${id}">${label}</button>`;
    }).join('');
    return `
      <div class="campaign-modes">
        <div class="campaign-modes-primary">${modeButtons}</div>
        ${_renderScenarioHud(state)}
        <div class="campaign-modes-utility">${utilityButtons}</div>
      </div>
    `;
  }

  function _renderSubTabs(tabs, isUtility) {
    if (!tabs || !tabs.length) return '';
    return `
      <nav class="campaign-subtabs ${isUtility ? 'is-utility' : ''}">
        ${tabs.map(([id, label]) => `<button class="campaign-tab ${id === _activeTab ? 'active' : ''}" data-campaign-tab="${id}">${_esc(label)}</button>`).join('')}
      </nav>
    `;
  }

  // _renderWorldGate — Phase F.12 port. Body moved to
  // `src/campaign/tabs/CampaignWorldGateTab.tsx`. Typed data flows
  // through `getWorldGateData(state)`. Per-world cards still come
  // through `_renderWorldGateCard` (kept here because the bridge calls
  // it) until the per-card banner / button logic ports.

  function _renderWorldGateCard(worldId, world, state) {
    const def = _worldMenuDef(worldId);
    const isCurrent = worldId === state.currentWorld;
    const bannerImage = def.bannerImage || world.storyModeTheme?.bannerImage || world.storyModeTheme?.backdrop || '';
    const bannerStyle = bannerImage ? ` style="--world-card-image:url('${_escAttr(_cssVarAssetUrl(bannerImage))}')"` : '';
    const mapCount = DS().getAllAsArray('travelMaps').filter((map) => map.world === worldId).length;
    const activityPacks = DS().getAllAsArray('worldActivityPacks').filter((pack) => pack.world === worldId);
    const activities = activityPacks.flatMap((pack) => pack.activities || []);
    const activityTypes = Array.from(new Set(activities.map((activity) => activity.type || 'activity'))).slice(0, 4);
    const status = isCurrent ? 'Loaded' : (def.status || 'Available');
    const targetTab = def.defaultTab || (mapCount ? 'worldMap' : 'storyHome');
    const action = isCurrent
      ? _actionBtn({ action: 'open-world-content', label: def.openLabel || 'Open Content', hint: def.openHint || 'Open this world content', kind: 'primary', data: { tab: targetTab, mode: def.defaultMode || _modeForTab(targetTab) } })
      : _actionBtn({ action: 'travel-world-card', label: def.enterLabel || `Enter ${world.displayName || worldId}`, hint: def.enterHint || 'Switch world and load its content menu', kind: 'primary', data: { 'world-id': worldId, 'target-tab': targetTab } });
    const secondary = isCurrent
      ? `${mapCount ? _actionBtn({ action: 'open-world-content', label: 'Map Movement', hint: 'Open this world travel map', data: { tab: 'worldMap', mode: 'activities' } }) : ''}
         ${activities.length ? _actionBtn({ action: 'open-world-content', label: 'Activities', hint: 'Open this world activities', data: { tab: 'worldActivities', mode: 'activities' } }) : ''}
         ${worldId === 'bazaar' ? _actionBtn({ action: 'open-world-content', label: 'Arena / Auction', hint: 'Open Bazaar activities', data: { tab: 'worldActivities', mode: 'activities' } }) : ''}`
      : '';
    return `
      <article class="campaign-world-gate-card theme-${_escAttr(worldId)} ${isCurrent ? 'is-current' : ''} ${bannerImage ? 'has-banner' : ''}"${bannerStyle}>
        ${bannerImage ? '<div class="campaign-world-gate-banner" aria-hidden="true"></div>' : ''}
        <div class="campaign-world-gate-card-head">
          <div>
            <h3>${_esc(def.title || world.displayName || worldId)}</h3>
            <span>${_esc(def.kicker || world.tone || worldId)}</span>
          </div>
          <b>${_esc(status)}</b>
        </div>
        <p>${_esc(def.summary || 'World content placeholder.')}</p>
        <div class="campaign-world-gate-tags">
          ${(def.features || []).map((feature) => `<span>${_esc(feature)}</span>`).join('')}
          ${mapCount ? `<span>${mapCount} map${mapCount === 1 ? '' : 's'}</span>` : ''}
          ${activities.length ? `<span>${activities.length} activities</span>` : ''}
        </div>
        ${activityTypes.length ? `<div class="campaign-muted">Loops: ${_esc(activityTypes.map(_label).join(', '))}</div>` : ''}
        ${def.devNote ? `<div class="campaign-world-gate-note">${_esc(def.devNote)}</div>` : ''}
        <div class="campaign-panel-actions">${action}${secondary}</div>
      </article>
    `;
  }

  function _renderPressureStripMini(state) {
    const pressures = Object.values(state.crossWorld?.pressures || {});
    if (!pressures.length) return '';
    return `<div class="campaign-panel-actions">${pressures.slice(0, 3).map((p) => `<span class="campaign-pill">${_esc(p.title || p.id)} ${Number(p.value || 0)}</span>`).join('')}</div>`;
  }

  function _worldMenuDef(worldId) {
    const defs = {
      earth: {
        title: 'Earth',
        kicker: 'Daily life / emotional anchor',
        summary: 'Earth loads ordinary-life story scenes, the Zhonghai visual city map, hospital support item pumping, diary/recap memories, and social scenes.',
        features: ['Story', 'VN city map', 'Hospital', 'Diaries'],
        bannerImage: 'images/story-mode/earth/earth-theme.webp',
        defaultMode: 'activities',
        defaultTab: 'worldMap',
        openLabel: 'Open Earth Map',
        enterLabel: 'Enter Earth',
        devNote: 'Future buttons can add Riverside, Research Block, and Old Town without changing the renderer.'
      },
      haven: {
        title: 'Haven',
        kicker: 'Main fantasy campaign',
        summary: 'Haven keeps the existing story, quests, Pocket Haven, and scenario/node-map flow. This does not use the new Earth/Zombie visual map style.',
        features: ['Main story', 'Quests', 'Pocket Haven', 'Scenario maps'],
        defaultMode: 'story',
        defaultTab: 'storyHome',
        openLabel: 'Open Haven Story',
        enterLabel: 'Return to Haven'
      },
      zombie: {
        title: 'Zombie World',
        kicker: 'Scavenge / build pressure loop',
        summary: 'Zombie world loads the Last Light visual ruined-city map, scavenging tasks, safehouse building, medical salvage, and future survival pressure events.',
        features: ['Story', 'Ruined city map', 'Scavenge', 'Build'],
        bannerImage: 'images/story-mode/zombie/zombie-bin-burnice-horizontal.png',
        defaultMode: 'activities',
        defaultTab: 'worldMap',
        openLabel: 'Open Zombie Map',
        enterLabel: 'Enter Zombie World',
        devNote: 'Future areas are already stubbed: Harbor Quarantine, Farm Belt, and Military Shelter.'
      },
      bazaar: {
        title: 'Bazaar',
        kicker: 'Arena / auction testbed',
        summary: 'Bazaar loads optional activity systems first: arena matches, auction lots, prize boards, and future economy experiments.',
        features: ['Arena', 'Auction House', 'Prize Board', 'Rewards'],
        bannerImage: 'images/story-mode/bazaar/bazaar-theme.png',
        defaultMode: 'activities',
        defaultTab: 'worldMap',
        openLabel: 'Open Bazaar',
        enterLabel: 'Enter Bazaar',
        devNote: 'Use Lantern Arena and Glass Gavel House as the first test locations.'
      }
    };
    return defs[worldId] || {
      title: DS().get('worlds', worldId)?.displayName || worldId,
      kicker: 'World content',
      summary: 'Custom world content. Add a travel map, activity pack, or story sequence to expand this card.',
      features: ['Custom'],
      defaultMode: 'story',
      defaultTab: 'storyHome'
    };
  }

  function _modeForTab(tabId) {
    return APP_TAB_TO_MODE[tabId] || 'story';
  }

  function _renderScenarioHud(state) {
    const run = state.activeScenarioRun;
    if (!run) return '<div class="campaign-hud-spacer"></div>';
    const scenario = CS().getScenarioById(run.scenarioId);
    const generated = !!scenario?.generated;
    return `
      <div class="campaign-scenario-hud">
        <span class="campaign-pill is-current">${_esc(scenario?.name || run.scenarioId)}</span>
        <span class="campaign-pill">Danger ${run.danger}/${run.dangerMax}</span>
        <span class="campaign-pill">Camps ${run.usedCampRests}/${run.limits?.campRests ?? 0}</span>
        <span class="campaign-pill">Battles ${run.randomBattlesUsed}/${run.limits?.randomBattles ?? 0}</span>
        <button class="campaign-action" data-campaign-action="open-maps-tab">Run</button>
        <button class="campaign-action danger" data-campaign-action="end-scenario">End</button>
        ${generated ? '<button class="campaign-action danger" data-campaign-action="cancel-scenario" title="Discard without recording a report">Cancel</button>' : ''}
      </div>
    `;
  }

  function _goto(mode, tab) {
    if (mode) _activeMode = mode;
    if (tab) _activeTab = tab;
    render();
  }

  // Party / roster rendering lives in
  // `js/campaign/ui/tabs/cui-party-tab.js`. These delegators keep the
  // shell's existing closure callers (command rail panel, party sheet
  // modal) working with a single import.
  function _renderParty(state) {
    return window.CJS.CampaignUIInternal.PartyTab.renderParty(state, _tabHelpers());
  }

  function _renderPartyCard(id, member) {
    return window.CJS.CampaignUIInternal.PartyTab.renderPartyCard(id, member, _tabHelpers());
  }

  function _renderRoster(state) {
    return window.CJS.CampaignUIInternal.PartyTab.renderRoster(state, _tabHelpers());
  }

  function _renderRosterMember(id, member) {
    return window.CJS.CampaignUIInternal.PartyTab.renderRosterMember(id, member, _tabHelpers());
  }

  // Pool pickers + passive rank math live in
  // `js/campaign/ui/tabs/cui-party-tab.js`. The shell keeps thin
  // delegators because the action handler (`pick-equip-skill`,
  // `pick-equip-passive`) and the rank-up modal call them directly
  // from closure.
  function _openSkillPoolPicker(memberId) {
    return window.CJS.CampaignUIInternal.PartyTab.openSkillPoolPicker(memberId);
  }

  function _openPassivePoolPicker(memberId) {
    return window.CJS.CampaignUIInternal.PartyTab.openPassivePoolPicker(memberId);
  }

  function _passiveRankInfo(memberId, passiveId, passive = null) {
    return window.CJS.CampaignUIInternal.PartyTab.passiveRankInfo(memberId, passiveId, passive);
  }

  function _passiveRankCostText(passive, currentRank) {
    return window.CJS.CampaignUIInternal.PartyTab.passiveRankCostText(passive, currentRank);
  }

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
    const Tabs = window.CJS.CampaignUIInternal.Tabs;
    if (Tabs?.has?.(_activeTab)) {
      const html = Tabs.render(_activeTab, state, _tabHelpers());
      if (html != null) return html;
    }
    // Tabs the React bridge has taken over (`settings`, `logs`,
    // `roster`, `worldMap`, `worldActivities`, the hub family,
    // `inventory`, `shops`, `craft`, `cook`, `farm`, `relationships`,
    // `overview`, `eventLog`, `minigameTest`) never reach this switch
    // — `Tabs.has(id)` returns true above and the early-return wins.
    // Tabs that still render vanilla HTML live here until they migrate.
    switch (_activeTab) {
      case 'storyDirector': return _renderStoryDirector(state);
      default: return '<div class="campaign-empty">Unknown tab: ' + _esc(_activeTab) + '</div>';
    }
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

  function _renderChoiceConsequencePanel(state) {
    const Align = window.CJS.CampaignAlignment;
    if (!Align?.snapshot) return '';
    const snap = Align.snapshot(state, { actor: 'bin', world: state.currentWorld });
    const axes = Object.entries(Align.AXES || {});
    const axisCards = axes.map(([axis, meta]) => {
      const current = Number(snap.axes?.[axis] || 0);
      const world = Number(snap.worldAxes?.[axis] || 0);
      const range = snap.range?.[axis] || { min: current, max: current };
      return `
        <div class="campaign-alignment-axis">
          <span>${_esc(meta.label || axis)}</span>
          <strong>${current >= 0 ? '+' : ''}${current}</strong>
          <small>Here ${world >= 0 ? '+' : ''}${world} | possible ${range.min >= 0 ? '+' : ''}${range.min}..${range.max >= 0 ? '+' : ''}${range.max}</small>
        </div>
      `;
    }).join('');
    const recent = (snap.recent || []).slice(0, 3).map((entry) => `
      <div class="campaign-alignment-line">
        <strong>${_esc(entry.label || entry.choiceId || 'Choice')}</strong>
        <span>${_esc(Align.describeDeltas?.(entry.deltas) || 'Tracked')}</span>
      </div>
    `).join('');
    const potentials = (snap.potential || []).slice(0, 4).map((entry) => `
      <span class="campaign-chip ${entry.reachable === false ? '' : 'is-route'}" title="${_escAttr(entry.summary || entry.sequenceId || '')}">
        ${_esc(entry.label || entry.choiceId || 'Future')} ${_esc(Align.describeDeltas?.(entry.deltas) || '')}
      </span>
    `).join('');
    return `
      <section class="campaign-panel campaign-wide-panel campaign-alignment-panel">
        <div class="campaign-panel-head">
          <div>
            <h2>Choice Consequences</h2>
            <div class="campaign-muted">Bin's soft leanings for dialogue gates, NPC reactions, quest unlocks, and future branches.</div>
          </div>
          <span class="campaign-pill">${(snap.potential || []).length} possible points</span>
        </div>
        <div class="campaign-alignment-grid">${axisCards}</div>
        <div class="campaign-alignment-bottom">
          <div>
            <strong>Recent</strong>
            ${recent || '<div class="campaign-muted">No consequence choices recorded yet.</div>'}
          </div>
          <div>
            <strong>Future Checks</strong>
            <div class="campaign-chip-row">${potentials || '<span class="campaign-muted">No authored potential points visible yet.</span>'}</div>
          </div>
        </div>
      </section>
    `;
  }

  // _renderStorySummary — Phase F.5 port. Body moved to
  // `src/campaign/tabs/CampaignStorySummaryTab.tsx`. Typed data flows
  // through `getStorySummaryData(state)`. `_storySummaryEntries` and
  // `_storySummaryTextFromRecord` stay (the bridge calls them).

  // _renderQuestHome — Phase F.6 port. Body moved to
  // `src/campaign/tabs/CampaignQuestHomeTab.tsx`. The non-zombie data
  // flows through `getQuestHomeData(state)`; the zombie variant still
  // renders via `_renderZombieScavengeHome` (returned as one HTML
  // string in the bridge data) until its own JSX port.

  function _renderZombieScavengeHome(state) {
    const activities = _worldActivitiesFor('zombie').filter((activity) => activity.type !== 'journal');
    const scavenge = activities.filter((activity) => activity.type === 'scavenge');
    const build = activities.filter((activity) => activity.type === 'build');
    const pressures = Object.values(state.crossWorld?.pressures || {})
      .filter((pressure) => String(pressure.id || '').startsWith('zombie_'));
    const run = state.activeScenarioRun;
    return `
      <div class="campaign-dashboard campaign-mode-home campaign-quest-home campaign-scavenge-home">
        ${_renderGachaHomeHero({
          tone: 'quest',
          kicker: 'Scavenge',
          title: 'Last Light Scavenge Board',
          text: 'Zombie world does not use normal quests by default. It is built around supply routes, medical runs, safehouse projects, and pressure clocks that react to noise and infection.',
          meta: [`${scavenge.length} supply runs`, `${build.length} build projects`, `${pressures.length} pressures`],
          actions: [
            _actionBtn({ action: 'open-world-content', label: 'Open Last Light Map', hint: 'Move between safehouse, mall, clinic, subway, and tower.', kind: 'primary', data: { tab: 'worldMap', mode: 'activities' } }),
            _actionBtn({ action: 'open-world-content', label: 'Supply Activities', hint: 'Run scavenging and safehouse actions from the current location.', data: { tab: 'worldActivities', mode: 'activities' } }),
            _actionBtn({ action: 'open-maps-tab', label: run ? 'Current Run' : 'No Combat Run', hint: run ? 'Continue the active scenario run.' : 'Zombie scavenge currently uses map activities unless a combat run is started.' })
          ]
        })}
        <section class="campaign-panel campaign-wide-panel campaign-scavenge-route-panel">
          <div class="campaign-panel-head">
            <div>
              <h2>Supply Routes</h2>
              <div class="campaign-muted">These replace Earth/Bazaar-style quests: choose a location on the zombie map, then run the activity there.</div>
            </div>
            <span class="campaign-pill">${scavenge.length} routes</span>
          </div>
          <div class="campaign-tab-grid">
            ${scavenge.map((activity) => _renderWorldActivityPreviewCard(activity, 'Scavenge route')).join('') || '<div class="campaign-empty">No scavenge routes authored yet.</div>'}
          </div>
        </section>
        <section class="campaign-panel campaign-wide-panel campaign-scavenge-build-panel">
          <div class="campaign-panel-head">
            <div>
              <h2>Safehouse Projects</h2>
              <div class="campaign-muted">Build actions convert salvage into security, medicine storage, and later survivor facilities.</div>
            </div>
            <span class="campaign-pill">${build.length} projects</span>
          </div>
          <div class="campaign-tab-grid">
            ${build.map((activity) => _renderWorldActivityPreviewCard(activity, 'Build project')).join('') || '<div class="campaign-empty">No build projects authored yet.</div>'}
          </div>
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head">
            <h3>Pressure Clocks</h3>
            <span class="campaign-muted">Zombie progress should feel like survival weather.</span>
          </div>
          <div class="campaign-stat-grid">
            ${pressures.length ? pressures.map((pressure) => `<span>${_esc(pressure.title || pressure.id)} <b>${Number(pressure.value || 0)}</b></span>`).join('') : '<span>No zombie pressures yet <b>0</b></span>'}
          </div>
        </section>
      </div>
    `;
  }

  function _worldActivitiesFor(worldId) {
    return DS().getAllAsArray('worldActivityPacks')
      .filter((pack) => pack.world === worldId)
      .flatMap((pack) => pack.activities || []);
  }

  function _renderWorldActivityPreviewCard(activity = {}, kicker = 'Activity') {
    return `
      <article class="campaign-sequence-card is-quest">
        <div class="campaign-sequence-kind">${_esc(kicker)}</div>
        <strong>${_esc(activity.title || activity.name || activity.id)}</strong>
        <p>${_esc(activity.summary || activity.description || '')}</p>
        <div class="campaign-muted">${_esc(activity.rewardText || 'No reward text yet.')}</div>
      </article>
    `;
  }

  // _renderMiniGameTest — Phase F.3 port. Body moved to
  // `src/campaign/tabs/CampaignMinigameTestTab.tsx`. Typed data flows
  // through `getMinigameTestData(state)`. The level cache and the
  // selected-game state (kept on `_root.dataset.mgTestGame`) still
  // live here so the legacy `mg-test-*` actions stay unchanged.

  function _mgTestPick(gameId) {
    if (!_root) return;
    _root.dataset.mgTestGame = String(gameId || '');
    render();
  }

  async function _mgTestPlay(gameId, levelId, options = {}) {
    const MG = window.CJS.Minigames;
    if (!MG?.openMiniGame) return UI().toast('Mini-game module is not loaded', 'error');
    if (!gameId) return UI().toast('No mini-game selected', 'info');
    try {
      const session = await MG.openMiniGame({
        gameId,
        levelId: levelId || undefined,
        difficulty: options.difficulty || undefined,
        source: 'minigame_test_lab',
        onComplete: (result) => {
          CS().mutate((state) => {
            state.lastMiniGameTestResult = result;
            state.log = state.log || [];
            state.log.unshift({
              id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
              at: new Date().toISOString(),
              phase: state.phase?.number || 1,
              world: state.currentWorld,
              text: `Mini-game test: ${result?.gameId || gameId} ${result?.levelId || ''} -> ${result?.status || 'done'} (score ${result?.score ?? 0})`,
              op: 'minigame_test'
            });
            state.log = state.log.slice(0, 500);
          }, { source: 'mg_test_result' });
          if (result?.status === 'win') UI().toast('Mini-game test cleared', 'success');
          else if (result?.status === 'fail') UI().toast('Mini-game test failed', 'info');
          else if (result?.status === 'giveup') UI().toast('Mini-game test abandoned', 'info');
        }
      });
      if (!session) UI().toast('Mini-game could not open. Check the selected level data.', 'error');
    } catch (err) {
      console.error('mg-test-play failed', err);
      UI().toast(err?.message || 'Could not open mini-game', 'error');
    }
  }

  function _questPaperKind(entry = {}) {
    const kind = String(entry.kind || '').toLowerCase();
    const tags = (entry.tags || []).map((tag) => String(tag).toLowerCase());
    if (kind.includes('daily') || tags.includes('daily')) return 'daily';
    if (kind.includes('story') || kind.includes('chapter') || kind.includes('one_time') || tags.includes('story_quest') || tags.includes('chapter_repeat')) return 'story';
    return 'normal';
  }

  // _renderEventTypeTab — Phase F.7 port. Body moved to
  // `src/campaign/tabs/CampaignEventTab.tsx`. Typed data flows through
  // `getEventTabData(kind, state)`. `_renderEventHome`,
  // `_renderEventHomeClean`, and `_renderEventFileButtons` were dead
  // (only used by `_renderEventTypeTab`) and have been removed.
  function _eventFileKind(entry = {}) {
    const kind = String(entry.kind || '').toLowerCase();
    const tags = (entry.tags || []).map((tag) => String(tag).toLowerCase());
    if (kind.includes('special') || tags.includes('special_event')) return 'special';
    if (kind.includes('side') || tags.includes('side_story')) return 'side';
    return 'character';
  }

  // _renderEventLog / _renderEventLogEntry — Phase F.2 port. The body
  // moved to `src/campaign/tabs/CampaignEventLogTab.tsx` (JSX). Typed
  // data comes through `getEventLogData(state)`; the two shared
  // sub-panels (event result, oracle) are still HTML bridges via
  // `renderEventResultHtml` / `renderOracleHtml` and migrate when
  // event{Character,Special,Side} port.

  function _renderSequenceShelf(scope, options = {}) {
    const Seq = window.CJS.CampaignSequences;
    const entries = Seq?.list?.(scope) || [];
    const title = options.title || (scope === 'story' ? 'Story Files' : scope === 'event' ? 'Event Files' : 'Quest Papers');
    const note = options.note || 'Small authored files that can be played one node at a time.';
    return `
      <section class="campaign-panel ${options.wide ? 'campaign-wide-panel' : ''} campaign-sequence-shelf">
        <div class="campaign-panel-head">
          <div>
            <h3>${_esc(title)}</h3>
            <div class="campaign-muted">${_esc(note)}</div>
          </div>
          <span class="campaign-pill">${entries.length} files</span>
        </div>
        <div class="campaign-sequence-grid">
          ${entries.length ? entries.map((entry) => `
            <article class="campaign-sequence-card is-${_escAttr(scope)}">
              <div class="campaign-sequence-paper-pin"></div>
              <div class="campaign-sequence-kind">${_esc(_label(entry.kind || scope))}</div>
              <strong>${_esc(entry.title || entry.id)}</strong>
              ${scope === 'story' ? _renderStorySequenceMeta(entry) : ''}
              ${(scope === 'story' || entry.summary?.short || entry.summary?.default || entry.description) ? `<p>${_esc(_storySequenceSummary(entry))}</p>` : ''}
              <div class="campaign-chip-row">${(entry.tags || []).slice(0, 4).map((tag) => `<span class="campaign-chip">${_esc(_label(tag))}</span>`).join('')}</div>
              ${_renderSequenceDeliveryState(entry, scope)}
              ${scope === 'story' ? _renderStorySequenceStatus(entry) : ''}
              ${_renderSequenceActionButton(entry, scope)}
            </article>
          `).join('') : '<div class="campaign-empty">No sequence files loaded for this scope.</div>'}
        </div>
      </section>
    `;
  }

  function _renderActiveSequence(state, scopes = null) {
    const Seq = window.CJS.CampaignSequences;
    const active = Seq?.active?.(state);
    if (!active || (scopes && !scopes.includes(active.scope))) return '';
    const sequence = Seq.cachedSequence?.(active.sequenceId, state.currentWorld) || null;
    const meta = Seq?.storyMeta?.(sequence || active.sequenceId, state.currentWorld) || {};
    const node = sequence ? Seq.findNode?.(sequence, active.nodeId) : null;

    // When the fullscreen sequence-VN is enabled (default), the overlay
    // handles the active node. Render a slim "playing" card so the
    // story-home tab still acknowledges the active run without
    // duplicating the dialogue UI.
    const vnActive = !!(window.CJS.CampaignSequenceVN?.isEnabled?.() && active);
    if (vnActive) {
      return `
        <section class="campaign-panel campaign-wide-panel campaign-sequence-active is-vn-active">
          <div class="campaign-sequence-active-avatar" aria-hidden="true">
            <span class="campaign-grid-player" data-facing="down"></span>
          </div>
          <div class="campaign-sequence-active-body">
            <div class="campaign-panel-head">
              <div>
                <h2>Now playing — ${_esc(active.title || active.sequenceId)}</h2>
                <div class="campaign-muted">${meta.chapterLabel ? `Chapter ${_esc(meta.chapterLabel)} · ` : ''}${_esc(_label(active.scope || 'sequence'))}${active.applyConsequences === false ? ' · Replay mode' : ''}</div>
              </div>
              <button class="campaign-action danger" data-campaign-action="sequence-complete">End</button>
            </div>
            <div class="campaign-muted">The visual novel overlay is open. Click anywhere in it to continue, or use Panel to switch back to the inline view.</div>
          </div>
        </section>
      `;
    }

    return `
      <section class="campaign-panel campaign-wide-panel campaign-sequence-active">
        <div class="campaign-panel-head">
          <div>
            <h2>${_esc(active.title || active.sequenceId)}</h2>
            <div class="campaign-muted">${_esc(_label(active.scope || 'sequence'))} | ${meta.chapterLabel ? `Chapter ${_esc(meta.chapterLabel)} | ` : ''}${_esc(active.nodeId || '')}${active.applyConsequences === false ? ' | Replay mode' : ''}</div>
          </div>
          ${active.applyConsequences === false ? '<span class="campaign-pill">Replay</span>' : ''}
          <button class="campaign-action" data-campaign-action="sequence-open-vn">Open VN</button>
          <button class="campaign-action danger" data-campaign-action="sequence-complete">End</button>
        </div>
        ${node ? _renderSequenceNode(node, active) : '<div class="campaign-empty">Loading sequence node...</div>'}
      </section>
    `;
  }

  function _renderSequenceNode(node = {}, active = {}) {
    const type = String(node.type || 'narration').toLowerCase();
    const replay = active?.applyConsequences === false;
    const speaker = node.speaker ? `<span class="campaign-story-speaker">${_esc(node.speaker)}</span>` : '';
    const text = node.text || node.prompt || node.summary || node.title || '';
    if (type === 'choice') {
      const state = CS().getState() || {};
      const Seq = window.CJS.CampaignSequences;
      const choiceButtons = (node.choices || []).map((choice) => {
        const eligibility = Seq?.choiceEligibility?.(choice, node, state, { active }) || { ok: true, blockers: [], hidden: false };
        if (eligibility.hidden) return '';
        const locked = !eligibility.ok;
        const alignmentHint = window.CJS.CampaignAlignment?.describeDeltas?.(
          choice.alignment ?? choice.karma ?? choice.consequencePoints ?? choice.alignmentDelta
        );
        const hint = locked
          ? (eligibility.blockers || []).join(' | ')
          : (choice.summary || alignmentHint || choice.next || '');
        return _actionBtn({
          action: 'sequence-choice',
          label: choice.label || choice.id,
          hint,
          kind: locked ? 'is-locked' : '',
          disabled: locked,
          data: { choice: choice.id }
        });
      }).join('');
      return `
        <div class="campaign-story-dialogue-box">
          ${speaker}
          <p>${_esc(text || 'Choose a path.')}</p>
          <div class="campaign-action-grid">
            ${choiceButtons || '<div class="campaign-muted">No available choices right now.</div>'}
          </div>
        </div>
      `;
    }
    if (type === 'stat_check') {
      return `
        <div class="campaign-story-dialogue-box">
          <p>${_esc(text || `${node.actor || 'Party'} checks ${node.stat || '?'} vs ${node.difficulty || node.dc || '?'}.`)}</p>
          ${_sequenceNodeMeta(node)}
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'sequence-pass', label: 'Pass', hint: 'Route to pass node', kind: 'primary' })}
            ${_actionBtn({ action: 'sequence-fail', label: 'Fail', hint: 'Route to fail node', kind: 'danger' })}
          </div>
        </div>
      `;
    }
    if (type === 'combat') {
      return `
        <div class="campaign-story-dialogue-box">
          <p>${_esc(text || node.label || 'Combat encounter')}</p>
          ${_sequenceNodeMeta(node)}
          <div class="campaign-action-grid">
            ${replay ? '' : _actionBtn({ action: 'sequence-queue-battle', label: 'Queue Battle', hint: node.encounterId || node.battleSetId || 'Open in combat/manual result', kind: 'primary' })}
            ${_actionBtn({ action: 'sequence-win', label: replay ? 'Continue as Win' : 'Manual Win', hint: replay ? 'Advance without reapplying battle rewards or flags' : 'Advance as victory' })}
            ${_actionBtn({ action: 'sequence-lose', label: replay ? 'Continue as Loss' : 'Manual Loss', hint: replay ? 'Advance without reapplying defeat consequences' : 'Advance as defeat', kind: 'danger' })}
          </div>
        </div>
      `;
    }
    if (type === 'minigame') {
      const gameId = node.minigame?.gameId || node.minigameId || node.gameId;
      return `
        <div class="campaign-story-dialogue-box">
          <p>${_esc(text || `${_label(gameId || 'Mini-game')} challenge`)}</p>
          ${_sequenceNodeMeta(node)}
          <div class="campaign-action-grid">
            ${replay ? '' : _actionBtn({ action: 'sequence-play-minigame', label: 'Play Mini-Game', hint: gameId ? `Open ${_label(gameId)}` : 'Open the linked mini-game', kind: 'primary' })}
            ${_actionBtn({ action: 'sequence-win', label: replay ? 'Continue as Clear' : 'Manual Clear', hint: replay ? 'Advance without replaying rewards or flags' : 'Advance as mini-game success' })}
            ${_actionBtn({ action: 'sequence-lose', label: replay ? 'Continue as Fail' : 'Manual Fail', hint: replay ? 'Advance without replaying failure penalties' : 'Advance as mini-game failure', kind: 'danger' })}
          </div>
        </div>
      `;
    }
    if (type === 'scenario') {
      const state = CS().getState();
      const activeRun = state.activeScenarioRun;
      const scenarioId = node.scenarioId || '';
      const scenarioOpen = activeRun?.scenarioId === scenarioId;
      return `
        <div class="campaign-story-dialogue-box">
          <p>${_esc(text || node.label || node.title || 'Exploration run')}</p>
          ${_sequenceNodeMeta(node)}
          <div class="campaign-action-grid">
            ${replay ? '' : _actionBtn({ action: scenarioOpen ? 'open-maps-tab' : 'sequence-next', label: scenarioOpen ? 'Open Map' : 'Start Exploration', hint: scenarioId || 'Launch the linked scenario', kind: 'primary' })}
            ${_actionBtn({ action: 'sequence-win', label: 'Continue as Success', hint: 'Resume story after a successful run' })}
            ${_actionBtn({ action: 'sequence-lose', label: 'Continue as Failure', hint: 'Resume story after a failed run', kind: 'danger' })}
            ${_actionBtn({ action: 'sequence-abort', label: 'Abort Run', hint: 'Resume story as an aborted exploration' })}
          </div>
        </div>
      `;
    }
    if (type === 'end') {
      return `
        <div class="campaign-story-dialogue-box">
          <p>${_esc(text || 'This sequence is ready to close.')}</p>
          <button class="campaign-action primary" data-campaign-action="sequence-complete">Complete</button>
        </div>
      `;
    }
    return `
      <div class="campaign-story-dialogue-box">
        ${speaker}
        <p>${_esc(text)}</p>
        ${_sequenceNodeMeta(node)}
        <div class="campaign-action-grid">
          ${_actionBtn({ action: type === 'condition' ? 'sequence-resolve' : 'sequence-next', label: type === 'ops' ? (replay ? 'Continue' : 'Apply & Continue') : 'Continue', hint: node.next || '', kind: 'primary' })}
        </div>
      </div>
    `;
  }

  function _sequenceNodeMeta(node = {}) {
    const bits = [];
    if (node.stat) bits.push(`${node.stat} DC ${node.difficulty || node.dc || '?'}`);
    if (node.encounterId) bits.push(node.encounterId);
    if (node.battleSetId) bits.push(node.battleSetId);
    if (node.scenarioId) bits.push(`Scenario: ${_label(node.scenarioId)}`);
    const gameId = node.minigame?.gameId || node.minigameId || node.gameId;
    const difficulty = node.minigame?.difficulty || node.difficulty;
    if (gameId) bits.push(`Mini-Game: ${_label(gameId)} Lv ${difficulty || 1}`);
    if (node.tags?.length) bits.push((node.tags || []).map(_label).join(', '));
    return bits.length ? `<div class="campaign-chip-row">${bits.map((bit) => `<span class="campaign-chip">${_esc(bit)}</span>`).join('')}</div>` : '';
  }

  function _storyChapterText(state = CS().getState() || {}) {
    return _esc(state.storyMode?.currentChapterLabel || state.currentChapter || 1);
  }

  function _renderStorySequenceMeta(entry = {}) {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    const meta = Seq?.storyMeta?.(entry, state.currentWorld) || {};
    const bits = [];
    if (meta.chapterLabel) bits.push(`Chapter ${meta.chapterLabel}`);
    if (meta.partLabel) bits.push(meta.partLabel);
    return bits.length ? `<div class="campaign-chip-row">${bits.map((bit) => `<span class="campaign-chip">${_esc(bit)}</span>`).join('')}</div>` : '';
  }

  function _storySequenceSummary(entry = {}) {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    const meta = Seq?.storyMeta?.(entry, state.currentWorld) || {};
    return meta.summary?.short || meta.summary?.default || entry.description || '';
  }

  function _storySequenceActionLabel(entry = {}) {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    const status = Seq?.storyStatus?.(entry.id, state, state.currentWorld);
    if (status?.deliveryBlocked) return 'In Update';
    return status?.replayOnly ? 'Read' : 'Start';
  }

  function _renderStorySequenceStatus(entry = {}) {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    const status = Seq?.storyStatus?.(entry.id, state, state.currentWorld);
    if (!status?.record) return '';
    const label = status.defaulted ? 'Defaulted' : (status.completed ? 'Played' : 'Read');
    return `<div class="campaign-chip-row"><span class="campaign-chip">${_esc(label)}</span></div>`;
  }

  function _renderSequenceActionButton(entry = {}, scope = 'story') {
    const blocked = _sequenceDeliveryBlocked(entry, scope);
    const label = scope === 'story' ? _storySequenceActionLabel(entry) : (blocked ? 'In Update' : 'Start');
    return `<button class="campaign-action primary" data-campaign-action="sequence-start" data-id="${_escAttr(entry.id)}" ${blocked ? 'disabled' : ''}>${_esc(label)}</button>`;
  }

  function _renderSequenceDeliveryState(entry = {}, scope = 'story') {
    const status = _sequenceDeliveryStatus(entry, scope);
    const note = _sequenceDeliveryNote(entry, scope);
    if (!status || status === 'ready') return note ? `<div class="campaign-muted">${_esc(note)}</div>` : '';
    return `
      <div class="campaign-chip-row"><span class="campaign-chip">${_esc(_label(status))}</span></div>
      ${note ? `<div class="campaign-muted">${_esc(note)}</div>` : ''}
    `;
  }

  function _sequenceDeliveryStatus(entry = {}, scope = 'story') {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    if (scope === 'story') {
      return Seq?.storyStatus?.(entry.id, state, state.currentWorld)?.deliveryStatus
        || Seq?.storyMeta?.(entry, state.currentWorld)?.deliveryStatus
        || 'ready';
    }
    return Seq?.storyMeta?.(entry, state.currentWorld)?.deliveryStatus || 'ready';
  }

  function _sequenceDeliveryBlocked(entry = {}, scope = 'story') {
    return _sequenceDeliveryStatus(entry, scope) === 'in_update' || _sequenceDeliveryStatus(entry, scope) === 'blocked';
  }

  function _sequenceDeliveryNote(entry = {}, scope = 'story') {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    if (scope === 'story') {
      return Seq?.storyStatus?.(entry.id, state, state.currentWorld)?.deliveryNote
        || Seq?.storyMeta?.(entry, state.currentWorld)?.deliveryNote
        || '';
    }
    return Seq?.storyMeta?.(entry, state.currentWorld)?.deliveryNote || '';
  }

  function _storyPipelineSnapshot(state = CS().getState() || {}) {
    const Seq = window.CJS.CampaignSequences;
    const active = Seq?.active?.(state);
    const summary = _storySummaryEntries(state);
    const anchorId = active?.scope === 'story'
      ? active.sequenceId
      : (summary[summary.length - 1]?.sequenceId || (Seq?.list?.('story', state.currentWorld) || [])[0]?.id || null);
    const meta = anchorId ? (Seq?.storyMeta?.(anchorId, state.currentWorld) || {}) : {};
    return {
      anchorId,
      anchorTitle: meta.title || '',
      nextCandidates: meta.nextCandidates || [],
      syncSummary: meta.syncSummary || [],
      syncTitle: meta.title || meta.partLabel || meta.sequenceId || ''
    };
  }

  function _renderChapterTreePanel(state = CS().getState() || {}) {
    const Seq = window.CJS.CampaignSequences;
    if (!Seq?.chapterTree) return '';
    let tree = Seq.chapterTree(state.currentWorld, state);
    if (!tree) tree = { roots: [], byPartId: {}, nodes: [] };
    // Inject runtime branch chapters (1.4.a, 1.4.b, ...) authored via the
    // Story Controls "Branch from current chapter" panel.
    const Branch = window.CJS.CampaignStoryBranch;
    if (Branch?.applyToTree) tree = Branch.applyToTree(tree, state.currentWorld);
    if (!tree.roots?.length) return '';
    const route = Seq.currentRouteChoices(state, state.currentWorld) || [];
    const routeText = route.length
      ? route.map((entry) => entry.partLabel || entry.title || entry.sequenceId).join(' → ')
      : 'No story parts played yet.';
    return `
      <section class="campaign-panel campaign-wide-panel campaign-chapter-tree-panel">
        <div class="campaign-panel-head">
          <div>
            <h3>Chapter Routes</h3>
            <div class="campaign-muted">Branches unlock from the choices you made. Locked rows show what you still need before they can play.</div>
          </div>
          <span class="campaign-pill">${route.length} played</span>
        </div>
        <div class="campaign-route-trail" aria-label="Current route">
          <strong>Route taken:</strong>
          <span>${_esc(routeText)}</span>
        </div>
        <div class="campaign-chapter-tree" role="tree" aria-label="Chapter tree">
          ${tree.roots.map((node) => _renderChapterTreeNode(node, 0)).join('')}
        </div>
      </section>
    `;
  }

  function _renderChapterTreeNode(node = {}, depth = 0) {
    const status = node.status || {};
    const eligibility = node.eligibility || { eligible: true, reasons: [] };
    const blocked = status.deliveryBlocked;
    const completed = status.completed;
    const defaulted = status.defaulted;
    const replayOnly = status.replayOnly;
    const locked = !eligibility.eligible && !replayOnly;
    let stateLabel = 'Ready';
    let stateClass = 'is-ready';
    if (blocked) { stateLabel = 'In Update'; stateClass = 'is-update'; }
    else if (completed) { stateLabel = 'Played'; stateClass = 'is-played'; }
    else if (defaulted) { stateLabel = 'Defaulted'; stateClass = 'is-defaulted'; }
    else if (locked) { stateLabel = 'Locked'; stateClass = 'is-locked'; }
    const reasons = locked ? eligibility.reasons.join(' | ') : '';
    const routeChip = node.routeLabel
      ? `<span class="campaign-chip is-route">${_esc(node.routeLabel)}</span>`
      : (node.routeKey ? `<span class="campaign-chip is-route">${_esc(_label(node.routeKey))}</span>` : '');
    const action = blocked
      ? `<span class="campaign-pill is-update">In Update</span>`
      : (locked
        ? `<button class="campaign-action" data-campaign-action="sequence-start" data-id="${_escAttr(node.id)}" disabled title="${_escAttr(reasons || 'Locked')}">Locked</button>`
        : `<button class="campaign-action primary" data-campaign-action="sequence-start" data-id="${_escAttr(node.id)}">${replayOnly ? 'Read' : 'Play'}</button>`);
    return `
      <div class="campaign-chapter-tree-node depth-${Math.min(depth, 4)} ${stateClass}" role="treeitem" aria-level="${depth + 1}">
        <div class="campaign-chapter-tree-row">
          <div class="campaign-chapter-tree-marker" aria-hidden="true"></div>
          <div class="campaign-chapter-tree-body">
            <div class="campaign-chapter-tree-head">
              <strong>${_esc(node.partLabel || node.orderKey || node.id)}</strong>
              <span>${_esc(node.title || '')}</span>
              ${routeChip}
              <span class="campaign-pill ${stateClass}">${_esc(stateLabel)}</span>
            </div>
            ${node.meta?.summary?.short ? `<div class="campaign-muted">${_esc(node.meta.summary.short)}</div>` : ''}
            ${reasons ? `<div class="campaign-muted is-warning">Unlock requires: ${_esc(reasons)}</div>` : ''}
            ${node.nextCandidates?.length ? `<div class="campaign-muted">Next: ${_esc(node.nextCandidates.join(' / '))}</div>` : ''}
            <div class="campaign-chapter-tree-actions">${action}</div>
          </div>
        </div>
        ${node.children?.length ? `<div class="campaign-chapter-tree-children">${node.children.map((child) => _renderChapterTreeNode(child, depth + 1)).join('')}</div>` : ''}
      </div>
    `;
  }

  function _renderStoryPipelinePanel(pipeline = {}) {
    const items = Array.isArray(pipeline.nextCandidates) ? pipeline.nextCandidates.filter(Boolean) : [];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>Next Planned Parts</h3>
          <span class="campaign-pill">${items.length}</span>
        </div>
        <div class="campaign-muted">${pipeline.anchorTitle ? `Following ${pipeline.anchorTitle}` : 'Upcoming story delivery for this arc.'}</div>
        ${items.length
          ? `<div class="campaign-chip-row">${items.map((item) => `<span class="campaign-chip">${_esc(item)}</span>`).join('')}</div>`
          : '<div class="campaign-empty">No next-part notes yet.</div>'}
      </section>
    `;
  }

  function _renderSyncSummaryPanel(title = 'State Sync', lines = [], sourceTitle = '') {
    const items = Array.isArray(lines) ? lines.filter(Boolean) : [];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>${_esc(title)}</h3>
          ${sourceTitle ? `<span class="campaign-pill">${_esc(_shortenPanelLabel(sourceTitle))}</span>` : ''}
        </div>
        ${items.length
          ? items.map((line) => `<div class="campaign-row"><div>${_esc(line)}</div></div>`).join('')
          : '<div class="campaign-empty">No quest, hub, or rumor sync notes for this part yet.</div>'}
      </section>
    `;
  }

  function _shortenPanelLabel(value = '') {
    const text = String(value || '');
    return text.length > 24 ? `${text.slice(0, 22)}..` : text;
  }

  function _storySummaryEntries(state = CS().getState() || {}) {
    const Seq = window.CJS.CampaignSequences;
    const ordered = Seq?.list?.('story', state.currentWorld) || [];
    const records = state.storyMode?.partResults || {};
    const seen = new Set();
    const out = ordered.map((storyEntry) => {
      const record = records[storyEntry.id];
      if (!record) return null;
      seen.add(storyEntry.id);
      const meta = Seq?.storyMeta?.(storyEntry, state.currentWorld) || {};
      return {
        ...record,
        title: record.title || storyEntry.title || storyEntry.id,
        chapterLabel: record.chapterLabel || meta.chapterLabel || '',
        partLabel: meta.partLabel || '',
        summaryText: record.summaryText || _storySummaryTextFromRecord(record),
        syncSummary: record.syncSummary || meta.syncSummary || []
      };
    }).filter(Boolean);
    for (const record of Object.values(records)) {
      if (!record?.sequenceId || seen.has(record.sequenceId)) continue;
      out.push({
        ...record,
        title: record.title || record.sequenceId,
        chapterLabel: record.chapterLabel || '',
        partLabel: '',
        summaryText: record.summaryText || _storySummaryTextFromRecord(record),
        syncSummary: record.syncSummary || []
      });
    }
    return out;
  }

  function _storySummaryTextFromRecord(record = {}) {
    return record.summaryText
      || (record.log || []).map((line) => line.summary).filter(Boolean).slice(-3).join(' | ')
      || record.result
      || 'Story part recorded.';
  }

  function _renderGachaHomeHero({ tone = 'story', kicker = '', title = '', text = '', meta = [], actions = [] } = {}) {
    return `
      <section class="campaign-gacha-hero campaign-wide-panel is-${_escAttr(tone)}" ${_worldHomeHeroStyle()}>
        <div class="campaign-gacha-hero-copy">
          <div class="campaign-gacha-kicker">${_esc(kicker)}</div>
          <h2>${_esc(title)}</h2>
          <p>${_esc(text)}</p>
          <div class="campaign-chip-row">${meta.map((item) => `<span class="campaign-chip">${_esc(item)}</span>`).join('')}</div>
        </div>
        <div class="campaign-gacha-hero-actions">${actions.join('')}</div>
      </section>
    `;
  }

  function _renderFarmingStageCard(title, text, action, opts = {}) {
    const tag = opts.tag ? `<span class="campaign-stage-tag">${_esc(opts.tag)}</span>` : '';
    const icon = opts.icon ? `<span class="campaign-stage-icon" aria-hidden="true">${_esc(opts.icon)}</span>` : '';
    return `
      <article class="campaign-stage-card">
        <div class="campaign-stage-head">
          ${icon}
          <strong>${_esc(title)}</strong>
          ${tag}
        </div>
        <p>${_esc(text)}</p>
        <button class="campaign-action" data-campaign-action="${_escAttr(action)}">Start</button>
      </article>
    `;
  }

  // TOOL_PURPOSES, _renderInlinePurpose, _purposeTone, _purposeKeyForCard
  // live in js/campaign/ui/cui-controls.js (bound as aliases at the top).

  // _renderOverview — Phase F.4 port. Body moved to
  // `src/campaign/tabs/CampaignOverviewTab.tsx`. The outer dashboard
  // and Adventure Desk (3 control groups, 13 buttons) are JSX. The 12
  // shared sub-panels still come through the HTML bridge
  // `renderOverviewSectionHtml(sectionId, state)`; each one migrates
  // independently by replacing its <Section> with a JSX render.

  function _renderStoryDirector(state) {
    const director = SD();
    if (!director) return '<div class="campaign-empty">Story Director module is not loaded.</div>';
    const snap = director.snapshot();
    const pack = snap.pack;
    const theme = _storyTheme(state);
    if (!pack) {
      const next = {
        index: 0,
        title: 'No story pack loaded',
        text: 'This world has a visual theme, but no Story Director pack yet. Add one later to unlock scene rolls, routes, clues, and side route guidance.',
        actions: []
      };
      return `
        <div class="campaign-dashboard campaign-story-dashboard campaign-story-vn ${_escAttr(theme.className)}" ${_storyThemeStyle(theme)}>
          ${_renderStoryVnHero({ state, pack: null, stage: null, next, theme })}
          <section class="campaign-panel campaign-wide-panel campaign-story-empty-world">
            <div class="campaign-panel-head"><h2>Story Mode</h2></div>
            <div class="campaign-empty">No Story Director pack loaded for this world.</div>
          </section>
        </div>
      `;
    }
    const stage = snap.stage || {};
    const stages = pack.stages || [];
    const metrics = pack.metrics || [];
    const flow = snap.flow;
    const queue = snap.queue.slice(0, 8);
    const clues = snap.clues.slice(0, 8);
    const facts = snap.facts.slice(0, 8);
    const syncKey = pack.id && flow?.stageId ? `${pack.id}:${flow.stageId}` : '';
    const flowSynced = !!(syncKey && state.storyDirector?.sideQuestSync?.[syncKey]);
    const next = _storyNextStep(snap, state, flowSynced);

    return `
      <div class="campaign-dashboard campaign-story-dashboard campaign-story-vn ${_escAttr(theme.className)}" ${_storyThemeStyle(theme)}>
        ${_renderStoryVnHero({ state, pack, stage, next, theme })}

        <section class="campaign-panel campaign-wide-panel campaign-story-control-deck">
          <div class="campaign-panel-head">
            <div>
              <h2>Story Desk</h2>
              <div class="campaign-muted">Rolls open a decision window first. Nothing changes until you choose a route.</div>
            </div>
            <span class="campaign-pill">${_esc(stage.name || stage.id || 'No stage')}</span>
          </div>
          <div class="campaign-story-command-grid">
            ${_renderStorySoloGuide(next)}
            ${_renderStoryActionDeck(flow, flowSynced)}
          </div>
        </section>

        <section class="campaign-panel campaign-wide-panel campaign-story-episode-panel">
          <div class="campaign-panel-head">
            <div>
              <h3>Episode Route</h3>
              <div class="campaign-muted">${_esc(stage.summary || '')}</div>
            </div>
          </div>
          ${_renderStoryStageRail(stages, stage)}
        </section>

        ${snap.last ? _renderStoryDirectorCard(snap.last) : _renderStoryDirectorEmptyCard()}

        <div class="campaign-story-support-grid campaign-wide-panel">
          ${_renderStoryPressureBoard(metrics, snap, pack)}
          ${_renderStorySideFlow(flow, flowSynced)}
          ${_renderStoryCluesPanel(clues, facts)}
          ${_renderStoryQueuePanel(queue)}
          ${_renderStoryTruthsPanel(pack)}
        </div>
      </div>
    `;
  }

  function _storyTheme(state = {}) {
    const world = CS().getCurrentWorld?.() || {};
    const cfg = world.storyModeTheme || {};
    const currentWorld = state.currentWorld || world.id || '';
    return {
      id: cfg.id || 'default',
      className: cfg.className || '',
      backdrop: cfg.backdrop || '',
      bannerImage: cfg.bannerImage || cfg.backdrop || '',
      bannerVideo: cfg.bannerVideo || (currentWorld === 'haven' ? 'assets/videos/story-mode/banners/3%20f%C3%ACght%20chimera_reduced.mp4' : ''),
      accent: cfg.accent || world.color || '#76d3b1',
      danger: cfg.danger || '#ef6666',
      motif: cfg.motif || world.tone || 'story',
      worldName: world.displayName || state.currentWorld || 'World'
    };
  }

  function _storyThemeStyle(theme = {}) {
    const parts = [];
    if (theme.backdrop) parts.push(`--story-backdrop: url('${_escAttr(_cssVarAssetUrl(theme.backdrop))}')`);
    if (theme.accent) parts.push(`--story-accent: ${_escAttr(theme.accent)}`);
    if (theme.danger) parts.push(`--story-danger: ${_escAttr(theme.danger)}`);
    return parts.length ? `style="${parts.join('; ')}"` : '';
  }

  function _renderStoryVnHero({ state = {}, pack = null, stage = null, next = {}, theme = {} }) {
    const phase = state.phase || {};
    const title = pack?.name || `${theme.worldName || 'World'} Story Mode`;
    const summary = pack?.summary || 'Story Mode is ready for this world theme, but no authored story pack is loaded yet.';
    const actions = next.actions?.length ? `<div class="campaign-story-next-actions">${next.actions.join('')}</div>` : '';
    const video = theme.bannerVideo || '';
    const videoMarkup = video
      ? `<video class="campaign-story-vn-video" autoplay muted loop playsinline preload="auto" aria-hidden="true" tabindex="-1">
          <source src="${_escAttr(video)}" type="${_escAttr(_videoTypeFromPath(video))}">
        </video>`
      : '';
    return `
      <section class="campaign-story-vn-hero campaign-wide-panel ${video ? 'has-video' : ''}">
        ${videoMarkup}
        <div class="campaign-story-vn-shade" aria-hidden="true"></div>
        <div class="campaign-story-vn-content">
          <div class="campaign-story-vn-kicker">
            <span>${_esc(theme.worldName || state.currentWorld || 'World')}</span>
            <span>Chapter ${_storyChapterText(state)} / Phase ${_esc(phase.number || 1)}</span>
          </div>
          <div class="campaign-story-vn-title">
            <span class="campaign-story-motif">${_esc(theme.motif || 'story')}</span>
            <h2>${_esc(title)}</h2>
            <p>${_esc(summary)}</p>
          </div>
          <div class="campaign-story-vn-next">
            <span class="campaign-story-step-badge">Next Action</span>
            <strong>${_esc(next.title || 'Choose the next story action')}</strong>
            <p>${_esc(next.text || 'Pick a stage, roll a scene, then choose a route when the popup opens.')}</p>
            ${actions}
            <small>Route choices are previews until you click one.</small>
          </div>
        </div>
      </section>
    `;
  }

  function _videoTypeFromPath(path = '') {
    const lower = String(path).toLowerCase();
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
    return 'video/mp4';
  }

  function _renderStoryDirectorEmptyCard() {
    return `
      <section class="campaign-panel campaign-wide-panel campaign-solo-notice campaign-story-card campaign-story-dialogue is-empty">
        <div class="campaign-panel-head"><h3>Scene Waiting</h3></div>
        <div class="campaign-story-dialogue-box">
          <div class="campaign-story-speaker">Narrator</div>
          <p>Choose <b>Next Scene</b> when you want the app to surprise you. Choose <b>Write Scene</b> when you already know what should happen and only want the campaign log to remember it.</p>
          <small>Nothing random commits until you choose a route.</small>
        </div>
      </section>
    `;
  }

  function _renderStorySoloGuide(next) {
    const steps = [
      ['Stage', 'Pick the episode you are playing now.'],
      ['Scene', 'Roll or write a playable story beat.'],
      ['Route', 'Read the choices and their outcomes.'],
      ['Commit', 'Choose, hold, or skip the roll.'],
      ['Table', 'Update side routes, then play.']
    ];
    return `
      <div class="campaign-story-guide">
        <div class="campaign-story-ladder" aria-label="Solo story flow">
          ${steps.map((step, index) => `
            <div class="campaign-story-ladder-step ${index === next.index ? 'is-active' : index < next.index ? 'is-done' : ''}">
              <span>${index + 1}</span>
              <b>${_esc(step[0])}</b>
              <small>${_esc(step[1])}</small>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function _renderStoryActionDeck(flow, flowSynced) {
    return `
      <div class="campaign-story-roll-pad">
        <div class="campaign-section-title">Scene Controls</div>
        <div class="campaign-action-grid">
          ${_actionBtn({ action: 'story-roll-scene', label: 'Next Scene', hint: 'Default story roll. Opens a popup before anything is applied.', kind: 'primary story' })}
          ${_actionBtn({ action: 'story-manual-note', label: 'Write Scene', hint: 'Write your own table beat and save it without random rolling.', kind: 'manual' })}
          ${_actionMenu('Roll Type', `
            ${_actionBtn({ action: 'story-roll-peri', label: 'Peri Interrupt', hint: 'Comic system interruption, helpful glitch, or suspicious advice.', kind: 'random' })}
            ${_actionBtn({ action: 'story-roll-memory', label: 'Memory / Clue', hint: 'Mystery clue or emotional leak. Good when the scene needs plot smoke.', kind: 'plot' })}
            ${_actionBtn({ action: 'story-pressure-tick', label: 'Offscreen Trouble', hint: 'Pressure that happens away from the current scene when time passes or the table stalls.', kind: 'risk' })}
          `)}
          ${_actionMenu('Story Tools', `
            ${_actionBtn({ action: 'story-sync-sidequests', label: flowSynced ? 'Routes Updated' : 'Update Side Routes', hint: 'Marks which side routes should stay, rise, or pause for this episode.', kind: flowSynced ? 'manual' : 'quest', disabled: !flow || flowSynced })}
            ${_actionBtn({ action: 'story-copy-prompt', label: 'Copy GM Prompt', hint: 'Copies current stage, last beat, clues, and queue for outside AI or GM drafting.', kind: 'manual' })}
            ${_actionBtn({ action: 'story-help', label: 'Flow Help', hint: 'Short solo/GM instructions for this Story Mode desk.' })}
          `)}
        </div>
      </div>
    `;
  }

  function _storyNextStep(snap, state, flowSynced) {
    const last = snap?.last;
    const choices = last?.suggestedChoices || [];
    if (!snap?.stage) {
      return {
        index: 0,
        title: 'Pick an arc stage',
        text: 'Choose the part of the story you are actually playing now. This only guides tables; it does not lock the plot.',
        actions: []
      };
    }
    if (!last) {
      return {
        index: 1,
        title: 'Roll or write the next scene',
        text: 'Use Next Scene for normal story flow, Peri Interrupt for comedy, Memory / Clue for mystery, or Write Scene when you want GM control.',
        actions: [
          _actionBtn({ action: 'story-roll-scene', label: 'Next Scene', hint: 'Best default for solo play', kind: 'primary story' }),
          _actionBtn({ action: 'story-manual-note', label: 'Write Scene', hint: 'Save your own beat', kind: 'manual' })
        ]
      };
    }
    if (!['resolved', 'rejected', 'saved', 'manual', 'review'].includes(last.status || '')) {
      return {
        index: 2,
        title: 'Choose a route',
        text: 'Read the route cards below. Choose one if it fits, hold it for later, or skip the roll with no guilt.',
        actions: [
          _actionBtn({ action: 'story-open-last', label: 'Open Popup', hint: 'Reopen the current beat window', kind: 'primary story' }),
          _actionBtn({ action: 'story-save-beat', label: 'Hold For Later', hint: 'Keep it in the queue without applying consequences', kind: 'manual' }),
          _actionBtn({
            action: 'story-apply-choice',
            label: choices[0]?.label ? `Choose: ${choices[0].label}` : 'Accept Note',
            hint: 'Apply the first route',
            kind: 'quest',
            data: { id: last.id, choice: 0 }
          })
        ]
      };
    }
    if (snap.flow && !flowSynced) {
      return {
        index: 4,
        title: 'Update side routes',
        text: 'This episode has advice for which side routes should stay available, get promoted, or politely leave the room.',
        actions: [
          _actionBtn({ action: 'story-sync-sidequests', label: 'Update Side Routes', hint: 'Applies this episode side-flow once', kind: 'quest' })
        ]
      };
    }
    if (state?.activeScenarioRun) {
      return {
        index: 4,
        title: 'Continue the tabletop run',
        text: 'A scenario is active. Use the story beat as table color, then continue moving pieces and resolving encounters on the map.',
        actions: [
          _actionBtn({ action: 'open-maps-tab', label: 'Open Run Map', hint: 'Return to the tactical board', kind: 'primary' })
        ]
      };
    }
    return {
      index: 1,
      title: 'Ready for the next scene',
      text: 'The last beat is handled. Roll again, write a scene, or just let the table breathe for a moment.',
      actions: [
        _actionBtn({ action: 'story-roll-scene', label: 'Next Scene', hint: 'Continue the story flow', kind: 'primary story' })
      ]
    };
  }

  function _renderStoryStageRail(stages, stage = {}) {
    if (!stages.length) return '<div class="campaign-empty">No stages authored.</div>';
    const activeIndex = Math.max(0, stages.findIndex((entry) => entry.id === stage.id));
    return `
      <div class="campaign-story-stage-rail">
        ${stages.map((entry, index) => {
          const cls = ['campaign-story-stage'];
          if (entry.id === stage.id) cls.push('is-active');
          else if (index < activeIndex) cls.push('is-past');
          return `
            <button class="${cls.join(' ')}" data-campaign-action="story-set-stage" data-id="${_escAttr(entry.id)}" title="${_escAttr(entry.summary || '')}">
              <span>${index + 1}</span>
              <strong>${_esc(entry.name || entry.id)}</strong>
              <small>${_esc(entry.summary || '')}</small>
            </button>
          `;
        }).join('')}
      </div>
    `;
  }

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

  function _renderStoryPressureBoard(metrics, snap, pack) {
    return `
      <section class="campaign-panel campaign-story-support-panel">
        <div class="campaign-panel-head"><h3>Pressure Board</h3></div>
        <div class="campaign-stat-grid">
          ${metrics.map((metric) => `<span>${_esc(metric.label || _label(metric.id))} <b>${_esc(snap.metrics[metric.id] || 0)}</b></span>`).join('') || '<span>No metrics authored.</span>'}
        </div>
        <div class="campaign-control-help">${_esc(pack.pressureRule || 'Offscreen trouble suggests consequences. Apply only what fits the session.')}</div>
      </section>
    `;
  }

  function _renderStoryCluesPanel(clues, facts) {
    return `
      <section class="campaign-panel campaign-story-support-panel">
        <div class="campaign-panel-head"><h3>Clues & Reveals</h3></div>
        ${clues.length ? clues.map((clue) => `
          <div class="campaign-row">
            <div>
              <strong>${_esc(clue.title || clue.id)}</strong>
              <div class="campaign-muted">${_esc(clue.text || '')}</div>
            </div>
            <span class="campaign-risk ${Side().riskClass(clue.canonRisk)}">${_esc(clue.canonRisk || 'green')}</span>
          </div>
        `).join('') : '<div class="campaign-empty">No story clues recorded yet.</div>'}
        ${facts.length ? `<div class="campaign-section-title">Revealed Facts</div>${facts.map((fact) => `<div class="campaign-town-line is-plot"><strong>${_esc(fact.title || fact.id)}</strong><span>${_esc(fact.text || '')}</span></div>`).join('')}` : ''}
      </section>
    `;
  }

  function _renderStoryQueuePanel(queue) {
    return `
      <section class="campaign-panel campaign-story-support-panel">
        <div class="campaign-panel-head"><h3>Held Scenes</h3></div>
        ${queue.length ? queue.map((beat) => `
          <div class="campaign-row">
            <div>
              <strong>${_esc(beat.title || beat.id)}</strong>
              <div class="campaign-muted">${_esc(beat.status || 'saved')} | ${_esc(beat.stageName || beat.stageId || '')}</div>
            </div>
            <span class="campaign-risk ${Side().riskClass(beat.canonRisk)}">${_esc(beat.canonRisk || 'green')}</span>
          </div>
        `).join('') : '<div class="campaign-empty">Hold a scene to keep it here for later.</div>'}
      </section>
    `;
  }

  function _renderStoryTruthsPanel(pack) {
    return `
      <section class="campaign-panel campaign-story-support-panel">
        <div class="campaign-panel-head"><h3>Protected Truths</h3></div>
        ${(pack.protectedTruths || []).slice(0, 10).map((truth) => `
          <div class="campaign-town-line is-risk">
            <strong>${_esc(truth.title || truth.id)}</strong>
            <span>${_esc(truth.rule || 'Red-risk until the GM promotes it.')}</span>
          </div>
        `).join('') || '<div class="campaign-empty">No protected truths listed.</div>'}
      </section>
    `;
  }

  function _renderStorySideFlow(flow, flowSynced = false) {
    if (!flow) {
      return `
        <section class="campaign-panel campaign-story-support-panel">
          <div class="campaign-panel-head"><h3>Side Routes</h3></div>
          <div class="campaign-empty">No side route flow authored for this episode.</div>
        </section>
      `;
    }
    const row = (label, list, tone) => list?.length ? `
      <div>
        <div class="campaign-section-title">${_esc(label)}</div>
        ${list.map((item) => `<div class="campaign-town-line is-${_escAttr(tone)}"><strong>${_esc(item.title || item.id || item)}</strong><span>${_esc(item.reason || item.note || '')}</span></div>`).join('')}
      </div>
    ` : '';
    return `
      <section class="campaign-panel campaign-story-support-panel">
        <div class="campaign-panel-head">
          <div>
            <h3>Side Routes</h3>
            <div class="campaign-muted">${_esc(flow.summary || 'Keep, promote, or retire optional content as the main arc moves.')}</div>
          </div>
          <div class="campaign-row-actions">
            <span class="campaign-chip ${flowSynced ? 'is-good' : 'is-warn'}">${flowSynced ? 'Updated' : 'Not updated'}</span>
            <button class="campaign-action ${flowSynced ? '' : 'quest'}" data-campaign-action="story-sync-sidequests" ${flowSynced ? 'disabled' : ''}>Update Routes</button>
          </div>
        </div>
        <div class="campaign-town-columns">
          ${row('Keep Available', flow.keep, 'flavor')}
          ${row('Promote Soon', flow.promote, 'plot')}
          ${row('Retire / Downgrade', flow.retire, 'risk')}
        </div>
      </section>
    `;
  }

  function _renderAdventureLegend(state) {
    const hasResult = state?.lastEvent || state?.lastOracle || state?.pendingSoloHook || state?.pendingBattle;
    if (hasResult) return '';
    return `
      <section class="campaign-panel campaign-legend">
        <div class="campaign-panel-head">
          <h3>What each output means</h3>
          <small class="campaign-muted">Click any Adventure Desk button to see a result here</small>
        </div>
        <div class="campaign-legend-grid">
          <div class="campaign-legend-item">
            <strong>📜 Story Offer / Hook</strong>
            <p>A narrative card with a suggested choice. Buttons let you <b>Accept</b> (apply choice's ops),
            <b>Make Quest</b> (add to Quest Tracker), <b>Make Rumor</b> (post to hub), or <b>Save</b>/<b>Ignore</b>.
            Accepting a quest offer also auto-starts its map run.</p>
          </div>
          <div class="campaign-legend-item">
            <strong>🎴 Event</strong>
            <p>A table-rolled event with prepared consequence ops (gold, danger, status, etc.).
            <b>Apply</b> commits the ops; <b>Edit First</b> lets you change them; <b>Save Note</b> just logs it;
            <b>Pin Plot Seed</b> stores it as a future hook; <b>Ignore</b> discards it.</p>
          </div>
          <div class="campaign-legend-item">
            <strong>🔮 GM Prompt (Oracle)</strong>
            <p>Pure inspiration text. <b>No bonuses</b> are applied to the campaign. Use it to riff a scene,
            then either <b>Save as Note</b> for later or <b>Reroll</b>.</p>
          </div>
          <div class="campaign-legend-item">
            <strong>⚔ Battle / Scenario</strong>
            <p>Battle Ready cards run combat (or take a manual result). Scenarios are the run/map flow;
            quests with linked maps will create one when you press <b>Map Run</b> in the Quest Tracker.</p>
          </div>
        </div>
      </section>
    `;
  }

  // Hub tab body renderers (`sideForge`, `questChains`, `oracleForge`,
  // `battleSets`, `mapSeeds`) live in `js/campaign/ui/tabs/cui-hub-tab.js`.
  // The tab registry already routes them; no shell stubs are needed.

  // Shared hub-flavored primitives kept as closure delegators so the
  // story home, overview, event log, and manual builder can keep
  // calling them without learning about the hub tab module.
  function _renderTownSnapshot(state) {
    return window.CJS.CampaignUIInternal.HubTab.renderTownSnapshot(state);
  }

  function _renderTownRollFloat(state) {
    return window.CJS.CampaignUIInternal.HubTab.renderTownRollFloat(state, {
      pendingSoloHookCard: _pendingSoloHookCard
    });
  }

  function _isRumorOpen(rumor = {}) {
    return window.CJS.CampaignUIInternal.HubTab.isRumorOpen(rumor);
  }

  function _openRumors(hubState) {
    return window.CJS.CampaignUIInternal.HubTab.openRumors(hubState);
  }

  function _renderRumorRow(rumor = {}, options = {}) {
    return window.CJS.CampaignUIInternal.HubTab.renderRumorRow(rumor, options);
  }

  function _renderQuestChainActive(chain) {
    return window.CJS.CampaignUIInternal.HubTab.renderQuestChainActive(chain);
  }

  function _renderQuestChainTemplate(chain) {
    return window.CJS.CampaignUIInternal.HubTab.renderQuestChainTemplate(chain);
  }

  // _renderQuestChainResolved, _renderSideStoryFlowGuide,
  // _renderQuestChainStepCard, _renderQuestChainStepDetail,
  // _questChainStepSystems, _renderQuestChainVnPanel, _renderChainStakes
  // are referenced only inside the chain template card itself; they
  // moved with the rest of the hub tab.

  function _startQuestChainRun(templateId) {
    const chain = window.CJS.CampaignQuestChains?.getTemplate?.(templateId);
    if (!chain) return UI().toast('Quest arc not found', 'info');
    if (CS().getState()?.activeScenarioRun) {
      _activeMode = 'event';
      _activeTab = 'maps';
      render();
      return UI().toast('A scenario is already active. Finish it before starting a quest arc run.', 'info');
    }
    window.CJS.CampaignQuestChains.start(templateId);
    return _startQuestChainScenario(templateId);
  }

  function _startQuestChainScenario(templateId) {
    const chain = window.CJS.CampaignQuestChains?.getTemplate?.(templateId);
    if (!chain) return UI().toast('Quest arc not found', 'info');
    const quest = _ensureQuestChainQuest(chain);
    if (!quest) return null;
    const activeRun = CS().getState()?.activeScenarioRun;
    const activeScenario = CS().getActiveScenario?.();
    if (activeRun) {
      if (_activeRunQuestId(activeRun, activeScenario) === quest.id || activeRun.questChainId === templateId) return _goto(null, 'maps');
      return UI().toast('End the active scenario before starting this quest arc map', 'info');
    }
    return _startQuestScenario(quest.id, {
      quest,
      source: 'quest_chain',
      questChainId: templateId,
      mapForm: _questMapForm(chain),
      mapType: chain.mapType || _questMapType(chain),
      size: chain.size || 'small',
      forceGenerated: !chain.linkedScenario
    });
  }

  function _questChainBattle(templateId) {
    const chain = window.CJS.CampaignQuestChains?.getTemplate?.(templateId);
    if (!chain) return UI().toast('Quest arc not found', 'info');
    const quest = _ensureQuestChainQuest(chain);
    if (!quest) return null;
    return _questBattle(quest.id);
  }

  function _ensureQuestChainQuest(chain) {
    const questId = `quest_${chain.id}`;
    const existing = CS().getState()?.quests?.[questId];
    if (existing && !_isQuestResolved(existing)) return existing;
    const quest = window.CJS.CampaignQuestChains.toQuest(chain);
    Ops().apply({ op: 'add_quest', quest }, { source: 'quest_chain' });
    return CS().getState()?.quests?.[questId] || quest;
  }

  function _addQuestChainToTracker(templateId) {
    window.CJS.CampaignQuestChains.start(templateId);
    _activeMode = 'event';
    _activeTab = 'questChains';
    render();
    UI().toast('Side story added to Event', 'success');
  }

  function _advanceQuestChainStep(templateId) {
    window.CJS.CampaignQuestChains.advance(templateId);
    render();
  }

  function _completeQuestChain(templateId) {
    window.CJS.CampaignQuestChains.complete(templateId);
    render();
    UI().toast('Quest arc resolved', 'success');
  }

  function _failQuestChain(templateId) {
    window.CJS.CampaignQuestChains.fail(templateId);
    render();
    UI().toast('Quest arc failed', 'info');
  }

  // Side card, consequence preview, flavor trail, and the consequence
  // tone helpers all live in `js/campaign/ui/tabs/cui-hub-tab.js`. The
  // story home, event log, manual builder, and overview keep calling
  // them through these thin closure delegators.
  function _renderSideCard(card, options = {}) {
    return window.CJS.CampaignUIInternal.HubTab.renderSideCard(card, options);
  }

  function _cardChoiceOps(card = {}) {
    return window.CJS.CampaignUIInternal.HubTab.cardChoiceOps(card);
  }

  function _renderChoiceConsequence(choice = {}, index = 0) {
    return window.CJS.CampaignUIInternal.HubTab.renderChoiceConsequence(choice, index);
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

  function _operationTone(op = {}) {
    return window.CJS.CampaignUIInternal.HubTab.operationTone(op);
  }

  // _impactLegendItem, _controlGroup, _actionMenu, _actionBtn live in
  // js/campaign/ui/cui-controls.js (bound as aliases at the top).

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

  function _renderScenarioSummary(state) {
    const run = state.activeScenarioRun;
    if (!run) {
      return `
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h2>Current Run</h2></div>
          <div class="campaign-empty">No active run.</div>
          <button class="campaign-action primary" data-campaign-action="open-scenarios-tab">Run Setup</button>
        </section>
      `;
    }
    const scenario = CS().getScenarioById(run.scenarioId);
    const location = run.travelMode === 'grid_map' && run.currentCell
      ? `${run.currentCell.x},${run.currentCell.y}`
      : (run.currentNode || '-');
    const questPill = _runQuestPill(state, run, scenario);
    const objective = run.objectiveState || null;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || run.scenarioId)}</h2>
          <span class="campaign-pill">Danger ${run.danger}/${run.dangerMax}</span>
          ${questPill}
        </div>
        <div class="campaign-stat-grid">
          <span>${run.travelMode === 'grid_map' ? 'Cell' : 'Node'} <b>${_esc(location)}</b></span>
          <span>Camp <b>${run.usedCampRests}/${run.limits?.campRests ?? 0}</b></span>
          <span>Events <b>${run.eventsUsed}/${run.limits?.events ?? 0}</b></span>
          <span>Battles <b>${run.randomBattlesUsed}/${run.limits?.randomBattles ?? 0}</b></span>
          ${run.movingThreats?.length ? `<span>Roamers <b>${run.movingThreats.length}</b></span>` : ''}
        </div>
        ${objective ? `
          <div class="campaign-quest-phase campaign-scenario-task">
            <span>${objective.completed ? 'Objective Complete' : (objective.visible === false ? 'Objective Hidden' : 'Current Objective')}</span>
            <strong>${_esc(objective.label || 'Reach the target')}</strong>
            <small>${_esc(_scenarioObjectiveMeta(run, objective))}</small>
          </div>
        ` : ''}
        ${_renderQuestRunTask(state, run, scenario)}
        <div class="campaign-control-stack">
          ${_controlGroup('Run Tools', `
            <button class="campaign-action" data-campaign-action="open-maps-tab">Map</button>
            <button class="campaign-action primary" data-campaign-action="roll-travel-surprise">Movement Surprise</button>
            <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          `)}
          ${_controlGroup('Manual Control', `
            <button class="campaign-action" data-campaign-action="manual-battle">Manual Battle Result</button>
            <button class="campaign-action danger" data-campaign-action="end-scenario">End Run</button>
            ${scenario?.generated ? '<button class="campaign-action danger" data-campaign-action="cancel-scenario" title="Discard without report">Cancel Run</button>' : ''}
          `)}
        </div>
        <div class="campaign-action-grid" hidden>
          <button class="campaign-action" data-campaign-action="open-maps-tab">Map</button>
          <button class="campaign-action" data-campaign-action="roll-travel-surprise">Travel Surprise</button>
          <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          <button class="campaign-action" data-campaign-action="manual-battle">Manual Battle Result</button>
          <button class="campaign-action danger" data-campaign-action="end-scenario">End Run</button>
          ${scenario?.generated ? '<button class="campaign-action danger" data-campaign-action="cancel-scenario" title="Discard without report">Cancel Run</button>' : ''}
        </div>
      </section>
    `;
  }

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

  function _renderPendingBattle(state) {
    const battle = state.pendingBattle;
    if (!battle) return '';
    const isRandom = battle.source === 'random';
    const canRun = battle.encounterId || battle.battleSetId || battle.monsterIds?.length;
    return `
      <section class="campaign-panel battle-ready">
        <div class="campaign-panel-head">
          <h2>Battle Ready</h2>
          <span class="campaign-pill">${_esc(_battleSourceLabel(battle))}</span>
        </div>
        <strong>${_esc(battle.label || battle.encounterId)}</strong>
        <div class="campaign-muted">${_esc(battle.encounterId || battle.battleSetId || (battle.monsterIds || []).join(', ') || '')}</div>
        ${battle.battleMap?.theme ? `<div class="campaign-muted">Auto map: ${_esc(_label(battle.battleMap.theme))}</div>` : ''}
        ${_renderPendingBattleContext(state, battle)}
        ${_renderBattlePartySummary(state)}
        <div class="campaign-control-help">Choose how this battle resolves. <b>Run in Combat App</b> = full tactical fight (loot returns to campaign). <b>Resolve Manually</b> = type a free-form result. <b>Manual Victory/Defeat</b> = skip the fight with default rewards or penalty. Cancel removes the pending battle without effect.</div>
        <div class="campaign-action-grid campaign-battle-primary-actions">
          ${_actionBtn({ action: 'run-battle',       label: 'Run in Combat App', hint: 'Open the tactical combat screen with this encounter', kind: 'primary', disabled: !canRun })}
          ${_actionBtn({ action: 'manual-battle',    label: 'Resolve Manually',  hint: 'Type a custom outcome and rewards' })}
          ${_actionMenu('Battle Options', `
            ${isRandom ? _actionBtn({ action: 'battle-reroll', label: 'Reroll', hint: 'Re-roll from the same random table' }) : ''}
            ${_actionBtn({ action: 'battle-override',  label: 'Override',        hint: 'Pick a specific encounter from the catalog' })}
            ${_actionBtn({ action: 'skip-victory',     label: 'Manual Victory',  hint: 'Skip the fight as a win (basic rewards)' })}
            ${_actionBtn({ action: 'skip-defeat',      label: 'Manual Defeat',   hint: 'Skip as a loss (default: danger +2 and 10% currency loss)' })}
            ${_actionBtn({ action: 'cancel-battle',    label: 'Cancel Battle',   hint: 'Remove pending battle, no effect', kind: 'danger' })}
          `)}
        </div>
        <div class="campaign-action-grid campaign-battle-legacy-actions" hidden>
          ${_actionBtn({ action: 'run-battle',       label: 'Run in Combat App',     hint: 'Open the tactical combat screen with this encounter', kind: 'primary', disabled: !canRun })}
          ${_actionBtn({ action: 'manual-battle',    label: 'Resolve Manually',      hint: 'Type a custom outcome and rewards' })}
          ${isRandom ? _actionBtn({ action: 'battle-reroll', label: '🎲 Reroll', hint: 'Re-roll from the same random table' }) : ''}
          ${_actionBtn({ action: 'battle-override',  label: '📋 Override',           hint: 'Pick a specific encounter from the catalog' })}
          ${_actionBtn({ action: 'skip-victory',     label: 'Manual Victory',        hint: 'Skip the fight as a win (basic rewards)' })}
          ${_actionBtn({ action: 'skip-defeat',      label: 'Manual Defeat',         hint: 'Skip as a loss (default: danger +2 and 10% currency loss)' })}
          ${_actionBtn({ action: 'cancel-battle',    label: 'Cancel',                hint: 'Remove pending battle, no effect', kind: 'danger' })}
        </div>
      </section>
    `;
  }

  function _renderTravelSurprise(state) {
    const notice = state.lastTravelSurprise;
    if (!notice || !state.activeScenarioRun) return '';
    const repeat = notice.repeated ? `Revisit ${notice.visitCount || 2}` : 'New route';
    return `
      <section class="campaign-panel campaign-travel-notice">
        <div class="campaign-panel-head">
          <h2>${_esc(notice.title || 'Travel Surprise')}</h2>
          <span class="campaign-pill">${_esc(_label(notice.category || 'surprise'))}</span>
        </div>
        <p>${_esc(notice.prompt || '')}</p>
        <div class="campaign-chip-row">
          <span class="campaign-chip">${_esc(notice.area || 'Area')}</span>
          <span class="campaign-chip">${_esc(repeat)}</span>
          ${notice.location ? `<span class="campaign-chip">${_esc(notice.location)}</span>` : ''}
        </div>
        <div class="campaign-action-grid" style="margin-top:12px">
          <button class="campaign-action" data-campaign-action="roll-travel-surprise">Roll Another</button>
        </div>
      </section>
    `;
  }

  function _battleSourceLabel(battle) {
    const map = { random: '🎲 Random Roll', set: '📌 Set Battle', manual_pick: '📋 Picked', beat: '📜 Beat', manual: 'Manual' };
    if (battle.source === 'travel_surprise') return 'Travel Surprise';
    if (battle.source === 'moving_threat') return 'Moving Threat';
    if (battle.source === 'random_monster_pool') return 'Monster Pool';
    return map[battle.source] || battle.source || 'manual';
  }

  function _renderBattlePartySummary(state) {
    const ready = [];
    const blocked = [];
    for (const [id, member] of Object.entries(state.party || {})) {
      if (Bridge()?.isMemberBattleReady?.(member)) ready.push(member.name || id);
      else blocked.push(`${member.name || id}: ${Bridge()?.availabilityLabel?.(member) || 'Unavailable'}`);
    }
    return `
      <div class="campaign-preview">
        <b>Battle Party</b><br>
        Ready: ${_esc(ready.join(', ') || 'none')}<br>
        ${blocked.length ? `Unavailable: ${_esc(blocked.join('; '))}` : 'Unavailable: none'}
      </div>
    `;
  }

  function _renderCombatResult(state) {
    const result = state.pendingBattleResult;
    if (!result) return '';
    const loot = _renderLootSummary(result.loot || []);
    return `
      <section class="campaign-panel battle-result">
        <div class="campaign-panel-head"><h2>Returned From Combat</h2><span class="campaign-pill">${_esc(result.result)}</span></div>
        <div class="campaign-muted">${_esc(result.encounterId || '')} | ${result.rounds || 0} rounds</div>
        ${loot}
        ${_renderCombatConsequenceNotice(result, state)}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="apply-combat-result">Apply to Campaign</button>
          <button class="campaign-action danger" data-campaign-action="ignore-combat-result">Ignore</button>
        </div>
      </section>
    `;
  }

  function _renderLastCombatResult(state) {
    const result = state.lastCombatResult;
    if (!result) return '';
    const loot = _renderLootSummary(result.loot || []);
    return `
      <section class="campaign-panel battle-result applied">
        <div class="campaign-panel-head">
          <h2>Combat Applied</h2>
          <span class="campaign-pill">${_esc(result.result || 'resolved')}</span>
        </div>
        <div class="campaign-muted">${_esc(result.encounterId || result.label || 'Campaign battle')} | ${result.rounds || 0} rounds</div>
        ${result.summary ? `<p>${_esc(result.summary)}</p>` : ''}
        ${_renderCombatPulseSummary(result.combatPulse)}
        ${loot}
      </section>
    `;
  }

  function _renderCombatConsequenceNotice(result, state) {
    const outcome = String(result?.result || '').toLowerCase();
    if (!['defeat', 'draw'].includes(outcome)) return '';
    const battle = state.pendingBattle || {};
    const hasCustom = outcome === 'defeat'
      ? !!((result.defeatOps || battle.defeatOps || battle.lossOps || result.badEndingOps || battle.badEndingOps || []).length)
      : !!((result.drawOps || battle.drawOps || []).length);
    const badEnding = outcome === 'defeat' && !!(
      result.badEndingOnDefeat ||
      battle.badEndingOnDefeat ||
      result.defeatOutcome === 'bad_ending' ||
      battle.defeatOutcome === 'bad_ending' ||
      result.defeatMode === 'bad_ending' ||
      battle.defeatMode === 'bad_ending'
    );
    const lines = [];
    if (badEnding) lines.push('Defeat can branch into a bad-ending route for this battle.');
    if (hasCustom) lines.push('This battle has authored defeat consequences.');
    if (!hasCustom) lines.push(outcome === 'draw' ? 'Default draw penalty: danger +1 and 5% currency loss.' : 'Default defeat penalty: danger +2 and 10% currency loss.');
    if (!(result.defeatNoRecovery || battle.defeatNoRecovery || battle.noDefeatRecovery)) lines.push('KO party members recover to low HP instead of an instant wipeout.');
    return `
      <div class="campaign-preview">
        <b>Campaign Consequence</b><br>
        ${lines.map((line) => _esc(line)).join('<br>')}
      </div>
    `;
  }

  function _renderLootSummary(drops) {
    if (!drops.length) return '<div class="campaign-empty">No loot in this result.</div>';
    return `
      <div class="campaign-preview">
        <b>Loot</b><br>
        ${drops.map((drop) => _esc(_lootLine(drop))).join('<br>')}
      </div>
    `;
  }

  function _renderEventResult(state) {
    const event = state.lastEvent;
    if (!event) return '';
    const suggested = event.suggested || [];
    const summary = _consequenceSummary(suggested, { hasText: !!(event.prompt || event.gmHook) });
    const ideaLabels = {
      new_char: '👤 New Character',
      new_item: '🎁 Item idea',
      weapon: '⚔ Weapon idea',
      back_story: '📖 Backstory beat',
      main_plot: '🌌 Main plot thread',
      development: '✨ Character development',
      faction: '🏛 Faction hook',
      mystery: '🔮 Mystery hook'
    };
    const ideaPill = event.gmIdea ? `<span class="campaign-pill">${_esc(ideaLabels[event.gmIdea] || event.gmIdea)}</span>` : '';
    const opsDesc = (event.suggested || []).length ? Ops().describe(event.suggested).filter(Boolean) : [];
    const consequenceLabel = opsDesc.length ? 'Consequences if applied' : 'Story-only event (no automatic ops)';
    return `
      <section class="campaign-panel campaign-event-result campaign-result-card is-${_escAttr(summary.tone)}">
        <div class="campaign-panel-head">
          <div>
            <h2>${_esc(event.title || event.id || 'Event')}</h2>
            <div class="campaign-muted">${_esc(event.tableName || event.type || 'event')}</div>
          </div>
          <div class="campaign-impact-row">
            <span class="campaign-impact-badge is-${_escAttr(summary.tone)}">${_esc(summary.label)}</span>
            ${ideaPill}
          </div>
        </div>
        ${_renderInlinePurpose('event')}
        ${event.manualSummary ? _renderManualEventSummary(event) : ''}
        <p>${_esc(event.prompt || '')}</p>
        ${event.gmHook ? `<div class="campaign-warning"><b>GM hook:</b> ${_esc(event.gmHook)}</div>` : ''}
        ${_renderConsequencePreview(suggested, {
          emptyTitle: 'Flavor or plot text only',
          emptyText: 'No reward or damage is applied. Save the text, pin it as a plot seed, or ignore it.'
        })}
        ${_renderFlavorTrail(event)}
        <div class="campaign-control-help">Pick one: <b>Apply</b> commits listed ops and writes the event ledger. <b>Edit Rewards/Consequences</b> lets you tweak ops. <b>Event Log</b> records summary only. <b>To Quest</b> promotes the hook into the quest tracker.</div>
        <div class="campaign-action-grid">
          ${_actionBtn({ action: 'apply-event', label: suggested.length ? 'Apply Listed Changes' : 'Log Flavor', hint: opsDesc.length ? 'Commit: ' + opsDesc.join('; ') : 'Log the event with no stat changes', kind: 'primary' })}
          ${_actionBtn({ action: 'edit-event', label: 'Edit Rewards/Consequences', hint: 'Tweak the ops, then apply' })}
          ${_actionBtn({ action: 'event-to-quest', label: 'To Quest', hint: 'Create a tracked quest from this event' })}
          ${_actionBtn({ action: 'event-log-only', label: 'Event Log', hint: 'Summarize this event without applying mechanics' })}
          ${_actionBtn({ action: 'event-add-tags', label: 'Add Tags', hint: 'Tag this event in the campaign ledger' })}
          ${event.manualSummary ? _actionBtn({ action: 'copy-event-summary', label: 'Copy Summary', hint: 'Copy the event summary and separate main-story notes for outside writing', kind: 'manual' }) : ''}
          ${(event.gmHook || event.gmIdea) ? _actionBtn({ action: 'pin-plot-seed', label: 'Pin Plot Seed', hint: 'Save as a future plot hook in pinned notes' }) : ''}
          ${event.oracleTableId ? _actionBtn({ action: 'event-to-oracle', label: 'Roll Linked Oracle', hint: 'Roll an oracle prompt linked to this event' }) : ''}
          ${_actionBtn({ action: 'ignore-event', label: 'Ignore', hint: 'Discard this event with no log entry', kind: 'danger' })}
          ${_actionBtn({ action: 'pick-event', label: 'Pick Different', hint: 'Replace with a specific event from the catalog' })}

        </div>
      </section>
    `;
  }

  function _renderManualEventSummary(event = {}) {
    const summary = event.manualSummary || {};
    const tags = (summary.tags || []).filter(Boolean);
    return `
      <div class="campaign-manual-summary">
        <div>
          <strong>Event Summary</strong>
          <span>${_esc(summary.short || 'No short result written yet.')}</span>
        </div>
        ${summary.main ? `
          <div>
            <strong>Main Story</strong>
            <span>${_esc(summary.main)}</span>
          </div>
        ` : ''}
        ${tags.length ? `<div class="campaign-manual-summary-tags">${tags.map((tag) => `<span>${_esc(tag)}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }

  function _renderOracle(state) {
    if (!state.lastOracle) return '';
    return `
      <section class="campaign-panel oracle campaign-result-card is-flavor">
        <div class="campaign-panel-head">
          <h2>GM Prompt</h2>
          <span class="campaign-impact-badge is-flavor">Text only</span>
        </div>
        ${_renderInlinePurpose('oracle')}
        <p>${_esc(state.lastOracle.text)}</p>
        ${_renderConsequencePreview([], {
          emptyTitle: 'Flavor prompt',
          emptyText: 'Use as narration now, save it as a note, or reroll for a sharper prompt.'
        })}
        <div class="campaign-control-help">Pure narrative until promoted. Turn it into a quest, summarize it into Event Log, or open the event builder when you want rewards, consequences, or tags.</div>
        <div class="campaign-action-grid">
          ${_actionBtn({ action: 'oracle-event-log', label: 'Event Log', hint: 'Summarize this prompt into the event ledger', kind: 'primary' })}
          ${_actionBtn({ action: 'oracle-to-quest', label: 'To Quest', hint: 'Create a tracked quest from this prompt' })}
          ${_actionBtn({ action: 'oracle-to-event-builder', label: 'Event Builder', hint: 'Add rewards, consequences, tags, or a main-story note' })}
          ${_actionBtn({ action: 'oracle-add-tags', label: 'Add Tags', hint: 'Tag this oracle result' })}
          ${_actionBtn({ action: 'roll-oracle', label: 'Reroll Prompt', hint: 'Roll a different prompt' })}
          ${_actionBtn({ action: 'pick-oracle', label: 'Pick Different', hint: 'Pick a specific prompt from the catalog' })}

        </div>
      </section>
    `;
  }

  function _renderLastReport(state) {
    const report = state.lastScenarioReport;
    if (!report) return '';
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h2>Last Scenario Report</h2><span class="campaign-pill">${_esc(report.outcome)}</span></div>
        <div class="campaign-stat-grid">
          <span>Danger <b>${report.danger}</b></span>
          <span>Camp <b>${report.usedCampRests}</b></span>
          <span>Events <b>${report.eventsUsed}</b></span>
          <span>Battles <b>${report.completedBattles?.length || 0}</b></span>
        </div>
        <pre class="campaign-report">${_esc(JSON.stringify(report.diff, null, 2))}</pre>
      </section>
    `;
  }

  function _renderSide(state) {
    const activeQuests = Object.values(state.quests || {}).filter((quest) => quest.status === 'active');
    return `
      ${_renderWallet(state)}
      ${_renderInventorySnapshot(state)}
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Quests</h2></div>
        ${activeQuests.length ? activeQuests.slice(0, 5).map(_renderQuestMini).join('') : '<div class="campaign-empty">No active quests.</div>'}
      </section>
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Recent Log</h2></div>
        ${(state.log || []).slice(0, 10).map((line) => _renderLogEntry(line, { compact: true })).join('') || '<div class="campaign-empty">No log entries.</div>'}
      </section>
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Notes</h2><button class="campaign-icon-btn" data-campaign-action="add-note">+</button></div>
        ${(state.pinnedNotes || []).slice(0, 6).map((note) => `<div class="campaign-log-line">${_esc(note.text || note)}</div>`).join('') || '<div class="campaign-empty">No pinned notes.</div>'}
      </section>
    `;
  }

  function _renderWallet(state) {
    const entries = Object.entries(state.currencies || {});
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Wallet</h2></div>
        ${entries.length ? entries.map(([id, amount]) => `
          <div class="campaign-row">
            <strong>${_esc(_currencyLabel(id))}</strong>
            <span class="campaign-pill">${amount || 0}</span>
          </div>
        `).join('') : '<div class="campaign-empty">No currency tracked.</div>'}
      </section>
    `;
  }

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

  function _renderCommandRail(state) {
    const panelDefs = _panelDefsForState(state);
    const activeQuests = Object.values(state.quests || {}).filter((q) => q.status === 'active').length;
    const logCount = (state.log || []).length;
    const notesCount = (state.pinnedNotes || []).length;
    const inventoryCount = ['items', 'materials', 'food', 'questItems']
      .reduce((sum, b) => sum + Object.values(state.inventory?.[b] || {}).filter((q) => q > 0).length, 0);
    const partyCount = Object.keys(state.party || {}).length;
    const counts = {
      party: partyCount,
      inventory: inventoryCount,
      quests: activeQuests,
      log: logCount,
      notes: notesCount
    };
    const currency = _currencyAmounts(state);
    const buttons = RAIL_ORDER.filter((id) => panelDefs[id]).map((id) => {
      const def = panelDefs[id];
      const active = _activePanel === id;
      const dot = counts[id] > 0 ? '<span class="campaign-rail-dot" aria-hidden="true"></span>' : '';
      return `
        <button class="campaign-rail-btn ${active ? 'is-active' : ''}"
                data-campaign-panel="${id}"
                title="${_esc(def.title)}"
                aria-label="${_esc(def.title)}">
          <span class="campaign-rail-btn-icon" aria-hidden="true">${def.icon}</span>
          <span class="campaign-rail-btn-label">${_esc(def.label)}</span>
          ${dot}
        </button>
      `;
    }).join('');
    return `
      ${buttons}
      <div class="campaign-rail-divider" aria-hidden="true"></div>
      <button class="campaign-rail-btn is-gm"
              data-campaign-action="gm-override"
              title="GM Override"
              aria-label="GM Override">
        <span class="campaign-rail-btn-icon" aria-hidden="true">⚜</span>
        <span class="campaign-rail-btn-label">GM</span>
      </button>
      <div class="campaign-rail-currency" title="Gold and Jester Points">
        <span>G ${currency.gold}</span>
        <span class="campaign-rail-jp" title="Jester Points">JP ${currency.jp}</span>
      </div>
    `;
  }

  function _openPanel(panelId) {
    if (!_panelDefsForState()[panelId]) return;
    if (_activePanel === panelId) {
      _closePanel();
      return;
    }
    _lastFocus = document.activeElement;
    _activePanel = panelId;
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
    _activePanel = null;
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

  function _renderScenarioRunActions(scenario, state) {
    const activeRun = state.activeScenarioRun;
    const isCurrent = activeRun?.scenarioId === scenario.id;
    const start = activeRun
      ? (isCurrent
        ? '<button class="campaign-action primary" data-campaign-action="open-maps-tab" title="This run is already active.">Continue Run</button>'
        : '<button class="campaign-action" disabled title="Finish or cancel the current run before starting another.">Current Run Active</button>')
      : `<button class="campaign-action primary" data-campaign-action="start-scenario" data-id="${_escAttr(scenario.id)}" title="Begin this as the current run. Generates a map, applies danger, and switches to Current Run.">Start Run</button>`;
    return `
      ${start}
      <button class="campaign-action" data-campaign-action="inspect-scenario" data-id="${_escAttr(scenario.id)}" title="Open a read-only sheet showing beats, danger budget, and rewards. Does not start it.">Inspect</button>
    `;
  }

  function _scenarioQuestPill(scenario = {}, state = CS().getState()) {
    const src = scenario.source || {};
    const questId = src.questId;
    if (questId) {
      const quest = state?.quests?.[questId];
      const title = quest?.title || src.title || questId;
      return `<span class="campaign-pill" title="Generated for this quest">📌 Quest: ${_esc(title)}</span>`;
    }
    if (src.questChainId) {
      return `<span class="campaign-pill" title="Generated for this quest arc">📌 Arc: ${_esc(src.title || src.questChainId)}</span>`;
    }
    return '';
  }

  function _renderShapePills(scenario = {}) {
    const mode = scenario.travelMode || scenario.mapForm || (scenario.mapId ? 'node_map' : 'freeform');
    const modeLabels = {
      node_map: 'Movement: Node Map',
      grid_map: 'Movement: Grid Map',
      procedural: 'Movement: Procedural',
      linear: 'Movement: Linear',
      freeform: 'Movement: Freeform'
    };
    const settingLabels = {
      outdoor: 'Setting: Outdoor',
      dungeon: 'Setting: Dungeon',
      urban: 'Setting: Urban',
      forest: 'Setting: Forest',
      cave: 'Setting: Cave',
      sewer: 'Setting: Sewer',
      ruins: 'Setting: Ruins',
      temple: 'Setting: Temple',
      house: 'Setting: House',
      tavern: 'Setting: Tavern',
      castle: 'Setting: Castle',
      mountain: 'Setting: Mountain',
      arena: 'Setting: Arena',
      abstract: 'Setting: Abstract'
    };
    const sizeLabels = { tiny: 'XS', small: 'S', medium: 'M', large: 'L' };
    const pills = [];
    pills.push(`<span class="campaign-chip">${modeLabels[mode] || `Movement: ${mode}`}</span>`);
    const setting = scenario.mapSetting || scenario.setting;
    if (setting) pills.push(`<span class="campaign-chip">${settingLabels[setting] || `Setting: ${setting}`}</span>`);
    if (scenario.size) pills.push(`<span class="campaign-chip">Size: ${sizeLabels[scenario.size] || scenario.size}</span>`);
    return `<div class="campaign-chip-row">${pills.join('')}</div>`;
  }
  // _renderRun / _renderRunFreeform / _renderRunLinear — Phase F.9 port.
  // Body moved to `src/campaign/tabs/CampaignMapsTab.tsx`. Typed data
  // flows through `getRunData(state)`. `_beatIcon` stays because the
  // bridge calls it for the linear-beat icon character.

  function _beatIcon(kind) {
    const map = { battle: '⚔', event: '🎴', trap: '🪤', rest: '🏕', reward: '🎁', boss: '👹', exit: '🚪' };
    return map[kind] || '·';
  }

  // _renderQuestPanel — Phase F.10 port. Body moved to
  // `src/campaign/tabs/CampaignQuestsPanelTab.tsx`. Typed data flows
  // through `getQuestPanelData(state)`. The zombie variant still
  // renders via `_renderZombieScavengeTracker` (returned as one HTML
  // string in the bridge data) until its own JSX port.

  function _worldHomeHeroStyle() {
    const world = CS().getCurrentWorld?.() || {};
    const theme = world.storyModeTheme || {};
    const backdrop = theme.homeBackdrop || theme.bannerImage || theme.backdrop || '';
    return backdrop ? `style="--campaign-home-backdrop: url('${_escAttr(_cssVarAssetUrl(backdrop))}')"` : '';
  }

  function _cssVarAssetUrl(path = '') {
    const value = String(path || '').trim();
    if (!value) return '';
    if (/^(data:|https?:|\/|\.\/|\.\.)/i.test(value)) return value;
    return `../${value}`;
  }

  function _renderZombieScavengeTracker(state) {
    const quests = Object.values(state.quests || {});
    const active = quests.filter((q) => !q.chainTemplateId && !_isQuestResolved(q));
    const finished = quests.filter((q) => !q.chainTemplateId && _isQuestResolved(q));
    const activities = _worldActivitiesFor('zombie').filter((activity) => activity.type !== 'journal');
    return `
      <section class="campaign-panel campaign-scavenge-tracker">
        <div class="campaign-panel-head">
          <div>
            <h2>Scavenge Run Log</h2>
            <div class="campaign-muted">This is the zombie-world survival tracker. Normal quest creation is hidden behind the map/activity loop.</div>
          </div>
          <div class="campaign-panel-actions">
            <span class="campaign-pill">${active.length} active runs | ${finished.length} resolved</span>
            <button class="campaign-action primary" data-campaign-action="open-world-content" data-tab="worldActivities" data-mode="activities">Open Activities</button>
            <button class="campaign-action" data-campaign-action="open-world-content" data-tab="worldMap" data-mode="activities">Open Map</button>
          </div>
        </div>
        <div class="campaign-tab-grid">
          ${activities.map((activity) => _renderWorldActivityPreviewCard(activity, activity.type === 'build' ? 'Build project' : 'Scavenge route')).join('') || '<div class="campaign-empty">No zombie activities authored yet.</div>'}
        </div>
        ${active.length ? `
          <div class="campaign-section-title">Active Legacy Runs</div>
          <div class="campaign-quest-list">${active.map((quest) => _renderQuestRow(quest)).join('')}</div>
        ` : ''}
        ${finished.length ? `
          <details class="campaign-resolved-quests">
            <summary>Resolved legacy runs (${finished.length})</summary>
            <div class="campaign-quest-list">${finished.map((quest) => _renderQuestRow(quest, { resolved: true })).join('')}</div>
          </details>
        ` : ''}
      </section>
    `;
  }

  function _renderQuestRow(quest, opts = {}) {
    const objectives = quest.objectives || [];
    const nextObjective = opts.resolved ? null : _questNextObjective(quest);
    const done = objectives.filter((obj) => _questObjectiveDone(obj)).length;
    const total = objectives.length || 1;
    const meta = [
      _label(quest.status || 'active'),
      quest.giver ? `Giver: ${quest.giver}` : '',
      quest.timer?.phasesRemaining ? `${quest.timer.phasesRemaining} phases left` : ''
    ].filter(Boolean).join(' | ');
    const activeRun = CS().getState()?.activeScenarioRun;
    const activeScenario = CS().getActiveScenario?.();
    const isRunQuest = _activeRunQuestId(activeRun, activeScenario) === quest.id;
    const scenarioDisabled = activeRun && !isRunQuest;
    const scenarioLabel = isRunQuest ? 'Open Map' : 'Map Run';
    const scenarioPill = _questScenarioPill(quest, activeRun, activeScenario);
    const hasMiniGame = !!_questMiniGameObjective(quest);
    return `
      <article class="campaign-quest-card ${opts.resolved ? 'is-resolved' : ''}">
        <div class="campaign-quest-main">
          <div class="campaign-quest-title-row">
            <strong>${_esc(quest.title || quest.id)}</strong>
            <span class="campaign-pill campaign-quest-status ${_escAttr(_questStatusClass(quest))}">${_esc(_label(quest.status || 'active'))}</span>
            ${scenarioPill}
          </div>
          ${meta ? `<div class="campaign-muted">${_esc(meta)}</div>` : ''}
          ${quest.summary ? `<div class="campaign-muted">${_esc(quest.summary)}</div>` : ''}
          ${_renderQuestVariant(quest)}
          ${_renderContextTags([...(quest.tags || []), ...(quest.contextTags || []), ...(quest.monsterTags || [])])}
          <div class="campaign-quest-phase">
            <span>Phase</span>
            <strong>${_esc(opts.resolved ? 'Resolved' : (nextObjective?.label || 'Open'))}</strong>
            <small>${done}/${total}</small>
          </div>
          <div class="campaign-quest-objectives">
            ${objectives.length ? objectives.map(_renderQuestObjective).join('') : '<div class="campaign-muted">No written objective yet.</div>'}
          </div>
        </div>
        ${opts.resolved ? '' : `
          <div class="campaign-quest-actions">
            ${_actionBtn({ action: 'quest-scenario', label: scenarioLabel, hint: isRunQuest ? 'Jump to the active map for this quest' : 'Start (or generate) the map run for this quest', kind: 'primary', data: { id: quest.id }, disabled: scenarioDisabled })}
            ${_actionBtn({ action: 'quest-progress', label: 'Progress', hint: 'Tick an objective forward by 1', data: { id: quest.id } })}
            ${_actionMenu('Quest Actions', `
              ${_actionBtn({ action: 'quest-battle',  label: 'Battle',   hint: 'Run a battle linked to this quest', data: { id: quest.id } })}
              ${_actionBtn({ action: 'quest-hub-event', label: 'Hub Scene', hint: 'Run one logical hub scene and tick an objective', data: { id: quest.id } })}
              ${_actionBtn({ action: 'quest-harvest', label: 'Harvest', hint: 'Manual harvest/gather progress with light loot', data: { id: quest.id } })}
              ${hasMiniGame ? _actionBtn({ action: 'quest-minigame', label: 'Mini-Game', hint: 'Play the linked puzzle room and apply its result', data: { id: quest.id } }) : ''}
              ${_actionBtn({ action: 'quest-check',   label: 'Check',    hint: 'Make a stat or skill check toward this quest', data: { id: quest.id } })}
              ${_actionBtn({ action: 'quest-hand-in', label: 'Hand In',  hint: 'Deliver an item to complete an objective', data: { id: quest.id } })}
              ${_actionBtn({ action: 'quest-answer',  label: 'Answer',   hint: 'Resolve a riddle / dialog objective', data: { id: quest.id } })}
              ${_actionBtn({ action: 'quest-complete', label: 'Resolve', hint: 'Mark complete and grant rewards', data: { id: quest.id } })}
              ${_actionBtn({ action: 'quest-fail',     label: 'Fail',     hint: 'Mark failed (no rewards)', kind: 'danger', data: { id: quest.id } })}
            `)}
          </div>
        `}
      </article>
    `;
  }

  function _renderQuestObjective(obj = {}) {
    const current = Number(obj.current || 0);
    const required = Math.max(1, Number(obj.required || 1));
    const pct = Math.max(0, Math.min(100, Math.round((current / required) * 100)));
    return `
      <div class="campaign-quest-objective ${current >= required ? 'is-done' : ''}">
        <div>
          <strong>${_esc(obj.label || obj.id || 'Objective')}</strong>
          <small>${current}/${required}</small>
        </div>
        <div class="campaign-quest-progress"><span style="width:${pct}%"></span></div>
        ${_renderObjectivePulseHint(obj)}
      </div>
    `;
  }

  function _renderQuestVariant(quest = {}) {
    const variant = quest.activeVariant || null;
    const label = variant?.label || quest.variantLabel || '';
    const text = quest.variantDialogue || quest.variantSummary || variant?.dialogue || variant?.summary || '';
    const repeat = quest.repeatCycle ? `Cycle ${quest.repeatCycle + 1}` : '';
    if (!label && !text && !repeat) return '';
    return `
      <div class="campaign-quest-variant">
        ${label ? `<strong>${_esc(label)}</strong>` : ''}
        ${text ? `<span>${_esc(text)}</span>` : ''}
        ${repeat ? `<small>${_esc(repeat)}</small>` : ''}
      </div>
    `;
  }

  function _renderContextTags(tags = []) {
    const list = Array.from(new Set((tags || []).filter(Boolean))).slice(0, 8);
    if (!list.length) return '';
    return `
      <div class="campaign-chip-row campaign-context-tags">
        ${list.map((tag) => `<span class="campaign-chip">${_esc(_label(tag))}</span>`).join('')}
      </div>
    `;
  }

  function _renderObjectivePulseHint(obj = {}) {
    const triggers = obj.progressTriggers || [];
    if (!triggers.length) return '';
    return `
      <div class="campaign-quest-pulse">
        ${triggers.slice(0, 2).map((trigger) => `<span>${_esc(_triggerLabel(trigger))}</span>`).join('')}
      </div>
    `;
  }

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

  function _renderPendingBattleContext(state, battle = {}) {
    const ctx = QP()?.battleContextForPending?.(state, battle);
    const tags = [
      ...(ctx?.contextTags || []),
      ...(ctx?.monsterTags || [])
    ];
    if (!ctx?.questId && !tags.length) return '';
    return `
      <div class="campaign-battle-context">
        ${ctx?.questTitle ? `<strong>${_esc(ctx.questTitle)}</strong>` : ''}
        ${_renderContextTags(tags)}
      </div>
    `;
  }

  function _renderCombatPulseSummary(pulse = null) {
    if (!pulse) return '';
    const tags = (pulse.tags || []).filter((tag) => /^(behavior|defeated_tag|status|skill):/.test(tag)).slice(0, 8);
    return `
      <div class="campaign-combat-pulse">
        ${pulse.summary ? `<span>${_esc(pulse.summary)}</span>` : ''}
        ${_renderContextTags(tags.map((tag) => tag.replace(/^[^:]+:/, '')))}
      </div>
    `;
  }

  function _questNextObjective(quest = {}) {
    const objectives = quest.objectives || [];
    return objectives.find((entry) => !_questObjectiveDone(entry)) || objectives[0] || null;
  }

  function _scenarioObjectiveMeta(run = {}, objective = {}) {
    const bits = [];
    if (objective.visible === false && objective.revealHint) bits.push(objective.revealHint);
    if (run.travelMode === 'grid_map' && objective.levelId) bits.push(objective.levelId.replace(/_/g, ' '));
    if (objective.nodeId) bits.push(objective.nodeId);
    if (objective.cell) bits.push(`${objective.cell.x},${objective.cell.y}`);
    if (objective.completedAt) bits.push('resolved');
    else if (objective.visible === false) bits.push('hidden');
    else bits.push(`${window.CJS.ScenarioRunner?.explorationPercent?.(CS().getState(), CS().getActiveMap()) || 0}% explored`);
    return bits.join(' | ');
  }

  function _questMiniGameObjective(quest = {}) {
    return (quest.objectives || []).find((objective) => {
      if (_questObjectiveDone(objective)) return false;
      const kind = String(objective.kind || '').toLowerCase();
      return !!(objective.minigame || objective.miniGame || objective.minigameId || kind === 'minigame' || kind === 'puzzle');
    }) || null;
  }

  function _questObjectiveDone(obj = {}) {
    return Number(obj.current || 0) >= Math.max(1, Number(obj.required || 1));
  }

  function _isQuestResolved(quest = {}) {
    return ['complete', 'completed', 'failed'].includes(String(quest.status || 'active'));
  }

  function _questStatusClass(quest = {}) {
    const status = String(quest.status || 'active');
    if (status === 'failed') return 'is-failed';
    if (_isQuestResolved(quest)) return 'is-complete';
    return 'is-active';
  }

  function _runQuestPill(state, run, scenario) {
    const questId = _activeRunQuestId(run, scenario);
    if (questId) {
      const quest = state?.quests?.[questId];
      const title = quest?.title || run?.questTitle || questId;
      return `<span class="campaign-pill campaign-pill-link" title="This run is linked to a quest">📌 Quest: ${_esc(title)}</span>`;
    }
    if (scenario?.source?.questChainId) {
      return `<span class="campaign-pill" title="This run is part of a quest arc">📌 Arc: ${_esc(scenario.source.title || scenario.source.questChainId)}</span>`;
    }
    return '<span class="campaign-pill campaign-muted-pill" title="Standalone run, not bound to a quest">no quest binding</span>';
  }

  function _questScenarioPill(quest = {}, activeRun = null, activeScenario = null) {
    if (!quest?.id) return '';
    if (_activeRunQuestId(activeRun, activeScenario) === quest.id) {
      return `<span class="campaign-pill campaign-pill-link" title="A scenario for this quest is currently running">▶ Running: ${_esc(activeScenario?.name || activeRun?.scenarioId || 'scenario')}</span>`;
    }
    const linkedId = quest.linkedScenario || quest.scenarioId || quest.scenario;
    if (linkedId) {
      const sc = CS().getScenarioById?.(linkedId);
      return `<span class="campaign-pill" title="This quest has a pre-built scenario linked to it">📜 Linked: ${_esc(sc?.name || linkedId)}</span>`;
    }
    const generated = Object.values(CS().getState()?.sideContent?.generatedScenarios || {})
      .find((sc) => sc?.source?.questId === quest.id);
    if (generated) {
      return `<span class="campaign-pill" title="A scenario was previously generated for this quest">🗺 Generated: ${_esc(generated.name || generated.id)}</span>`;
    }
    return `<span class="campaign-pill campaign-muted-pill" title="No scenario yet — Map Run will generate one">no map yet</span>`;
  }

  // The Session Log panel (`tab: logs`) and the Save Manager / Settings
  // panel (`tab: settings`) are owned by React — see
  // `src/campaign/tabs/CampaignLogsTab.tsx` and
  // `src/campaign/tabs/CampaignSettingsTab.tsx`. The vanilla shell's
  // `_renderMain` consults `CampaignUIInternal.Tabs` first, which the
  // React bridge in `js/campaign/ui/tabs/cui-react-bridge.js` populates
  // with mount-point placeholders for each migrated tab.
  //
  // `_renderLogEntry`, `_logKind`, `_logMeta`, `_formatLogTime` still
  // live in `js/campaign/ui/cui-log.js`; the React side reuses them so
  // categorisation stays consistent with the recent-log strip in the
  // header (which is still vanilla-rendered).
  function _bindEvents() {
    _root.addEventListener('click', (event) => {
      const panelBtn = event.target.closest('[data-campaign-panel]');
      if (panelBtn) {
        event.preventDefault();
        _openPanel(panelBtn.dataset.campaignPanel);
        return;
      }

      const mode = event.target.closest('[data-campaign-mode]');
      if (mode) {
        const id = mode.dataset.campaignMode;
        _activeMode = id;
        const tabId = _defaultTabForMode(id, CS().getState());
        if (tabId) _activeTab = tabId;
        render();
        return;
      }

      const tab = event.target.closest('[data-campaign-tab]');
      if (tab) {
        const id = tab.dataset.campaignTab;
        _activeTab = id;
        const owningMode = APP_TAB_TO_MODE[id];
        if (owningMode) _activeMode = owningMode;
        render();
        return;
      }

      const action = event.target.closest('[data-campaign-action]');
      if (!action) return;
      event.preventDefault();
      _handleAction(action.dataset, action);
    });

    _root.addEventListener('change', (event) => {
      const farmSelect = event.target.closest?.('[data-farm-select]');
      if (farmSelect) {
        if (farmSelect.dataset.farmSelect === 'seed') window.CJS.FarmingMode?.selectSeed?.(farmSelect.value);
        return;
      }
      if (event.target.id === 'campaign-import-file') {
        Save().importFile(event.target.files?.[0]).then(() => {
          UI().toast('Campaign save imported', 'success');
          render();
        }).catch((error) => UI().toast(error.message || 'Import failed', 'error'));
        event.target.value = '';
      }
    });
  }

  function _handleAction(data) {
    switch (data.campaignAction) {
      case 'open-world-gate': return _goto('world', 'worldGate');
      case 'open-world-content': return _goto(data.mode || _modeForTab(data.tab), data.tab || 'worldGate');
      case 'travel-world-card': return _travelWorldCard(data.worldId || data.world, data.targetTab);
      case 'rel-activity': return _doRelActivity(data.characterId, data.activityId);
      case 'world-map-travel':
      case 'world-map-switch-map':
      case 'world-map-interaction':
      case 'world-map-node-action':
      case 'world-activity-use':
        return window.CJS.CampaignWorldMap?.handleAction?.(data);
      case 'new-save': return _newSave();
      case 'save-slot': Save().saveCurrent(); return UI().toast('Campaign saved', 'success');
      case 'fork-save': Save().forkCurrent(); return UI().toast('Campaign forked', 'success');
      case 'export-save': return Save().exportCurrent();
      case 'import-save': return _root.querySelector('#campaign-import-file')?.click();
      case 'push-github': return _pushGitHub();
      case 'pass-phase': return Ops().apply({ op: 'pass_phase' }, { source: 'ui' });
      case 'roll-event': return _pickEvent();
      case 'pick-event': return _pickEvent();
      case 'custom-event': return _customEvent();
      case 'roll-oracle': return _rollOracle();
      case 'pick-oracle': return _pickOracle();
      case 'custom-oracle': return _customOracle();
      case 'battle-reroll': return _battleReroll();
      case 'battle-override': return _battleOverride();
      case 'roll-hub-pulse': return _rollHubPulse(data.table);
      case 'solo-surprise': return _rollSoloSurprise();
      case 'random-quest-offer': return _offerRandomQuest();
      case 'random-rumor-offer': return _offerRandomRumor();
      case 'manual-rumor': return _manualRumorModal();
      case 'accept-solo-hook': return _acceptSoloHook();
      case 'solo-hook-quest': return _soloHookToQuest();
      case 'solo-hook-rumor': return _soloHookToRumor();
      case 'save-solo-hook': return _saveSoloHook();
      case 'ignore-solo-hook': return _ignoreSoloHook();
      case 'apply-side-choice': return _applySideChoice(data.id, Number(data.choice || 0));
      case 'save-side-idea': return _saveSideIdea(data.id);
      case 'reject-side-idea': return _rejectSideIdea(data.id);
      case 'dismiss-side-card': return _dismissSideCard(data.id);
      case 'copy-side-card': return _copySideCard(data.id);
      case 'resolve-rumor': return _resolveRumor(data.id, data.hubId);
      case 'rumor-to-quest': return _rumorToQuest(data.id, data.hubId);
      case 'rumor-to-problem': return _rumorToProblem(data.id, data.hubId);
      case 'review-resolve': return Ops().apply({ op: 'review_queue_resolve', reviewId: data.id, decision: data.decision }, { source: 'ui' });
      case 'resolve-hub-problem': return Ops().apply({ op: 'hub_problem_remove', hubId: data.hubId, problemId: data.id }, { source: 'ui' });
      case 'start-chain': return _startQuestChainRun(data.id);
      case 'advance-chain': return _advanceQuestChainStep(data.id);
      case 'complete-chain': return _completeQuestChain(data.id);
      case 'fail-chain': return _failQuestChain(data.id);
      case 'save-chain': return window.CJS.CampaignQuestChains.saveAsIdea(data.id);
      case 'promote-chain': return _addQuestChainToTracker(data.id);
      case 'chain-scenario': return _startQuestChainScenario(data.id);
      case 'chain-battle': return _questChainBattle(data.id);
      case 'queue-battle-set': return window.CJS.CampaignBattleSetForge.queueBattle(data.id);
      case 'save-battle-card': return window.CJS.CampaignBattleSetForge.saveCard(data.id);
      case 'copy-battle-card': return _copyBattleCard(data.id);
      case 'save-map-seed': return window.CJS.CampaignMapSeedForge.saveSeed(data.id);
      case 'copy-map-seed': return _copyMapSeed(data.id);
      case 'roll-forge-oracle': return _rollForgeOracle();
      case 'story-roll-scene': return _rollStoryDirector('scene');
      case 'story-roll-peri': return _rollStoryDirector('peri');
      case 'story-roll-memory': return _rollStoryDirector('memory');
      case 'story-pressure-tick': return _rollStoryDirector('pressure');
      case 'story-save-beat': return _saveStoryDirectorBeat();
      case 'story-reject-beat': return _rejectStoryDirectorBeat();
      case 'story-apply-choice': return _applyStoryDirectorChoice(data.id, Number(data.choice || 0));
      case 'story-set-stage': return _setStoryDirectorStage(data.id);
      case 'story-sync-sidequests': return _syncStoryDirectorSideQuests();
      case 'story-open-last': return _openLastStoryBeatModal();
      case 'story-manual-note': return _manualStoryNote();
      case 'story-copy-prompt': return _copyStoryPrompt();
      case 'story-help': return _openStoryHelpModal();
      case 'sequence-start': return _startSequenceFromUi(data.id);
      case 'sequence-next': return _advanceSequenceFromUi('next');
      case 'sequence-resolve': return _advanceSequenceFromUi('resolve');
      case 'sequence-choice': return _advanceSequenceFromUi('choice', data.choice);
      case 'sequence-pass': return _advanceSequenceFromUi('pass');
      case 'sequence-fail': return _advanceSequenceFromUi('fail');
      case 'sequence-queue-battle': return _advanceSequenceFromUi('queue');
      case 'sequence-play-minigame': return _playSequenceMiniGame();
      case 'sequence-win': return _advanceSequenceFromUi('win');
      case 'sequence-lose': return _advanceSequenceFromUi('lose');
      case 'sequence-abort': return _advanceSequenceFromUi('abort');
      case 'sequence-complete': return _completeSequenceFromUi();
      case 'sequence-open-vn': window.CJS.CampaignSequenceVN?.setEnabled?.(true); return render();
      case 'import-side-pack': return _importSidePack();
      case 'export-side-pack': return _exportSidePack();
      case 'oracle-note': return _saveOracleNote();
      case 'oracle-event-log': return _oracleToEventLog();
      case 'oracle-to-quest': return _oracleToQuest();
      case 'oracle-to-event-builder': return _oracleToEventBuilder();
      case 'oracle-add-tags': return _oracleAddTags();
      case 'apply-event': return _applyEvent();
      case 'edit-event': return _editEvent();
      case 'event-to-quest': return _eventToQuest();
      case 'event-log-only': return _eventLogOnly();
      case 'event-add-tags': return _eventAddTags();
      case 'copy-event-summary': return _copyEventSummary();
      case 'note-event': return _noteEvent();
      case 'ignore-event': return _ignoreEvent();
      case 'pin-plot-seed': return _pinPlotSeed();
      case 'event-to-oracle': return _eventToOracle();
      case 'add-quest': return _openQuestModal();
      case 'full-rest': return Ops().apply({ op: 'full_rest' }, { source: 'ui' });
      case 'camp-rest': return _campRestModal();
      case 'travel-world': return _travelWorld();
      case 'open-story-home': return _goto('story', 'storyHome');
      case 'open-story-summary': return _goto('story', 'storySummary');
      case 'open-quest-home': return _goto('quest', 'questHome');
      case 'open-event-home': return _goto('event', 'eventCharacter');
      case 'open-event-log': return _goto('event', 'eventLog');
      case 'open-roster-tab': return _goto(null, 'roster');
      case 'open-scenarios-tab': return _goto(null, 'scenarios');
      case 'open-maps-tab': return _goto(null, 'maps');
      case 'open-inventory-tab': return _goto('activities', 'inventory');
      case 'open-farm-tab': return _goto('activities', 'farm');
      case 'open-craft-tab': return _goto('activities', 'craft');
      case 'open-cook-tab': return _goto('activities', 'cook');
      case 'open-oracle-event-tab': return _goto('activities', 'oracleForge');
      case 'open-quests-tab': return _goto('quest', 'quests');
      case 'open-shops-tab': return _goto('activities', 'shops');
      case 'open-sideforge-tab': return _goto('activities', 'sideForge');
      case 'open-event-stories-tab': return _goto('event', 'eventSide');
      case 'open-event-battles-tab': return _goto('event', 'battleSets');
      case 'run-roll-battle': return _runRollBattle();
      case 'run-pick-battle': return _runPickBattle();
      case 'run-roll-event': return UI().toast('Random event rolls are disabled. Use authored Event files or Quest tools.', 'info');
      case 'roll-travel-surprise': return _rollTravelSurprise();
      case 'run-queue-set-battle': return _runQueueSetBattle(data.battleId);
      case 'run-tick-danger': return Ops().apply({ op: 'danger', amount: 1 }, { source: 'run' });
      case 'run-next-beat': return _runNextBeat();
      case 'generate-scenario': return _generateScenario();
      case 'generate-quest-scenario': return _generateScenario({ source: 'active_quest' });
      case 'generate-material-run': return _generateScenario({ source: 'random', mapType: 'forest', size: 'small', mapForm: 'node_map' });
      case 'generate-bounty-run': return _generateScenario({ source: 'random', mapType: 'outdoor', size: 'tiny', mapForm: 'node_map' });
      case 'generate-dungeon-run': return _generateScenario({ source: 'random', mapType: 'dungeon', size: 'medium', mapForm: 'grid_map' });
      case 'generate-urban-run': return _generateScenario({ source: 'random', mapType: 'urban', size: 'small', mapForm: 'node_map' });
      case 'generate-training-run': return _generateScenario({ source: 'random', mapType: 'arena', size: 'tiny', mapForm: 'grid_map' });
      case 'start-scenario': return _startScenarioFromUi(data.id);
      case 'inspect-scenario': return _inspectScenario(data.id);
      case 'end-scenario': return Runner().endScenario('manual');
      case 'cancel-scenario': return _cancelScenario();
      case 'discard-scenario': return _discardGeneratedScenario(data.id);
      case 'move-node': return _moveNode(data.nodeId);
      case 'move-cell': return _moveCell(data.x, data.y);
      case 'map-layer': return _setMapLayer(data.layer);
      case 'reveal-node': return Ops().apply({ op: 'reveal_node', nodeId: data.nodeId }, { source: 'ui' });
      case 'clear-node': return _clearNode(data.nodeId);
      case 'run-battle': return _runBattle();
      case 'manual-battle': return _manualBattleModal();
      case 'skip-victory': return Ops().apply({ op: 'manual_battle_result', result: 'victory', summary: 'Skipped as GM-approved victory.' }, { source: 'ui' });
      case 'skip-defeat': return Ops().apply({ op: 'manual_battle_result', result: 'defeat', summary: 'Skipped as GM-approved defeat.' }, { source: 'ui' });
      case 'cancel-battle': return CS().mutate((state) => { state.pendingBattle = null; }, { source: 'ui' });
      case 'apply-combat-result': return _applyCombatResult();
      case 'ignore-combat-result': return CS().mutate((state) => { state.pendingBattleResult = null; }, { source: 'ui' });
      case 'inventory-delta': return _inventoryDelta(data);
      case 'quick-add-inventory': return _quickAddInventory(data.bucket);
      case 'shop-buy': return _shopBuy(data);
      case 'shop-sell': return Ops().apply({ op: 'shop_sell', id: data.id, type: data.type, price: Number(data.price || 0), currency: data.currency, qty: 1 }, { source: 'ui' });
      case 'farm-tick': return Ops().apply({ op: 'farm_tick', amount: 1 }, { source: 'ui' });
      case 'farm-move': return window.CJS.FarmingMode?.move?.(data.dir);
      case 'farm-interact': return window.CJS.FarmingMode?.interact?.();
      case 'farm-tile': return window.CJS.FarmingMode?.faceOrUseTile?.(data.x, data.y);
      case 'farm-select-tool': return window.CJS.FarmingMode?.selectTool?.(data.tool);
      case 'farm-tile-action': return window.CJS.FarmingMode?.tileAction?.(data.tileAction, data.x, data.y);
      case 'farm-tile-menu-close': return window.CJS.FarmingMode?.closeTileMenu?.();
      case 'farm-qte-open': return window.CJS.FarmingMode?.openQte?.();
      case 'farm-qte-hit': return window.CJS.FarmingMode?.hitQte?.();
      case 'farm-qte-close': return window.CJS.FarmingMode?.closeQte?.();
      case 'plant-seed': return _plantSeed(data.plotId);
      case 'harvest-plot': return window.CJS.PocketHaven.harvestPlot(data.plotId);
      case 'open-fishing': return window.CJS.PocketHaven?.openFishing?.();
      case 'haven-build-facility': return _havenBuildFacility(data.facility);
      case 'haven-upgrade-facility': return _havenUpgradeFacility(data.facility);
      case 'haven-train-skill': return _havenTrainSkill(data.facility);
      case 'haven-ranch-assign': return _havenRanchAssign(data.facility);
      case 'haven-ranch-collect': return _havenRanchCollect(data.facility);
      case 'haven-open-trivia': return _openGuildTrivia(data.world);
      case 'haven-open-cooking': return _openCookingMinigame(data.foodId);
      case 'haven-play-minigame': return _havenPlayMinigame(data.game);
      case 'craft-recipe': return _craftRecipe(data.recipeId);
      case 'cook-food': {
        // If the cooking minigame is loaded, route through it so timing
        // affects buff potency and recipes can be discovered. Falls back
        // to the immediate cook op when the minigame isn't available.
        if (window.CJS.CookingMinigame?.open) {
          return _openCookingMinigame(data.foodId);
        }
        const food = DS().get('food', data.foodId);
        const inputs = food?.inputs || {};
        return Ops().apply({
          op: 'cook_basic',
          id: data.foodId,
          label: food?.name || data.foodId,
          inputs,
          outputs: { food: { [data.foodId]: 1 } }
        }, { source: 'ui' });
      }
      case 'add-pocket-note': return _addPocketNote();
      case 'add-note': return _addPinnedNote();
      case 'quest-progress': return _questProgress(data.id);
      case 'quest-scenario': return _questScenario(data.id);
      case 'quest-battle': return _questBattle(data.id);
      case 'quest-event': return UI().toast('Random quest events are disabled. Use Hub Scene, Check, Battle, or authored Event files.', 'info');
      case 'quest-hub-event': return _questHubEvent(data.id);
      case 'quest-harvest': return _questHarvest(data.id);
      case 'quest-minigame': return _questMiniGame(data.id);
      case 'mg-test-pick': return _mgTestPick(data.game);
      case 'mg-test-play': return _mgTestPlay(data.game, data.level);
      case 'mg-test-random': return _mgTestPlay(data.game, '', { difficulty: Number(data.difficulty || 1) });
      case 'mg-test-random-any': return _mgTestPlay(data.game, '');
      case 'quest-check': return _questCheck(data.id);
      case 'quest-hand-in': return _questHandIn(data.id);
      case 'quest-answer': return _questAnswer(data.id);
      case 'quest-complete': return Ops().apply({ op: 'complete_quest', questId: data.id }, { source: 'ui' });
      case 'quest-fail': return Ops().apply({ op: 'fail_quest', questId: data.id }, { source: 'ui' });
      case 'damage-char': return _charNumberOp(data.id, 'damage_character', 'Damage amount');
      case 'heal-char': return _charNumberOp(data.id, 'heal_character', 'Heal amount');
      case 'mp-char': return _charMpModal(data.id);
      case 'status-char': return _charStatusModal(data.id);
      case 'party-sheet': return _partySheetModal(data.id);
      case 'recruit-character': return _recruitCharacterModal();
      case 'bench-character': return Ops().apply({ op: 'bench_character', target: data.id }, { source: 'ui' });
      case 'activate-character': return Ops().apply({ op: 'activate_character', target: data.id }, { source: 'ui' });
      case 'remove-character': return _removeCharacter(data.id);
      case 'learn-skill': return _learnSkillModal(data.id);
      case 'unlearn-skill': return Ops().apply({ op: 'unlearn_skill', target: data.id, skillId: data.skillId }, { source: 'ui' });
      case 'learn-passive': return _learnPassiveModal(data.id);
      case 'unlearn-passive': return Ops().apply({ op: 'unlearn_passive', target: data.id, passiveId: data.passiveId }, { source: 'ui' });
      case 'equip-item': return _equipItemModal(data.id, data.slot);
      case 'unequip-item': return Ops().apply({ op: 'unequip_item', target: data.id, slot: data.slot }, { source: 'ui' });
      case 'stat-boost': return _statBoostModal(data.id);
      case 'level-char': return _charNumberOp(data.id, 'add_level', 'Level change');
      case 'grant-xp': return _grantXpModal(data.id);
      case 'grant-job-xp': return _grantJobXpModal(data.id);
      case 'change-job': return _changeJobModal(data.id);
      case 'show-job-tree': return _showJobTreeModal(data.id);
      case 'change-persona': return _changePersonaModal(data.id);
      case 'grant-skill-ap': return _grantSkillApModal(data.id, data.skillId);
      case 'level-up-skill': return _levelUpSkillConfirm(data.id, data.skillId);
      case 'rank-up-passive': return _rankUpPassiveConfirm(data.id, data.passiveId);
      case 'rank-up-apply': return _rankUpApplyModal();
      case 'equip-skill':    return Ops().apply({ op: 'equip_skill',    target: data.id, skillId:   data.skillId   }, { source: 'ui' });
      case 'unequip-skill':  return Ops().apply({ op: 'unequip_skill',  target: data.id, skillId:   data.skillId   }, { source: 'ui' });
      case 'equip-passive':  return Ops().apply({ op: 'equip_passive',  target: data.id, passiveId: data.passiveId }, { source: 'ui' });
      case 'unequip-passive':return Ops().apply({ op: 'unequip_passive',target: data.id, passiveId: data.passiveId }, { source: 'ui' });
      case 'pick-equip-skill':   return _openSkillPoolPicker(data.id);
      case 'pick-equip-passive': return _openPassivePoolPicker(data.id);
      case 'show-skill-detail': return _showSkillDetailModal(data.id, data.skillId);
      case 'unlock-job-from-tree': return _confirmUnlockJob(data.id, data.jobId);
      case 'switch-job-from-tree': return _switchJob(data.id, data.jobId);
      case 'party-availability': return _partyAvailabilityModal(data.id);
      case 'party-available': return Ops().apply({ op: 'clear_party_availability', target: data.id }, { source: 'ui' });
      case 'gm-override': return _gmOverride();
      case 'gm-member-override': return _gmOverride(data.id);
      case 'load-slot': return _loadSlot(data.id);
      case 'delete-slot': return _deleteSlot(data.id);
      case 'delete-all-saves': return _deleteAllSaves();
      case 'export-slot': return _exportSlot(data.id);
      case 'export-log': return _exportLog();
      case 'clear-log': return _clearLog();
      case 'export-event-log': return _exportEventLog();
      case 'clear-event-log': return _clearEventLog();
      default: break;
    }
  }

  function _newSave() {
    const message = 'Create a fresh campaign save? Your current campaign will keep its own slot — the new save starts empty in a different slot.';
    UI().confirm(message, () => {
      const campaign = Object.values(CS().getContent().campaigns)[0];
      CS().createNewSave(campaign?.id);
      Save().saveCurrent();
      _bootIncompatibleNotice = null;
      UI().toast('New campaign save started', 'success');
      render();
    });
  }

  function _loadSlot(slotId) {
    if (!slotId) return;
    const result = Save().loadSlot(slotId);
    if (result && result.incompatible) {
      UI().toast(result.reason || 'That save is from an older build and cannot be loaded.', 'error', 5500);
      return;
    }
    if (!result) {
      UI().toast('Save slot not found', 'error');
      return;
    }
    _bootIncompatibleNotice = null;
    UI().toast(`Loaded ${result.slotName || result.saveId || 'save'}`, 'success');
    render();
  }

  function _deleteSlot(slotId) {
    if (!slotId) return;
    UI().confirm('Delete this save slot? This cannot be undone.', () => {
      Save().deleteSlot(slotId);
      UI().toast('Save slot deleted', 'info');
      render();
    });
  }

  function _deleteAllSaves() {
    UI().confirm('Delete ALL local campaign saves? This cannot be undone.', () => {
      Save().deleteAllSlots();
      // Start a fresh save immediately so the UI does not crash on an empty slot list.
      const campaign = Object.values(CS().getContent().campaigns)[0];
      CS().createNewSave(campaign?.id);
      Save().saveCurrent();
      _bootIncompatibleNotice = null;
      UI().toast('All save slots cleared. Started a fresh campaign.', 'success');
      render();
    });
  }

  function _exportSlot(slotId) {
    const slot = Save().getSlots()[slotId];
    if (!slot) { UI().toast('Save slot not found', 'error'); return; }
    const SaveMgr = window.CJS.SaveManager;
    if (!SaveMgr?.downloadTextFile) { UI().toast('Save export unavailable', 'error'); return; }
    const file = `${(slot.slotName || slot.saveId || 'campaign_save').replace(/[^a-z0-9._-]+/gi, '_').toLowerCase()}.save.json`;
    SaveMgr.downloadTextFile(file, `${JSON.stringify(slot, null, 2)}\n`, 'application/json');
    UI().toast(`Exported ${file}`, 'success');
  }

  function _pushGitHub() {
    Save().pushCurrentToGitHub()
      .then(() => UI().toast('Campaign save pushed to GitHub', 'success'))
      .catch((error) => UI().toast(error.message || 'GitHub save failed', 'error', 5000));
  }

  function _rollEvent() {
    const campaign = CS().getCurrentCampaign();
    const world = CS().getState().currentWorld;
    const tables = campaign?.eventTables || [];
    const tableId = window.CJS.CampaignEvents.pickTable(tables, { world, setting: 'town', tags: ['town'] });
    const event = window.CJS.CampaignEvents.roll(tableId, { world, setting: 'town', tags: ['town'] });
    if (!event) UI().toast('No event table available', 'info');
  }

  function _rollOracle() {
    const oracle = window.CJS.CampaignOracle.roll();
    if (!oracle) return UI().toast('No oracle table available', 'info');
    CS().mutate((state) => { state.lastOracle = oracle; }, { source: 'oracle' });
  }

  function _eventChoices() {
    const campaign = CS().getCurrentCampaign();
    const world = CS().getState().currentWorld;
    const tables = (campaign?.eventTables || []).map((id) => CS().getContent().campaignEvents[id]).filter(Boolean);
    const seen = new Map();
    for (const table of tables) {
      for (const entry of table.entries || []) {
        if (!entry.id || seen.has(entry.id)) continue;
        seen.set(entry.id, {
          value: entry.id,
          label: entry.title || entry.id,
          sub: table.name || table.id,
          _entry: { ...entry, tableId: table.id, tableName: table.name }
        });
      }
    }
    void world;
    return Array.from(seen.values());
  }

  function _pickEvent() {
    const choices = _eventChoices();
    if (!choices.length) return UI().toast('No events authored yet', 'info');
    _opPickerModal({
      title: 'Pick Event',
      options: choices.map(({ value, label, sub }) => ({ value, label, sub })),
      placeholder: 'Search events…',
      primaryLabel: 'Use Event',
      onSubmit: ({ value }) => {
        const opt = choices.find((c) => c.value === value);
        if (!opt) return;
        const event = { ...opt._entry, rolledAt: new Date().toISOString() };
        CS().mutate((state) => { state.lastEvent = event; }, { source: 'event_pick' });
      }
    });
  }

  function _customEvent() {
    _openManualEventBuilder();
  }

  function _doRelActivity(characterId, activityId) {
    if (!characterId) return UI().toast('Pick a character first', 'info');
    const acts = CS().getState()?.relationshipActs;
    if (acts && Number(acts.remaining || 0) <= 0) {
      return UI().toast('No activity acts left. Pass a phase to refresh.', 'info');
    }
    Ops().apply({
      op: 'relationship_activity',
      characterId,
      activityId: activityId || 'hang_out'
    }, { source: 'relationships_ui' });
    const narrative = CS().getState()?.lastRelationshipNarrative;
    if (narrative?.characterId === characterId && narrative?.activityId === (activityId || 'hang_out')) {
      _relationshipNarrativeModal(narrative);
      return;
    }
    const def = (window.CJS.RelationshipsTab?.ACTIVITIES || []).find((a) => a.id === activityId);
    if (def) {
      const charBase = window.CJS.DataStore?.get?.('characters', characterId);
      const name = charBase?.name || characterId;
      UI().toast(`${def.label}: ${name} (${def.hint})`, 'success');
    }
  }

  async function _ensureStoryContext(world = 'haven') {
    const worldId = world || 'haven';
    const jobs = [];
    if (_storyContextCache.globalIndex.status === 'idle') {
      _storyContextCache.globalIndex.status = 'loading';
      _storyContextCache.globalIndex.promise = _loadStoryContextJson('data/worlds/_ai_story_context_index.json')
        .then((data) => {
          _storyContextCache.globalIndex.data = data;
          _storyContextCache.globalIndex.status = data ? 'loaded' : 'missing';
        })
        .catch((error) => {
          console.warn('AI story context index unavailable:', error);
          _storyContextCache.globalIndex.status = 'missing';
        });
    }
    if (_storyContextCache.globalIndex.promise) jobs.push(_storyContextCache.globalIndex.promise);

    if (_storyContextCache.allWorld.status === 'idle') {
      _storyContextCache.allWorld.status = 'loading';
      _storyContextCache.allWorld.promise = _loadStoryContextFile('data/worlds/_all_world_story_flow_summary.md')
        .then((text) => {
          _storyContextCache.allWorld.text = text;
          _storyContextCache.allWorld.status = text ? 'loaded' : 'missing';
        })
        .catch((error) => {
          console.warn('All-world story summary unavailable:', error);
          _storyContextCache.allWorld.status = 'missing';
        });
    }
    if (_storyContextCache.allWorld.promise) jobs.push(_storyContextCache.allWorld.promise);

    const entry = _storyContextCache.worlds[worldId] = _storyContextCache.worlds[worldId] || { status: 'idle', text: '', promise: null };
    if (entry.status === 'idle') {
      entry.status = 'loading';
      entry.promise = _loadStoryContextFile(`data/worlds/${worldId}/story_summary.md`)
        .then((text) => {
          entry.text = text;
          entry.status = text ? 'loaded' : 'missing';
          if (_root && CS().getState()?.currentWorld === worldId) setTimeout(render, 0);
        })
        .catch((error) => {
          console.warn('World story summary unavailable:', worldId, error);
          entry.status = 'missing';
        });
    }
    if (entry.promise) jobs.push(entry.promise);

    const structured = _storyContextCache.structuredWorlds[worldId] = _storyContextCache.structuredWorlds[worldId] || { status: 'idle', data: null, promise: null };
    if (structured.status === 'idle') {
      structured.status = 'loading';
      structured.promise = _loadStoryContextJson(`data/worlds/${worldId}/story_context/index.json`)
        .then((data) => {
          structured.data = data;
          structured.status = data ? 'loaded' : 'missing';
          if (_root && CS().getState()?.currentWorld === worldId) setTimeout(render, 0);
        })
        .catch((error) => {
          console.warn('World AI story context unavailable:', worldId, error);
          structured.status = 'missing';
        });
    }
    if (structured.promise) jobs.push(structured.promise);
    await Promise.allSettled(jobs);
    return _storyContextFor(worldId);
  }

  async function _loadStoryContextFile(path) {
    if (typeof fetch !== 'function') return '';
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return '';
    return (await response.text()).trim();
  }

  async function _loadStoryContextJson(path) {
    if (typeof fetch !== 'function') return null;
    const response = await fetch(path, { cache: 'no-store' });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    if (!text) return null;
    return JSON.parse(text);
  }

  function _storyContextFor(world = 'haven') {
    const worldId = world || 'haven';
    const worldEntry = _storyContextCache.worlds[worldId] || { status: 'idle', text: '' };
    const structuredEntry = _storyContextCache.structuredWorlds[worldId] || { status: 'idle', data: null };
    return {
      world: worldId,
      indexPath: 'data/worlds/_ai_story_context_index.json',
      allWorldPath: 'data/worlds/_all_world_story_flow_summary.md',
      worldPath: `data/worlds/${worldId}/story_summary.md`,
      structuredWorldPath: `data/worlds/${worldId}/story_context/index.json`,
      indexStatus: _storyContextCache.globalIndex.status,
      allWorldStatus: _storyContextCache.allWorld.status,
      worldStatus: worldEntry.status,
      structuredWorldStatus: structuredEntry.status,
      indexData: _storyContextCache.globalIndex.data || null,
      allWorldText: _storyContextCache.allWorld.text || '',
      worldText: worldEntry.text || '',
      structuredWorldData: structuredEntry.data || null
    };
  }

  function _renderAiStoryContextPanel(state) {
    const ctx = _storyContextFor(state.currentWorld || 'haven');
    const manual = state.storyMode?.manualSummaryEntries || [];
    const branches = window.CJS.CampaignStoryBranch?.getBranches?.(state.currentWorld) || state.storyMode?.manualBranches || [];
    const loaded = [ctx.indexData ? 1 : 0, ctx.allWorldText ? 1 : 0, ctx.worldText ? 1 : 0, ctx.structuredWorldData ? 1 : 0].reduce((a, b) => a + b, 0);
    const arcs = Array.isArray(ctx.structuredWorldData?.arcs) ? ctx.structuredWorldData.arcs : [];
    return `
      <section class="campaign-panel campaign-wide-panel campaign-ai-context-panel">
        <div class="campaign-panel-head">
          <div>
            <h2>AI Story Context</h2>
            <div class="campaign-muted">Copy GM Prompt merges static summaries, low-token arc context, live GM notes, runtime branches, and consequence trackers.</div>
          </div>
          <span class="campaign-pill">${loaded}/4 files</span>
        </div>
        <div class="campaign-ai-context-grid">
          <div>
            <strong>Static summaries</strong>
            <div class="campaign-muted">${_esc(ctx.allWorldPath)} - ${_esc(_label(ctx.allWorldStatus))}</div>
            <div class="campaign-muted">${_esc(ctx.worldPath)} - ${_esc(_label(ctx.worldStatus))}</div>
          </div>
          <div>
            <strong>Arc/event/quest index</strong>
            <div class="campaign-muted">${_esc(ctx.indexPath)} - ${_esc(_label(ctx.indexStatus))}</div>
            <div class="campaign-muted">${_esc(ctx.structuredWorldPath)} - ${_esc(_label(ctx.structuredWorldStatus))}</div>
            <div class="campaign-muted">${arcs.length} arc${arcs.length === 1 ? '' : 's'} with compact event, quest, branch, and consequence slots.</div>
          </div>
          <div>
            <strong>Live overlay</strong>
            <div class="campaign-muted">${manual.length} GM note${manual.length === 1 ? '' : 's'} and ${branches.length} manual branch${branches.length === 1 ? '' : 'es'} will be included after the markdown summary.</div>
            <div class="campaign-muted">If live GM notes disagree with a static summary, the prompt tells AI to treat the GM notes as newer table truth.</div>
          </div>
        </div>
      </section>
    `;
  }

  function _relationshipNarrativeModal(narrative = {}) {
    const body = document.createElement('div');
    body.className = 'campaign-relationship-narrative';
    body.innerHTML = `
      <div class="campaign-quest-narrative">
        <p>${_esc(narrative.text || 'A small moment passes between you.')}</p>
        ${narrative.blocked ? '' : `<p class="campaign-muted">+${_esc(narrative.amount || 0)} ${_esc(narrative.field || 'bond')}</p>`}
      </div>
    `;
    const footer = document.createElement('div');
    const close = document.createElement('button');
    close.className = 'btn btn-primary';
    close.textContent = 'Continue';
    footer.appendChild(close);
    const overlay = UI().openModal({
      title: narrative.title || 'Relationship Moment',
      content: body,
      footer,
      width: '420px'
    });
    close.onclick = () => UI().closeModal(overlay);
  }

  function _legacyCustomEventUnused() {
    const body = document.createElement('div');
    body.appendChild(_formLabel('Title'));
    const title = document.createElement('input');
    title.type = 'text';
    title.style.width = '100%';
    title.placeholder = 'Event title';
    body.appendChild(title);
    body.appendChild(_formLabel('Prompt'));
    const prompt = document.createElement('textarea');
    prompt.style.width = '100%';
    prompt.style.minHeight = '90px';
    prompt.placeholder = 'What happens?';
    body.appendChild(prompt);
    body.appendChild(_formLabel('Quick consequence (optional)'));
    const consequence = UI().createSelect({
      options: [
        { value: 'none', label: 'None — story only' },
        { value: 'gain_gold', label: 'Gain 25 gold' },
        { value: 'lose_gold', label: 'Lose 15 gold' },
        { value: 'damage_party', label: 'Damage party 5' },
        { value: 'heal_party', label: 'Heal party 10' },
        { value: 'add_status_cold', label: 'Cold status on party (scenario)' },
        { value: 'danger_up', label: 'Danger +1' },
        { value: 'danger_down', label: 'Danger -1' }
      ],
      value: 'none'
    });
    body.appendChild(consequence);
    _formModal({
      title: 'Custom Event',
      body,
      width: '520px',
      primaryLabel: 'Use',
      onSubmit: () => {
        const t = title.value.trim() || 'Custom Event';
        const p = prompt.value.trim();
        const choice = consequence.value;
        const world = CS().getState().currentWorld;
        const ops = _consequenceOps(choice, world);
        const event = {
          id: `custom_${Date.now()}`,
          title: t,
          prompt: p,
          suggested: ops,
          tableName: 'Custom',
          rolledAt: new Date().toISOString()
        };
        CS().mutate((state) => { state.lastEvent = event; }, { source: 'event_custom' });
      }
    });
  }

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
      _copyPlainText('Manual Event Summary', _manualEventSummaryText(draft, ops), 'Manual event summary copied');
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
        ..._battleDefeatFields(battle),
        objective: battle.objective || draft.questObjective || '',
        notes: battle.notes || draft.scene || short,
        battleMap: battle.battleMap || _battleMapForArea(CS().getActiveScenario?.()?.setting || 'outdoor')
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
    const fallback = _fallbackBattlePool().slice(0, 10).map((battle, index) => ({
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

  function _consequenceOps(choice, world) {
    switch (choice) {
      case 'gain_gold': return [{ op: 'give_money', currency: `${world}_gold`, amount: 25 }];
      case 'lose_gold': return [{ op: 'take_money', currency: `${world}_gold`, amount: 15 }];
      case 'damage_party': return [{ op: 'damage_party', amount: 5 }];
      case 'heal_party': return [{ op: 'heal_party', amount: 10 }];
      case 'add_status_cold': return [{ op: 'add_status', target: 'party', status: 'cold', duration: 'scenario' }];
      case 'danger_up': return [{ op: 'danger', amount: 1 }];
      case 'danger_down': return [{ op: 'danger', amount: -1 }];
      default: return [];
    }
  }

  function _oracleChoices() {
    const tables = window.CJS.CampaignDataLoader?.getOracleTables?.() || Object.values(CS().getContent().oracleTables || {});
    const seen = new Map();
    for (const table of tables) {
      const entries = table.entries || table.prompts || [];
      for (const entry of entries) {
        const text = entry.text || entry.prompt || entry.label;
        if (!text) continue;
        const value = entry.id || `${table.id}_${seen.size}`;
        seen.set(value, {
          value,
          label: text.length > 80 ? text.slice(0, 80) + '…' : text,
          sub: table.name || table.id,
          _text: text,
          _tableId: table.id
        });
      }
    }
    return Array.from(seen.values());
  }

  function _pickOracle() {
    const choices = _oracleChoices();
    if (!choices.length) return UI().toast('No oracle prompts available', 'info');
    _opPickerModal({
      title: 'Pick GM Prompt',
      options: choices.map(({ value, label, sub }) => ({ value, label, sub })),
      placeholder: 'Search prompts…',
      primaryLabel: 'Use Prompt',
      onSubmit: ({ value }) => {
        const opt = choices.find((c) => c.value === value);
        if (!opt) return;
        CS().mutate((state) => {
          state.lastOracle = { id: opt.value, text: opt._text, tableId: opt._tableId, rolledAt: new Date().toISOString() };
        }, { source: 'oracle_pick' });
      }
    });
  }

  function _customOracle() {
    _textareaModal({
      title: 'Custom GM Prompt',
      label: 'Prompt text',
      placeholder: 'A scene seed in your own words…',
      primaryLabel: 'Use',
      onSubmit: (text) => {
        if (!text) return false;
        CS().mutate((state) => {
          state.lastOracle = { id: `custom_${Date.now()}`, text, source: 'custom', rolledAt: new Date().toISOString() };
        }, { source: 'oracle_custom' });
      }
    });
  }

  function _battleReroll() {
    const battle = CS().getState().pendingBattle;
    if (!battle || battle.source !== 'random') return UI().toast('Only random battles can be rerolled', 'info');
    const scenario = CS().getActiveScenario();
    const tables = scenario?.randomBattleTables || [];
    const tableId = battle.tableId || tables[0]?.id;
    if (!tableId) return UI().toast('No random table to reroll from', 'info');
    Runner().rollRandomBattle(tableId);
  }

  function _battleOverride() {
    const battle = CS().getState().pendingBattle;
    if (!battle) return;
    _runPickBattle();
  }

  function _rollHubPulse(table) {
    _activeMode = 'event';
    _activeTab = 'sideForge';
    const card = window.CJS.CampaignHub.rollHubPulse(table);
    if (!card) return UI().toast('No hub events available', 'info');
    render();
  }

  function _rollSoloSurprise() {
    const tables = ['town', 'guild', 'tavern', 'forge', 'weird'];
    const table = tables[Math.floor(Math.random() * tables.length)];
    const card = window.CJS.CampaignHub.rollHubPulse(table);
    if (!card) return UI().toast('No solo hooks available', 'info');
    _setPendingSoloHook(card, 'surprise');
    _activeMode = 'story';
    _activeTab = 'storyHome';
    render();
    UI().toast('Story offer ready', 'success');
  }

  function _offerRandomRumor() {
    const tables = ['tavern', 'town', 'weird'];
    const table = tables[Math.floor(Math.random() * tables.length)];
    const card = window.CJS.CampaignHub.rollHubPulse(table);
    if (!card) return UI().toast('No rumor hooks available', 'info');
    _setPendingSoloHook({ ...card, type: 'rumor_offer' }, 'rumor_offer');
    render();
  }

  function _offerRandomQuest() {
    if (CS().getState()?.activeScenarioRun) {
      _activeMode = 'quest';
      _activeTab = 'maps';
      render();
      return UI().toast('A scenario is already active. Finish it before starting another quest run.', 'info');
    }
    const card = _randomQuestOfferCard();
    if (!card) return UI().toast('No single-quest templates available. Finish an active quest or add more quest templates.', 'info');
    Side().saveCard(card, { status: 'active', source: 'quest_run' });
    return _startQuestRunFromOffer(card);
  }

  function _randomQuestOfferCard() {
    const state = CS().getState();
    const activeQuestIds = new Set(Object.values(state?.quests || {})
      .filter((quest) => !_isQuestResolved(quest))
      .map((quest) => quest.id));
    const templates = Object.values(CS().getContent().campaignQuests || {})
      .flatMap((record) => record.templates || [])
      .filter((quest) => !activeQuestIds.has(quest.id));
    const options = templates.map((quest) => ({ type: 'quest_template', quest }));
    if (!options.length) return null;
    const weighted = options.map((option) => ({
      option,
      weight: _questTemplateWeight(option.quest, state)
    }));
    const total = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = Math.random() * Math.max(1, total);
    let pick = weighted[0]?.option;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) {
        pick = entry.option;
        break;
      }
    }
    const quest = CS().clone(pick.quest);
    return {
      id: `idea_offer_${quest.id}_${Date.now()}`,
      type: 'quest_offer',
      title: quest.title || quest.id,
      summary: quest.summary || '',
      canonRisk: quest.canonRisk || 'green',
      tags: quest.tags || [],
      questTemplate: quest,
      suggestedChoices: [{
        label: 'Start this quest run',
        ops: [{ op: 'add_quest', quest }]
      }]
    };
  }

  function _questTemplateWeight(quest = {}, state = CS().getState()) {
    const activeTags = new Set([
      state?.currentWorld ? `world:${state.currentWorld}` : '',
      state?.phase?.type ? `phase:${state.phase.type}` : '',
      state?.currentChapter ? `chapter:${state.currentChapter}` : '',
      ...(window.CJS.CampaignTags?.getActiveTags?.(state) || []),
      ...(Object.values(state?.party || {}).flatMap((member) => member.activePersona ? [`persona:${member.activePersona}`] : []) || [])
    ].filter(Boolean).map((tag) => String(tag).toLowerCase()));
    let weight = 1;
    for (const tag of [...(quest.tags || []), ...(quest.contextTags || []), ...(quest.monsterTags || [])]) {
      const cleaned = String(tag || '').toLowerCase();
      if (activeTags.has(cleaned) || activeTags.has(`world:${cleaned}`) || activeTags.has(`phase:${cleaned}`)) weight += 1;
      if (cleaned.includes(String(state?.currentWorld || '').toLowerCase())) weight += 1;
    }
    const rank = Object.values(state?.party || {})[0]?.rank || 'F';
    if ((quest.rankBand || quest.ranks || []).includes(rank)) weight += 2;
    if (quest.kind === 'daily' || quest.repeat) weight += 1;
    return Math.max(1, weight);
  }

  function _startQuestRunFromOffer(card) {
    if (!card) return null;
    if (CS().getState()?.activeScenarioRun) {
      _activeMode = 'quest';
      _activeTab = 'maps';
      render();
      UI().toast('A scenario is already active. Finish it before starting another quest run.', 'info');
      return { error: 'active_run' };
    }
    if (card.questChainTemplateId) {
      Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'quest_chain_run', approved: true }, { source: 'quest_run' });
      _clearPendingSoloHook();
      return _startQuestChainRun(card.questChainTemplateId);
    }

    const quest = _questFromOfferCard(card);
    if (!quest) return null;
    Ops().apply({ op: 'add_quest', quest }, { source: 'quest_run' });
    Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'quest_run', approved: true }, { source: 'quest_run' });
    _clearPendingSoloHook();
    const result = _startQuestScenario(quest.id, {
      quest,
      mapForm: _questMapForm(quest),
      mapType: quest.mapType || _questMapType(quest)
    });
    if (result?.error) {
      _activeMode = 'quest';
      _activeTab = 'quests';
      render();
    }
    return result;
  }

  function _questFromOfferCard(card) {
    const base = card.questTemplate ? CS().clone(card.questTemplate) : {
      id: `quest_${card.id || Date.now()}`,
      title: card.title || card.name || 'Quest Run',
      summary: card.summary || card.prompt || '',
      objectives: [{ id: 'follow_hook', label: 'Follow this hook', current: 0, required: 1 }],
      rewards: card.rewardOps || [],
      tags: card.tags || []
    };
    base.templateId = base.templateId || base.id;
    base.mapForm = base.mapForm || card.mapForm || card.travelMode || _questMapForm(base);
    base.mapType = base.mapType || card.mapType || card.setting || _questMapType(base);
    base.status = 'active';
    return base;
  }

  function _setPendingSoloHook(card, kind) {
    const id = card?.id;
    if (!id) return;
    CS().mutate((state) => {
      state.pendingSoloHook = {
        cardId: id,
        kind: kind || card.type || 'hook',
        at: new Date().toISOString()
      };
    }, { source: 'solo_hook' });
  }

  function _pendingSoloHookCard(state = CS().getState()) {
    const id = state?.pendingSoloHook?.cardId;
    if (!id) return null;
    return state.sideContent?.generatedIdeas?.[id]
      || (state.lastSideContentCard?.id === id ? state.lastSideContentCard : null);
  }

  function _clearPendingSoloHook() {
    CS().mutate((state) => { state.pendingSoloHook = null; }, { source: 'solo_hook' });
  }

  function _acceptSoloHook() {
    const card = _pendingSoloHookCard();
    if (!card) return;
    const apply = () => {
      if (card.questTemplate || card.questChainTemplateId || card.type === 'quest_offer') {
        _startQuestRunFromOffer(card);
        return;
      }
      const choice = card.suggestedChoices?.[0];
      if (choice?.ops?.length) {
        Ops().apply(choice.ops, { source: 'solo_hook_accept' });
        Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'hub_event', approved: true }, { source: 'solo_hook' });
      } else {
        _soloHookToQuest(true);
        return;
      }
      _clearPendingSoloHook();
      _activeMode = 'story';
      _activeTab = 'storyHome';
      render();
      UI().toast('Story offer accepted', 'success');
    };
    if (Side().risk(card.canonRisk) === 'red') {
      return UI().confirm('This is red-risk content. Accept it now?', apply);
    }
    apply();
  }

  function _soloHookToQuest(approved = false) {
    const card = _pendingSoloHookCard();
    if (!card) return;
    if (Side().risk(card.canonRisk) === 'red' && !approved) {
      return UI().confirm('This is red-risk content. Make it a quest now?', () => _soloHookToQuest(true));
    }
    if (card.questChainTemplateId) {
      const choice = card.suggestedChoices?.[0];
      if (choice?.ops?.length) Ops().apply(choice.ops, { source: 'solo_hook_chain' });
      Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'quest_chain', approved: true }, { source: 'solo_hook' });
      _clearPendingSoloHook();
      _activeMode = 'quest';
      _activeTab = 'quests';
      render();
      UI().toast('Quest arc added', 'success');
      return;
    }
    const quest = card.questTemplate ? CS().clone(card.questTemplate) : {
      id: `quest_${card.id}`,
      title: card.title || card.name || 'Story Quest',
      status: 'active',
      summary: card.summary || card.prompt || '',
      objectives: [{ id: 'follow_hook', label: 'Follow this hook', current: 0, required: 1 }],
      rewards: card.rewardOps || []
    };
    Ops().apply({ op: 'add_quest', quest }, { source: 'solo_hook_quest' });
    Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'accepted_hook', approved: true }, { source: 'solo_hook' });
    _clearPendingSoloHook();
    _activeMode = 'quest';
    _activeTab = 'quests';
    render();
    UI().toast(`Quest added: ${quest.title || quest.id}`, 'success');
  }

  function _soloHookToRumor(approved = false) {
    const card = _pendingSoloHookCard();
    if (!card) return;
    if (Side().risk(card.canonRisk) === 'red' && !approved) {
      return UI().confirm('This is red-risk content. Make it a rumor now?', () => _soloHookToRumor(true));
    }
    const hubId = window.CJS.CampaignHub.getCurrentHubId();
    Ops().apply({
      op: 'add_rumor',
      hubId,
      text: card.prompt || card.summary || card.title || card.name || card.id,
      canonRisk: card.canonRisk || 'green',
      tags: card.tags || [],
      source: 'solo_hook'
    }, { source: 'solo_hook_rumor' });
    Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'rumor', approved: true }, { source: 'solo_hook' });
    _clearPendingSoloHook();
  }

  function _saveSoloHook() {
    const card = _pendingSoloHookCard();
    if (!card) return;
    Side().saveCard(card, { status: 'saved', source: 'solo_hook' });
    _clearPendingSoloHook();
  }

  function _ignoreSoloHook() {
    const card = _pendingSoloHookCard();
    if (card) Side().rejectCard(card.id, 'Ignored from story offer.');
    _clearPendingSoloHook();
  }

  function _applySideChoice(id, choiceIndex) {
    const card = _sideCardById(id);
    const applyNow = (approved) => {
      window.CJS.CampaignHub.applyChoice(id, choiceIndex, { approved });
      _clearCurrentSideCard(id);
      render();
      UI().toast(approved ? 'Pulse applied and cleared' : 'Pulse sent to review and cleared', approved ? 'success' : 'info');
    };
    if (card?.canonRisk === 'red') {
      UI().confirm('This is red-risk content. Approve and apply it now?',
        () => applyNow(true),
        () => applyNow(false));
      return;
    }
    applyNow(true);
  }

  function _saveSideIdea(id) {
    const card = _sideCardById(id);
    if (!card) return;
    Side().saveCard(card, { status: 'saved', source: 'ui' });
    _clearCurrentSideCard(id);
    render();
    UI().toast('Idea saved and cleared from current result', 'success');
  }

  function _rejectSideIdea(id) {
    _textareaModal({
      title: 'Reject Idea',
      label: 'Reason (optional)',
      placeholder: 'Why is this rejected?',
      primaryLabel: 'Reject',
      onSubmit: (reason) => {
        Side().rejectCard(id, reason || '');
        _clearCurrentSideCard(id);
        render();
      }
    });
  }

  function _dismissSideCard(id) {
    _clearCurrentSideCard(id);
    render();
  }

  function _clearCurrentSideCard(id) {
    CS().mutate((state) => {
      if (!id || state.lastSideContentCard?.id === id) state.lastSideContentCard = null;
    }, { source: 'side_card_clear' });
  }

  function _rumorById(rumorId, hubId) {
    const id = hubId || window.CJS.CampaignHub?.getCurrentHubId?.();
    const hub = id ? CS().getHubState(id) : window.CJS.CampaignHub?.getCurrentHubState?.();
    return { hubId: id, rumor: (hub?.rumors || []).find((entry) => entry.id === rumorId) };
  }

  function _resolveRumor(rumorId, hubId, status = 'resolved') {
    const found = _rumorById(rumorId, hubId);
    if (!found.rumor) return UI().toast('Rumor not found', 'info');
    Ops().apply({ op: 'resolve_rumor', hubId: found.hubId, rumorId, status }, { source: 'rumor' });
    render();
    UI().toast(status === 'promoted' ? 'Rumor promoted and removed from open leads' : 'Rumor resolved', 'success');
  }

  function _rumorToQuest(rumorId, hubId) {
    const found = _rumorById(rumorId, hubId);
    const rumor = found.rumor;
    if (!rumor) return UI().toast('Rumor not found', 'info');
    const title = _truncate(rumor.text || rumor.id, 52);
    const questId = `quest_rumor_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    Ops().apply([
      {
        op: 'add_quest',
        quest: {
          id: questId,
          title: `Rumor: ${title}`,
          status: 'active',
          summary: rumor.text || '',
          tags: ['rumor', ...(rumor.tags || [])],
          objectives: [{ id: 'follow_lead', label: 'Follow the rumor lead', current: 0, required: 1 }],
          rewards: []
        }
      },
      { op: 'resolve_rumor', hubId: found.hubId, rumorId, status: 'promoted' }
    ], { source: 'rumor_to_quest' });
    _activeMode = 'quest';
    _activeTab = 'quests';
    render();
    UI().toast('Rumor promoted to Quest', 'success');
  }

  function _rumorToProblem(rumorId, hubId) {
    const found = _rumorById(rumorId, hubId);
    const rumor = found.rumor;
    if (!rumor) return UI().toast('Rumor not found', 'info');
    const label = _truncate(rumor.text || rumor.id, 48);
    Ops().apply([
      {
        op: 'hub_problem_add',
        hubId: found.hubId,
        problemId: `rumor_problem_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        label,
        notes: rumor.text || ''
      },
      { op: 'resolve_rumor', hubId: found.hubId, rumorId, status: 'promoted' }
    ], { source: 'rumor_to_problem' });
    render();
    UI().toast('Rumor escalated to hub problem', 'success');
  }

  function _copySideCard(id) {
    const card = _sideCardById(id);
    if (!card) return;
    Side().copyMarkdown(card).then(() => UI().toast('Card copied as Markdown', 'success'));
  }

  function _copyBattleCard(id) {
    const card = window.CJS.CampaignBattleSetForge.getCard(id);
    if (card) Side().copyMarkdown({ ...card, type: 'battle_set', title: card.name || card.id }).then(() => UI().toast('Battle card copied', 'success'));
  }

  function _copyMapSeed(id) {
    const seed = window.CJS.CampaignMapSeedForge.getSeed(id);
    if (seed) Side().copyMarkdown({ ...seed, type: 'map_seed', title: seed.name || seed.id }).then(() => UI().toast('Map seed copied', 'success'));
  }

  function _rollForgeOracle() {
    _activeMode = 'event';
    _activeTab = 'oracleForge';
    const card = window.CJS.CampaignIdeaForge.rollOracle();
    if (!card) return UI().toast('No oracle table available', 'info');
    render();
  }

  function _rollStoryDirector(kind) {
    _activeMode = 'story';
    _activeTab = 'storyDirector';
    const card = SD()?.roll(kind);
    if (!card) return UI().toast('No matching story beat available', 'info');
    render();
    _openStoryBeatModal(card);
  }

  async function _startSequenceFromUi(sequenceId) {
    if (!sequenceId) return;
    // Manual branch chapters live outside the sequence runner — they're
    // authored at runtime in Story Controls and stored in state. Route
    // them through CampaignStoryBranch so they play as VN scenes.
    if (String(sequenceId).startsWith('branch_')) {
      const Branch = window.CJS.CampaignStoryBranch;
      const branch = Branch?.getBranch?.(sequenceId);
      if (!branch) return UI().toast('Branch chapter is missing.', 'error');
      _activeMode = 'story';
      const ok = Branch.playBranch(sequenceId, {
        onComplete: () => { render(); }
      });
      if (!ok) UI().toast('Branch chapter could not open.', 'error');
      return;
    }
    try {
      const started = await window.CJS.CampaignSequences?.start?.(sequenceId);
      if (started?.blocked) {
        render();
        return UI().toast(started?.meta?.deliveryNote || 'That chapter part is still in update.', 'info');
      }
      const sequence = started?.sequence || null;
      if (!sequence) return UI().toast('Sequence file not found', 'info');
      const scope = sequence.scope || sequence._indexEntry?.scope || 'event';
      if (scope === 'story') _activeMode = 'story';
      else if (scope === 'quest') _activeMode = 'quest';
      else if (scope === 'event') _activeMode = 'event';
      render();
      if (started?.replayOnly) {
        return UI().toast(`Opened ${sequence.title || sequence.id} in replay mode`, 'info');
      }
      if (started?.defaulted?.length) {
        return UI().toast(`Started ${sequence.title || sequence.id}; defaulted ${started.defaulted.length} earlier part${started.defaulted.length === 1 ? '' : 's'}`, 'success');
      }
      UI().toast(`Started ${sequence.title || sequence.id}`, 'success');
    } catch (error) {
      console.error(error);
      UI().toast(error?.message || 'Sequence could not start', 'error');
    }
  }

  async function _advanceSequenceFromUi(action, value = null) {
    try {
      const result = await window.CJS.CampaignSequences?.advance?.(action, value);
      if (result?.scenarioStarted || result?.queued) _activeTab = 'maps';
      render();
      if (result?.replayOnly && result?.reason === 'replay_queue_blocked') {
        return UI().toast('Replay mode keeps consequences frozen. Use the continue buttons instead of queuing battle.', 'info');
      }
      if (result?.replayOnly && result?.reason === 'replay_scenario_blocked') {
        return UI().toast('Replay mode keeps exploration frozen too. Use the continue buttons instead of launching a scenario.', 'info');
      }
      if (result?.scenarioStarted) return UI().toast('Exploration run started from sequence', 'success');
      if (result?.queued) return UI().toast('Battle queued from sequence', 'success');
      if (result?.complete) return UI().toast('Sequence complete', 'success');
      if (!result?.ok && result?.reason === 'choice_locked') {
        return UI().toast((result.blockers || []).join(' | ') || 'That choice is locked by earlier consequences.', 'info');
      }
      if (!result?.ok) return UI().toast('No active sequence node', 'info');
    } catch (error) {
      console.error(error);
      UI().toast(error?.message || 'Sequence could not advance', 'error');
    }
  }

  async function _playSequenceMiniGame() {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState();
    const active = Seq?.active?.(state);
    const sequence = active ? Seq.cachedSequence?.(active.sequenceId, state.currentWorld) : null;
    const node = sequence ? Seq.findNode?.(sequence, active.nodeId) : null;
    if (!node || String(node.type || '').toLowerCase() !== 'minigame') {
      return UI().toast('No active mini-game node', 'info');
    }
    const config = _miniGameConfig(node, { includeOps: false });
    config.seed = config.seed || `${active.sequenceId}:${node.id}`;
    return _openMiniGameSession(config, {
      source: 'sequence_minigame',
      eventId: active.sequenceId,
      nodeId: node.id,
      sequence,
      node,
      onComplete: (result, storyContext) => {
        _applyMiniGameResult(result, 'sequence_minigame', storyContext);
        if (result?.status === 'win') return _advanceSequenceFromUi('win');
        if (result?.status === 'fail' || result?.status === 'giveup') return _advanceSequenceFromUi('lose');
        return UI().toast('Mini-game could not resolve this sequence node', 'error');
      }
    });
  }

  function _miniGameConfig(source = {}, options = {}) {
    const raw = source.minigame || source.miniGame || {};
    const nested = typeof raw === 'string' ? { gameId: raw } : raw;
    const includeOps = options.includeOps !== false;
    return {
      gameId: nested.gameId || source.minigameId || source.gameId || '',
      levelId: nested.levelId || source.levelId || '',
      difficulty: Number(nested.difficulty || source.difficulty || 1),
      seed: nested.seed || source.seed || '',
      theme: nested.theme || source.theme || '',
      briefingTitle: nested.briefingTitle || source.briefingTitle || nested.title || source.title || '',
      contextText: nested.contextText || nested.context || source.contextText || source.context || source.text || '',
      conversation: nested.conversation || source.conversation || [],
      bonusText: nested.bonusText || source.bonusText || '',
      bonusOps: includeOps ? (nested.bonusOps || source.bonusOps || []) : [],
      contextualBonus: nested.contextualBonus ?? source.contextualBonus,
      onWinOps: includeOps ? (nested.onWinOps || source.onWinOps || source.winOps || []) : [],
      onLoseOps: includeOps ? (nested.onLoseOps || source.onLoseOps || source.failOps || source.loseOps || []) : []
    };
  }

  async function _openMiniGameSession(config = {}, context = {}) {
    const MG = window.CJS.Minigames;
    if (!MG?.openMiniGame) return UI().toast('Mini-game module is not loaded', 'error');
    if (!config.gameId) return UI().toast('No mini-game is linked here', 'info');
    const questId = context.questId && context.objectiveId ? context.questId : null;
    const objectiveId = context.questId && context.objectiveId ? context.objectiveId : null;
    const storyContext = _miniGameStoryContext(config, context);
    const launch = async () => {
      try {
        const session = await MG.openMiniGame({
          gameId: config.gameId,
          levelId: config.levelId || undefined,
          difficulty: config.difficulty || undefined,
          seed: config.seed || undefined,
          theme: config.theme || undefined,
          source: context.source || 'campaign_minigame',
          questId,
          objectiveId,
          eventId: context.eventId || null,
          mapId: context.mapId || null,
          nodeId: context.nodeId || null,
          contextText: storyContext.contextText || undefined,
          conversation: storyContext.conversation || [],
          bonusText: storyContext.bonusText || undefined,
          onWinOps: storyContext.onWinOps || [],
          onLoseOps: storyContext.onLoseOps || [],
          onComplete: (result) => context.onComplete
            ? context.onComplete(result, storyContext)
            : _applyMiniGameResult(result, context.source || 'campaign_minigame', storyContext)
        });
        if (!session) UI().toast('Mini-game could not open', 'error');
        return session;
      } catch (error) {
        console.error(error);
        UI().toast(error?.message || 'Mini-game failed to open', 'error');
        return null;
      }
    };
    if (context.requireBriefing) {
      _showMiniGameBriefing(storyContext, launch);
      return null;
    }
    return launch();
  }

  function _miniGameStoryContext(config = {}, context = {}) {
    const source = String(context.source || 'campaign_minigame');
    const quest = context.quest || (context.questId ? _activeQuestById(context.questId) : null);
    const objective = context.objective || (quest ? _questMiniGameObjective(quest) : null);
    const node = context.node || null;
    const title = config.briefingTitle
      || (quest ? `${quest.title || quest.id}: ${objective?.label || 'Puzzle room'}` : '')
      || node?.title
      || node?.label
      || _label(config.gameId || 'Mini-game');
    const contextText = config.contextText
      || (quest ? _questMiniGameContextText(quest, objective) : '')
      || node?.text
      || (source === 'scenario_progress' ? 'A route obstacle resolves as a small puzzle beat before the run can continue.' : '');
    const conversation = _normalizeMiniGameConversation(config.conversation);
    const defaultConversation = conversation.length ? [] : _defaultMiniGameConversation(source, quest, objective, node);
    const bonusOps = _asOps(config.bonusOps);
    const contextOps = _miniGameContextWinOps(config, context, { quest, objective, title });
    return {
      title,
      contextText,
      conversation: conversation.length ? conversation : defaultConversation,
      bonusText: config.bonusText || '',
      briefingBonusText: config.bonusText || 'Clear bonus: the selected room applies its next-battle buff and JP reward on success.',
      onWinOps: [..._asOps(config.onWinOps), ...bonusOps, ...contextOps],
      onLoseOps: _asOps(config.onLoseOps)
    };
  }

  function _normalizeMiniGameConversation(lines) {
    return (Array.isArray(lines) ? lines : []).map((line) => {
      if (typeof line === 'string') return { speaker: 'Scene', text: line };
      return {
        speaker: line?.speaker || line?.name || 'Scene',
        text: line?.text || line?.line || ''
      };
    }).filter((line) => line.text);
  }

  function _asOps(value) {
    if (!value) return [];
    return Array.isArray(value) ? value.filter(Boolean) : [value].filter(Boolean);
  }

  function _defaultMiniGameConversation(source, quest, objective, node) {
    if (source === 'quest_minigame' && quest) {
      const giver = quest.giver || 'Guild Clerk';
      const label = objective?.label || 'the puzzle room';
      return [
        { speaker: giver, text: `This is part of the job, not a side diversion. Clear ${label} and I can mark the bonus.` },
        { speaker: 'Bin', text: 'Then it counts. Open the room.' }
      ];
    }
    if (source === 'scenario_progress') {
      return [
        { speaker: 'Route Beat', text: 'The obstacle is small, but it decides whether the run keeps momentum.' }
      ];
    }
    if (node?.speaker && node?.text) {
      return [{ speaker: node.speaker, text: node.text }];
    }
    return [];
  }

  function _questMiniGameContextText(quest = {}, objective = {}) {
    const pieces = [
      quest.summary || '',
      objective?.label ? `Objective: ${objective.label}.` : '',
      quest.giver ? `Giver: ${quest.giver}.` : ''
    ].filter(Boolean);
    return pieces.join(' ');
  }

  function _miniGameContextWinOps(config = {}, context = {}, resolved = {}) {
    if (config.contextualBonus === false) return [];
    const source = String(context.source || '');
    const quest = resolved.quest;
    const objective = resolved.objective;
    if (source === 'quest_minigame' && quest) {
      return [{
        op: 'log',
        text: `Quest mini-game cleared in context: ${quest.title || quest.id}${objective?.label ? ` - ${objective.label}` : ''}.`
      }];
    }
    if (source === 'sequence_minigame') {
      return [{ op: 'log', text: `Story mini-game cleared: ${resolved.title || config.gameId || 'scene challenge'}.` }];
    }
    if (source === 'scenario_progress') {
      return [{ op: 'log', text: 'Scenario mini-game cleared and the route keeps its momentum.' }];
    }
    return [];
  }

  function _showMiniGameBriefing(storyContext = {}, launch) {
    const body = document.createElement('div');
    body.className = 'campaign-minigame-briefing';
    if (storyContext.contextText) {
      const p = document.createElement('p');
      p.className = 'campaign-minigame-briefing-context';
      p.textContent = storyContext.contextText;
      body.appendChild(p);
    }
    for (const line of storyContext.conversation || []) {
      const row = document.createElement('p');
      row.className = 'campaign-minigame-briefing-line';
      const speaker = document.createElement('strong');
      speaker.textContent = line.speaker || 'Scene';
      const text = document.createElement('span');
      text.textContent = line.text || '';
      row.appendChild(speaker);
      row.appendChild(text);
      body.appendChild(row);
    }
    if (storyContext.briefingBonusText) {
      const bonus = document.createElement('div');
      bonus.className = 'campaign-minigame-briefing-bonus';
      bonus.textContent = storyContext.briefingBonusText;
      body.appendChild(bonus);
    }
    _formModal({
      title: storyContext.title || 'Mini-Game Beat',
      body,
      width: '540px',
      primaryLabel: 'Play Mini-Game',
      onSubmit: () => { launch?.(); }
    });
  }

  function _applyMiniGameResult(result, source = 'campaign_minigame', storyContext = null) {
    if (!result) return;
    const ops = (result.suggestedOps || []).filter((op) => {
      return !(op?.op === 'update_quest_progress' && (!op.questId || !op.objectiveId));
    });
    if (ops.length) Ops().apply(ops, { source });
    else render();
    if (result.status === 'win') {
      const buff = result.narrative?.buffName || '';
      if (buff) return UI().toast(`Mini-game cleared: ${buff} ready`, 'success');
      if (storyContext?.bonusText) return UI().toast(`Mini-game cleared: ${storyContext.bonusText}`, 'success');
      return UI().toast('Mini-game cleared', 'success');
    }
    if (result.status === 'fail') return UI().toast('Mini-game failed', 'info');
    if (result.status === 'giveup') return UI().toast('Mini-game abandoned', 'info');
    if (result.status === 'error') return UI().toast('Mini-game returned an error', 'error');
  }

  async function _completeSequenceFromUi() {
    const result = await window.CJS.CampaignSequences?.complete?.('manual');
    render();
    if (result?.ok) UI().toast('Sequence closed', 'success');
  }

  function _saveStoryDirectorBeat() {
    const card = SD()?.saveLast?.('saved');
    if (!card) return UI().toast('No story scene to hold', 'info');
    render();
    UI().toast('Story scene held for later', 'success');
  }

  function _rejectStoryDirectorBeat() {
    const card = SD()?.rejectLast?.();
    if (!card) return UI().toast('No story roll to skip', 'info');
    render();
    UI().toast('Story roll skipped', 'info');
  }

  function _applyStoryDirectorChoice(cardId, choiceIndex = 0) {
    const result = SD()?.applyChoice?.(cardId, choiceIndex);
    if (result?.queued) {
      render();
      return UI().toast('Red-risk story route queued for review', 'info');
    }
    if (result?.applied) {
      render();
      return UI().toast('Story route chosen', 'success');
    }
    return UI().toast('Story scene not found', 'info');
  }

  function _openLastStoryBeatModal() {
    const card = CS().getState()?.lastStoryDirectorBeat;
    if (!card) return UI().toast('No story scene to show', 'info');
    _openStoryBeatModal(card);
  }

  function _openStoryBeatModal(card) {
    if (!card || !UI()?.openModal) return;
    const body = document.createElement('div');
    body.className = 'campaign-story-modal-body';
    body.innerHTML = `
      <div class="campaign-story-popup-hint">
        This roll has not changed the campaign yet. Choose a route, hold it for later, or skip it if the table says "nice try, app."
      </div>
      ${_renderStoryDirectorCard(card, { modal: true })}
    `;

    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn btn-ghost" data-story-modal-close>Keep On Page</button>
      <button class="btn btn-ghost" data-story-modal-save>Hold For Later</button>
      <button class="btn btn-danger" data-story-modal-reject>Skip Roll</button>
    `;
    const overlay = UI().openModal({
      title: `${_label(card.kind || 'story')} - ${card.title || card.id}`,
      content: body,
      footer,
      width: '780px'
    });

    body.querySelectorAll('[data-story-modal-choice]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const choiceIndex = Number(btn.dataset.storyModalChoice || 0);
        UI().closeModal(overlay);
        _applyStoryDirectorChoice(card.id, choiceIndex);
      });
    });
    footer.querySelector('[data-story-modal-close]').onclick = () => UI().closeModal(overlay);
    footer.querySelector('[data-story-modal-save]').onclick = () => {
      UI().closeModal(overlay);
      _saveStoryDirectorBeat();
    };
    footer.querySelector('[data-story-modal-reject]').onclick = () => {
      UI().closeModal(overlay);
      _rejectStoryDirectorBeat();
    };
  }

  function _manualStoryNote() {
    const snap = SD()?.snapshot?.();
    const stage = snap?.stage || {};
    _openManualSceneBuilder({ stage });
  }

  // Manual Scene builder — also creates branching chapters like 1.4.a /
  // 1.4.b that slot into the auto-generated chapter tree.
  function _openManualSceneBuilder({ stage = {} } = {}) {
    const state = CS().getState() || {};
    const world = state.currentWorld || 'haven';
    const Seq = window.CJS.CampaignSequences;
    const Branch = window.CJS.CampaignStoryBranch;
    const chapterList = (Seq?.list?.('story', world) || []).map((entry) => {
      const meta = Seq.storyMeta(entry, world);
      return {
        id: entry.id,
        label: meta.partLabel || meta.chapterLabel || entry.id,
        chapterLabel: meta.chapterLabel || meta.partLabel || entry.id,
        title: meta.title || entry.title || entry.id
      };
    });
    const currentPartId = state.storyMode?.currentPartId || chapterList[0]?.id || '';

    const body = document.createElement('div');
    body.className = 'campaign-builder-body';
    body.innerHTML = `
      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>1</span>
          <div>
            <h3>Scene Text</h3>
            <small>The dialogue, hook, or scene description. Lines starting with "Name:" become VN speaker lines.</small>
          </div>
        </div>
        <label class="form-label">Scene Title
          <input id="manual-scene-title" type="text" placeholder="What this scene is called">
        </label>
        <label class="form-label">Scene / Conversation
          <textarea id="manual-scene-text" rows="8" placeholder="Bin: I have a terrible idea.&#10;Corvin: Of course you do.&#10;&#10;The hallway echoes with their footsteps."></textarea>
        </label>
      </section>

      <section class="campaign-builder-block">
        <div class="campaign-builder-title">
          <span>2</span>
          <div>
            <h3>Branch Into Chapter Tree</h3>
            <small>Optional. Hangs this scene off an existing chapter as 1.4.a, 1.4.b, etc. — fully integrated with the auto-generated tree.</small>
          </div>
        </div>
        <label class="form-label">
          <input id="manual-make-branch" type="checkbox">
          Create a new branch chapter from a parent chapter
        </label>
        <div class="campaign-branch-row" id="manual-branch-row" style="display:none">
          <label>From parent:
            <select id="manual-branch-parent">
              ${chapterList.map((entry) => `<option value="${_escAttr(entry.id)}" ${entry.id === currentPartId ? 'selected' : ''}>${_esc(entry.chapterLabel)} — ${_esc(entry.title)}</option>`).join('')}
            </select>
          </label>
          <label>Suffix:
            <input id="manual-branch-suffix" type="text" maxlength="2" value="" placeholder="auto">
          </label>
          <span class="campaign-branch-preview" id="manual-branch-preview">Branch label: —</span>
        </div>
        <div class="campaign-muted" id="manual-branch-help">
          Without a branch, the scene is recorded as a manual note in the summary.
          With a branch, it appears as a child chapter (e.g. <b>1.4.a</b>) in the Chapter Routes panel — playable like any other chapter.
        </div>
      </section>
    `;
    const footer = document.createElement('div');
    footer.className = 'campaign-builder-footer';
    footer.innerHTML = `
      <button class="btn" id="manual-scene-cancel">Cancel</button>
      <button class="btn" id="manual-scene-as-note">Save as Note</button>
      <button class="btn btn-primary" id="manual-scene-as-branch">Save & Create Branch</button>
    `;
    const overlay = UI().openModal({ title: 'Manual Scene + Branch', content: body, footer, width: '720px' });
    const $ = (sel) => body.querySelector(sel);

    function updatePreview() {
      const parent = $('#manual-branch-parent').value || currentPartId;
      const suffix = $('#manual-branch-suffix').value.trim() || Branch?.nextSuffix?.(parent, world) || 'a';
      $('#manual-branch-preview').textContent = `Branch label: ${Branch?.previewLabel?.(parent, suffix, world) || '?'}`;
    }
    function toggleBranch() {
      const make = $('#manual-make-branch').checked;
      $('#manual-branch-row').style.display = make ? 'grid' : 'none';
      footer.querySelector('#manual-scene-as-branch').disabled = !make && !$('#manual-scene-text').value.trim();
      if (make) updatePreview();
    }
    $('#manual-make-branch').addEventListener('change', toggleBranch);
    $('#manual-branch-parent').addEventListener('change', updatePreview);
    $('#manual-branch-suffix').addEventListener('input', updatePreview);
    $('#manual-scene-text').addEventListener('input', toggleBranch);

    footer.querySelector('#manual-scene-cancel').onclick = () => UI().closeModal(overlay);
    footer.querySelector('#manual-scene-as-note').onclick = () => {
      const text = $('#manual-scene-text').value.trim();
      if (!text) return UI().toast('Scene text is empty', 'info');
      _saveAsManualNote({ text, title: $('#manual-scene-title').value.trim(), stage });
      UI().closeModal(overlay);
      render();
    };
    footer.querySelector('#manual-scene-as-branch').onclick = () => {
      const text = $('#manual-scene-text').value.trim();
      if (!text) return UI().toast('Scene text is empty', 'info');
      const title = $('#manual-scene-title').value.trim() || (text.split(/\n+/)[0].slice(0, 78) || 'Manual Branch');
      const wantBranch = $('#manual-make-branch').checked;
      if (wantBranch) {
        const parent = $('#manual-branch-parent').value || currentPartId;
        const suffix = $('#manual-branch-suffix').value.trim();
        const result = Branch?.createBranch?.({
          world,
          parentSequenceId: parent,
          suffix,
          title,
          scene: text,
          summary: text.slice(0, 200)
        });
        if (!result?.ok) return UI().toast('Could not create branch chapter.', 'error');
        _saveAsManualNote({ text, title, stage, branchLabel: result.branch.chapterLabel });
        UI().toast(`Branch ${result.branch.chapterLabel} added to the chapter tree.`, 'success');
      } else {
        _saveAsManualNote({ text, title, stage });
        UI().toast('Manual scene held in summary.', 'success');
      }
      UI().closeModal(overlay);
      render();
    };
    toggleBranch();
  }

  function _saveAsManualNote({ text, title, stage = {}, branchLabel = '' } = {}) {
    const resolvedTitle = title || text.split(/\n+/)[0].slice(0, 78) || 'Manual Story Note';
    const beat = {
      id: `story_manual_${Date.now()}`,
      type: 'story_manual',
      kind: 'manual',
      title: branchLabel ? `[${branchLabel}] ${resolvedTitle}` : resolvedTitle,
      prompt: text,
      stageId: stage.id || '',
      stageName: stage.name || '',
      canonRisk: 'green',
      tags: branchLabel ? ['manual', 'table_control', 'branch'] : ['manual', 'table_control'],
      suggestedChoices: [
        {
          label: branchLabel ? 'Open branch chapter' : 'Accept as table note',
          ops: [{ op: 'log', text: `Story note: ${text}` }]
        }
      ]
    };
    Ops().apply({ op: 'story_beat_save', beat, status: 'manual' }, { source: 'story_director_manual' });
    CS().mutate((state) => {
      state.storyMode = state.storyMode || {};
      state.storyMode.manualSummaryEntries = state.storyMode.manualSummaryEntries || [];
      state.storyMode.manualSummaryEntries.unshift({
        id: beat.id,
        title: beat.title,
        text,
        stageId: stage.id || '',
        branchLabel: branchLabel || '',
        at: new Date().toISOString()
      });
    }, { source: 'story_manual_summary' });
  }

  async function _copyStoryPrompt() {
    await _ensureStoryContext(CS().getState()?.currentWorld || 'haven');
    const text = _storyPromptText();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => UI().toast('Story prompt copied', 'success'))
        .catch(() => _openCopyTextModal('Story Prompt', text));
      return;
    }
    _openCopyTextModal('Story Prompt', text);
  }

  function _storyContextPromptText(state = {}) {
    const ctx = _storyContextFor(state.currentWorld || 'haven');
    const allWorld = _markdownPromptExcerpt(ctx.allWorldText, 2200);
    const world = _markdownPromptExcerpt(ctx.worldText, 3200);
    const globalIndex = _storyContextIndexPromptText(ctx.indexData);
    const structuredWorld = _worldStoryContextPromptText(ctx.structuredWorldData);
    return [
      'AI-readable story context files:',
      `- ${ctx.indexPath} (${ctx.indexStatus})`,
      `- ${ctx.allWorldPath} (${ctx.allWorldStatus})`,
      `- ${ctx.worldPath} (${ctx.worldStatus})`,
      `- ${ctx.structuredWorldPath} (${ctx.structuredWorldStatus})`,
      '',
      'How to use the context:',
      '- First read the structured arc/event/quest context for the chosen world.',
      '- Use full markdown summaries only when the compact context does not answer a story continuity question.',
      '- After drafting a story, event, or quest, return a story_context_update block so the matching world story_context/index.json can be updated for future AI runs.',
      '- Check possible consequence points, not just current points: alignment, world alignment, relationships, flags, world pressure, reputation, heat, debt, noise, infection, and route identity.',
      '',
      'Global AI story context index:',
      globalIndex,
      '',
      `${_label(state.currentWorld || 'world')} compact arc/event/quest context:`,
      structuredWorld,
      '',
      'All-world story flow summary:',
      allWorld || '- Summary file not loaded or not present.',
      '',
      `${_label(state.currentWorld || 'world')} story summary:`,
      world || '- Summary file not loaded or not present.'
    ].join('\n');
  }

  function _storyContextIndexPromptText(data) {
    if (!data) return '- Global AI story context index not loaded.';
    const lines = [];
    if (data.purpose) lines.push(`Purpose: ${_compactPromptLine(data.purpose, 500)}`);
    if (Array.isArray(data.readOrder) && data.readOrder.length) {
      lines.push('Read order:');
      data.readOrder.slice(0, 7).forEach((item) => lines.push(`- ${_compactPromptLine(item, 240)}`));
    }
    const contract = data.authoringContract || {};
    if (Array.isArray(contract.afterDrafting) && contract.afterDrafting.length) {
      lines.push('After each AI delivery:');
      contract.afterDrafting.slice(0, 7).forEach((item) => lines.push(`- ${_compactPromptLine(item, 260)}`));
    }
    const consequence = data.sharedConsequenceModel || {};
    if (Array.isArray(consequence.choiceAxes) && consequence.choiceAxes.length) {
      lines.push('Shared choice axes:');
      consequence.choiceAxes.forEach((axis) => lines.push(`- ${axis.id}: ${_compactPromptLine(axis.use || '', 220)}`));
    }
    if (Array.isArray(consequence.additionalTrackers) && consequence.additionalTrackers.length) {
      lines.push(`Other trackers to consider: ${consequence.additionalTrackers.slice(0, 12).join(', ')}`);
    }
    return lines.join('\n') || '- Global AI story context index is empty.';
  }

  function _worldStoryContextPromptText(data) {
    if (!data) return '- World structured story context not loaded.';
    const lines = [];
    const title = data.displayName || data.world || 'World';
    lines.push(`World: ${title}`);
    if (data.purpose) lines.push(`Purpose: ${_compactPromptLine(data.purpose, 420)}`);
    const tiers = data.summaryTiers || {};
    if (tiers.always) lines.push(`Always remember: ${_compactPromptLine(tiers.always, 420)}`);
    if (tiers.previousArcCarryForward) lines.push(`Carryover: ${_compactPromptLine(tiers.previousArcCarryForward, 520)}`);
    const readFiles = [
      ...(Array.isArray(data.readOrder?.skim) ? data.readOrder.skim : []),
      ...(Array.isArray(data.readOrder?.openWhenWriting) ? data.readOrder.openWhenWriting : [])
    ];
    if (readFiles.length) {
      lines.push('Read/develop from:');
      readFiles.slice(0, 8).forEach((file) => lines.push(`- ${_compactPromptLine(file, 260)}`));
    }
    const inputs = data.consequenceInputs || {};
    const trackers = [
      ...(Array.isArray(inputs.alignmentAxes) ? [`axes=${inputs.alignmentAxes.join('/')}`] : []),
      ...(Array.isArray(inputs.relationships) ? [`relationships=${inputs.relationships.slice(0, 8).join(', ')}`] : []),
      ...(Array.isArray(inputs.worldPressure) ? [`worldPressure=${inputs.worldPressure.slice(0, 8).join(', ')}`] : [])
    ];
    if (trackers.length) lines.push(`Consequence inputs: ${trackers.join('; ')}`);
    const arcs = Array.isArray(data.arcs) ? data.arcs.slice(0, 5) : [];
    if (arcs.length) {
      lines.push('Arc plan:');
      arcs.forEach((arc) => {
        lines.push(`- ${arc.id || arc.title} [${arc.status || 'draft'}]: ${_compactPromptLine(arc.arcSummary || '', 520)}`);
        if (arc.previousArcCarryover) lines.push(`  Previous carryover: ${_compactPromptLine(arc.previousArcCarryover, 360)}`);
        if (arc.currentDevelopmentTarget) lines.push(`  Develop next: ${_compactPromptLine(arc.currentDevelopmentTarget, 360)}`);
        if (Array.isArray(arc.potentialChoicePoints) && arc.potentialChoicePoints.length) {
          const points = arc.potentialChoicePoints.slice(0, 3).map((point) => {
            const axes = point.potentialAxes ? ` axes=${Object.entries(point.potentialAxes).map(([key, value]) => `${key}${value}`).join('/')}` : '';
            return `${point.id || point.where}${axes}: ${_compactPromptLine(point.futureUse || '', 220)}`;
          }).join(' | ');
          lines.push(`  Potential points: ${points}`);
        }
        if (Array.isArray(arc.eventSuitability) && arc.eventSuitability.length) {
          const events = arc.eventSuitability.slice(0, 3).map((entry) => `${entry.bucket}: ${_compactPromptLine(entry.summary || '', 220)}`).join(' | ');
          lines.push(`  Event fit: ${events}`);
        }
        if (Array.isArray(arc.questSuitability) && arc.questSuitability.length) {
          const quests = arc.questSuitability.slice(0, 3).map((entry) => `${entry.bucket}: ${_compactPromptLine(entry.summary || '', 220)}`).join(' | ');
          lines.push(`  Quest fit: ${quests}`);
        }
      });
    }
    if (Array.isArray(data.futureEditSlots) && data.futureEditSlots.length) {
      lines.push('Future edit slots:');
      data.futureEditSlots.slice(0, 5).forEach((slot) => lines.push(`- ${_compactPromptLine(slot, 260)}`));
    }
    return lines.join('\n') || '- World structured story context is empty.';
  }

  function _liveGmStoryPromptText(state = {}) {
    const manual = Array.isArray(state.storyMode?.manualSummaryEntries)
      ? state.storyMode.manualSummaryEntries
      : [];
    const branches = window.CJS.CampaignStoryBranch?.getBranches?.(state.currentWorld) || state.storyMode?.manualBranches || [];
    const manualText = manual.length
      ? manual.slice(0, 8).map((entry) => {
        const meta = [
          entry.branchLabel ? `branch ${entry.branchLabel}` : '',
          entry.stageId ? `stage ${entry.stageId}` : '',
          entry.at || ''
        ].filter(Boolean).join(', ');
        return `- ${entry.title || 'GM note'}${meta ? ` (${meta})` : ''}: ${_compactPromptLine(entry.text || '', 700)}`;
      }).join('\n')
      : '- No GM-added manual notes yet.';
    const branchText = branches.length
      ? branches.slice(0, 8).map((branch) => {
        const parent = branch.parentLabel || branch.parentTitle || branch.parentSequenceId || 'parent chapter';
        return `- ${branch.chapterLabel || branch.partLabel || branch.id}: ${branch.title || 'Manual branch'} from ${parent}. ${_compactPromptLine(branch.summary || branch.scene?.lines?.map((line) => line.text).join(' ') || '', 500)}`;
      }).join('\n')
      : '- No runtime manual branch chapters yet.';
    return [
      'Live GM-added story overlay from the current save:',
      'These notes and branches are newer than static markdown. If they conflict, treat this live overlay as table truth unless the GM says otherwise.',
      '',
      'GM manual notes:',
      manualText,
      '',
      'Runtime manual branch chapters:',
      branchText
    ].join('\n');
  }

  function _storyPromptText() {
    const state = CS().getState() || {};
    const snap = SD()?.snapshot?.() || {};
    const pack = snap.pack || {};
    const stage = snap.stage || {};
    const last = snap.last || {};
    const party = Object.entries(state.party || {})
      .filter(([, member]) => (member.rosterRole || 'active') !== 'bench')
      .map(([id, member]) => member.name || DS().get('characters', member.baseCharacterId || id)?.name || id)
      .join(', ') || 'Current party';
    const queue = (snap.queue || []).slice(0, 5).map((beat) => `- ${beat.title || beat.id} (${beat.status || 'saved'})`).join('\n') || '- None';
    const clues = (snap.clues || []).slice(0, 5).map((clue) => `- ${clue.title || clue.id}: ${clue.text || ''}`).join('\n') || '- None';
    const facts = (snap.facts || []).slice(0, 5).map((fact) => `- ${fact.title || fact.id}: ${fact.text || ''}`).join('\n') || '- None';
    const choices = (last.suggestedChoices || []).map((choice, index) => {
      const ops = (choice.ops || []).map((op) => `    - ${Ops().describe([op])[0] || op.op}`).join('\n') || '    - Story only';
      return `${index + 1}. ${choice.label || `Choice ${index + 1}`}\n${ops}`;
    }).join('\n') || 'No current branch choices.';
    const Seq = window.CJS.CampaignSequences;
    const route = Seq?.currentRouteChoices?.(state, state.currentWorld) || [];
    const routePath = route.length
      ? route.map((entry) => `${entry.partLabel || entry.title || entry.sequenceId}${entry.routeLabel ? ` (${entry.routeLabel})` : ''}`).join(' → ')
      : 'No story parts played yet.';
    const routeDetail = route.length
      ? route.map((entry) => {
        const choiceText = (entry.choices || [])
          .map((choice) => `${choice.nodeId}=${choice.choiceId || choice.label || '?'}`)
          .join(', ');
        return `- ${entry.partLabel || entry.title || entry.sequenceId} [${entry.mode}]${choiceText ? `: ${choiceText}` : ''}`;
      }).join('\n')
      : '- None yet';
    const tree = Seq?.chapterTree?.(state.currentWorld, state) || { nodes: [] };
    const upcoming = (tree.nodes || []).filter((node) => {
      const eligible = node.eligibility?.eligible;
      const replayed = node.status?.replayOnly;
      const blocked = node.status?.deliveryBlocked;
      return eligible && !replayed && !blocked;
    }).slice(0, 6);
    const upcomingText = upcoming.length
      ? upcoming.map((node) => `- ${node.partLabel || node.partId || node.id}${node.routeLabel ? ` (${node.routeLabel})` : ''}: ${node.title}`).join('\n')
      : '- Nothing currently unlocked beyond the trunk.';
    const lockedHints = (tree.nodes || []).filter((node) => {
      const blocked = node.status?.deliveryBlocked;
      return !node.eligibility?.eligible && !node.status?.replayOnly && !blocked && node.eligibility?.reasons?.length;
    }).slice(0, 5);
    const lockedText = lockedHints.length
      ? lockedHints.map((node) => `- ${node.partLabel || node.partId || node.id}: ${(node.eligibility.reasons || []).join(' | ')}`).join('\n')
      : '- No locked branches with clear unlock hints.';
    const alignmentText = window.CJS.CampaignAlignment?.formatForPrompt?.(state, {
      actor: 'bin',
      world: state.currentWorld
    }) || 'Choice consequence tracker unavailable.';
    const staticStoryContext = _storyContextPromptText(state);
    const liveGmContext = _liveGmStoryPromptText(state);
    return [
      'CJS Story Mode GM Prompt',
      '',
      `Tone: ${(pack.tonePillars || []).join(', ') || 'light, human, funny, hopeful, slightly snarky'}`,
      `Campaign: ${pack.name || 'Campaign story'}`,
      `Current stage: ${stage.name || stage.id || 'No stage'} - ${stage.summary || ''}`,
      `Party: ${party}`,
      `Chapter/phase: chapter ${_storyChapterText(state)}, phase ${state.phase?.number || 1} (${state.phase?.type || 'unknown'})`,
      '',
      staticStoryContext,
      '',
      liveGmContext,
      '',
      'Route taken so far:',
      `Path: ${routePath}`,
      routeDetail,
      '',
      'Currently unlocked next chapter parts:',
      upcomingText,
      '',
      'Locked branches (and what unlocks them):',
      lockedText,
      '',
      alignmentText,
      '',
      'Current beat:',
      last.title ? `${last.title}\n${last.prompt || last.text || last.summary || ''}` : 'No current beat rolled.',
      '',
      'Branch choices and consequences:',
      choices,
      '',
      'Saved/queued beats:',
      queue,
      '',
      'Known clues:',
      clues,
      '',
      'Revealed facts:',
      facts,
      '',
      'Request:',
      'Continue the chapter that follows the route the player has taken. Respect the branch flags (e.g. gate vs tavern, hunt vs fortify vs compromise). When you write the next scene, begin with VN narration + dialogue + at least one stat/choice/QTE hook, then progress into either a map step or a battle that pops up directly in the player\'s face on contact. Resolve combat with consequences: losing should imply a penalty or retry, not a soft reset. Keep authored content concrete, no decorative filler, and end each scene with a clear next action or unlock signal.'
    ].join('\n');
  }

  function _markdownPromptExcerpt(text = '', maxChars = 2800) {
    const clean = String(text || '').replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
    if (!clean) return '';
    if (clean.length <= maxChars) return clean;
    const slice = clean.slice(0, maxChars);
    const cut = Math.max(slice.lastIndexOf('\n## '), slice.lastIndexOf('\n- '), slice.lastIndexOf('\n'));
    return `${slice.slice(0, cut > 900 ? cut : maxChars).trim()}\n...`;
  }

  function _compactPromptLine(text = '', maxChars = 600) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxChars) return clean;
    return `${clean.slice(0, maxChars - 3).trim()}...`;
  }

  function _openCopyTextModal(title, text) {
    const body = document.createElement('div');
    const hint = document.createElement('div');
    hint.className = 'campaign-muted';
    hint.style.marginBottom = '8px';
    hint.textContent = 'Clipboard was not available. Copy this text manually:';
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.style.width = '100%';
    ta.style.minHeight = '280px';
    ta.style.fontFamily = 'monospace';
    ta.value = text;
    body.appendChild(hint);
    body.appendChild(ta);
    UI().openModal({ title, content: body, width: '680px' });
    setTimeout(() => { ta.focus(); ta.select(); }, 30);
  }

  function _openStoryHelpModal() {
    const body = document.createElement('div');
    body.className = 'campaign-story-help';
    body.innerHTML = `
      <div class="campaign-story-help-grid">
        <div>
          <strong>Solo default</strong>
          <p>Pick the current episode, roll Next Scene, read the popup, then choose one route. The app handles clocks, rumors, clues, and queue changes only after you choose.</p>
        </div>
        <div>
          <strong>Manual GM control</strong>
          <p>Use the episode rail to jump anywhere, Write Scene to author your own beat, Hold For Later to keep an idea, and Skip Roll when the random result is being dramatic for attention.</p>
        </div>
        <div>
          <strong>Random flavor</strong>
          <p>Peri Interrupt is for system comedy, Memory / Clue is for mystery pressure, and Offscreen Trouble is for consequences when time passes or the table gets too comfortable.</p>
        </div>
        <div>
          <strong>Tabletop flow</strong>
          <p>Use Story for scenes and route choices, then switch to Current Run for tactical movement and encounters. Side Routes tells you what content should stay, rise, or pause.</p>
        </div>
      </div>
    `;
    UI().openModal({ title: 'Story Mode Flow', content: body, width: '720px' });
  }

  function _setStoryDirectorStage(stageId) {
    if (!stageId) return;
    SD()?.setStage?.(stageId);
    render();
  }

  function _syncStoryDirectorSideQuests() {
    const result = SD()?.syncSideQuestFlow?.();
    if (result?.already) return UI().toast('Side quest flow already synced for this stage', 'info');
    if (result?.synced) {
      render();
      return UI().toast('Side quest flow synced', 'success');
    }
    return UI().toast('No side quest flow for this stage', 'info');
  }

  function _importSidePack() {
    _textareaModal({
      title: 'Import Side Content Pack',
      label: 'Paste pack JSON',
      placeholder: '{ "id": "...", "cards": [...] }',
      primaryLabel: 'Import',
      width: '640px',
      onSubmit: (raw) => {
        if (!raw) {
          UI().toast('Nothing to import', 'info');
          return false;
        }
        try {
          const pack = JSON.parse(raw);
          window.CJS.CampaignSideContent.importPack(pack);
          UI().toast('Side content pack imported', 'success');
        } catch (error) {
          UI().toast(error.message || 'Invalid JSON', 'error');
          return false;
        }
      }
    });
  }

  function _exportSidePack() {
    const state = CS().getState();
    const content = {
      exportedAt: new Date().toISOString(),
      saveId: state.saveId,
      generatedIdeas: state.sideContent?.generatedIdeas || {},
      reviewQueue: state.sideContent?.reviewQueue || [],
      activeQuestChains: state.sideContent?.activeQuestChains || {}
    };
    window.CJS.SaveManager.downloadTextFile(`${_safe(state.slotName)}-side-content.json`, `${JSON.stringify(content, null, 2)}\n`, 'application/json');
  }

  function _sideCardById(id) {
    const state = CS().getState();
    return state.sideContent?.generatedIdeas?.[id] || (state.lastSideContentCard?.id === id ? state.lastSideContentCard : null);
  }

  function _saveOracleNote() {
    const oracle = CS().getState().lastOracle;
    if (!oracle) return;
    CS().mutate((state) => {
      state.pinnedNotes.unshift({ at: new Date().toISOString(), text: oracle.text });
      state.lastOracle = null;
    }, { source: 'oracle_note' });
    Ops().apply({ op: 'log', text: 'GM prompt saved as note.' }, { source: 'oracle' });
  }

  function _oracleToEventLog() {
    const oracle = CS().getState().lastOracle;
    if (!oracle) return;
    Ops().apply({
      op: 'event_log_add',
      entry: {
        title: oracle.title || 'Oracle Prompt',
        summary: oracle.text || oracle.prompt || '',
        source: oracle.source || 'oracle',
        scope: 'oracle',
        relatedId: oracle.id || null,
        tags: ['oracle', ...(oracle.tags || [])]
      }
    }, { source: 'oracle_event_log' });
    CS().mutate((state) => { state.lastOracle = null; }, { source: 'oracle_event_log' });
    UI().toast('Oracle summarized in Event Log', 'success');
  }

  function _oracleToQuest() {
    const oracle = CS().getState().lastOracle;
    if (!oracle) return;
    _addQuestFromPrompt({
      title: 'Oracle Quest',
      summary: oracle.text || oracle.prompt || '',
      source: 'oracle',
      tags: ['oracle', ...(oracle.tags || [])]
    });
    CS().mutate((state) => { state.lastOracle = null; }, { source: 'oracle_quest' });
  }

  function _oracleToEventBuilder() {
    const oracle = CS().getState().lastOracle;
    if (!oracle) return;
    _openManualEventBuilder({
      title: 'Oracle Event',
      source: 'oracle',
      scope: 'event',
      seed: oracle.text || oracle.prompt || '',
      short: _truncate(oracle.text || oracle.prompt || '', 160),
      tags: ['oracle', ...(oracle.tags || [])]
    });
  }

  function _oracleAddTags() {
    const oracle = CS().getState().lastOracle;
    if (!oracle) return;
    _tagPromptModal('Tag Oracle Prompt', oracle.text || oracle.prompt || 'Oracle prompt', 'oracle', oracle.id || null);
  }

  function _applyEvent() {
    const event = CS().getState().lastEvent;
    window.CJS.CampaignEvents.applyEvent(event);
    CS().mutate((state) => { state.lastEvent = null; }, { source: 'event' });
  }

  function _editEvent() {
    const event = CS().getState().lastEvent;
    _opsModal('Edit Event Operations', event?.suggested || [], (ops) => {
      window.CJS.CampaignEvents.applyEvent(event, ops);
      CS().mutate((state) => { state.lastEvent = null; }, { source: 'event' });
    });
  }

  function _eventToQuest() {
    const event = CS().getState().lastEvent;
    if (!event) return;
    _addQuestFromPrompt({
      title: event.title || 'Event Quest',
      summary: _eventSummary(event),
      source: event.source || event.tableName || 'event',
      tags: ['event', ...(event.tags || []), ...(event.manualSummary?.tags || [])]
    });
    CS().mutate((state) => { state.lastEvent = null; }, { source: 'event_quest' });
  }

  function _eventLogOnly() {
    const event = CS().getState().lastEvent;
    if (!event) return;
    Ops().apply({
      op: 'event_log_add',
      entry: {
        title: event.title || event.id || 'Event',
        summary: _eventSummary(event),
        source: event.source || event.tableName || 'event',
        scope: event.type || event.kind || 'event',
        relatedId: event.id || null,
        tags: ['event', ...(event.tags || []), ...(event.manualSummary?.tags || [])],
        consequences: Ops().describe(event.suggested || []).filter(Boolean)
      }
    }, { source: 'event_log_only' });
    CS().mutate((state) => { state.lastEvent = null; }, { source: 'event_log_only' });
    UI().toast('Event summarized in Event Log', 'success');
  }

  function _eventAddTags() {
    const event = CS().getState().lastEvent;
    if (!event) return;
    _tagPromptModal('Tag Event', _eventSummary(event), 'event', event.id || null);
  }

  function _noteEvent() {
    const event = CS().getState().lastEvent;
    window.CJS.CampaignEvents.ignoreEvent(event, true);
    CS().mutate((state) => { state.lastEvent = null; }, { source: 'event' });
  }

  function _ignoreEvent() {
    const event = CS().getState().lastEvent;
    window.CJS.CampaignEvents.ignoreEvent(event, false);
    CS().mutate((state) => { state.lastEvent = null; }, { source: 'event' });
  }

  function _pinPlotSeed() {
    const event = CS().getState().lastEvent;
    if (!event) return;
    window.CJS.CampaignEvents.pinAsPlotSeed(event);
    UI().toast('Plot seed pinned to notes', 'success');
  }

  function _eventToOracle() {
    const event = CS().getState().lastEvent;
    const oracle = window.CJS.CampaignOracle?.roll?.();
    if (!oracle) return UI().toast('Oracle table empty', 'info');
    CS().mutate((state) => { state.lastOracle = { ...oracle, source: event ? `event:${event.id}` : 'event' }; }, { source: 'oracle_from_event' });
    UI().toast('Oracle rolled from event', 'success');
  }

  function _copyEventSummary() {
    const event = CS().getState().lastEvent;
    const text = event?.manualSummary?.full || [
      event?.title || 'Event',
      event?.prompt || '',
      event?.gmHook ? `GM hook: ${event.gmHook}` : ''
    ].filter(Boolean).join('\n\n');
    _copyPlainText('Event Summary', text, 'Event summary copied');
  }

  function _eventSummary(event = {}) {
    return event.manualSummary?.short
      || event.summary
      || event.prompt
      || event.gmHook
      || event.text
      || event.title
      || event.id
      || 'Event happened.';
  }

  function _addQuestFromPrompt({ title = 'Event Quest', summary = '', source = 'event', tags = [] } = {}) {
    const cleanTitle = title || 'Event Quest';
    const questId = `${source || 'event'}_quest_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const quest = {
      id: _safe(questId),
      title: cleanTitle,
      status: 'active',
      summary: summary || cleanTitle,
      notes: summary || '',
      objectives: [{
        id: 'obj_1',
        label: 'Resolve the hook',
        current: 0,
        required: 1
      }],
      rewards: [],
      tags: Array.from(new Set(['promoted_event', source, ...tags].filter(Boolean)))
    };
    Ops().apply({ op: 'add_quest', quest }, { source: `${source}_to_quest` });
    Ops().apply({
      op: 'event_log_add',
      entry: {
        title: cleanTitle,
        summary: summary || cleanTitle,
        source,
        scope: 'quest',
        relatedId: quest.id,
        tags: quest.tags,
        consequences: [`Quest created: ${cleanTitle}`]
      }
    }, { source: `${source}_to_quest` });
    UI().toast('Quest created from prompt', 'success');
  }

  function _tagPromptModal(title, note, scope, targetId) {
    _textareaModal({
      title,
      label: 'Tags',
      placeholder: 'comma-separated tags',
      primaryLabel: 'Add Tags',
      onSubmit: (text) => {
        const tags = _tagList(text);
        if (!tags.length) {
          UI().toast('Add at least one tag', 'info');
          return false;
        }
        Ops().apply(tags.map((tag) => ({
          op: 'tag_add',
          tag,
          scope,
          targetType: scope,
          targetId,
          note,
          source: 'event_oracle_ui'
        })), { source: 'event_oracle_tags' });
      }
    });
  }

  function _copyPlainText(title, text, successMessage = 'Copied') {
    if (!text) return UI().toast('Nothing to copy', 'info');
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => UI().toast(successMessage, 'success'))
        .catch(() => _openCopyTextModal(title, text));
      return;
    }
    _openCopyTextModal(title, text);
  }

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
      _startQuestScenario(quest.id, {
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

  function _manualRumorModal() {
    const body = document.createElement('div');
    const hint = document.createElement('div');
    hint.className = 'campaign-muted';
    hint.style.marginBottom = '8px';
    hint.textContent = 'Rumors are stored leads. They do not change mechanics until you promote or apply them later.';
    body.appendChild(hint);
    body.appendChild(_formLabel('Rumor'));
    const text = document.createElement('textarea');
    text.style.width = '100%';
    text.style.minHeight = '90px';
    text.placeholder = 'What are people whispering about?';
    body.appendChild(text);
    body.appendChild(_formLabel('Canon risk'));
    const risk = UI().createSelect({
      options: [
        { value: 'green', label: 'Green' },
        { value: 'yellow', label: 'Yellow' },
        { value: 'red', label: 'Red' }
      ],
      value: 'green'
    });
    body.appendChild(risk);
    _formModal({
      title: 'Add Rumor',
      body,
      width: '520px',
      primaryLabel: 'Add Rumor',
      onSubmit: () => {
        const value = text.value.trim();
        if (!value) {
          UI().toast('Rumor text required', 'error');
          return false;
        }
        Ops().apply({
          op: 'add_rumor',
          hubId: window.CJS.CampaignHub.getCurrentHubId(),
          text: value,
          canonRisk: risk.value,
          source: 'manual'
        }, { source: 'ui' });
      }
    });
  }

  function _generateScenario(overrides = {}) {
    if (CS().getState()?.activeScenarioRun) return UI().toast('End the active scenario before generating another', 'info');
    const options = {
      source: _root.querySelector('#campaign-gen-source')?.value || 'random',
      mapForm: _root.querySelector('#campaign-gen-form')?.value || 'node_map',
      mapType: _root.querySelector('#campaign-gen-map-type')?.value || 'any',
      mapSetting: _root.querySelector('#campaign-gen-map-type')?.value || 'any',
      size: _root.querySelector('#campaign-gen-size')?.value || 'small',
      layers: Number(_root.querySelector('#campaign-gen-layers')?.value || 1),
      ...overrides
    };
    const result = Gen().generateAndStart(options);
    if (!result || result.error) {
      const messages = {
        active_run: 'End the active scenario before generating another',
        no_active_quest: 'No active quest to source from. Add one in the Quests tab first.',
        no_active_chain: 'No active quest arc. Start one from the Quests tab first.'
      };
      const msg = messages[result?.error] || 'Scenario generation skipped';
      UI().toast(msg, 'info');
      return result;
    }
    _activeMode = 'quest';
    _activeTab = 'maps';
    render();
    UI().toast(`Started ${result.scenario.name}`, 'success');
    return result;
  }

  function _startScenarioFromUi(scenarioId) {
    if (!scenarioId) return null;
    try {
      const run = Runner().startScenario(scenarioId);
      _activeTab = 'maps';
      render();
      return run;
    } catch (error) {
      UI().toast(error?.message || 'Scenario could not start', 'error');
      return null;
    }
  }

  function _inspectScenario(scenarioId) {
    const scenario = CS().getScenarioById(scenarioId);
    if (!scenario) return UI().toast('Run not found', 'info');
    const body = document.createElement('div');
    body.className = 'campaign-inspect-sheet';
    const beats = scenario.beats || [];
    const nodes = scenario.nodes || scenario.map?.nodes || [];
    const rewards = Ops().describe(scenario.rewardOps || scenario.rewards || []);
    const dangers = [
      scenario.dangerMax ? `Danger max ${scenario.dangerMax}` : '',
      scenario.limits?.events !== undefined ? `${scenario.limits.events} event rolls` : '',
      scenario.limits?.randomBattles !== undefined ? `${scenario.limits.randomBattles} random battles` : '',
      scenario.limits?.campRests !== undefined ? `${scenario.limits.campRests} camp rests` : ''
    ].filter(Boolean);
    body.innerHTML = `
      <div class="campaign-preview">
        <b>${_esc(scenario.name || scenario.id)}</b><br>
        ${_esc(scenario.notes || scenario.summary || 'No notes.')}<br>
        ${_renderShapePills(scenario)}
      </div>
      <div class="campaign-inspect-grid">
        <section>
          <h3>Flow</h3>
          <div class="campaign-muted">${_esc(scenario.travelMode || (scenario.mapId ? 'node_map' : 'freeform'))}</div>
          ${(beats.length ? beats : nodes).slice(0, 12).map((entry, index) => `
            <div class="campaign-step">
              <b>${index + 1}. ${_esc(entry.label || entry.name || entry.id)}</b>
              <span>${_esc(entry.prompt || entry.notes || entry.kind || entry.role || '')}</span>
            </div>
          `).join('') || '<div class="campaign-empty">Freeform run. Use manual controls, event notes, and battle picks.</div>'}
        </section>
        <section>
          <h3>Rules</h3>
          ${dangers.map((line) => `<div class="campaign-town-line"><strong>${_esc(line)}</strong><span>Run limit</span></div>`).join('') || '<div class="campaign-empty">No special limits listed.</div>'}
          <h3>Rewards</h3>
          ${rewards.map((line) => `<div class="campaign-town-line is-reward"><strong>${_esc(line)}</strong><span>On resolve</span></div>`).join('') || '<div class="campaign-empty">No authored rewards listed.</div>'}
        </section>
      </div>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn" data-inspect-close>Close</button>
      ${CS().getState()?.activeScenarioRun
        ? '<button class="btn btn-primary" data-inspect-current>Open Current Run</button>'
        : '<button class="btn btn-primary" data-inspect-start>Start Run</button>'}
    `;
    const overlay = UI().openModal({ title: 'Run Inspect', content: body, footer, width: '760px' });
    footer.querySelector('[data-inspect-close]').onclick = () => UI().closeModal(overlay);
    const current = footer.querySelector('[data-inspect-current]');
    if (current) current.onclick = () => {
      UI().closeModal(overlay);
      _goto(null, 'maps');
    };
    const start = footer.querySelector('[data-inspect-start]');
    if (start) start.onclick = () => {
      UI().closeModal(overlay);
      _startScenarioFromUi(scenarioId);
    };
  }

  function _discardGeneratedScenario(scenarioId) {
    if (!scenarioId) return;
    const state = CS().getState();
    if (state?.activeScenarioRun?.scenarioId === scenarioId) {
      return UI().toast('Cancel the active run first', 'info');
    }
    UI().confirm('Discard this generated scenario?', () => {
      CS().mutate((next) => {
        const sc = next.sideContent || {};
        const scenario = sc.generatedScenarios?.[scenarioId];
        const mapId = scenario?.mapId;
        if (sc.generatedScenarios) delete sc.generatedScenarios[scenarioId];
        if (mapId && sc.generatedMaps) delete sc.generatedMaps[mapId];
      }, { source: 'scenario_discard' });
      Ops().apply({ op: 'log', text: `Generated scenario discarded: ${scenarioId}.` }, { source: 'scenario_discard' });
      UI().toast('Scenario discarded', 'info');
    });
  }

  function _cancelScenario() {
    const run = CS().getState()?.activeScenarioRun;
    if (!run) return;
    UI().confirm('Cancel this scenario without recording a report?', () => {
      const scenarioId = run.scenarioId;
      CS().mutate((state) => {
        state.activeScenarioRun = null;
        state.pendingBattle = null;
        for (const member of Object.values(state.party || {})) {
          if (member.availability?.expires === 'scenario') {
            member.availability = {
              status: 'available',
              reason: '',
              source: 'scenario_cancel',
              expires: null,
              updatedAt: new Date().toISOString()
            };
          }
        }
        if (scenarioId && state.sideContent?.generatedScenarios?.[scenarioId]) {
          delete state.sideContent.generatedScenarios[scenarioId];
        }
      }, { source: 'scenario_cancel' });
      Ops().apply({ op: 'log', text: `Scenario cancelled: ${scenarioId}.` }, { source: 'scenario_cancel' });
      _activeMode = 'quest';
      _activeTab = 'scenarios';
      render();
      UI().toast('Scenario cancelled', 'info');
    });
  }

  function _setMapLayer(layer) {
    if (!layer) return;
    CS().mutate((state) => {
      if (state.activeScenarioRun) state.activeScenarioRun.mapLayer = layer;
    }, { source: 'map_layer' });
  }

  function _moveNode(nodeId) {
    const current = Runner().findCurrentNode();
    const link = (current?.exits || []).find((exit) => exit.to === nodeId) || null;
    const moved = Runner().moveToNode(nodeId, link);
    if (!moved) UI().toast('That node is not connected from here yet', 'info');
    else window.CJS.CampaignStoryScenes?.openPendingNodeEntry?.();
  }

  function _moveCell(x, y) {
    const moved = Runner().moveToCell?.(Number(x), Number(y));
    if (!moved) UI().toast('That cell is blocked or out of reach', 'info');
  }

  function _clearNode(nodeId) {
    CS().mutate((state) => {
      const mapId = state.activeScenarioRun?.mapId;
      if (!mapId) return;
      state.mapState[mapId] = state.mapState[mapId] || { visited: {}, revealed: {}, locked: {}, cleared: {}, notes: {} };
      state.mapState[mapId].cleared[nodeId] = true;
    }, { source: 'map' });
    Ops().apply({ op: 'log', text: `Node cleared: ${nodeId}.` }, { source: 'map' });
  }

  function _runBattle() {
    const battle = CS().getState().pendingBattle;
    if (!battle) return;
    if (!battle.encounterId && !battle.battleSetId && !battle.monsterIds?.length) return UI().toast('This battle needs an encounter, battle set, or monster pool first.', 'info');
    const readyCount = Object.values(CS().getState().party || {}).filter((member) => Bridge()?.isMemberBattleReady?.(member)).length;
    if (!readyCount) return UI().toast('No available party members can enter this battle', 'error');
    Save().saveCurrent();
    const Popup = window.CJS.CampaignCombatPopup;
    if (Popup?.show) {
      Popup.show(battle, {
        onEngage: (b) => {
          UI().toast('Opening combat. Results apply automatically when you return.', 'info');
          Bridge().openBattle(b);
        }
      });
      return;
    }
    UI().toast('Opening combat. Results apply automatically when you return.', 'info');
    Bridge().openBattle(battle);
  }

  function _runRollBattle() {
    const scenario = CS().getActiveScenario();
    const tables = scenario?.randomBattleTables || [];
    if (tables.length) {
      const pending = Runner().rollRandomBattle(tables[0].id);
      if (!pending) UI().toast('No battle rolled', 'info');
      return;
    }
    const fallbackPool = _fallbackBattlePool();
    if (!fallbackPool.length) return UI().toast('No battles available in this world', 'info');
    const pick = _pickContextualBattle(fallbackPool);
    const questContext = QP()?.battleContextForPending?.(CS().getState(), pick) || null;
    const pending = {
      encounterId: pick.encounterId || null,
      battleSetId: pick.battleSetId || null,
      monsterIds: pick.monsterIds || [],
      label: pick.label,
      source: 'random',
      rewardOps: pick.rewardOps || [],
      ..._battleDefeatFields(pick),
      objective: pick.objective || '',
      notes: pick.notes || '',
      battleMap: pick.battleMap || null,
      setting: pick.setting || scenario?.setting || null,
      tags: pick.tags || [],
      contextTags: questContext?.contextTags || [],
      monsterTags: questContext?.monsterTags || pick.monsterTags || [],
      questId: questContext?.questId || null,
      questChainId: questContext?.questChainId || null,
      objectiveId: questContext?.objectiveId || null,
      questContext
    };
    CS().mutate((state) => {
      state.pendingBattle = pending;
      if (state.activeScenarioRun) state.activeScenarioRun.randomBattlesUsed = (state.activeScenarioRun.randomBattlesUsed || 0) + 1;
    }, { source: 'random_battle_fallback' });
    Ops().apply({ op: 'log', text: `Random battle rolled (world pool): ${pending.label}.` }, { source: 'random_battle' });
  }

  function _rollTravelSurprise() {
    const result = Runner().rollTravelSurprise?.({ force: true });
    if (!result) return UI().toast('No travel surprise available right now', 'info');
    UI().toast(result.title || 'Travel surprise ready', result.category === 'battle' ? 'warning' : 'success');
  }

  function _fallbackBattlePool() {
    const world = CS().getState()?.currentWorld;
    const cards = window.CJS.CampaignBattleSetForge?.getCards?.({ world }) || [];
    const fromCards = cards
      .map((card) => ({
        id: card.id,
        battleSetId: card.id,
        encounterId: card.encounterId || null,
        label: card.name || card.id,
        rewardOps: card.rewardOps || [],
        ..._battleDefeatFields(card),
        objective: card.objective || '',
        notes: card.gimmick || '',
        battleMap: _battleMapForCard(card),
        tags: card.tags || [],
        contextTags: card.tags || [],
        monsterTags: card.tags || []
      }))
      .filter((entry) => entry.encounterId || entry.battleSetId);
    if (fromCards.length) return fromCards;
    const encounters = DS().getAllAsArray('encounters')
      .filter((enc) => !enc._world || enc._world === world)
      .slice(0, 6)
      .map((enc) => ({ id: enc.id, encounterId: enc.id, label: enc.name || enc.id }));
    if (encounters.length) return encounters;
    const monsters = DS().getAllAsArray('monsters')
      .filter((monster) => !world || !monster._world || monster._world === world)
      .slice(0, 8);
    if (!monsters.length) return [];
    return monsters.map((monster) => ({
      id: `monster_pool_${monster.id}`,
      monsterIds: [monster.id],
      label: monster.name || monster.id,
      setting: CS().getActiveScenario()?.setting || 'outdoor',
      battleMap: _battleMapForArea(CS().getActiveScenario()?.setting || 'outdoor'),
      tags: [monster.type, monster.id].filter(Boolean),
      monsterTags: QP()?.monsterTags?.(monster) || [monster.type, monster.id].filter(Boolean)
    }));
  }

  function _pickContextualBattle(pool = []) {
    const scored = pool
      .map((entry) => ({ entry, score: _battleContextScore(entry) }))
      .sort((a, b) => b.score - a.score);
    const top = scored.slice(0, Math.min(4, scored.length));
    const total = top.reduce((sum, item) => sum + Math.max(1, item.score), 0);
    let roll = Math.random() * total;
    for (const item of top) {
      roll -= Math.max(1, item.score);
      if (roll <= 0) return item.entry;
    }
    return top[0]?.entry || pool[Math.floor(Math.random() * pool.length)];
  }

  function _battleContextScore(entry = {}) {
    const context = _battleContextTags();
    const entryTags = [
      entry.label,
      entry.objective,
      entry.notes,
      entry.setting,
      ...(entry.tags || []),
      ...(entry.contextTags || []),
      ...(entry.monsterTags || [])
    ].join(' ').toLowerCase();
    let score = 1;
    for (const tag of context) {
      if (tag && entryTags.includes(tag)) score += 5;
    }
    if (/boss|chimera|preview/.test(entryTags) && !context.includes('boss') && !context.includes('training')) score -= 4;
    return Math.max(1, score);
  }

  function _battleContextTags() {
    const state = CS().getState() || {};
    const ctx = QP()?.battleContextForPending?.(state, state.pendingBattle || {}) || {};
    const run = state.activeScenarioRun || {};
    const raw = [
      run.questTask?.label,
      run.questTask?.location,
      ...(ctx.tags || []),
      ...(ctx.contextTags || []),
      ...(ctx.monsterTags || [])
    ].filter(Boolean).map((tag) => String(tag).toLowerCase());
    return Array.from(new Set(raw.flatMap((tag) => [
      tag,
      tag.replace(/[^a-z0-9_:-]+/g, '_')
    ])));
  }

  function _battleMapForArea(area) {
    const key = String(area || '').toLowerCase();
    let theme = 'forest';
    if (['dungeon', 'cave', 'sewer', 'house'].includes(key)) theme = 'cave';
    else if (key === 'temple') theme = 'temple';
    else if (key === 'ruins') theme = 'ruins';
    else if (['urban', 'tavern', 'castle', 'arena'].includes(key)) theme = 'arena';
    else if (key === 'mountain') theme = 'tundra';
    return { theme, width: 8, height: 8 };
  }

  function _battleMapForCard(card = {}) {
    const text = [card.name, card.objective, card.gimmick, ...(card.tags || [])].join(' ').toLowerCase();
    let theme = 'forest';
    if (/temple|shrine|holy/.test(text)) theme = 'temple';
    else if (/ruins|relic|pillar/.test(text)) theme = 'ruins';
    else if (/cave|cellar|sewer|underground|den/.test(text)) theme = 'cave';
    else if (/snow|ice|frost|ridge|mountain/.test(text)) theme = 'tundra';
    else if (/arena|spar|training|guild|tavern|house|urban|street/.test(text)) theme = 'arena';
    return {
      theme,
      width: Number(card.grid?.width || 8),
      height: Number(card.grid?.height || 8)
    };
  }

  function _battleDefeatFields(entry = {}, card = {}) {
    const defeatOutcome = entry.defeatOutcome || card?.defeatOutcome || null;
    const defeatMode = entry.defeatMode || card?.defeatMode || null;
    return {
      defeatOps: entry.defeatOps || entry.lossOps || card?.defeatOps || card?.lossOps || [],
      drawOps: entry.drawOps || card?.drawOps || [],
      badEndingOps: entry.badEndingOps || card?.badEndingOps || [],
      badEndingOnDefeat: !!(entry.badEndingOnDefeat || card?.badEndingOnDefeat || defeatOutcome === 'bad_ending' || defeatMode === 'bad_ending'),
      badEndingFlag: entry.badEndingFlag || card?.badEndingFlag || null,
      defeatOutcome,
      defeatMode,
      defeatNoRecovery: !!(entry.defeatNoRecovery || entry.noDefeatRecovery || card?.defeatNoRecovery || card?.noDefeatRecovery)
    };
  }

  function _runPickBattle() {
    const scenario = CS().getActiveScenario();
    const seen = new Map();
    for (const set of scenario?.setBattles || []) {
      const value = set.id || set.battleSetId || set.encounterId;
      if (!value || seen.has(value)) continue;
      seen.set(value, { value, label: set.label || set.name || set.encounterId || set.battleSetId, sub: 'scenario', _battle: set });
    }
    for (const table of scenario?.randomBattleTables || []) {
      for (const entry of table.entries || []) {
        const value = entry.id || entry.battleSetId || entry.encounterId;
        if (!value || seen.has(value)) continue;
        seen.set(value, { value, label: entry.label || entry.encounterId || entry.battleSetId, sub: table.name || table.id, _battle: entry });
      }
    }
    for (const card of window.CJS.CampaignBattleSetForge.getCards()) {
      if (seen.has(card.id)) continue;
      seen.set(card.id, {
        value: card.id,
        label: card.name || card.id,
        sub: `battle set ${card.rank || ''}`.trim(),
        _battle: {
          battleSetId: card.id,
          encounterId: card.encounterId || null,
          label: card.name || card.id,
          rewardOps: card.rewardOps || [],
          ..._battleDefeatFields(card),
          objective: card.objective || '',
          notes: card.gimmick || '',
          battleMap: _battleMapForCard(card),
          tags: card.tags || [],
          contextTags: card.tags || [],
          monsterTags: card.tags || []
        }
      });
    }
    const world = CS().getState()?.currentWorld;
    for (const enc of DS().getAllAsArray('encounters')) {
      if (seen.has(enc.id)) continue;
      if (enc._world && enc._world !== world) continue;
      seen.set(enc.id, { value: enc.id, label: enc.name || enc.id, sub: enc._world || 'all' });
    }
    const options = Array.from(seen.values()).sort((a, b) => String(a.label).localeCompare(String(b.label)));
    if (!options.length) return UI().toast('No encounters available', 'info');
    _opPickerModal({
      title: 'Pick Battle',
      options,
      placeholder: 'Search encounters…',
      primaryLabel: 'Queue Battle',
      onSubmit: ({ value }) => {
        const opt = seen.get(value);
        const battle = opt?._battle || {};
        const pending = {
          encounterId: battle.battleSetId ? (battle.encounterId || null) : (battle.encounterId || value),
          battleSetId: battle.battleSetId || null,
          label: battle.label || opt?.label || value,
          source: 'manual_pick',
          rewardOps: battle.rewardOps || [],
          ..._battleDefeatFields(battle),
          objective: battle.objective || '',
          notes: battle.notes || '',
          battleMap: battle.battleMap || null,
          tags: battle.tags || [],
          contextTags: QP()?.battleContextForPending?.(CS().getState(), battle)?.contextTags || [],
          monsterTags: QP()?.battleContextForPending?.(CS().getState(), battle)?.monsterTags || battle.monsterTags || [],
          questContext: QP()?.battleContextForPending?.(CS().getState(), battle) || null
        };
        CS().mutate((state) => { state.pendingBattle = pending; }, { source: 'run_pick_battle' });
        Ops().apply({ op: 'log', text: `Battle queued (manual pick): ${pending.label}.` }, { source: 'run' });
      }
    });
  }

  function _runRollEvent() {
    const scenario = CS().getActiveScenario();
    const campaign = CS().getCurrentCampaign();
    const world = CS().getState().currentWorld;
    const node = Runner().findCurrentNode?.();
    const cell = Runner().findCurrentCell?.();
    const context = {
      world,
      setting: scenario?.setting || '',
      tags: [...(scenario?.tags || []), ...(node?.tags || []), ...(cell?.tags || [])],
      locationKind: node?.kind || cell?.kind || ''
    };
    const tables = [...(scenario?.eventTables || []), ...(campaign?.eventTables || [])];
    const tableId = window.CJS.CampaignEvents.pickTable(tables, context);
    if (!tableId) return UI().toast('No event tables available', 'info');
    const event = window.CJS.CampaignEvents.roll(tableId, context);
    if (!event) UI().toast('Event roll returned nothing', 'info');
  }

  function _runQueueSetBattle(battleId) {
    const scenario = CS().getActiveScenario();
    const battle = (scenario?.setBattles || []).find((b) => b.id === battleId || b.encounterId === battleId || b.battleSetId === battleId);
    if (!battle) return UI().toast('Set battle not found', 'error');
    const pending = {
      encounterId: battle.encounterId || null,
      battleSetId: battle.battleSetId || null,
      label: battle.label || battle.name || battle.encounterId || battle.battleSetId,
      source: 'set',
      rewardOps: battle.rewardOps || [],
      ..._battleDefeatFields(battle),
      objective: battle.objective || '',
      notes: battle.notes || '',
      battleMap: battle.battleMap || null,
      tags: battle.tags || [],
      contextTags: QP()?.battleContextForPending?.(CS().getState(), battle)?.contextTags || [],
      monsterTags: QP()?.battleContextForPending?.(CS().getState(), battle)?.monsterTags || battle.monsterTags || [],
      questContext: QP()?.battleContextForPending?.(CS().getState(), battle) || null
    };
    CS().mutate((state) => { state.pendingBattle = pending; }, { source: 'run_set_battle' });
    Ops().apply({ op: 'log', text: `Set battle queued: ${pending.label}.` }, { source: 'run' });
  }

  function _runNextBeat() {
    const beat = Runner().advanceLinearBeat();
    if (!beat) UI().toast('No more beats', 'info');
  }

  function _manualBattleModal() {
    const body = document.createElement('div');
    body.innerHTML = `
      <label class="form-label">Result</label>
      <select id="campaign-manual-result"><option value="victory">Victory (battle rewards)</option><option value="defeat">Defeat (setback penalty)</option><option value="draw">Draw (small setback)</option></select>
      <div class="campaign-muted" style="margin:8px 0 10px">Defeat and draw keep the party alive by default, then apply danger and currency penalties unless this battle has authored consequences.</div>
      <label class="form-label">Summary</label>
      <textarea id="campaign-manual-summary"></textarea>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = '<button class="btn btn-primary">Apply</button>';
    const overlay = UI().openModal({ title: 'Manual Battle Result', content: body, footer, width: '480px' });
    footer.querySelector('button').onclick = () => {
      Ops().apply({
        op: 'manual_battle_result',
        result: body.querySelector('#campaign-manual-result').value,
        summary: body.querySelector('#campaign-manual-summary').value.trim()
      }, { source: 'ui' });
      UI().closeModal(overlay);
    };
  }

  function _applyCombatResult() {
    const result = CS().getState().pendingBattleResult;
    if (!result) return;
    Bridge().applyResult(result);
    CS().mutate((state) => { state.pendingBattleResult = null; }, { source: 'combat_bridge' });
  }

  function _shopBuy(data) {
    const stock = _shopStock(data.shopId, data.stockIndex);
    Ops().apply({
      op: 'shop_buy',
      shopId: data.shopId,
      id: data.id || stock?.id,
      type: data.type || stock?.type || 'item',
      bucket: stock?.bucket,
      price: Number(data.price ?? stock?.price ?? 0),
      currency: data.currency || stock?.currency,
      qty: 1,
      requires: stock?.requires || {},
      costs: stock?.costs || stock?.costBundle || {},
      consumeRequires: !!stock?.consumeRequires
    }, { source: 'ui' });
  }

  function _shopStock(shopId, stockIndex) {
    const shop = shopId ? DS().get('shops', shopId) : null;
    const index = Number(stockIndex);
    return shop?.stock?.[index] || null;
  }

  function _inventoryDelta(data) {
    const bucketToOps = {
      items: ['give_item', 'take_item'],
      materials: ['give_material', 'take_material'],
      food: ['give_food', 'take_food'],
      questItems: ['give_quest_item', 'take_quest_item'],
      equipment: ['give_item', 'take_item']
    };
    const delta = Number(data.delta || 0);
    const pair = bucketToOps[data.bucket] || bucketToOps.items;
    Ops().apply({ op: delta >= 0 ? pair[0] : pair[1], id: data.id, qty: Math.abs(delta) }, { source: 'ui' });
  }

  function _quickAddInventory(bucket) {
    const options = _bucketOptions(bucket || 'items');
    if (!options.length) {
      UI().toast(`No ${bucket || 'items'} available in this world`, 'info');
      return;
    }
    const titleByBucket = { items: 'Add Item', materials: 'Add Material', food: 'Add Food', equipment: 'Add Equipment', questItems: 'Add Quest Item' };
    _opPickerModal({
      title: titleByBucket[bucket] || 'Add Inventory',
      options,
      withQty: true,
      qtyDefault: 1,
      qtyMin: 1,
      qtyMax: 99,
      primaryLabel: 'Add',
      onSubmit: ({ value, qty }) => _inventoryDelta({ bucket, id: value, delta: qty || 1 })
    });
  }

  function _plantSeed(plotId) {
    const options = _seedOptions();
    if (!options.length) {
      UI().toast('No seeds available in this world', 'info');
      return;
    }
    _opPickerModal({
      title: 'Plant Seed',
      options,
      primaryLabel: 'Plant',
      placeholder: 'Search seeds…',
      onSubmit: ({ value }) => window.CJS.PocketHaven.plantSeed(plotId, value)
    });
  }

  function _craftRecipe(recipeId) {
    const recipe = DS().get('crafting', recipeId);
    if (!recipe) return;
    Ops().apply({ op: 'craft_basic', id: recipe.id, label: recipe.name, inputs: recipe.inputs || {}, outputs: recipe.outputs || {} }, { source: 'ui' });
  }

  function _addPocketNote() {
    _textareaModal({
      title: 'Activity Note',
      label: 'Note',
      placeholder: 'A short note about your haven…',
      primaryLabel: 'Save Note',
      onSubmit: (text) => {
        if (!text) return false;
        CS().mutate((state) => state.pocketHaven.notes.unshift({ at: new Date().toISOString(), text }), { source: 'note' });
      }
    });
  }

  // ── POCKET HAVEN FACILITIES ────────────────────────────────────
  function _havenBuildFacility(facilityId) {
    if (!facilityId) return;
    const def = window.CJS.PocketHavenFacilities?.getFacilityDef?.(facilityId);
    if (!def) return UI().toast('Unknown facility', 'error');
    Ops().apply({ op: 'build_facility', facilityId }, { source: 'pocket_haven_ui' });
    UI().toast(`Built ${def.name}`, 'success');
  }

  function _havenUpgradeFacility(facilityId) {
    if (!facilityId) return;
    Ops().apply({ op: 'upgrade_facility', facilityId }, { source: 'pocket_haven_ui' });
  }

  function _havenTrainSkill(facilityId) {
    const state = CS().getState();
    // Build a list of [member, skill] candidates from the active party.
    const memberOptions = Object.entries(state.party || {})
      .filter(([id, m]) => (m.rosterRole || 'active') !== 'bench')
      .map(([id, m]) => ({ id, name: m.name || id, member: m }));
    if (!memberOptions.length) return UI().toast('No active party members', 'info');

    // First pick a member, then pick a skill, then commit.
    _opPickerModal({
      title: 'Pick member to train',
      options: memberOptions.map((m) => ({ value: m.id, label: `${m.name}` })),
      primaryLabel: 'Next',
      onSubmit: ({ value: memberId }) => {
        const member = memberOptions.find((m) => m.id === memberId)?.member;
        if (!member) return;
        const skillIds = Array.from(new Set([
          ...(member.learnedSkills || []),
          ...((DS().get('characters', member.baseCharacterId || memberId) || {}).skills || []).map((s) => typeof s === 'string' ? s : s.skillId).filter(Boolean)
        ]));
        if (!skillIds.length) return UI().toast(`${member.name || memberId} has no trainable skills`, 'info');
        const skillOpts = skillIds.map((sid) => {
          const def = DS().get('skills', sid);
          const prog = member.skillProgress?.[sid] || { ap: 0, level: 1 };
          return { value: sid, label: `${def?.name || sid} (L${prog.level || 1} · ${prog.ap || 0} AP)` };
        });
        _opPickerModal({
          title: 'Pick skill to train',
          options: skillOpts,
          primaryLabel: 'Train',
          onSubmit: ({ value: skillId }) => {
            Ops().apply({ op: 'train_skill', facilityId, memberId, skillId }, { source: 'pocket_haven_ui' });
          }
        });
      }
    });
  }

  function _havenRanchAssign(facilityId) {
    // List known monsters whose data declares ranchOutputs OR tag them
    // as "tameable", plus a fallback that includes all monster ids.
    const tameable = DS().getAllAsArray('monsters')
      .filter((m) => m?.tameable || (m?.tags || []).includes('tameable') || m?.ranchOutputs)
      .slice(0, 50);
    const pool = tameable.length ? tameable : DS().getAllAsArray('monsters').slice(0, 30);
    const options = pool.map((m) => ({ value: m.id, label: `${m.icon || '🐾'} ${m.name || m.id}` }));
    if (!options.length) return UI().toast('No tameable beasts in this world', 'info');
    _opPickerModal({
      title: 'Assign beast to ranch',
      options,
      primaryLabel: 'Assign',
      onSubmit: ({ value: beastId }) => {
        Ops().apply({ op: 'ranch_assign', facilityId, beastId }, { source: 'pocket_haven_ui' });
      }
    });
  }

  function _havenRanchCollect(facilityId) {
    Ops().apply({ op: 'ranch_collect', facilityId }, { source: 'pocket_haven_ui' });
  }

  async function _openCookingMinigame(foodId) {
    if (!foodId) return;
    const food = DS().get('food', foodId);
    if (!food) return UI().toast('Unknown recipe', 'error');
    // The minigame handles cook_basic op itself; we just need to react
    // to the result so the UI refreshes and we apply the bonus stat
    // when perfect grade landed.
    const result = await window.CJS.CookingMinigame.open({ foodId, inputs: food.inputs || {} });
    if (!result?.ok) return;
    if (result.grade === 'perfect') {
      UI().toast(`Perfect cook! ${food.name} buff potency boosted`, 'success');
    } else if (result.grade === 'burnt') {
      UI().toast(`Burnt the ${food.name}…`, 'info');
    } else {
      UI().toast(`Cooked ${food.name} (${result.grade})`, 'success');
    }
    render();
  }

  // ── POCKET HAVEN MINI-GAMES ─────────────────────────────────────
  // Launches a registered mini-game from the Pocket Haven tile. The
  // host wires the level-authored `onWinOps` (contextual buffs / JP)
  // into the result, so all we do here is open the session and let
  // `_applyMiniGameResult` route the rewards.
  async function _havenPlayMinigame(gameId) {
    if (!gameId) return;
    const MG = window.CJS.Minigames;
    if (!MG?.openMiniGame) return UI().toast('Mini-game module is not loaded', 'error');
    const state = CS().getState();
    try {
      const session = await MG.openMiniGame({
        gameId,
        source: 'pocket_haven',
        mapId: 'pocket_haven',
        nodeId: gameId,
        onComplete: (result) => {
          _applyMiniGameResult(result, 'pocket_haven');
          if (result?.status === 'win') {
            UI().toast(`${result.narrative?.buffName || 'Buff'} applied for the next battle`, 'success');
          }
        }
      });
      if (!session) UI().toast('Mini-game could not open', 'error');
      return session;
    } catch (error) {
      console.error(error);
      UI().toast(error?.message || 'Mini-game failed to open', 'error');
    }
  }

  // ── GUILD TRIVIA ────────────────────────────────────────────────
  async function _openGuildTrivia(worldHint) {
    if (!window.CJS.GuildTrivia?.run) return UI().toast('Trivia module not loaded', 'error');
    const state = CS().getState();
    const result = await window.CJS.GuildTrivia.run({
      world: worldHint || state.currentWorld,
      questionCount: 5
    });
    render();
    if (result?.ok) {
      UI().toast(`Trivia: ${result.correct}/${result.total} correct · +${result.jp} JP`, 'success');
    }
  }

  function _addPinnedNote() {
    _textareaModal({
      title: 'Pinned Note',
      label: 'Note',
      placeholder: 'Pin a reminder for the campaign…',
      primaryLabel: 'Pin',
      onSubmit: (text) => {
        if (!text) return false;
        CS().mutate((state) => state.pinnedNotes.unshift({ at: new Date().toISOString(), text }), { source: 'note' });
      }
    });
  }

  function _questProgress(questId, objectiveId = null, amount = 1) {
    const quest = CS().getState().quests[questId];
    if (!quest) return;
    let objective = (quest.objectives || []).find((entry) => entry.id === objectiveId) || _questNextObjective(quest);
    if (!objective) {
      const fallbackId = `objective_${Date.now()}`;
      CS().mutate((state) => {
        const q = state.quests[questId];
        if (!q) return;
        q.objectives = [{ id: fallbackId, label: 'Manual progress', current: 0, required: 1 }];
      }, { source: 'quest_objective_add' });
      objective = CS().getState().quests[questId]?.objectives?.[0];
    }
    if (!objective) return;
    Ops().apply({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount }, { source: 'ui' });
  }

  function _questScenario(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const activeRun = CS().getState()?.activeScenarioRun;
    const activeScenario = CS().getActiveScenario?.();
    if (activeRun) {
      if (_activeRunQuestId(activeRun, activeScenario) === questId) return _goto(null, 'maps');
      return UI().toast('End the active scenario before starting a quest map', 'info');
    }
    return _startQuestScenario(questId);
  }

  function _questBattle(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    if (!CS().getState()?.activeScenarioRun) {
      const result = _startQuestScenario(questId, { size: 'tiny' });
      if (!result || result.error) return;
    }
    _runRollBattle();
    Ops().apply({ op: 'log', text: `Quest battle queued: ${quest.title || quest.id}.` }, { source: 'quest_battle' });
    _activeMode = 'quest';
    _activeTab = 'maps';
    render();
  }

  function _questEvent(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    UI().toast('Random quest events are disabled. Use Hub Scene, Check, Battle, or authored Event files.', 'info');
  }

  function _questHubEvent(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const objective = _questObjectiveByKinds(quest, ['hub_event', 'event']) || _questNextObjective(quest);
    const table = quest.tags?.includes('tavern') ? 'tavern' : quest.tags?.includes('guild') ? 'guild' : 'town';
    _rollHubPulse(table);
    if (objective) {
      Ops().apply({
        op: 'update_quest_progress',
        questId,
        objectiveId: objective.id,
        amount: 1
      }, { source: 'quest_hub_event' });
    }
    Ops().apply({ op: 'log', text: `Quest hub event: ${quest.title || quest.id}.` }, { source: 'quest_hub_event' });
  }

  function _questHarvest(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const objective = _questObjectiveByKinds(quest, ['harvest', 'gather', 'recover']) || _questNextObjective(quest);
    const loot = _questHarvestLoot(quest);
    const ops = [
      { op: loot.op, id: loot.id, qty: loot.qty || 1 },
      { op: 'log', text: `Quest harvest: ${quest.title || quest.id} - ${loot.qty || 1} ${loot.id}.` }
    ];
    if (objective) ops.push({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount: 1 });
    Ops().apply(ops, { source: 'quest_harvest' });
  }

  function _questMiniGame(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const objective = _questMiniGameObjective(quest);
    if (!objective) return UI().toast('This quest has no mini-game objective', 'info');
    const config = _miniGameConfig(objective);
    if (config.gameId) {
      config.seed = config.seed || `${quest.id}:${objective.id || 'objective'}`;
      return _openMiniGameSession(config, {
        source: 'quest_minigame',
        questId,
        objectiveId: objective.id,
        quest,
        objective,
        requireBriefing: true
      });
    }
    const MG = window.CJS.Minigames;
    if (!MG?.listGames || !MG?.openMiniGame) return UI().toast('Mini-game module is not loaded', 'error');
    const games = MG.listGames() || [];
    if (!games.length) return UI().toast('No mini-games are registered', 'info');
    const body = document.createElement('div');
    body.appendChild(_formLabel('Mini-Game'));
    const game = UI().createSelect({
      options: games.map((entry) => ({ value: entry.id, label: entry.title || _label(entry.id) })),
      value: games[0]?.id || ''
    });
    body.appendChild(game);
    body.appendChild(_formLabel('Difficulty'));
    const difficulty = UI().createSelect({
      options: [1, 2, 3, 4, 5].map((value) => ({ value: String(value), label: `Difficulty ${value}` })),
      value: '1'
    });
    body.appendChild(difficulty);
    _formModal({
      title: `Mini-Game: ${quest.title || quest.id}`,
      body,
      primaryLabel: 'Play',
      onSubmit: () => {
        _openMiniGameSession({
          gameId: game.value,
          difficulty: Number(difficulty.value || 1),
          seed: `${quest.id}:${objective.id || 'objective'}`
        }, {
          source: 'quest_minigame',
          questId,
          objectiveId: objective.id,
          quest,
          objective,
          requireBriefing: true
        });
      }
    });
  }

  function _questObjectiveByKinds(quest = {}, kinds = []) {
    const set = new Set(kinds);
    return (quest.objectives || []).find((objective) => !_questObjectiveDone(objective) && set.has(objective.kind)) || null;
  }

  function _questHarvestLoot(quest = {}) {
    const tags = new Set([...(quest.tags || []), ...(quest.contextTags || [])].map((tag) => String(tag).toLowerCase()));
    if (tags.has('mushroom') || tags.has('forage') || tags.has('food')) return { op: 'give_quest_item', id: 'haven_frostcap_mushroom', qty: 1 };
    if (tags.has('pelt') || tags.has('wolf')) return { op: 'give_material', id: 'haven_wolf_pelt', qty: 1 };
    if (tags.has('ore') || tags.has('forge') || tags.has('crafting')) return { op: 'give_material', id: 'haven_ice_crystal', qty: 1 };
    return { op: 'give_material', id: 'haven_sprite_dust', qty: 1 };
  }

  function _questCheck(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const objective = _questNextObjective(quest);
    const body = document.createElement('div');
    body.appendChild(_formLabel('Stat'));
    const stat = UI().createSelect({
      options: (C()?.STATS || ['S', 'P', 'E', 'C', 'I', 'A', 'L']).map((value) => ({ value, label: `${value} - ${_statName(value)}` })),
      value: 'P'
    });
    body.appendChild(stat);
    body.appendChild(_formLabel('DC'));
    const dc = UI().createNumberSlider({ value: 12, min: 4, max: 25, step: 1 });
    body.appendChild(dc);
    _formModal({
      title: `Quest Check: ${quest.title || quest.id}`,
      body,
      primaryLabel: 'Roll',
      onSubmit: () => {
        const success = [{ op: 'log', text: `Quest check success: ${quest.title || quest.id}.` }];
        if (objective) success.push({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount: 1 });
        const fail = [
          { op: 'log', text: `Quest check setback: ${quest.title || quest.id}.` },
          { op: 'danger', amount: 1 }
        ];
        Ops().apply({ op: 'roll_check', stat: stat.value, dc: dc._getValue(), success, fail }, { source: 'quest_check' });
      }
    });
  }

  function _questHandIn(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const options = _ownedInventoryOptions();
    if (!options.length) return UI().toast('No inventory to hand in', 'info');
    const objective = _questNextObjective(quest);
    const maxQty = Math.max(1, ...options.map((opt) => opt.qty || 1));
    _opPickerModal({
      title: `Hand In: ${quest.title || quest.id}`,
      options,
      withQty: true,
      qtyDefault: 1,
      qtyMin: 1,
      qtyMax: maxQty,
      primaryLabel: 'Hand In',
      placeholder: 'Search owned inventory...',
      onSubmit: ({ value, qty }) => {
        const opt = options.find((entry) => entry.value === value);
        if (!opt) return false;
        const amount = Math.max(1, Math.min(Number(qty || 1), opt.qty || 1));
        const ops = [
          { op: _takeOpForBucket(opt.bucket), id: opt.id, qty: amount },
          { op: 'log', text: `Quest hand-in: ${amount} ${_recordName(opt.bucket, opt.id)} for ${quest.title || quest.id}.` }
        ];
        if (objective) ops.push({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount: 1 });
        Ops().apply(ops, { source: 'quest_hand_in' });
      }
    });
  }

  function _questAnswer(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    const objective = _questNextObjective(quest);
    _textareaModal({
      title: `Answer: ${quest.title || quest.id}`,
      label: 'Answer',
      placeholder: 'What did the party answer or do?',
      primaryLabel: 'Apply',
      onSubmit: (text) => {
        if (!text) return false;
        const ops = [{ op: 'log', text: `Quest answer: ${quest.title || quest.id} - ${text}` }];
        if (objective) ops.push({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount: 1 });
        Ops().apply(ops, { source: 'quest_answer' });
      }
    });
  }

  function _activeQuestById(questId) {
    const quest = CS().getState()?.quests?.[questId];
    return quest && !_isQuestResolved(quest) ? quest : null;
  }

  function _activeRunQuestId(run, scenario) {
    return run?.questId || scenario?.source?.questId || null;
  }

  function _startQuestScenario(questId, overrides = {}) {
    const quest = overrides.quest || _activeQuestById(questId);
    if (!quest) return null;
    const requestedMapForm = String(overrides.mapForm || _questMapForm(quest) || '').toLowerCase();
    // Only run the linked scenario if its movement style agrees with what the
    // quest (or caller) asked for. Otherwise we'd hand a grid-map quest a
    // node-map scenario — which is exactly the "I picked Grid Map but got Node
    // Map" bug.
    if (!overrides.forceGenerated && _linkedScenarioMatches(quest, requestedMapForm)) {
      const existing = _startExistingQuestScenario(quest);
      if (existing) return existing;
    }
    const result = _generateScenario({
      source: 'active_quest',
      questId,
      mapForm: requestedMapForm || _questMapForm(quest),
      mapType: _questMapType(quest),
      size: quest.mapSize || 'small',
      ...overrides
    });
    if (result && !result.error) {
      _annotateQuestRun(quest, result.scenario);
      render();
    }
    return result;
  }

  // Returns true when the quest's linked scenario uses the same map movement
  // as the requested form. If the quest has no linked scenario, returns true
  // (so _startExistingQuestScenario's own null-check handles the fallthrough).
  function _linkedScenarioMatches(quest = {}, requestedMapForm = '') {
    const scenarioId = quest?.linkedScenario || quest?.scenarioId || quest?.scenario;
    if (!scenarioId) return true;
    if (!requestedMapForm) return true;
    const scenario = CS().getScenarioById?.(scenarioId);
    if (!scenario) return true;
    const scenarioForm = String(scenario.mapForm || scenario.travelMode || '').toLowerCase();
    if (!scenarioForm) return true;
    return scenarioForm === requestedMapForm;
  }

  function _startExistingQuestScenario(quest) {
    const scenarioId = quest?.linkedScenario || quest?.scenarioId || quest?.scenario;
    if (!scenarioId) return null;
    const scenario = CS().getScenarioById(scenarioId);
    if (!scenario) return null;
    try {
      Runner().startScenario(scenarioId);
    } catch (err) {
      UI().toast(`Scenario could not start: ${err?.message || scenarioId}`, 'info');
      return { error: 'start_failed' };
    }
    _annotateQuestRun(quest, scenario);
    _activeMode = 'quest';
    _activeTab = 'maps';
    render();
    UI().toast(`Started ${scenario.name || scenario.id}`, 'success');
    return { scenario, existing: true };
  }

  function _annotateQuestRun(quest, scenario) {
    if (!quest?.id || !CS().getState()?.activeScenarioRun) return;
    const task = _questTaskDescriptor(quest, scenario);
    CS().mutate((state) => {
      const run = state.activeScenarioRun;
      if (!run) return;
      run.questId = quest.id;
      run.questTitle = quest.title || quest.id;
      // Carry the quest's narrative style into the run. Scenario-level
      // quickNarrative wins if it's been set; otherwise the quest's value
      // controls. Defaults to fullscreen VN if neither is set (so authored
      // story scenarios keep their original feel).
      if (scenario?.quickNarrative === true || quest.quickNarrative === true) {
        run.quickNarrative = scenario?.quickNarrative !== false && quest.quickNarrative !== false;
      } else if (scenario?.quickNarrative === false || quest.quickNarrative === false) {
        run.quickNarrative = false;
      }
      run.questChainId = quest.chainTemplateId || scenario?.source?.questChainId || run.questChainId || null;
      run.questObjectiveId = task.objectiveId || null;
      run.questTask = task;
    }, { source: 'quest_run' });
    const location = task.location ? ` at ${task.location}` : '';
    Ops().apply({ op: 'log', text: `Quest task: ${task.label || quest.title || quest.id}${location}.` }, { source: 'quest_run' });
  }

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

  function _questTags(quest = {}) {
    return ['quest', quest.id, ...(quest.tags || []), ...(quest.contextTags || []), ...(quest.monsterTags || []), _questMapType(quest)].filter(Boolean);
  }

  function _ownedInventoryOptions() {
    const state = CS().getState() || {};
    return [
      ['questItems', 'Quest Item'],
      ['items', 'Item'],
      ['materials', 'Material'],
      ['food', 'Food']
    ].flatMap(([bucket, label]) => Object.entries(state.inventory?.[bucket] || {})
      .filter(([, qty]) => Number(qty || 0) > 0)
      .map(([id, qty]) => ({
        value: `${bucket}:${id}`,
        label: _recordName(bucket, id),
        sub: `${label} x${qty}`,
        description: id,
        bucket,
        id,
        qty: Number(qty || 0)
      })));
  }

  function _takeOpForBucket(bucket) {
    const map = {
      questItems: 'take_quest_item',
      items: 'take_item',
      materials: 'take_material',
      food: 'take_food'
    };
    return map[bucket] || 'take_item';
  }

  function _charNumberOp(id, op, label) {
    const member = CS().getState()?.party?.[id];
    const max = op === 'heal_character' ? Math.max(member?.maxHp || 999, 1) : 999;
    _numberModal({
      title: `${label}: ${member?.name || id}`,
      label,
      value: 5,
      min: 1,
      max,
      primaryLabel: 'Apply',
      onSubmit: (amount) => {
        if (amount) Ops().apply({ op, target: id, amount }, { source: 'ui' });
      }
    });
  }

  function _charMpModal(id) {
    const member = CS().getState()?.party?.[id];
    const body = document.createElement('div');
    body.appendChild(_formLabel('Direction'));
    const dir = UI().createSelect({
      options: [
        { value: 'restore_mp', label: 'Restore MP' },
        { value: 'spend_mp', label: 'Spend MP' }
      ],
      value: 'restore_mp'
    });
    body.appendChild(dir);
    body.appendChild(_formLabel('Amount'));
    const slider = UI().createNumberSlider({ value: 5, min: 1, max: Math.max(member?.maxMp || 99, 1), step: 1 });
    body.appendChild(slider);
    _formModal({
      title: `MP: ${member?.name || id}`,
      body,
      primaryLabel: 'Apply',
      onSubmit: () => {
        const amount = slider._getValue();
        if (!amount) return false;
        Ops().apply({ op: dir.value, target: id, amount }, { source: 'ui' });
      }
    });
  }

  function _charStatusModal(id) {
    const member = CS().getState()?.party?.[id];
    const options = _statusOptions();
    if (!options.length) {
      UI().toast('No statuses authored yet', 'info');
      return;
    }
    _opPickerModal({
      title: `Add Status: ${member?.name || id}`,
      options,
      withDuration: true,
      placeholder: 'Search statuses…',
      primaryLabel: 'Apply Status',
      onSubmit: ({ value, duration }) => {
        Ops().apply({ op: 'add_status', target: id, status: value, duration: duration || 'manual' }, { source: 'ui' });
      }
    });
  }

  function _partySheetModal(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    const body = document.createElement('div');
    body.innerHTML = _renderPortraitHero(id, member) + _renderRosterMember(id, member);
    body.addEventListener('click', (event) => {
      const action = event.target.closest('[data-campaign-action]');
      if (!action) return;
      event.preventDefault();
      _handleAction(action.dataset, action);
    });
    _formModal({
      title: `${member.name || id} Sheet`,
      body,
      width: '820px',
      primaryLabel: 'Close',
      onSubmit: () => true
    });
  }

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

  function _recruitCharacterModal() {
    const options = _characterOptions();
    if (!options.length) {
      UI().toast('No unrecruited characters found in Edit Mode', 'info');
      return;
    }
    _opPickerModal({
      title: 'Recruit Character',
      options,
      placeholder: 'Search characters...',
      primaryLabel: 'Recruit',
      onSubmit: ({ value }) => Ops().apply({ op: 'recruit_character', characterId: value }, { source: 'ui' })
    });
  }

  function _removeCharacter(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    UI().confirm(`Remove ${member.name || id} from this campaign roster?`, () => {
      Ops().apply({ op: 'remove_character', target: id }, { source: 'ui' });
    });
  }

  function _learnSkillModal(id) {
    const options = _skillOptions(id);
    if (!options.length) {
      UI().toast('No unlearned skills found in Edit Mode', 'info');
      return;
    }
    _opPickerModal({
      title: 'Learn Skill',
      options,
      placeholder: 'Search skills...',
      primaryLabel: 'Learn',
      onSubmit: ({ value }) => Ops().apply({ op: 'learn_skill', target: id, skillId: value }, { source: 'ui' })
    });
  }

  function _learnPassiveModal(id) {
    const options = _passiveOptions(id);
    if (!options.length) {
      UI().toast('No unlearned passives found in Edit Mode', 'info');
      return;
    }
    _opPickerModal({
      title: 'Learn Passive',
      options,
      placeholder: 'Search passives...',
      primaryLabel: 'Learn',
      onSubmit: ({ value }) => Ops().apply({ op: 'learn_passive', target: id, passiveId: value }, { source: 'ui' })
    });
  }

  function _equipItemModal(id, slot) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    const options = _equipmentOptions(member, slot);
    if (!options.length) {
      UI().toast(`No ${_slotLabel(slot).toLowerCase()} options found in Edit Mode`, 'info');
      return;
    }
    _opPickerModal({
      title: `Equip ${_slotLabel(slot)}: ${member.name || id}`,
      options,
      placeholder: 'Search equipment...',
      primaryLabel: 'Equip',
      renderItem: _equipmentPickerItem,
      onSubmit: ({ value }) => Ops().apply({ op: 'equip_item', target: id, itemId: value, slot }, { source: 'ui' })
    });
  }

  function _statBoostModal(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    const body = document.createElement('div');
    body.appendChild(_formLabel('Stat'));
    const stat = UI().createSelect({
      options: (C()?.STATS || ['S', 'P', 'E', 'C', 'I', 'A', 'L']).map((value) => ({ value, label: `${value} - ${_statName(value)}` })),
      value: 'S'
    });
    body.appendChild(stat);
    body.appendChild(_formLabel('Change'));
    const amount = UI().createNumberSlider({ value: 1, min: -20, max: 20, step: 1 });
    body.appendChild(amount);
    _formModal({
      title: `Stat Growth: ${member.name || id}`,
      body,
      primaryLabel: 'Apply',
      onSubmit: () => Ops().apply({ op: 'change_stat', target: id, stat: stat.value, amount: amount._getValue() || 0 }, { source: 'ui' })
    });
  }

  function _grantXpModal(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    _numberModal({
      title: `Grant XP: ${member.name || id}`,
      label: 'XP amount',
      value: 50,
      min: 1,
      max: 99999,
      primaryLabel: 'Grant',
      onSubmit: (amount) => {
        if (amount > 0) Ops().apply({ op: 'add_xp', target: id, amount }, { source: 'ui' });
      }
    });
  }

  function _grantJobXpModal(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    if (!member.currentJob) {
      UI().toast(`${member.name || id} has no active job. Pick one with the Job button first.`, 'info');
      return;
    }
    const job = DS().get('jobs', member.currentJob);
    _numberModal({
      title: `Grant Job XP: ${member.name || id} (${job?.name || member.currentJob})`,
      label: 'Job XP amount',
      value: 30,
      min: 1,
      max: 99999,
      primaryLabel: 'Grant',
      onSubmit: (amount) => {
        if (amount > 0) Ops().apply({ op: 'gain_job_xp', target: id, amount }, { source: 'ui' });
      }
    });
  }

  function _changePersonaModal(id) {
    const state = CS().getState();
    const member = state?.party?.[id];
    if (!member) return;
    const PS = window.CJS.PersonaService;
    if (!PS) {
      UI().toast('Persona system not loaded.', 'error');
      return;
    }
    const charId = member.baseCharacterId || id;
    const personas = PS.personasForCharacter(charId);
    if (!personas.length) {
      UI().toast(`No personas authored for ${member.name || id}. Open the editor → Personas to create one.`, 'info');
      return;
    }
    const currentWorld = state.currentWorld || '';
    const unlocked = new Set(member.unlockedPersonas || []);
    // Group: unlocked first, then locked. Sort each group by world matching the
    // current world first so the player can pick a same-world skin quickly.
    const score = (p) => {
      let s = 0;
      if (unlocked.has(p.id)) s += 10;
      if (p.world === currentWorld) s += 4;
      if (p.unlock?.default) s += 1;
      return s;
    };
    const sorted = personas.slice().sort((a, b) => score(b) - score(a) || String(a.name || a.id).localeCompare(String(b.name || b.id)));

    const options = [
      { value: '', label: '— No persona (use base character) —' },
      ...sorted.map((p) => {
        const isUnlocked = unlocked.has(p.id);
        const worldLabel = p.world ? (DS().get('worlds', p.world)?.displayName || p.world) : '—';
        const outOfWorld = p.world && p.world !== currentWorld;
        const flag = isUnlocked ? '' : ' [LOCKED]';
        const here = p.id === member.activePersona ? ' (current)' : '';
        const penalty = outOfWorld ? ' (out of world)' : '';
        return {
          value: p.id,
          label: `${p.icon || '🎭'} ${p.name || p.id} — ${worldLabel}${penalty}${here}${flag}`,
          disabled: !isUnlocked
        };
      })
    ];

    const body = document.createElement('div');
    body.appendChild(_formLabel('Persona'));
    const sel = UI().createSelect({ options, value: member.activePersona || '' });
    body.appendChild(sel);

    // Live preview: show description / unlock rule / penalty on selection.
    const preview = document.createElement('div');
    preview.style.marginTop = '12px';
    preview.style.padding = '8px 10px';
    preview.style.borderRadius = '6px';
    preview.style.background = 'rgba(255,255,255,0.04)';
    preview.style.fontSize = '0.85rem';
    body.appendChild(preview);
    const renderPreview = () => {
      const pid = sel.value;
      if (!pid) {
        preview.innerHTML = '<em class="campaign-muted">Clears the active persona. Combat will use the base character record.</em>';
        return;
      }
      const persona = DS().get('personas', pid);
      if (!persona) { preview.innerHTML = ''; return; }
      const pen = persona.crossWorldPenalty || {};
      const outOfWorld = persona.world && persona.world !== currentWorld;
      const unlockedBits = [];
      if (persona.unlock?.default) unlockedBits.push('Default unlock');
      if (persona.unlock?.requiresPhaseNumber) unlockedBits.push(`Phase ≥ ${persona.unlock.requiresPhaseNumber}`);
      if (persona.unlock?.requiresChapter) unlockedBits.push(`Chapter ≥ ${persona.unlock.requiresChapter}`);
      if (persona.unlock?.requiresFlag) unlockedBits.push(`Flag: ${persona.unlock.requiresFlag}`);
      preview.innerHTML = `
        <div><b>${_esc(persona.name)}</b> ${persona.world ? `<span class="campaign-muted">(${_esc(persona.world)})</span>` : ''}</div>
        ${persona.description ? `<div style="margin-top:4px">${_esc(persona.description)}</div>` : ''}
        ${unlockedBits.length ? `<div class="campaign-muted" style="margin-top:4px">Unlock: ${_esc(unlockedBits.join(', '))}</div>` : ''}
        ${outOfWorld ? `<div style="margin-top:6px;color:#f59e0b">⚠ Out of world. Damage dealt ×${Number(pen.damageDealtMultiplier ?? 1)}, taken ×${Number(pen.damageTakenMultiplier ?? 1)}, relationship ${Number(pen.relationshipModifier ?? 0)}.</div>` : ''}
      `;
    };
    sel.addEventListener('change', renderPreview);
    renderPreview();

    _formModal({
      title: `Switch Persona: ${member.name || id}`,
      body,
      primaryLabel: 'Apply',
      onSubmit: () => {
        Ops().apply({ op: 'set_persona', target: id, personaId: sel.value || null }, { source: 'ui' });
      }
    });
  }

  function _changeJobModal(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    const base = DS().get('characters', member.baseCharacterId || id) || {};
    const allowed = new Set([...(base.availableJobs || []), ...(member.unlockedJobs || [])]);
    if (member.currentJob) allowed.add(member.currentJob);
    const allJobs = DS().getAllAsArray('jobs');
    const fromAllowed = allJobs.filter((j) => allowed.has(j.id));
    const others = allJobs.filter((j) => !allowed.has(j.id));
    const options = [
      { value: '', label: '— Remove current job —' },
      ...fromAllowed.map((j) => ({ value: j.id, label: `${j.icon || '🛡️'} ${j.name} ${j.id === member.currentJob ? '(current)' : ''}` })),
      ...(others.length ? [{ value: '__hr__', label: '── Other (will unlock) ──', disabled: true }] : []),
      ...others.map((j) => ({ value: j.id, label: `${j.icon || '🛡️'} ${j.name} (unlock)` }))
    ];
    if (!allJobs.length) {
      UI().toast('No jobs authored yet. Open the editor → Jobs to create some.', 'info');
      return;
    }
    const body = document.createElement('div');
    body.appendChild(_formLabel('Job'));
    const sel = UI().createSelect({ options, value: member.currentJob || '' });
    body.appendChild(sel);
    _formModal({
      title: `Change Job: ${member.name || id}`,
      body,
      primaryLabel: 'Apply',
      onSubmit: () => {
        const value = sel.value;
        if (value === '') {
          Ops().apply({ op: 'set_job', target: id, jobId: null }, { source: 'ui' });
        } else {
          if (!allowed.has(value)) {
            Ops().apply([
              { op: 'unlock_job', target: id, jobId: value },
              { op: 'set_job', target: id, jobId: value }
            ], { source: 'ui' });
          } else {
            Ops().apply({ op: 'set_job', target: id, jobId: value }, { source: 'ui' });
          }
        }
      }
    });
  }

  function _grantSkillApModal(memberId, skillId) {
    const member = CS().getState()?.party?.[memberId];
    const skill = DS().get('skills', skillId);
    if (!member || !skill) return;
    const F = window.CJS.Formulas;
    const prog = member.skillProgress?.[skillId] || { ap: 0, level: 1 };
    const apToNext = F?.calcSkillApToNextLevel ? F.calcSkillApToNextLevel(skill, prog.ap, prog.level) : 10;
    _numberModal({
      title: `Grant ${skill.name || skillId} AbP: ${member.name || memberId}`,
      label: `Current AbP: ${prog.ap}, Lv ${prog.level} (${apToNext != null ? `${apToNext} to next` : 'max'})`,
      value: Math.max(1, apToNext || 5),
      min: 1,
      max: 9999,
      primaryLabel: 'Grant',
      onSubmit: (amount) => {
        if (amount > 0) Ops().apply({ op: 'gain_skill_ap', target: memberId, skillId, amount }, { source: 'ui' });
      }
    });
  }

  function _levelUpSkillConfirm(memberId, skillId) {
    const member = CS().getState()?.party?.[memberId];
    const skill = DS().get('skills', skillId);
    if (!member || !skill) return;
    const F = window.CJS.Formulas;
    const prog = member.skillProgress?.[skillId] || { ap: 0, level: 1 };
    const cap = F?.getSkillMaxLevel ? F.getSkillMaxLevel(skill) : 5;
    const target = Math.min(cap, Number(prog.level || 1) + 1);
    if (target <= prog.level) {
      UI().toast('Skill is already at max level.', 'info');
      return;
    }
    UI().confirm(`Force ${skill.name || skillId} to Lv ${target}? (Edit-mode only.)`, () => {
      Ops().apply({ op: 'set_skill_level', target: memberId, skillId, level: target }, { source: 'ui' });
    });
  }

  // Adventurer Guild rank-up modal. Lists each active member with their
  // RP progress and gate status, and a "Start Trial" button when ready.
  // The world ceiling explicitly blocks promotions past it, with a hint
  // to travel to a higher-ceiling world for the next trial.
  function _rankUpApplyModal() {
    const state = CS().getState() || {};
    const F = window.CJS.Formulas;
    const world = DS().get('worlds', state.currentWorld) || {};
    const body = document.createElement('div');
    body.innerHTML = `<div class="hint-box hint-info" style="margin-bottom:10px">
      <b>Adventurer Guild — ${_esc(world.displayName || state.currentWorld || '')}</b><br>
      Ceiling here is <b>${_esc(world.ceiling || '—')}</b>. Members past the ceiling must travel to a higher-ceiling world for further trials.
    </div>`;
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';
    body.appendChild(list);

    for (const [id, member] of Object.entries(state.party || {})) {
      if ((member.rosterRole || 'active') === 'bench') continue;
      const info = _memberRankInfo(member);
      const gates = F?.rankUpGates ? F.rankUpGates(member, null, state) : null;
      const blockedByCeiling = !!(world.ceiling && gates?.target
        && F?.rankIndex(gates.target) > F.rankIndex(world.ceiling));
      const row = document.createElement('div');
      row.style.padding = '10px';
      row.style.border = '1px solid rgba(255,255,255,0.1)';
      row.style.borderRadius = '8px';
      const reasons = blockedByCeiling
        ? [`Above ${world.ceiling} ceiling — travel to a higher-ceiling world.`]
        : (gates?.reasons || []);
      row.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <b>${_esc(member.name || id)}</b>
          <span class="campaign-muted">Rank ${_esc(info.label)}${info.atMax ? '' : ` · target ${_esc(info.next || '—')}`}</span>
        </div>
        ${info.atMax ? '<div class="campaign-muted">At max rank.</div>' : `
          <div class="campaign-bar" style="margin-top:4px"><span class="mp" style="width:${info.pct}%"></span><b>RP ${info.rp}/${info.threshold}</b></div>
          ${reasons.length ? `<div class="campaign-muted" style="margin-top:6px;font-size:0.8rem">${reasons.map(_esc).join(' ')}</div>` : '<div style="margin-top:6px;color:#9dd8ff;font-size:0.8rem">All gates met — ready for trial.</div>'}
        `}
      `;
      if (!info.atMax && gates?.ok && !blockedByCeiling) {
        const btn = document.createElement('button');
        btn.className = 'campaign-action primary';
        btn.style.marginTop = '8px';
        btn.textContent = `Start Trial → ${gates.target}`;
        btn.dataset.startTrialFor = id;
        btn.dataset.startTrialRank = gates.target;
        row.appendChild(btn);
      }
      list.appendChild(row);
    }
    if (!list.children.length) {
      const empty = document.createElement('div');
      empty.className = 'campaign-empty';
      empty.textContent = 'No active party members.';
      body.appendChild(empty);
    }
    const footer = document.createElement('div');
    const doneBtn = document.createElement('button');
    doneBtn.className = 'btn btn-primary';
    doneBtn.textContent = 'Done';
    footer.appendChild(doneBtn);
    const overlay = UI().openModal({ title: 'Apply for Rank-Up', content: body, footer, width: '520px' });
    doneBtn.onclick = () => UI().closeModal(overlay);
    body.addEventListener('click', (event) => {
      const btn = event.target?.closest?.('[data-start-trial-for]');
      if (!btn) return;
      const memberId = btn.dataset.startTrialFor;
      const toRank = btn.dataset.startTrialRank;
      Ops().apply([
        { op: 'start_rank_trial', target: memberId },
        { op: 'rank_up_member', target: memberId, toRank, source: 'guild_apply' }
      ], { source: 'ui' });
      UI().closeModal(overlay);
    });
  }

  function _rankUpPassiveConfirm(memberId, passiveId) {
    const member = CS().getState()?.party?.[memberId];
    const passive = DS().get('passives', passiveId);
    if (!member || !passive) return;
    const info = _passiveRankInfo(memberId, passiveId, passive);
    if (info.isMax) {
      UI().toast('Passive is already at max rank.', 'info');
      return;
    }
    const costText = _passiveRankCostText(passive, info.rank) || 'rank material';
    UI().confirm(`Rank up ${passive.name || passiveId} to Rank ${info.rank + 1}? Consumes ${costText}.`, () => {
      Ops().apply({ op: 'rank_up_passive', target: memberId, passiveId }, { source: 'ui' });
    });
  }

  // Open a modal listing every level perk on the skill, marking earned vs.
  // upcoming. Used by the "Detail" button on each known-skill row.
  function _showSkillDetailModal(memberId, skillId) {
    const member = CS().getState()?.party?.[memberId];
    const skill = DS().get('skills', skillId);
    if (!skill) { UI().toast('Skill not found', 'error'); return; }
    const F = window.CJS.Formulas;
    const prog = member?.skillProgress?.[skillId] || { ap: 0, level: 1 };
    const cap = F?.getSkillMaxLevel ? F.getSkillMaxLevel(skill) : 5;
    const level = Math.max(1, Number(prog.level || 1));
    const ap = Number(prog.ap || 0);
    const apToNext = F?.calcSkillApToNextLevel ? F.calcSkillApToNextLevel(skill, ap, level) : null;

    const body = document.createElement('div');
    body.innerHTML = `
      <div style="margin-bottom:12px">
        <div><b>${_icon(skill, { kind: 'skill', size: 'sm' })} ${_esc(skill.name || skillId)}</b></div>
        <div class="campaign-muted">${_esc(skill.description || '')}</div>
        <div style="margin-top:6px">
          ${_esc(_skillMeta(skill, { level }))}
          | <b>Lv ${level}/${cap}</b>
          | AbP ${ap}${apToNext != null ? ` (${apToNext} to next)` : ' (max)'}
        </div>
      </div>
      <div class="campaign-section-title">Level Perks</div>
      <div id="skl-detail-perks"></div>
    `;
    const perksArea = body.querySelector('#skl-detail-perks');
    const perks = Array.isArray(skill.levelPerks) ? [...skill.levelPerks].sort((a, b) => a.level - b.level) : [];
    if (!perks.length) {
      perksArea.innerHTML = '<div class="campaign-empty">No authored perks. (Power scales with level via levelScaling.powerPerLevel.)</div>';
    } else {
      perksArea.innerHTML = perks.map((perk) => {
        const earned = Number(perk.level || 0) <= level;
        const tag = earned ? '<span style="color:var(--green)">✔ earned</span>' : `<span class="campaign-muted">unlocks at Lv ${perk.level}</span>`;
        const mods = perk.modifiers
          ? Object.entries(perk.modifiers).filter(([, v]) => v).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(', ')
          : '';
        const addEff = (perk.addEffects || []).map((e) => e.effectId).filter(Boolean).join(', ');
        return `
          <div class="campaign-record-line" style="opacity:${earned ? 1 : 0.6}">
            <div>
              <strong>Lv ${perk.level}</strong>
              <small>${tag}</small>
              <p>${_esc(perk.description || '')}</p>
              ${mods ? `<div class="campaign-muted" style="font-size:0.8em">Modifiers: ${_esc(mods)}</div>` : ''}
              ${addEff ? `<div class="campaign-muted" style="font-size:0.8em">Adds effects: ${_esc(addEff)}</div>` : ''}
            </div>
          </div>`;
      }).join('');
    }

    UI().openModal({
      title: `Skill Detail: ${skill.name || skillId}`,
      content: body,
      width: '600px'
    });
  }

  // Show the full job tree for a member: every job grouped by branch, each
  // marked unlocked / current / locked, with per-level perks visible.
  function _showJobTreeModal(memberId) {
    const member = CS().getState()?.party?.[memberId];
    if (!member) return;
    const F = window.CJS.Formulas;
    const allJobs = DS().getAllAsArray('jobs') || [];
    const jobsCollection = DS().getAll('jobs') || {};

    // Group: branches the member can access, plus an "other" group for any
    // jobs they've unlocked outside their authored branches.
    const memberBranches = new Set(member.availableBranches || []);
    const memberAllow = new Set(member.baseAvailableJobs || []);
    const groups = {};

    for (const job of allJobs) {
      const branch = job.branch || 'other';
      const inScope = memberBranches.has(branch) || memberAllow.has(job.id) || (member.unlockedJobs || []).includes(job.id);
      if (!inScope) continue;
      groups[branch] = groups[branch] || [];
      groups[branch].push(job);
    }
    for (const list of Object.values(groups)) {
      list.sort((a, b) => Number(a.tier || 1) - Number(b.tier || 1));
    }

    const body = document.createElement('div');
    const slotInfo = `Slots used: ${(member.unlockedJobs || []).length} / ${member.maxJobs || 3}`;
    body.innerHTML = `
      <div style="margin-bottom:8px" class="campaign-muted">
        ${_esc(member.name || memberId)} — ${slotInfo}
        ${member.currentJob ? ` — Current: <b>${_esc(_jobLabel(member.currentJob))}</b>` : ' — No active job'}
      </div>
      <div id="job-tree-area"></div>
    `;
    const area = body.querySelector('#job-tree-area');

    if (!Object.keys(groups).length) {
      area.innerHTML = '<div class="campaign-empty">No job branches authored on this character. Add availableBranches or availableJobs in the editor.</div>';
    } else {
      area.innerHTML = Object.entries(groups).map(([branch, list]) =>
        _renderBranchColumn(memberId, member, branch, list, jobsCollection, F)
      ).join('');
    }

    UI().openModal({
      title: `Job Tree: ${member.name || memberId}`,
      content: body,
      width: '780px'
    });
  }

  function _renderBranchColumn(memberId, member, branchId, jobs, jobsCollection, F) {
    const header = `<div class="campaign-section-title" style="margin-top:8px">${_esc(branchId)} branch</div>`;
    const cards = jobs.map((job) => {
      const unlocked = (member.unlockedJobs || []).includes(job.id);
      const isCurrent = member.currentJob === job.id;
      const prog = member.jobProgress?.[job.id] || { xp: 0, level: 1 };
      const cap = F?.getJobMaxLevel ? F.getJobMaxLevel(job) : 5;
      const level = Math.max(1, Number(prog.level || 1));
      const xp = Number(prog.xp || 0);
      const xpToNext = F?.calcJobXpToNextLevel ? F.calcJobXpToNextLevel(job, xp, level) : null;
      const xpMeta = level >= cap
        ? `Lv ${level}/${cap} (max)`
        : (xpToNext != null ? `Lv ${level}/${cap} | XP ${xp} (${xpToNext} to next)` : `Lv ${level}/${cap}`);

      const eligibility = F?.canUnlockJob
        ? F.canUnlockJob(job, member, jobsCollection)
        : { ok: true };

      let statusBadge = '';
      let actionBtn = '';
      if (isCurrent) {
        statusBadge = '<span style="color:var(--green)">● ACTIVE</span>';
      } else if (unlocked) {
        statusBadge = '<span style="color:var(--accent)">● UNLOCKED</span>';
        actionBtn = `<button class="campaign-action" data-campaign-action="switch-job-from-tree" data-id="${_escAttr(memberId)}" data-job-id="${_escAttr(job.id)}">Switch to this job</button>`;
      } else if (eligibility.ok) {
        statusBadge = '<span class="campaign-muted">○ available</span>';
        actionBtn = `<button class="campaign-action" data-campaign-action="unlock-job-from-tree" data-id="${_escAttr(memberId)}" data-job-id="${_escAttr(job.id)}">Unlock & switch</button>`;
      } else {
        const reasonText = _eligibilityReason(eligibility, job);
        statusBadge = `<span class="campaign-muted">🔒 ${_esc(reasonText)}</span>`;
      }

      const levels = Array.isArray(job.levels) ? [...job.levels].sort((a, b) => Number(a.level) - Number(b.level)) : [];
      const levelLines = levels.map((tier) => {
        const earned = unlocked && Number(tier.level || 0) <= level;
        const star = earned ? '★' : '☆';
        const stat = tier.statBonus
          ? Object.entries(tier.statBonus).filter(([, v]) => v).map(([k, v]) => `${k}+${v}`).join(' ')
          : '';
        const skills = (tier.grantsSkills || []).join(', ');
        const passives = (tier.grantsPassives || []).join(', ');
        const desc = tier.description || [stat, skills && `learn ${skills}`, passives && `passive ${passives}`].filter(Boolean).join(' · ');
        return `<div style="opacity:${earned ? 1 : 0.65};font-size:0.85em">${star} <b>Lv ${tier.level}</b> — ${_esc(desc || '...')}</div>`;
      }).join('');

      return `
        <div class="campaign-record-line" style="margin-bottom:8px">
          <div>
            <strong>${_icon(job, { kind: 'job', size: 'sm' })} ${_esc(job.name || job.id)} <small style="color:var(--text-mute)">tier ${job.tier || 1}</small></strong>
            <small>${statusBadge} | ${_esc(xpMeta)}</small>
            <p>${_esc(job.description || '')}</p>
            <div style="margin-top:4px">${levelLines || '<i class="campaign-muted">No level data authored.</i>'}</div>
          </div>
          ${actionBtn ? `<div>${actionBtn}</div>` : ''}
        </div>`;
    }).join('');
    return header + cards;
  }

  function _eligibilityReason(eligibility, job) {
    if (!eligibility) return 'unknown';
    if (eligibility.reason === 'max_jobs_reached') return 'job slots full';
    if (eligibility.reason === 'branch_not_available') return 'branch not allowed for this character';
    if (eligibility.reason === 'prereq_not_unlocked') return `requires ${job.unlockRequirement?.jobId}`;
    if (eligibility.reason === 'prereq_level_low') return `requires ${job.unlockRequirement?.jobId} Lv ${eligibility.need || job.unlockRequirement?.minLevel}`;
    if (eligibility.reason === 'prereq_job_missing') return 'prereq job missing in DataStore';
    return eligibility.reason || 'locked';
  }

  function _confirmUnlockJob(memberId, jobId) {
    const member = CS().getState()?.party?.[memberId];
    const job = DS().get('jobs', jobId);
    if (!member || !job) return;
    const slots = (member.unlockedJobs || []).length;
    UI().confirm(
      `Unlock ${job.name || jobId} for ${member.name || memberId}? (${slots + 1}/${member.maxJobs || 3} slots will be used.)`,
      () => Ops().apply([
        { op: 'unlock_job', target: memberId, jobId },
        { op: 'set_job', target: memberId, jobId }
      ], { source: 'ui' })
    );
  }

  function _switchJob(memberId, jobId) {
    const job = DS().get('jobs', jobId);
    if (!job) return;
    Ops().apply({ op: 'set_job', target: memberId, jobId }, { source: 'ui' });
  }

  function _jobLabel(jobId) {
    const job = DS().get('jobs', jobId);
    return job ? `${job.icon || '🛡️'} ${job.name || jobId}` : jobId;
  }

  function _partyAvailabilityModal(id) {
    const member = CS().getState()?.party?.[id];
    if (!member) return;
    const body = document.createElement('div');
    body.appendChild(_formLabel('Status'));
    const status = UI().createSelect({
      options: [
        { value: 'available', label: 'Available' },
        { value: 'unavailable', label: 'Unavailable' },
        { value: 'busy', label: 'Busy' },
        { value: 'injured', label: 'Injured' },
        { value: 'story_locked', label: 'Story Locked' }
      ],
      value: member.availability?.status || 'available'
    });
    body.appendChild(status);
    body.appendChild(_formLabel('Reason'));
    const reason = document.createElement('input');
    reason.type = 'text';
    reason.style.width = '100%';
    reason.placeholder = 'guarding the sled, recovering, story split...';
    reason.value = member.availability?.reason || '';
    body.appendChild(reason);
    body.appendChild(_formLabel('Expires'));
    const expires = UI().createSelect({
      options: [
        { value: '', label: 'Manual' },
        { value: 'scenario', label: 'Scenario' },
        { value: 'phase', label: 'Phase' },
        { value: 'battle', label: 'Battle' }
      ],
      value: member.availability?.expires || ''
    });
    body.appendChild(expires);
    _formModal({
      title: `Availability: ${member.name || id}`,
      body,
      primaryLabel: 'Save',
      onSubmit: () => {
        if (status.value === 'available') {
          Ops().apply({ op: 'clear_party_availability', target: id }, { source: 'ui' });
        } else {
          Ops().apply({
            op: 'set_party_availability',
            target: id,
            status: status.value,
            reason: reason.value.trim(),
            expires: expires.value || null,
            source: 'manual'
          }, { source: 'ui' });
        }
      }
    });
  }

  function _travelWorld() {
    _goto('world', 'worldGate');
    return;
    const options = _worldOptions().filter((opt) => opt.value !== CS().getState().currentWorld);
    if (!options.length) {
      UI().toast('No other worlds available', 'info');
      return;
    }
    _opPickerModal({
      title: 'Travel to World',
      options,
      placeholder: 'Search worlds…',
      primaryLabel: 'Travel',
      onSubmit: ({ value }) => {
        // Hard rank gate: refuse outright if requiredRank is unmet. Soft gate:
        // warn before continuing. Ceiling: inform if it caps the party.
        const gate = _evaluateTravelRankGate(value);
        if (!gate.allowed) {
          UI().toast(gate.message, 'warn');
          return;
        }
        const proceed = () => {
          const meaningful = _hasMeaningfulPersonaChoice(value);
          if (meaningful) {
            _openPreTravelPersonaPicker(value);
          } else {
            Ops().apply({ op: 'world_transition', toWorld: value, carryoverProfile: 'carryover_new_world_default' }, { source: 'ui' });
          }
        };
        if (gate.softWarning) {
          const ok = window.confirm(gate.softWarning + '\n\nTravel anyway?');
          if (!ok) return;
        }
        proceed();
      }
    });
  }

  function _travelWorldCard(worldId, targetTab = null) {
    if (!worldId) return;
    if (worldId === CS().getState()?.currentWorld) {
      const tab = targetTab || _worldMenuDef(worldId).defaultTab || 'worldGate';
      return _goto(_modeForTab(tab), tab);
    }
    const gate = _evaluateTravelRankGate(worldId);
    if (!gate.allowed) {
      UI().toast(gate.message, 'warn');
      return;
    }
    const proceed = () => {
      const tab = targetTab || _worldMenuDef(worldId).defaultTab || 'storyHome';
      if (_hasMeaningfulPersonaChoice(worldId)) {
        _openPreTravelPersonaPicker(worldId, tab);
      } else {
        _completeWorldTravel(worldId, tab);
      }
    };
    if (gate.softWarning) {
      const ok = window.confirm(gate.softWarning + '\n\nTravel anyway?');
      if (!ok) return;
    }
    proceed();
  }

  function _completeWorldTravel(worldId, targetTab = null, preOps = []) {
    const tab = targetTab || _worldMenuDef(worldId).defaultTab || 'storyHome';
    const ops = [
      ...preOps,
      { op: 'world_transition', toWorld: worldId, carryoverProfile: 'carryover_new_world_default' }
    ];
    const landing = _defaultTravelLanding(worldId);
    if (landing) ops.push(landing);
    Ops().apply(ops, { source: 'world_gate' });
    const finish = () => {
      _activeMode = _modeForTab(tab);
      _activeTab = tab;
      UI()?.toast?.(`Loaded ${DS().get('worlds', worldId)?.displayName || worldId}.`, 'success');
      render();
    };
    const load = window.CJS.CampaignSequences?.loadWorld?.(worldId);
    if (load && typeof load.then === 'function') load.then(finish).catch((error) => {
      console.warn('World story load failed:', error);
      finish();
    });
    else finish();
  }

  function _defaultTravelLanding(worldId) {
    const existing = CS().getState()?.worldProgress?.[worldId];
    if (existing?.currentLocation && existing?.currentTravelMap) return null;
    const map = DS().getAllAsArray('travelMaps').find((entry) => entry.world === worldId);
    if (!map?.defaultLocationId) return null;
    const node = (map.nodes || []).find((entry) => entry.id === map.defaultLocationId) || {};
    return {
      op: 'travel_location',
      world: worldId,
      mapId: map.id,
      locationId: map.defaultLocationId,
      title: node.name || map.defaultLocationId,
      zone: node.zone || map.zone,
      hubId: node.hubId || map.hubId
    };
  }

  // Build a travel decision for a destination world by looking up its
  // requiredRank (hard), recommendedRank (soft), and ceiling. Hard gate
  // returns allowed=false with a toast message; soft gate sets
  // softWarning so we can confirm before proceeding.
  function _evaluateTravelRankGate(toWorld) {
    const F = window.CJS.Formulas;
    const dest = DS().get('worlds', toWorld) || {};
    const state = CS().getState() || {};
    const active = Object.values(state.party || {})
      .filter((m) => (m.rosterRole || 'active') !== 'bench');
    const topRank = active.reduce((best, m) => {
      const r = m.adventurer?.rank || m.rank || 'F';
      if (!best) return r;
      return F?.rankIndex?.(r) > F?.rankIndex?.(best) ? r : best;
    }, null);

    if (dest.requiredRank && !F?.meetsRank?.(topRank, dest.requiredRank)) {
      return {
        allowed: false,
        message: `${dest.displayName || toWorld} requires rank ${dest.requiredRank}. Party top: ${topRank || 'F'}.`
      };
    }
    const warnings = [];
    if (dest.recommendedRank && !F?.meetsRank?.(topRank, dest.recommendedRank)) {
      warnings.push(`Underranked: ${dest.displayName || toWorld} recommends ${dest.recommendedRank} (party top: ${topRank || 'F'}). Monsters will spawn tougher.`);
    }
    if (dest.ceiling && F?.rankIndex?.(topRank) > F?.rankIndex?.(dest.ceiling)) {
      warnings.push(`This world caps ranks at ${dest.ceiling}. Higher-rank members are treated as ${dest.ceiling} here; RP rewards taper out.`);
    }
    return {
      allowed: true,
      softWarning: warnings.length ? warnings.join('\n\n') : null
    };
  }

  function _hasMeaningfulPersonaChoice(targetWorld) {
    const PS = window.CJS.PersonaService;
    if (!PS) return false;
    const state = CS().getState();
    if (!state?.party) return false;
    for (const [id, member] of Object.entries(state.party)) {
      const charId = member.baseCharacterId || id;
      const choices = PS.personasForCharacterInWorld(charId, targetWorld);
      if (!choices.length) continue;
      // Meaningful = at least two unlocked-or-default personas for that world,
      // OR exactly one persona that is NOT the currently active one.
      const unlocked = new Set(member.unlockedPersonas || []);
      const eligible = choices.filter((p) => unlocked.has(p.id) || p.unlock?.default);
      if (eligible.length >= 2) return true;
      if (eligible.length === 1 && eligible[0].id !== member.activePersona) return true;
    }
    return false;
  }

  function _openPreTravelPersonaPicker(targetWorld, targetTab = null) {
    const PS = window.CJS.PersonaService;
    const state = CS().getState();
    const worldName = DS().get('worlds', targetWorld)?.displayName || targetWorld;
    const body = document.createElement('div');
    body.innerHTML = `<div class="hint-box hint-info" style="margin-bottom:10px">
      Heading to <b>${_esc(worldName)}</b>. Pick a persona for each member who has one — out-of-world personas keep their loadout but pay penalties in combat and with the locals. Unset members will auto-switch on arrival.
    </div>`;
    const choicesArea = document.createElement('div');
    choicesArea.style.display = 'grid';
    choicesArea.style.gridTemplateColumns = '1fr';
    choicesArea.style.gap = '10px';
    body.appendChild(choicesArea);

    const memberChoices = new Map();
    for (const [id, member] of Object.entries(state.party || {})) {
      const charId = member.baseCharacterId || id;
      const choices = PS ? PS.personasForCharacterInWorld(charId, targetWorld) : [];
      const otherWorlds = PS ? PS.personasForCharacter(charId).filter((p) => p.world !== targetWorld) : [];
      if (!choices.length && !otherWorlds.length) continue;
      const unlocked = new Set(member.unlockedPersonas || []);
      const eligibleWorld = choices.filter((p) => unlocked.has(p.id) || p.unlock?.default);
      const eligibleOther = otherWorlds.filter((p) => unlocked.has(p.id));

      const options = [
        { value: '__keep__', label: '— Keep current persona (out-of-world penalty if any) —' },
        ...eligibleWorld.map((p) => ({
          value: p.id,
          label: `${p.icon || '🎭'} ${p.name} ${p.id === member.activePersona ? '(current)' : ''}`
        })),
        ...(eligibleOther.length ? [{ value: '__hr__', label: '── Out-of-world (penalty applies) ──', disabled: true }] : []),
        ...eligibleOther.map((p) => ({
          value: p.id,
          label: `${p.icon || '🎭'} ${p.name} — ${p.world} (penalty)`
        }))
      ];

      const sel = UI().createSelect({
        options,
        value: eligibleWorld.find((p) => p.id === member.activePersona)?.id || (eligibleWorld[0]?.id || '__keep__')
      });

      const card = document.createElement('div');
      card.style.padding = '10px';
      card.style.border = '1px solid rgba(255,255,255,0.1)';
      card.style.borderRadius = '8px';
      card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <b>${_esc(member.name || id)}</b>
          <span class="campaign-muted" style="font-size:0.78rem">${_esc(charId)}</span>
        </div>`;
      const label = document.createElement('div');
      label.innerHTML = '<div class="form-label" style="font-size:0.78rem">Persona for ' + _esc(worldName) + '</div>';
      card.appendChild(label);
      card.appendChild(sel);
      choicesArea.appendChild(card);
      memberChoices.set(id, sel);
    }

    if (!memberChoices.size) {
      // Nothing meaningful after all — skip the modal.
      _completeWorldTravel(targetWorld, targetTab || _worldMenuDef(targetWorld).defaultTab);
      return;
    }

    _formModal({
      title: `Travel: → ${worldName}`,
      body,
      primaryLabel: 'Travel',
      onSubmit: () => {
        // Apply the persona picks BEFORE transition so the autoSwitch step in
        // world_transition doesn't overwrite the player's chosen personas.
        const ops = [];
        for (const [id, sel] of memberChoices) {
          const value = sel.value;
          if (!value || value === '__keep__' || value === '__hr__') continue;
          ops.push({ op: 'unlock_persona', target: id, personaId: value });
          ops.push({ op: 'set_persona', target: id, personaId: value });
        }
        _completeWorldTravel(targetWorld, targetTab || _worldMenuDef(targetWorld).defaultTab, ops);
      }
    });
  }

  function _campRestModal() {
    const options = _tentOptions();
    const body = document.createElement('div');
    body.appendChild(_formLabel('Consume Item (optional)'));
    const select = UI().createSearchableSelect({
      options: [{ value: '', label: '— None (no item consumed) —' }, ...options],
      value: options.find((opt) => opt.value === 'haven_basic_tent') ? 'haven_basic_tent' : '',
      placeholder: 'Search items…'
    });
    body.appendChild(select);
    body.appendChild(_formLabel('Danger change'));
    const danger = UI().createNumberSlider({ value: 1, min: -3, max: 5, step: 1 });
    body.appendChild(danger);
    _formModal({
      title: 'Camp Rest',
      body,
      primaryLabel: 'Camp',
      onSubmit: () => {
        const consumeItem = select._getValue() || null;
        const op = { op: 'camp_rest', dangerChange: danger._getValue() || 0 };
        if (consumeItem) op.consumeItem = consumeItem;
        Ops().apply(op, { source: 'ui' });
      }
    });
  }

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

  function _opsModal(title, ops, onApply) {
    const body = document.createElement('div');
    body.innerHTML = `<textarea id="ops-json" style="min-height:220px;font-family:monospace">${_esc(JSON.stringify(ops, null, 2))}</textarea>`;
    const footer = document.createElement('div');
    footer.innerHTML = '<button class="btn btn-primary">Apply</button>';
    const overlay = UI().openModal({ title, content: body, footer, width: '680px' });
    footer.querySelector('button').onclick = () => {
      try {
        onApply(JSON.parse(body.querySelector('#ops-json').value || '[]'));
        UI().closeModal(overlay);
      } catch (error) {
        UI().toast(error.message || 'Invalid JSON', 'error');
      }
    };
  }

  function _exportLog() {
    const state = CS().getState();
    const text = (state.log || []).map((line) => `[${line.at}] [${_logKind(line).label}] Phase ${line.phase} ${line.world}: ${line.text}`).join('\n');
    window.CJS.SaveManager.downloadTextFile(`${_safe(state.slotName)}-log.txt`, `${text}\n`, 'text/plain');
  }

  function _clearLog() {
    UI().confirm('Clear the session log?', () => {
      CS().mutate((state) => { state.log = []; }, { source: 'clear_log' });
      UI().toast('Log cleared', 'info');
    });
  }

  function _exportEventLog() {
    const state = CS().getState();
    const entries = state.eventLog?.entries || [];
    const text = entries.map((entry) => [
      `[${entry.at || ''}] Phase ${entry.phase || '?'} ${entry.world || ''}`,
      entry.title || 'Event',
      entry.summary || '',
      entry.tags?.length ? `Tags: ${entry.tags.join(', ')}` : '',
      entry.consequences?.length ? `Consequences: ${entry.consequences.join('; ')}` : ''
    ].filter(Boolean).join('\n')).join('\n\n');
    window.CJS.SaveManager.downloadTextFile(`${_safe(state.slotName)}-event-log.txt`, `${text}\n`, 'text/plain');
  }

  function _clearEventLog() {
    UI().confirm('Clear the event log?', () => {
      CS().mutate((state) => {
        state.eventLog = state.eventLog || {};
        state.eventLog.entries = [];
      }, { source: 'clear_event_log' });
      UI().toast('Event log cleared', 'info');
    });
  }

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
  // live in js/campaign/ui/cui-equipment.js (bound as aliases at the top).

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
  // js/campaign/ui/cui-modals.js (bound as aliases at the top of this IIFE).

  // _bucketOptions, _statusOptions, _seedOptions, _worldOptions, _tentOptions
  // live in js/campaign/ui/cui-options.js (bound as aliases at the top of this IIFE).

  // _opPickerModal, _textareaModal, _numberModal live in
  // js/campaign/ui/cui-modals.js (bound as aliases at the top of this IIFE).

  // Leaf utilities (_esc, _escAttr, _label, _safe, _truncate, _lootLine,
  // _currencyLabel, _recordName, _formatBundleText) live in
  // js/campaign/ui/cui-utils.js and are bound as aliases at the top of
  // this IIFE.

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

  // Bridge entry for React tabs that wrap a closure-private vanilla
  // renderer (worldGate, storyHome, questHome, eventHome, eventLog,
  // storyDirector, scenarios, maps, quests, minigameTest, overview).
  // Returns the HTML body string the matching _render* would produce
  // when the shell renders that tab through the switch case below.
  function renderTabBody(tabId, state = CS().getState()) {
    if (!state) return '';
    switch (tabId) {
      case 'storyDirector': return _renderStoryDirector(state);
      default: return '';
    }
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
  // components map directly into JSX — no HTML strings. The legacy
  // vanilla render() path uses `_renderHeader`/`_renderModeBar`/…
  // directly and never calls this.
  function getChromeData(state = CS().getState()) {
    if (!state) return null;
    const campaign = CS().getCurrentCampaign();
    const world = CS().getCurrentWorld();
    const isUtility = APP_UTILITY_TABS.some(([id]) => id === _activeTab);
    const subTabsRaw = isUtility ? APP_UTILITY_TABS : _tabsForMode(_activeMode, state);
    return {
      activeMode: _activeMode,
      activeTab: _activeTab,
      activePanel: _activePanel,
      isUtility,
      header: _chromeHeaderData(state, campaign, world),
      modeBar: _chromeModeBarData(state, isUtility),
      subTabs: subTabsRaw.map(([id, label]) => ({ id, label })),
      recentLog: _chromeRecentLogData(state),
      commandRail: _chromeCommandRailData(state)
    };
  }

  function _chromeHeaderData(state, campaign, world) {
    const phase = state.phase || { number: 1, type: 'unknown', name: '' };
    const WE = window.CJS.CampaignWorldEvents;
    const events = WE?.getActive ? WE.getActive() : [];
    return {
      campaignName: campaign?.name || 'Campaign',
      worldName: world?.displayName || state.currentWorld || '',
      chapter: state.storyMode?.currentChapterLabel || state.currentChapter || 1,
      phaseNumber: phase.number,
      phaseLabel: phase.name || phase.type,
      worldEvents: events.map((ev) => ({
        id: ev.id,
        name: ev.name || ev.id,
        icon: ev.icon || '✨',
        summary: ev.summary || '',
        category: ev.category || 'boon',
        remainingPhases: ev.remainingPhases
      })),
      currencies: _currencyAmounts(state)
    };
  }

  function _chromeModeBarData(state, isUtility) {
    const modes = _appModesForState(state).map(([id, label, icon]) => ({ id, label, icon }));
    const utilityTabs = APP_UTILITY_TABS.map(([id, label]) => ({ id, label }));
    return {
      modes,
      activeMode: isUtility ? null : _activeMode,
      utilityTabs,
      activeTab: _activeTab,
      scenarioHud: _chromeScenarioHudData(state)
    };
  }

  function _chromeScenarioHudData(state) {
    const run = state.activeScenarioRun;
    if (!run) return null;
    const scenario = CS().getScenarioById(run.scenarioId);
    return {
      scenarioName: scenario?.name || run.scenarioId,
      danger: run.danger,
      dangerMax: run.dangerMax,
      campsUsed: run.usedCampRests,
      campsMax: run.limits?.campRests ?? 0,
      battlesUsed: run.randomBattlesUsed,
      battlesMax: run.limits?.randomBattles ?? 0,
      generated: !!scenario?.generated
    };
  }

  function _chromeRecentLogData(state) {
    const entries = (state.log || []).slice(0, 3).map((line) => ({
      kind: _CUILog.logKind(line),
      text: line.text || '',
      meta: _CUILog.logMeta(line, true)
    }));
    return {
      entries,
      hasLog: (state.log || []).length > 0
    };
  }

  function _chromeCommandRailData(state) {
    const panelDefs = _panelDefsForState(state);
    const activeQuests = Object.values(state.quests || {}).filter((q) => q.status === 'active').length;
    const logCount = (state.log || []).length;
    const notesCount = (state.pinnedNotes || []).length;
    const inventoryCount = ['items', 'materials', 'food', 'questItems']
      .reduce((sum, b) => sum + Object.values(state.inventory?.[b] || {}).filter((q) => q > 0).length, 0);
    const partyCount = Object.keys(state.party || {}).length;
    const counts = {
      party: partyCount,
      inventory: inventoryCount,
      quests: activeQuests,
      log: logCount,
      notes: notesCount
    };
    const panels = RAIL_ORDER.filter((id) => panelDefs[id]).map((id) => {
      const def = panelDefs[id];
      return {
        id,
        icon: def.icon,
        label: def.label,
        title: def.title,
        count: counts[id] || 0
      };
    });
    return {
      panels,
      activePanel: _activePanel,
      currency: _currencyAmounts(state)
    };
  }

  // ── Typed tab data for Phase F per-tab ports ───────────────────────
  // Each `get<Tab>Data` returns a JSON-friendly snapshot the matching
  // React component reads. Heavy / shared sub-panels that still render
  // through other tabs (e.g. _renderEventResult, _renderOracle) stay as
  // HTML-string bridges until those tabs migrate.

  function getEventLogData(state = CS().getState()) {
    if (!state) return null;
    const entries = (state.eventLog?.entries || []).map((entry) => ({
      title: entry.title || 'Event',
      summary: entry.summary || '',
      scopeLabel: _label(entry.scope || entry.source || 'event'),
      phase: entry.phase || null,
      at: entry.at ? _formatLogTime(entry.at) : '',
      consequences: Array.isArray(entry.consequences) ? entry.consequences.slice(0) : [],
      tags: Array.isArray(entry.tags) ? entry.tags.slice(0, 8).map((tag) => _label(tag)) : []
    }));
    const rawEntries = state.eventLog?.entries || [];
    const oracleCount = rawEntries.filter((entry) => String(entry.source || '').includes('oracle') || (entry.tags || []).includes('oracle')).length;
    const manualCount = rawEntries.filter((entry) => String(entry.source || '').includes('manual') || (entry.tags || []).includes('manual_event')).length;
    return {
      entries,
      totalCount: rawEntries.length,
      oracleCount,
      manualCount,
      heroBackdropUrl: _worldHomeBackdropUrl()
    };
  }

  // Returns just the resolved backdrop URL (or null) the React hero uses
  // for its CSS custom property. The vanilla _worldHomeHeroStyle wraps
  // this in `style="..."`; JSX needs only the URL.
  function _worldHomeBackdropUrl() {
    const world = CS().getCurrentWorld?.() || {};
    const theme = world.storyModeTheme || {};
    const backdrop = theme.homeBackdrop || theme.bannerImage || theme.backdrop || '';
    if (!backdrop) return null;
    return _cssVarAssetUrl(backdrop);
  }

  // HTML-string sub-panel bridges. Shared with the event{Character,
  // Special,Side} tabs that haven't migrated yet. When those tabs port,
  // these get replaced with typed getEventResultData / getOracleData
  // and JSX renderers.
  function renderEventResultHtml(state = CS().getState()) {
    if (!state) return '';
    return _renderEventResult(state);
  }

  function renderOracleHtml(state = CS().getState()) {
    if (!state) return '';
    return _renderOracle(state);
  }

  // Quest Home (non-zombie). The hero / quest-types panel / quest-run
  // tools render in JSX from this typed snapshot; the active-quest
  // cards and the optional active-sequence panel still go through
  // HTML bridges (renderQuestRowHtml, renderActiveSequenceHtml).
  function getWorldGateData(state = CS().getState()) {
    if (!state) return null;
    const worlds = CS().getContent().worlds || {};
    const options = _worldOptions();
    const current = state.currentWorld || 'haven';
    return {
      currentWorldName: worlds[current]?.displayName || current,
      pressureStripHtml: _renderPressureStripMini(state) || '',
      cards: options.map((option) => ({
        worldId: option.value,
        cardHtml: _renderWorldGateCard(option.value, worlds[option.value] || {}, state)
      }))
    };
  }

  function getStoryHomeData(state = CS().getState()) {
    if (!state) return null;
    const theme = _storyTheme(state);
    const director = SD();
    const snap = director?.snapshot?.() || {};
    const pack = snap.pack || null;
    const stage = snap.stage || {};
    const Seq = window.CJS.CampaignSequences;
    const storyFiles = Seq?.list?.('story') || [];
    const activeSequence = Seq?.active?.(state);
    const storyParts = _storySummaryEntries(state);
    const manualCount = state.storyMode?.manualSummaryEntries?.length || 0;
    const defaultedCount = Object.keys(state.storyMode?.defaultedParts || {}).length;
    const activeRun = state.activeScenarioRun;
    const pipeline = _storyPipelineSnapshot(state);
    const next = {
      index: activeSequence?.scope === 'story' ? 1 : 0,
      title: activeSequence?.scope === 'story' ? 'Continue Current Story Part' : 'Choose a Chapter Part',
      text: activeSequence?.scope === 'story'
        ? 'The current story file is open below. Continue node by node, then complete it when the conclusion is reached.'
        : 'Start a story file when you are ready. Starting ahead should be treated as revealing earlier parts with the default path.',
      actions: [
        _actionBtn({ action: 'story-manual-note', label: 'Manual Note', hint: 'Add a GM-written scene to the story summary', kind: 'manual' }),
        _actionBtn({ action: 'open-story-summary', label: 'Summary', hint: 'Read what has happened so far' }),
        _actionBtn({ action: 'story-copy-prompt', label: 'Copy AI Context', hint: 'Copy static summaries, live GM notes, branches, and current route state for AI drafting', kind: 'manual' })
      ]
    };
    // CSS-vars derived from theme; React will set them as style props.
    const themeStyleVars = {};
    if (theme.backdrop) themeStyleVars['--story-backdrop'] = `url('${_cssVarAssetUrl(theme.backdrop)}')`;
    if (theme.accent) themeStyleVars['--story-accent'] = theme.accent;
    if (theme.danger) themeStyleVars['--story-danger'] = theme.danger;
    return {
      themeClassName: theme.className || '',
      themeStyleVars,
      chapterPartsCount: storyFiles.length,
      currentChapter: state.storyMode?.currentChapterLabel || state.currentChapter || 1,
      currentArc: {
        completed: storyParts.length,
        defaulted: defaultedCount,
        manualNotes: manualCount,
        phase: state.phase?.number || 1
      },
      hasActiveRun: !!activeRun,
      vnHeroHtml: _renderStoryVnHero({ state, pack, stage, next, theme }),
      activeSequenceHtml: _renderActiveSequence(state, ['story']) || '',
      chapterTreeHtml: _renderChapterTreePanel(state) || '',
      choiceConsequenceHtml: _renderChoiceConsequencePanel(state) || '',
      aiStoryContextHtml: _renderAiStoryContextPanel(state) || '',
      sequenceShelfHtml: _renderSequenceShelf('story', {
        wide: true,
        title: 'Chapter Files',
        note: 'Pick the chapter part to play. Branches are gated by the choice you made in the previous chapter, so unlocked branches will be marked. If you start ahead, prior parts are revealed with the default path.'
      }),
      storyPipelineHtml: _renderStoryPipelinePanel(pipeline) || '',
      syncSummaryHtml: _renderSyncSummaryPanel('After This Part Changes', pipeline.syncSummary, pipeline.syncTitle) || '',
      soloNoticeHtml: _renderSoloNotice(state) || '',
      scenarioSummaryHtml: activeRun ? (_renderScenarioSummary(state) || '') : '',
      pendingBattleHtml: _renderPendingBattle(state) || '',
      combatResultHtml: _renderCombatResult(state) || ''
    };
  }

  function getQuestPanelData(state = CS().getState()) {
    if (!state) return null;
    if (state.currentWorld === 'zombie') {
      return { isZombie: true, zombieHtml: _renderZombieScavengeTracker(state) };
    }
    const quests = Object.values(state.quests || {});
    const active = quests.filter((q) => !q.chainTemplateId && !_isQuestResolved(q));
    const finished = quests.filter((q) => !q.chainTemplateId && _isQuestResolved(q));
    const templateCount = Object.values(CS().getContent().campaignQuests || {})
      .reduce((sum, record) => sum + (record.templates?.length || 0), 0);
    return {
      isZombie: false,
      activeCount: active.length,
      finishedCount: finished.length,
      templateCount,
      activeQuestRows: active.map((quest) => _renderQuestRow(quest)),
      finishedQuestRows: finished.map((quest) => _renderQuestRow(quest, { resolved: true })),
      soloNoticeHtml: _renderSoloNotice(state) || ''
    };
  }

  function getRunData(state = CS().getState()) {
    if (!state) return null;
    const run = state.activeScenarioRun;
    if (!run) {
      return {
        hasRun: false,
        mode: null,
        scenarioName: '',
        scenarioNotes: '',
        questPillHtml: '',
        shapePillsHtml: '',
        run: null,
        freeform: null,
        linear: null,
        travelSurpriseHtml: '',
        pendingBattleHtml: '',
        combatResultHtml: '',
        lastCombatResultHtml: '',
        eventResultHtml: ''
      };
    }
    const mode = run.travelMode || (run.mapId ? 'node_map' : 'freeform');
    const scenario = CS().getActiveScenario();
    const shared = {
      hasRun: true,
      mode,
      scenarioName: scenario?.name || 'Run',
      scenarioNotes: scenario?.notes || '',
      questPillHtml: _runQuestPill(state, run, scenario) || '',
      shapePillsHtml: _renderShapePills(scenario || {}) || '',
      run: {
        danger: run.danger,
        dangerMax: run.dangerMax,
        campsUsed: run.usedCampRests,
        campsMax: run.limits?.campRests ?? 0,
        battlesUsed: run.randomBattlesUsed,
        battlesMax: run.limits?.randomBattles ?? 0,
        eventsUsed: run.eventsUsed,
        eventsMax: run.limits?.events ?? 0
      },
      travelSurpriseHtml: _renderTravelSurprise(state) || '',
      pendingBattleHtml: _renderPendingBattle(state) || '',
      combatResultHtml: _renderCombatResult(state) || '',
      lastCombatResultHtml: _renderLastCombatResult(state) || '',
      eventResultHtml: _renderEventResult(state) || ''
    };
    if (mode === 'freeform') {
      const setBattles = scenario?.setBattles || [];
      return {
        ...shared,
        freeform: {
          setBattles: setBattles.map((b) => ({
            id: b.id || b.battleSetId || b.encounterId || '',
            label: b.label || b.name || b.encounterId || b.battleSetId || '',
            sub: b.encounterId || b.battleSetId || ''
          }))
        },
        linear: null
      };
    }
    if (mode === 'linear') {
      const beats = scenario?.beats || [];
      const idx = run.currentBeatIndex ?? 0;
      return {
        ...shared,
        freeform: null,
        linear: {
          beats: beats.map((b, i) => ({
            id: String(b.id || ''),
            number: i + 1,
            label: b.label || b.id || '',
            kind: b.kind || '',
            iconChar: _beatIcon(b.kind),
            encounterId: b.encounterId || '',
            prompt: b.prompt || '',
            isCurrent: i === idx,
            isDone: i < idx
          })),
          currentIndex: idx,
          totalBeats: beats.length,
          allDone: idx >= beats.length
        }
      };
    }
    // node_map / grid_map render into #campaign-map-region via CampaignMap.render
    return { ...shared, freeform: null, linear: null };
  }

  function getScenariosData(state = CS().getState()) {
    if (!state) return null;
    const campaign = CS().getCurrentCampaign();
    const authored = (campaign?.scenarios || []).map((id) => CS().getContent().scenarios[id]).filter(Boolean);
    const generated = CS().getGeneratedScenarios
      ? CS().getGeneratedScenarios()
      : Object.values(state.sideContent?.generatedScenarios || {});
    const scenarios = [...generated, ...authored];
    const mapTypeOptions = Gen()?.options?.().mapSettings || Gen()?.options?.().mapTypes
      || ['any', 'urban', 'outdoor', 'forest', 'dungeon', 'cave', 'sewer', 'ruins', 'temple', 'house', 'tavern', 'castle', 'mountain', 'arena'];
    const activeRun = state.activeScenarioRun;
    return {
      hasActiveRun: !!activeRun,
      activeRunScenarioId: activeRun?.scenarioId || null,
      mapTypeOptions: mapTypeOptions.map((id) => ({ id, label: _label(id) })),
      sizeOptions: [
        { id: 'tiny', label: 'Tiny' },
        { id: 'small', label: 'Small' },
        { id: 'medium', label: 'Medium' },
        { id: 'large', label: 'Large' },
        { id: 'huge', label: 'Huge' },
        { id: 'massive', label: 'Massive' }
      ],
      scenarios: scenarios.map((scenario) => ({
        id: String(scenario.id || ''),
        name: scenario.name || scenario.id || '',
        notes: scenario.notes || '',
        generated: !!scenario.generated,
        pillLabel: scenario.generated
          ? `generated | ${scenario.source?.kind || 'random'}`
          : (scenario.type || 'scenario'),
        questPillHtml: _scenarioQuestPill(scenario, state) || '',
        shapePillsHtml: _renderShapePills(scenario) || '',
        runActionsHtml: _renderScenarioRunActions(scenario, state)
      }))
    };
  }

  function getEventTabData(kind, state = CS().getState()) {
    if (!state) return null;
    const Seq = window.CJS.CampaignSequences;
    const entries = (Seq?.list?.('event') || []).filter((entry) => _eventFileKind(entry) === kind);
    const labels = {
      character: {
        kicker: 'Character Event',
        title: 'Relationship / Persona Scenes',
        text: 'Focused authored scenes for party members, dialogue, relationship flags, and small consequences.',
        empty: 'No character events loaded yet.'
      },
      special: {
        kicker: 'Special Event',
        title: 'Limited or Plot-Timed',
        text: 'Rank-up, holiday, unlock, or story-progression events with proper authored flow.',
        empty: 'No special events loaded yet.'
      },
      side: {
        kicker: 'Side Stories',
        title: 'Optional Story Content',
        text: 'Side-story files and existing side-story chains. Battles and map runs should be attached through Quest.',
        empty: 'No side stories loaded yet.'
      }
    };
    const info = labels[kind] || labels.character;
    const activeChains = kind === 'side' ? (window.CJS.CampaignQuestChains?.getActive?.() || []) : [];
    const availableChains = kind === 'side' ? (window.CJS.CampaignQuestChains?.getAvailable?.() || []) : [];
    return {
      kind,
      kicker: info.kicker,
      title: info.title,
      text: info.text,
      empty: info.empty,
      meta: kind === 'side'
        ? [`${entries.length} files`, `${activeChains.length} active`, `${availableChains.length} available`]
        : [`${entries.length} files`, 'authored flow', 'event log ready'],
      entryCount: entries.length,
      entries: entries.map((entry) => ({
        id: String(entry.id || ''),
        title: entry.title || entry.id || '',
        kindLabel: _label(entry.kind || kind),
        summary: entry.summary?.short || entry.summary?.default || entry.description || '',
        tagLabels: (entry.tags || []).slice(0, 4).map((tag) => _label(tag)),
        deliveryHtml: _renderSequenceDeliveryState(entry, 'event'),
        actionHtml: _renderSequenceActionButton(entry, 'event')
      })),
      activeSequenceHtml: _renderActiveSequence(state, ['event']) || '',
      questChains: kind === 'side' ? {
        activeCount: activeChains.length,
        availableCount: availableChains.length,
        activeHtml: activeChains.map((chain) => _renderQuestChainActive(chain)).join(''),
        availableHtml: availableChains.length
          ? availableChains.map((chain) => _renderQuestChainTemplate(chain)).join('')
          : ''
      } : null,
      soloNoticeHtml: _renderSoloNotice(state) || '',
      pendingBattleHtml: _renderPendingBattle(state) || '',
      combatResultHtml: _renderCombatResult(state) || '',
      eventResultHtml: _renderEventResult(state) || ''
    };
  }

  function getQuestHomeData(state = CS().getState()) {
    if (!state) return null;
    const isZombie = state.currentWorld === 'zombie';
    if (isZombie) {
      // The component reads `zombieHtml` and renders it as one HTML
      // bridge. World-specific variants migrate to JSX separately.
      return { isZombie: true, zombieHtml: _renderZombieScavengeHome(state) };
    }
    const quests = Object.values(state.quests || {});
    const active = quests.filter((q) => !q.chainTemplateId && !_isQuestResolved(q));
    const finished = quests.filter((q) => !q.chainTemplateId && _isQuestResolved(q));
    const nextQuest = active[0] || null;
    const Seq = window.CJS.CampaignSequences;
    const questEntries = Seq?.list?.('quest') || [];
    const dailyPapers = questEntries.filter((entry) => _questPaperKind(entry) === 'daily');
    const storyPapers = questEntries.filter((entry) => _questPaperKind(entry) === 'story');
    const normalPapers = questEntries.filter((entry) => _questPaperKind(entry) === 'normal');
    const templateCount = Object.values(CS().getContent().campaignQuests || {})
      .reduce((sum, record) => sum + (record.templates?.length || 0), 0);
    const run = state.activeScenarioRun;
    const paperLite = (entries) => entries.slice(0, 2).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.id,
      kindLabel: _label(entry.kind || 'quest paper')
    }));
    return {
      isZombie: false,
      activeCount: active.length,
      finishedCount: finished.length,
      templateCount,
      hasRun: !!run,
      hasNextQuest: !!nextQuest,
      nextQuestTitle: nextQuest ? (nextQuest.title || nextQuest.id) : '',
      nextQuestSummary: nextQuest ? (nextQuest.summary || '') : '',
      paperCount: questEntries.length,
      dailyPapers: paperLite(dailyPapers),
      normalPapers: paperLite(normalPapers).slice(0, 1),
      storyPapers: paperLite(storyPapers),
      activeQuestRows: active.slice(0, 4).map((quest) => _renderQuestRow(quest)),
      activeSequenceHtml: _renderActiveSequence(state, ['quest']) || '',
      soloNoticeHtml: _renderSoloNotice(state) || '',
      scenarioSummaryHtml: run ? (_renderScenarioSummary(state) || '') : '',
      pendingBattleHtml: _renderPendingBattle(state) || '',
      combatResultHtml: _renderCombatResult(state) || '',
      lastReportHtml: _renderLastReport(state) || ''
    };
  }

  function getStorySummaryData(state = CS().getState()) {
    if (!state) return null;
    const storyParts = _storySummaryEntries(state).map((entry) => ({
      title: entry.title || entry.sequenceId || 'Story Part',
      chapterLabel: entry.chapterLabel || '',
      partLabel: entry.partLabel || '',
      modeLabel: _label(entry.mode || 'played'),
      result: entry.result || 'complete',
      timestamp: entry.completedAt || entry.startedAt || '',
      summaryText: entry.summaryText || '',
      routeText: (entry.routeChoices || [])
        .map((choice) => choice.label || choice.choiceId)
        .filter(Boolean)
        .join(' → '),
      syncSummary: Array.isArray(entry.syncSummary) ? entry.syncSummary.slice(0) : []
    }));
    const manual = (state.storyMode?.manualSummaryEntries || []).map((entry) => ({
      title: entry.title || 'Manual Note',
      timestamp: entry.at || '',
      text: entry.text || ''
    }));
    const facts = Object.values(state.storyDirector?.revealedFacts || {}).slice(0, 8).map((fact) => ({
      title: fact.title || fact.id || 'Fact',
      text: fact.text || fact.note || ''
    }));
    const queue = Object.values(state.storyDirector?.storyQueue || {}).slice(0, 8).map((beat) => ({
      title: beat.title || beat.id || 'Beat',
      status: beat.status || 'held',
      text: beat.prompt || beat.summary || ''
    }));
    return { storyParts, manual, facts, queue };
  }

  // Per-section HTML bridge for the Overview tab. Each sectionId maps
  // to a closure-private `_renderXxx(state)` helper that returns an
  // HTML string. The JSX port at
  // `src/campaign/tabs/CampaignOverviewTab.tsx` calls this once per
  // sub-panel; replacing a bridge call with a JSX component as each
  // sub-panel migrates.
  function renderOverviewSectionHtml(sectionId, state = CS().getState()) {
    if (!state) return '';
    switch (sectionId) {
      case 'townSnapshot':     return _renderTownSnapshot(state);
      case 'townRollFloat':    return _renderTownRollFloat(state);
      case 'soloNotice':       return _renderSoloNotice(state);
      case 'adventureLegend':  return _renderAdventureLegend(state);
      case 'scenarioSummary':  return _renderScenarioSummary(state);
      case 'travelSurprise':   return _renderTravelSurprise(state);
      case 'pendingBattle':    return _renderPendingBattle(state);
      case 'combatResult':     return _renderCombatResult(state);
      case 'lastCombatResult': return _renderLastCombatResult(state);
      case 'eventResult':      return _renderEventResult(state);
      case 'oracle':           return _renderOracle(state);
      case 'lastReport':       return _renderLastReport(state);
      default: return '';
    }
  }

  function getMinigameTestData(state = CS().getState()) {
    if (!state) return null;
    const MG = window.CJS.Minigames;
    const games = MG?.listGames?.() || [];
    const selected = _root?.dataset?.mgTestGame || (games[0]?.id || '');
    const levelCache = _mgTestLevels;
    const ensureLevels = async () => {
      if (!selected || levelCache[selected]) return;
      try {
        const res = await fetch(`data/minigames/${selected}_levels.json?v=grid-regression-20260517c`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        levelCache[selected] = Array.isArray(data.levels) ? data.levels : [];
        render();
      } catch (err) {
        console.warn('Minigame test: failed to load levels for', selected, err);
        levelCache[selected] = [];
        render();
      }
    };
    if (selected && !levelCache[selected]) void ensureLevels();
    const levels = (levelCache[selected] || []).map((lvl) => ({
      id: String(lvl.id || ''),
      title: lvl.title || lvl.id || '',
      difficulty: lvl.difficulty || 1,
      theme: lvl.theme || 'any',
      width: lvl.width || null,
      height: lvl.height || null,
      optimalTurns: lvl.optimalTurns || lvl.optimalMoves || null,
      hint: lvl.hint || lvl.description || '',
      tags: Array.isArray(lvl.tags) ? lvl.tags.slice(0) : []
    }));
    const lastResult = state.lastMiniGameTestResult || null;
    return {
      games: games.map((g) => ({ id: String(g.id || ''), title: g.title || g.id || '' })),
      selectedGameId: selected || null,
      levels,
      levelsLoaded: !!levelCache[selected],
      lastResultStatus: lastResult?.status || null,
      lastResultJson: lastResult ? JSON.stringify(lastResult, null, 2) : null
    };
  }

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

  function getPanelDefs(state = CS().getState()) {
    return _panelDefsForState(state);
  }

  function getPanelOrder() {
    return RAIL_ORDER.slice();
  }

  function renderDrawerBody(panelId, state = CS().getState()) {
    if (!state || !panelId) return '';
    return _renderDrawerBody(panelId, state);
  }

  function setActiveMode(mode, opts = {}) {
    if (!mode) return;
    _activeMode = mode;
    if (!opts.keepTab) {
      const next = _defaultTabForMode(mode, CS().getState());
      if (next) _activeTab = next;
    }
    render();
  }

  function setActiveTab(tab, opts = {}) {
    if (!tab) return;
    _activeTab = tab;
    const owningMode = APP_TAB_TO_MODE[tab];
    if (owningMode && !opts.keepMode) _activeMode = owningMode;
    render();
  }

  function setActivePanel(panelId) {
    if (panelId == null) {
      _activePanel = null;
    } else {
      // Toggle: clicking the active panel again closes it (mirrors the
      // vanilla _openPanel behaviour).
      _activePanel = _activePanel === panelId ? null : panelId;
    }
    render();
  }

  return Object.freeze({
    init,
    render,
    isBooted: () => _booted,
    playSequenceMinigame: _playSequenceMiniGame,
    showQuestNarrative,
    // Bridge surface for React-owned tabs (Phase D migration). Tabs that
    // have moved to React read engine state through these getters instead
    // of reaching into closure-private state.
    getBootIncompatibleNotice: () => _bootIncompatibleNotice,
    // Exposes the frozen helper bundle that vanilla tab modules consume
    // (memberBase, memberStats, renderEquipmentLoadout, etc.). React tabs
    // call into these for the closure-private math + sub-renderers that
    // would be invasive to port one-by-one to TypeScript right now.
    getTabHelpers: () => _tabHelpers(),
    // Returns the HTML body string for any closure-private vanilla
    // renderer the React-tab bridge wraps.
    renderTabBody,
    // Phase E React Shell bridge. See enableReactShell() above for the
    // contract — when this is set, render() no longer clobbers _root
    // and instead emits `campaign:state-tick` events for the shell to
    // re-render against.
    enableReactShell,
    getChromeData,
    getEventLogData,
    renderEventResultHtml,
    renderOracleHtml,
    getMinigameTestData,
    renderOverviewSectionHtml,
    getStorySummaryData,
    getQuestHomeData,
    getEventTabData,
    getScenariosData,
    getRunData,
    getQuestPanelData,
    getStoryHomeData,
    getWorldGateData,
    getMainBody,
    getPanelDefs,
    getPanelOrder,
    renderDrawerBody,
    setActiveMode,
    setActiveTab,
    setActivePanel,
    getActiveTab: () => _activeTab,
    getActiveMode: () => _activeMode,
    getActivePanel: () => _activePanel
  });
})();
