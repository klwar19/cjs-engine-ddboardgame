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

  // _renderWorldGate — Phase F.12 port. Body moved to
  // `src/campaign/tabs/CampaignWorldGateTab.tsx`. Typed data flows
  // through `getWorldGateData(state)`. Per-world cards still come
  // through `_renderWorldGateCard` (kept here because the bridge calls
  // it) until the per-card banner / button logic ports.

  // _renderWorldGateCard / _renderPressureStripMini removed in Phase
  // G.13. The React `WorldGateCard` + `WorldGatePressureStrip`
  // (`src/campaign/tabs/WorldGateCard.tsx`) render from the typed
  // data produced below.
  function _worldGateCardData(worldId, world, state) {
    const def = _worldMenuDef(worldId);
    const isCurrent = worldId === state.currentWorld;
    const bannerImage = def.bannerImage || world.storyModeTheme?.bannerImage || world.storyModeTheme?.backdrop || '';
    const bannerImageUrl = bannerImage ? String(_cssVarAssetUrl(bannerImage) || bannerImage) : '';
    const mapCount = DS().getAllAsArray('travelMaps').filter((map) => map.world === worldId).length;
    const activityPacks = DS().getAllAsArray('worldActivityPacks').filter((pack) => pack.world === worldId);
    const activities = activityPacks.flatMap((pack) => pack.activities || []);
    const activityTypes = Array.from(new Set(activities.map((activity) => activity.type || 'activity'))).slice(0, 4);
    const status = isCurrent ? 'Loaded' : (def.status || 'Available');
    const targetTab = def.defaultTab || (mapCount ? 'worldMap' : 'storyHome');
    const primary = isCurrent
      ? _worldGateActionData({
          action: 'open-world-content',
          label: def.openLabel || 'Open Content',
          hint: def.openHint || 'Open this world content',
          kind: 'primary',
          data: { tab: targetTab, mode: def.defaultMode || _modeForTab(targetTab) }
        })
      : _worldGateActionData({
          action: 'travel-world-card',
          label: def.enterLabel || `Enter ${world.displayName || worldId}`,
          hint: def.enterHint || 'Switch world and load its content menu',
          kind: 'primary',
          data: { worldId, targetTab }
        });
    const secondary = [];
    if (isCurrent) {
      if (mapCount) {
        secondary.push(_worldGateActionData({
          action: 'open-world-content', label: 'Map Movement', hint: 'Open this world travel map',
          data: { tab: 'worldMap', mode: 'activities' }
        }));
      }
      if (activities.length) {
        secondary.push(_worldGateActionData({
          action: 'open-world-content', label: 'Activities', hint: 'Open this world activities',
          data: { tab: 'worldActivities', mode: 'activities' }
        }));
      }
      if (worldId === 'bazaar') {
        secondary.push(_worldGateActionData({
          action: 'open-world-content', label: 'Arena / Auction', hint: 'Open Bazaar activities',
          data: { tab: 'worldActivities', mode: 'activities' }
        }));
      }
    }
    return {
      worldId: String(worldId),
      title: String(def.title || world.displayName || worldId),
      kicker: String(def.kicker || world.tone || worldId),
      summary: String(def.summary || 'World content placeholder.'),
      features: Array.isArray(def.features) ? def.features.map(String) : [],
      bannerImageUrl,
      isCurrent,
      status: String(status),
      mapCount,
      activitiesCount: activities.length,
      activityTypeLabels: activityTypes.map(_label),
      devNote: String(def.devNote || ''),
      primaryAction: primary,
      secondaryActions: secondary
    };
  }

  function _worldGateActionData(opts = {}) {
    return {
      action: String(opts.action || ''),
      label: String(opts.label || ''),
      hint: String(opts.hint || ''),
      kind: String(opts.kind || ''),
      data: Object.freeze(Object.fromEntries(Object.entries(opts.data || {}).map(([k, v]) => [k, String(v)])))
    };
  }

  function _pressureStripChips(state) {
    const pressures = Object.values(state.crossWorld?.pressures || {});
    return pressures.slice(0, 3).map((p) => ({
      id: String(p.id || ''),
      title: String(p.title || p.id || ''),
      value: Number(p.value || 0)
    }));
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
  // `_choiceConsequenceData(state)` returns the alignment snapshot
  // for the React `ChoiceConsequencePanel` component
  // (`src/campaign/tabs/StoryHomePanels.tsx`).
  function _choiceConsequenceData(state) {
    const Align = window.CJS.CampaignAlignment;
    if (!Align?.snapshot) return null;
    const snap = Align.snapshot(state, { actor: 'bin', world: state.currentWorld });
    const axes = Object.entries(Align.AXES || {});
    return {
      axes: axes.map(([axis, meta]) => {
        const current = Number(snap.axes?.[axis] || 0);
        const world = Number(snap.worldAxes?.[axis] || 0);
        const range = snap.range?.[axis] || { min: current, max: current };
        return {
          id: String(axis),
          label: String(meta.label || axis),
          currentValue: current,
          worldValue: world,
          rangeMin: Number(range.min || 0),
          rangeMax: Number(range.max || 0)
        };
      }),
      recent: (snap.recent || []).slice(0, 3).map((entry) => ({
        label: String(entry.label || entry.choiceId || 'Choice'),
        description: String(Align.describeDeltas?.(entry.deltas) || 'Tracked')
      })),
      potential: (snap.potential || []).slice(0, 4).map((entry) => ({
        label: String(entry.label || entry.choiceId || 'Future'),
        description: String(Align.describeDeltas?.(entry.deltas) || ''),
        summary: String(entry.summary || entry.sequenceId || ''),
        reachable: entry.reachable !== false
      })),
      potentialCount: (snap.potential || []).length
    };
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

  // _renderZombieScavengeHome / _renderGachaHomeHero /
  // _renderWorldActivityPreviewCard removed in Phase G.17. The
  // zombie Quest Home now reads typed `getQuestHomeData(state).zombie`
  // and renders JSX via `src/campaign/tabs/ZombieScavenge.tsx`.
  function _zombieScavengeHomeData(state) {
    const activities = _worldActivitiesFor('zombie').filter((activity) => activity.type !== 'journal');
    const scavenge = activities.filter((activity) => activity.type === 'scavenge');
    const build = activities.filter((activity) => activity.type === 'build');
    const pressures = Object.values(state.crossWorld?.pressures || {})
      .filter((pressure) => String(pressure.id || '').startsWith('zombie_'));
    return {
      scavengeCount: scavenge.length,
      buildCount: build.length,
      pressureCount: pressures.length,
      hasRun: !!state.activeScenarioRun,
      heroBackdropUrl: _worldHomeBackdropUrl(),
      scavenge: scavenge.map((activity) => _worldActivityPreviewData(activity, 'Scavenge route')),
      build: build.map((activity) => _worldActivityPreviewData(activity, 'Build project')),
      pressures: pressures.map((pressure) => ({
        id: String(pressure.id || ''),
        title: String(pressure.title || pressure.id || ''),
        value: Number(pressure.value || 0)
      }))
    };
  }

  function _worldActivitiesFor(worldId) {
    return DS().getAllAsArray('worldActivityPacks')
      .filter((pack) => pack.world === worldId)
      .flatMap((pack) => pack.activities || []);
  }

  function _worldActivityPreviewData(activity = {}, kicker = 'Activity') {
    return {
      id: String(activity.id || activity.name || activity.title || ''),
      kicker: String(kicker),
      title: String(activity.title || activity.name || activity.id || ''),
      summary: String(activity.summary || activity.description || ''),
      rewardText: String(activity.rewardText || 'No reward text yet.')
    };
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

  function _storyChapterText(state = CS().getState() || {}) {
    return _esc(state.storyMode?.currentChapterLabel || state.currentChapter || 1);
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

  function _storySequenceMetaChips(entry = {}) {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    const meta = Seq?.storyMeta?.(entry, state.currentWorld) || {};
    const bits = [];
    if (meta.chapterLabel) bits.push(`Chapter ${meta.chapterLabel}`);
    if (meta.partLabel) bits.push(meta.partLabel);
    return bits;
  }

  function _storySequenceStatusLabel(entry = {}) {
    const Seq = window.CJS.CampaignSequences;
    const state = CS().getState() || {};
    const status = Seq?.storyStatus?.(entry.id, state, state.currentWorld);
    if (!status?.record) return '';
    return status.defaulted ? 'Defaulted' : (status.completed ? 'Played' : 'Read');
  }

  function _sequenceDeliveryData(entry = {}, scope = 'story') {
    const status = _sequenceDeliveryStatus(entry, scope);
    const note = _sequenceDeliveryNote(entry, scope);
    if (!status || status === 'ready') {
      return note ? { statusLabel: null, note: String(note) } : null;
    }
    return {
      statusLabel: _label(status),
      note: String(note || '')
    };
  }

  function _sequenceActionData(entry = {}, scope = 'story') {
    const blocked = _sequenceDeliveryBlocked(entry, scope);
    const label = scope === 'story' ? _storySequenceActionLabel(entry) : (blocked ? 'In Update' : 'Start');
    return {
      entryId: String(entry.id || ''),
      label: String(label),
      blocked: !!blocked
    };
  }

  function _sequenceShelfEntryData(entry = {}, scope = 'story') {
    const isStory = scope === 'story';
    const hasNativeSummary = entry.summary?.short || entry.summary?.default || entry.description;
    const summary = isStory ? _storySequenceSummary(entry) : (hasNativeSummary ? String(entry.summary?.short || entry.summary?.default || entry.description) : '');
    return {
      id: String(entry.id || ''),
      scope,
      kindLabel: _label(entry.kind || scope),
      title: String(entry.title || entry.id || ''),
      summary: String(summary),
      storyMetaChips: isStory ? _storySequenceMetaChips(entry) : [],
      storyStatusLabel: isStory ? _storySequenceStatusLabel(entry) : '',
      tags: (entry.tags || []).slice(0, 4).map((tag) => _label(tag)),
      delivery: _sequenceDeliveryData(entry, scope),
      action: _sequenceActionData(entry, scope)
    };
  }

  function getSequenceShelfData(scope, options = {}, state = CS().getState()) {
    if (!state) return null;
    const Seq = window.CJS.CampaignSequences;
    const entries = Seq?.list?.(scope) || [];
    const title = options.title || (scope === 'story' ? 'Story Files' : scope === 'event' ? 'Event Files' : 'Quest Papers');
    const note = options.note || 'Small authored files that can be played one node at a time.';
    return {
      scope,
      wide: !!options.wide,
      title: String(title),
      note: String(note),
      entries: entries.map((entry) => _sequenceShelfEntryData(entry, scope))
    };
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

  // _renderChapterTreePanel / _renderChapterTreeNode removed in
  // Phase G.12. The React `ChapterTreePanel`
  // (`src/campaign/tabs/StoryHomePanels.tsx`) renders the tree from
  // typed `chapterTree` data produced by `_chapterTreeData(state)`.
  function _chapterTreeData(state) {
    const Seq = window.CJS.CampaignSequences;
    if (!Seq?.chapterTree) return null;
    let tree = Seq.chapterTree(state.currentWorld, state);
    if (!tree) tree = { roots: [], byPartId: {}, nodes: [] };
    const Branch = window.CJS.CampaignStoryBranch;
    if (Branch?.applyToTree) tree = Branch.applyToTree(tree, state.currentWorld);
    if (!tree.roots?.length) return null;
    const route = Seq.currentRouteChoices(state, state.currentWorld) || [];
    const routeText = route.length
      ? route.map((entry) => entry.partLabel || entry.title || entry.sequenceId).join(' → ')
      : 'No story parts played yet.';
    return {
      routeText: String(routeText),
      routeCount: route.length,
      roots: tree.roots.map((node) => _chapterTreeNodeData(node, 0))
    };
  }

  function _chapterTreeNodeData(node = {}, depth = 0) {
    const status = node.status || {};
    const eligibility = node.eligibility || { eligible: true, reasons: [] };
    const blocked = !!status.deliveryBlocked;
    const completed = !!status.completed;
    const defaulted = !!status.defaulted;
    const replayOnly = !!status.replayOnly;
    const locked = !eligibility.eligible && !replayOnly;
    let stateLabel = 'Ready';
    let stateClass = 'is-ready';
    if (blocked) { stateLabel = 'In Update'; stateClass = 'is-update'; }
    else if (completed) { stateLabel = 'Played'; stateClass = 'is-played'; }
    else if (defaulted) { stateLabel = 'Defaulted'; stateClass = 'is-defaulted'; }
    else if (locked) { stateLabel = 'Locked'; stateClass = 'is-locked'; }
    return {
      id: String(node.id || ''),
      partLabel: String(node.partLabel || node.orderKey || node.id || ''),
      title: String(node.title || ''),
      routeLabel: String(node.routeLabel || (node.routeKey ? _label(node.routeKey) : '')),
      stateLabel,
      stateClass,
      summaryShort: String(node.meta?.summary?.short || ''),
      lockReasons: locked ? (eligibility.reasons || []).join(' | ') : '',
      nextCandidates: Array.isArray(node.nextCandidates) ? node.nextCandidates.map(String) : [],
      blocked,
      locked,
      replayOnly,
      depth,
      children: Array.isArray(node.children)
        ? node.children.map((child) => _chapterTreeNodeData(child, depth + 1))
        : []
    };
  }

  // _renderStoryPipelinePanel / _renderSyncSummaryPanel removed in
  // Phase G.12. The React `StoryPipelinePanel` / `SyncSummaryPanel`
  // (`src/campaign/tabs/StoryHomePanels.tsx`) render from typed
  // data produced by the helpers below.
  function _storyPipelinePanelData(pipeline = {}) {
    return {
      anchorTitle: String(pipeline.anchorTitle || ''),
      nextCandidates: (Array.isArray(pipeline.nextCandidates) ? pipeline.nextCandidates : [])
        .filter(Boolean)
        .map(String)
    };
  }

  function _syncSummaryData(title = 'State Sync', lines = [], sourceTitle = '') {
    return {
      title: String(title),
      sourcePill: sourceTitle ? _shortenPanelLabel(sourceTitle) : '',
      lines: (Array.isArray(lines) ? lines : []).filter(Boolean).map(String)
    };
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

  // _renderGachaHomeHero removed in Phase G.17 — its only caller, the
  // HTML _renderZombieScavengeHome, is gone. The zombie scavenge hero
  // is JSX now (`src/campaign/tabs/ZombieScavenge.tsx`); other gacha
  // heroes (Quest Home, Event tabs) were already inline JSX.

  // TOOL_PURPOSES, _renderInlinePurpose, _purposeTone, _purposeKeyForCard
  // live in js/campaign/ui/cui-controls.js (bound as aliases at the top).

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

  // _storyThemeStyle removed in Phase G — the React story tabs set the
  // theme CSS vars (`--story-backdrop/accent/danger`) via typed
  // `themeStyleVars` style props instead of an inline style string.

  // _renderStoryVnHero removed in Phase G.11a. The React
  // `StoryVnHero` (`src/campaign/tabs/StoryDirector.tsx`) renders
  // the hero from the typed `vnHero` data produced by
  // `_storyVnHeroData` below.
  function _storyVnHeroData({ state = {}, pack = null, stage = null, next = {}, theme = {} }) {
    const phase = state.phase || {};
    const video = theme.bannerVideo || '';
    return {
      worldName: String(theme.worldName || state.currentWorld || 'World'),
      chapterLabel: String(state.storyMode?.currentChapterLabel || state.currentChapter || 1),
      phaseLabel: String(phase.number || 1),
      motif: String(theme.motif || 'story'),
      title: String(pack?.name || `${theme.worldName || 'World'} Story Mode`),
      summary: String(pack?.summary || 'Story Mode is ready for this world theme, but no authored story pack is loaded yet.'),
      bannerVideoUrl: video ? String(_cssVarAssetUrl(video) || video) : '',
      bannerVideoType: video ? _videoTypeFromPath(video) : '',
      next: _storyNextStepData(next)
    };
  }

  function _storyActionBtnData(opts = {}) {
    return {
      action: String(opts.action || ''),
      label: String(opts.label || ''),
      hint: String(opts.hint || ''),
      kind: String(opts.kind || ''),
      disabled: !!opts.disabled,
      data: Object.freeze(Object.fromEntries(Object.entries(opts.data || {}).map(([k, v]) => [k, String(v)])))
    };
  }

  function _storyNextStepData(next = {}) {
    return {
      index: Number(next.index || 0),
      title: String(next.title || ''),
      text: String(next.text || ''),
      actions: Array.isArray(next.actions) ? next.actions.map(_storyActionBtnData) : []
    };
  }

  function _videoTypeFromPath(path = '') {
    const lower = String(path).toLowerCase();
    if (lower.endsWith('.webm')) return 'video/webm';
    if (lower.endsWith('.ogg') || lower.endsWith('.ogv')) return 'video/ogg';
    return 'video/mp4';
  }

  // _renderStoryDirectorEmptyCard removed in Phase G.11b. The
  // React `StoryDirectorCard` falls back to an empty-card JSX
  // when `data.lastCard === null`.

  // _renderStorySoloGuide / _renderStoryActionDeck removed in Phase
  // G.11a. The React `StorySoloGuide` and `StoryActionDeck`
  // components (`src/campaign/tabs/StoryDirector.tsx`) render their
  // bodies from the typed data on `StoryDirectorData`.

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
          { action: 'story-roll-scene', label: 'Next Scene', hint: 'Best default for solo play', kind: 'primary story' },
          { action: 'story-manual-note', label: 'Write Scene', hint: 'Save your own beat', kind: 'manual' }
        ]
      };
    }
    if (!['resolved', 'rejected', 'saved', 'manual', 'review'].includes(last.status || '')) {
      return {
        index: 2,
        title: 'Choose a route',
        text: 'Read the route cards below. Choose one if it fits, hold it for later, or skip the roll with no guilt.',
        actions: [
          { action: 'story-open-last', label: 'Open Popup', hint: 'Reopen the current beat window', kind: 'primary story' },
          { action: 'story-save-beat', label: 'Hold For Later', hint: 'Keep it in the queue without applying consequences', kind: 'manual' },
          {
            action: 'story-apply-choice',
            label: choices[0]?.label ? `Choose: ${choices[0].label}` : 'Accept Note',
            hint: 'Apply the first route',
            kind: 'quest',
            data: { id: last.id, choice: 0 }
          }
        ]
      };
    }
    if (snap.flow && !flowSynced) {
      return {
        index: 4,
        title: 'Update side routes',
        text: 'This episode has advice for which side routes should stay available, get promoted, or politely leave the room.',
        actions: [
          { action: 'story-sync-sidequests', label: 'Update Side Routes', hint: 'Applies this episode side-flow once', kind: 'quest' }
        ]
      };
    }
    if (state?.activeScenarioRun) {
      return {
        index: 4,
        title: 'Continue the tabletop run',
        text: 'A scenario is active. Use the story beat as table color, then continue moving pieces and resolving encounters on the map.',
        actions: [
          { action: 'open-maps-tab', label: 'Open Run Map', hint: 'Return to the tactical board', kind: 'primary' }
        ]
      };
    }
    return {
      index: 1,
      title: 'Ready for the next scene',
      text: 'The last beat is handled. Roll again, write a scene, or just let the table breathe for a moment.',
      actions: [
        { action: 'story-roll-scene', label: 'Next Scene', hint: 'Continue the story flow', kind: 'primary story' }
      ]
    };
  }

  // _renderStoryStageRail removed in Phase G.11b. The React
  // `StoryStageRail` (`src/campaign/tabs/StoryDirectorPanels.tsx`)
  // renders the rail directly from `stageRailEntries`.
  function _storyStageRailData(stages, stage = {}) {
    if (!stages.length) return [];
    const activeIndex = Math.max(0, stages.findIndex((entry) => entry.id === stage.id));
    return stages.map((entry, index) => ({
      id: String(entry.id || ''),
      name: String(entry.name || entry.id || ''),
      summary: String(entry.summary || ''),
      index: index + 1,
      isActive: entry.id === stage.id,
      isPast: index < activeIndex && entry.id !== stage.id
    }));
  }

  function _storyDirectorCardData(card) {
    if (!card) return null;
    const kindLabel = _label(card.kind || 'story');
    const stageLabel = card.stageName || card.stageId || '';
    const choices = card.suggestedChoices || [];
    const branchChoices = choices.length ? choices : [{
      label: 'Accept as story note',
      ops: [{ op: 'log', text: card.prompt || card.text || card.summary || card.title || 'Story beat accepted.' }]
    }];
    const routes = branchChoices.map((choice, index) => ({
      index,
      label: String(choice.label || `Choice ${index + 1}`),
      cardId: String(card.id || ''),
      isRecommended: index === 0,
      consequencePreviewHtml: _renderConsequencePreview(choice.ops || [], {
        title: choice.label || `Choice ${index + 1}`,
        emptyTitle: choice.label || `Choice ${index + 1}`,
        emptyText: 'Story-only route. Choose it if it fits the current scene.'
      })
    }));
    return {
      id: String(card.id || ''),
      title: String(card.title || card.id || ''),
      stageLabel: String(stageLabel),
      kindLabel: String(kindLabel),
      canonRisk: String(card.canonRisk || 'green'),
      canonRiskClass: Side().riskClass(card.canonRisk),
      prompt: String(card.prompt || ''),
      text: String(card.text || ''),
      summary: String(card.summary || ''),
      gmNote: String(card.gmNote || ''),
      tags: Array.isArray(card.tags) ? card.tags.map((tag) => String(tag)) : [],
      routes
    };
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

  // _renderStoryPressureBoard / _renderStoryCluesPanel /
  // _renderStoryQueuePanel / _renderStoryTruthsPanel /
  // _renderStorySideFlow removed in Phase G.11c. The React
  // support-grid components in
  // `src/campaign/tabs/StoryDirectorPanels.tsx` render these
  // panels from typed bridge data.
  function _storyPressureBoardData(metrics, snap, pack) {
    return {
      metrics: (metrics || []).map((metric) => ({
        id: String(metric.id || ''),
        label: String(metric.label || _label(metric.id || '')),
        value: snap?.metrics?.[metric.id] != null ? snap.metrics[metric.id] : 0
      })),
      rule: String(pack?.pressureRule || 'Offscreen trouble suggests consequences. Apply only what fits the session.')
    };
  }

  function _storyCluesPanelData(clues, facts) {
    return {
      clues: (clues || []).map((clue) => ({
        id: String(clue.id || ''),
        title: String(clue.title || clue.id || ''),
        text: String(clue.text || ''),
        canonRisk: String(clue.canonRisk || 'green'),
        canonRiskClass: Side().riskClass(clue.canonRisk)
      })),
      facts: (facts || []).map((fact) => ({
        id: String(fact.id || ''),
        title: String(fact.title || fact.id || ''),
        text: String(fact.text || '')
      }))
    };
  }

  function _storyQueuePanelData(queue) {
    return {
      beats: (queue || []).map((beat) => ({
        id: String(beat.id || ''),
        title: String(beat.title || beat.id || ''),
        statusLabel: String(beat.status || 'saved'),
        stageLabel: String(beat.stageName || beat.stageId || ''),
        canonRisk: String(beat.canonRisk || 'green'),
        canonRiskClass: Side().riskClass(beat.canonRisk)
      }))
    };
  }

  function _storyTruthsPanelData(pack) {
    return {
      truths: (pack?.protectedTruths || []).slice(0, 10).map((truth) => ({
        id: String(truth.id || ''),
        title: String(truth.title || truth.id || ''),
        rule: String(truth.rule || 'Red-risk until the GM promotes it.')
      }))
    };
  }

  function _storySideFlowData(flow, flowSynced = false) {
    if (!flow) {
      return {
        hasFlow: false,
        summary: '',
        flowSynced: !!flowSynced,
        columns: []
      };
    }
    const column = (label, list, tone) => ({
      label,
      tone,
      items: (list || []).map((item) => ({
        title: String(item.title || item.id || item || ''),
        reason: String(item.reason || item.note || '')
      }))
    });
    return {
      hasFlow: true,
      summary: String(flow.summary || 'Keep, promote, or retire optional content as the main arc moves.'),
      flowSynced: !!flowSynced,
      columns: [
        column('Keep Available', flow.keep, 'flavor'),
        column('Promote Soon', flow.promote, 'plot'),
        column('Retire / Downgrade', flow.retire, 'risk')
      ]
    };
  }

  // _renderAdventureLegend — Phase G.6 port. The legend body moved to
  // JSX in `src/campaign/tabs/CampaignOverviewTab.tsx`; only the
  // visibility check (hide when there's any active result card) lives
  // here as the typed `getAdventureLegendVisible(state)` bridge.
  function getAdventureLegendVisible(state = CS().getState()) {
    if (!state) return false;
    const hasResult = state.lastEvent || state.lastOracle || state.pendingSoloHook || state.pendingBattle;
    return !hasResult;
  }

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
  function _questChainStepData(step = {}, index = 0) {
    const meta = [
      step.chapterLabel ? `Chapter ${step.chapterLabel}` : '',
      step.phaseType ? _label(step.phaseType) : '',
      step.kind ? _label(step.kind) : ''
    ].filter(Boolean);
    const detail = [
      step.vn?.prompt || step.visualNovel?.prompt,
      step.character?.beat,
      step.event?.prompt,
      step.map?.objective,
      step.combat?.objective,
      step.minigame?.objective
    ].filter(Boolean).slice(0, 2);
    return {
      id: String(step.id || ''),
      label: String(step.label || step.id || `Step ${index + 1}`),
      text: String(step.text || ''),
      meta: meta.map(String),
      systems: _questChainStepSystems(step),
      detailLines: detail.map(String),
      pulseHints: (step.progressTriggers || []).slice(0, 2).map((trigger) => _triggerLabel(trigger))
    };
  }

  function _questChainStepSystems(step = {}) {
    const systems = [];
    if (step.vn || step.visualNovel) systems.push('VN');
    if (step.character) systems.push('Character');
    if (step.event) systems.push('Event');
    if (step.map) systems.push('Map');
    if (step.combat) systems.push('Combat');
    if (step.minigame) systems.push('Mini-Game');
    return systems;
  }

  function _questChainStakesData(chain = {}) {
    const rewards = Ops().describe(chain.rewardOps || chain.rewards || []);
    const failures = Ops().describe(chain.failureOps || chain.failureConsequences || []);
    const battleCount = (chain.battleSetIds || []).length;
    const mapCount = (chain.mapSeedIds || []).length + (chain.linkedScenario ? 1 : 0);
    const runBits = [mapCount ? `${mapCount} map hook${mapCount === 1 ? '' : 's'}` : 'generated map'];
    if (battleCount) runBits.push(`${battleCount} battle hook${battleCount === 1 ? '' : 's'}`);
    return {
      runLine: runBits.join(' · '),
      rewardLine: rewards.length ? rewards.join('; ') : '',
      failureLine: failures.length ? failures.join('; ') : 'GM consequence or mark failed'
    };
  }

  function _questChainVnPanelData(chain = {}, options = {}) {
    const template = chain.template || chain || {};
    const steps = template.steps || [];
    const currentId = options.active ? chain.currentStepId : steps[0]?.id;
    const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === currentId));
    const current = steps[currentIndex] || steps[0] || {};
    const npcs = (template.mainNpcs || []).slice(0, 4);
    return {
      badgeLabel: options.active ? 'Current Scene' : 'Opening Scene',
      title: String(current.label || template.title || template.id || 'Side Story'),
      text: String(current.text || template.summary || 'Pick a scene, run it as VN/table narration, then decide whether it becomes a map, battle, quest progress, or a parked lead.'),
      systems: _questChainStepSystems(current),
      plot: String(template.flowSummary || template.type || 'side story'),
      characters: npcs.length ? npcs.join(', ') : 'GM choice',
      steps: steps.map((step, index) => ({
        index: index + 1,
        label: String(step.label || step.id || `Step ${index + 1}`),
        state: index === currentIndex ? 'current' : (index < currentIndex ? 'done' : 'upcoming')
      }))
    };
  }

  function _questChainActiveData(chain = {}) {
    const template = chain.template || {};
    const steps = template.steps || [];
    const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === chain.currentStepId));
    const step = steps.find((entry) => entry.id === chain.currentStepId) || null;
    const tags = Array.from(new Set([
      ...(template.tags || []),
      ...(template.contextTags || []),
      ...(template.monsterTags || [])
    ].filter(Boolean))).slice(0, 8);
    return {
      templateId: String(chain.templateId || ''),
      title: String(chain.title || template.title || chain.templateId || ''),
      status: String(chain.status || ''),
      stepIndex: currentIndex + 1,
      stepCount: steps.length || 1,
      stepLabel: String(step?.label || chain.currentStepId || '-'),
      currentStepDetail: step ? _questChainStepData(step, currentIndex) : null,
      contextTags: tags.map((tag) => _label(tag)),
      vnPanel: _questChainVnPanelData(chain, { active: true }),
      stakes: _questChainStakesData(template)
    };
  }

  function _questChainTemplateData(chain = {}) {
    return {
      id: String(chain.id || ''),
      title: String(chain.title || chain.name || chain.id || ''),
      summary: String(chain.summary || ''),
      canonRisk: String(chain.canonRisk || 'green'),
      canonRiskClass: Side().riskClass(chain.canonRisk),
      tags: Array.isArray(chain.tags) ? chain.tags.map(String) : [],
      vnPanel: _questChainVnPanelData(chain, { active: false }),
      stakes: _questChainStakesData(chain),
      steps: (chain.steps || []).map((step, index) => _questChainStepData(step, index))
    };
  }

  // K.3 — typed builders for the questChains tab body (flow guide +
  // resolved rows). The active/template card data reuses the builders
  // above; these two cover the parts the EventTab side panel didn't need.
  function _sideStoryFlowGuideData(chain = {}) {
    const phases = (chain.phasePlan || []).slice(0, 4)
      .map((phase) => `${phase.chapterLabel || phase.id || ''} ${phase.title || phase.phaseType || ''}`.trim())
      .filter(Boolean);
    return {
      title: String(chain.title || chain.name || 'Side Story'),
      summary: String(chain.flowSummary || chain.summary || 'Side stories have their own plot rail, scene beats, optional map run, and manual resolve controls.'),
      phases: phases.map(String)
    };
  }

  function _questChainResolvedData(chain = {}) {
    const template = chain.template || {};
    return {
      title: String(chain.title || template.title || chain.templateId || ''),
      statusLabel: _label(chain.status || 'resolved'),
      phaseLabel: String(chain.completedAtPhase || chain.failedAtPhase || '-')
    };
  }

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

  // _renderCombatResult / _renderLastCombatResult — Phase G.4 port.
  // Bodies moved to `src/campaign/tabs/ResultPanels.tsx`. Typed
  // bridges `getCombatResultData(state)` / `getLastCombatResultData(state)`
  // produce the data.

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

  // Phase G.15 — typed scenario chips + per-card run actions. The
  // HTML siblings (`_renderScenarioRunActions`, `_renderShapePills`,
  // `_scenarioQuestPill`) are removed; the React components in
  // `src/campaign/tabs/ScenarioChips.tsx` consume these shapes.
  function _scenarioRunActionsData(scenario, state) {
    const activeRun = state.activeScenarioRun;
    const isCurrent = activeRun?.scenarioId === scenario.id;
    let startState = 'start';
    if (activeRun) startState = isCurrent ? 'continue' : 'other_active';
    return {
      scenarioId: String(scenario.id || ''),
      startState
    };
  }

  function _scenarioQuestPillData(scenario = {}, state = CS().getState()) {
    const src = scenario.source || {};
    const questId = src.questId;
    if (questId) {
      const quest = state?.quests?.[questId];
      const title = quest?.title || src.title || questId;
      return {
        variant: 'quest',
        label: `📌 Quest: ${title}`,
        title: 'Generated for this quest',
        linkable: false,
        muted: false
      };
    }
    if (src.questChainId) {
      return {
        variant: 'arc',
        label: `📌 Arc: ${src.title || src.questChainId}`,
        title: 'Generated for this quest arc',
        linkable: false,
        muted: false
      };
    }
    return null;
  }

  const SHAPE_MODE_LABELS = {
    node_map: 'Movement: Node Map',
    grid_map: 'Movement: Grid Map',
    procedural: 'Movement: Procedural',
    linear: 'Movement: Linear',
    freeform: 'Movement: Freeform'
  };
  const SHAPE_SETTING_LABELS = {
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
  const SHAPE_SIZE_LABELS = { tiny: 'XS', small: 'S', medium: 'M', large: 'L' };

  function _shapePillsData(scenario = {}) {
    const mode = scenario.travelMode || scenario.mapForm || (scenario.mapId ? 'node_map' : 'freeform');
    const pills = [];
    pills.push({ label: SHAPE_MODE_LABELS[mode] || `Movement: ${mode}` });
    const setting = scenario.mapSetting || scenario.setting;
    if (setting) pills.push({ label: SHAPE_SETTING_LABELS[setting] || `Setting: ${setting}` });
    if (scenario.size) pills.push({ label: `Size: ${SHAPE_SIZE_LABELS[scenario.size] || scenario.size}` });
    return { pills };
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

  // _worldHomeHeroStyle removed in Phase G.17 — its only caller
  // (_renderGachaHomeHero) is gone. JSX heroes read the resolved
  // backdrop URL via `_worldHomeBackdropUrl()` and set the CSS var
  // through a typed style prop.

  function _cssVarAssetUrl(path = '') {
    const value = String(path || '').trim();
    if (!value) return '';
    if (/^(data:|https?:|\/|\.\/|\.\.)/i.test(value)) return value;
    return `../${value}`;
  }

  // _renderZombieScavengeTracker removed in Phase G.17. The zombie
  // Quests tracker now reads typed `getQuestPanelData(state).zombie`
  // and renders JSX via `src/campaign/tabs/ZombieScavenge.tsx`. The
  // legacy quest rows reuse the shared typed `getQuestRowData` +
  // `<QuestRow>` component.
  function _zombieScavengeTrackerData(state) {
    const quests = Object.values(state.quests || {});
    const active = quests.filter((q) => !q.chainTemplateId && !_isQuestResolved(q));
    const finished = quests.filter((q) => !q.chainTemplateId && _isQuestResolved(q));
    const activities = _worldActivitiesFor('zombie').filter((activity) => activity.type !== 'journal');
    return {
      activeCount: active.length,
      finishedCount: finished.length,
      activities: activities.map((activity) => _worldActivityPreviewData(activity, activity.type === 'build' ? 'Build project' : 'Scavenge route')),
      activeQuestRows: active.map((quest) => getQuestRowData(quest)),
      finishedQuestRows: finished.map((quest) => getQuestRowData(quest, { resolved: true }))
    };
  }

  // _renderQuestRow / _renderQuestObjective / _renderQuestVariant
  // removed in Phase G.17. The shared QuestRow ported to JSX in G.1
  // (`src/campaign/tabs/QuestRow.tsx` + typed `getQuestRowData`); the
  // zombie scavenge tracker (its last HTML caller) ported in G.17.

  function _renderContextTags(tags = []) {
    const list = Array.from(new Set((tags || []).filter(Boolean))).slice(0, 8);
    if (!list.length) return '';
    return `
      <div class="campaign-chip-row campaign-context-tags">
        ${list.map((tag) => `<span class="campaign-chip">${_esc(_label(tag))}</span>`).join('')}
      </div>
    `;
  }

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

  // Phase G.15 — typed quest-pill data for the active run (consumed
  // by getScenarioSummaryData and getRunData). The React
  // `QuestPill` component (`src/campaign/tabs/ScenarioChips.tsx`)
  // renders the pill from this shape.
  function _runQuestPill(state, run, scenario) {
    const questId = _activeRunQuestId(run, scenario);
    if (questId) {
      const quest = state?.quests?.[questId];
      const title = quest?.title || run?.questTitle || questId;
      return {
        variant: 'quest',
        label: `📌 Quest: ${title}`,
        title: 'This run is linked to a quest',
        linkable: true,
        muted: false
      };
    }
    if (scenario?.source?.questChainId) {
      return {
        variant: 'arc',
        label: `📌 Arc: ${scenario.source.title || scenario.source.questChainId}`,
        title: 'This run is part of a quest arc',
        linkable: false,
        muted: false
      };
    }
    return {
      variant: 'noBinding',
      label: 'no quest binding',
      title: 'Standalone run, not bound to a quest',
      linkable: false,
      muted: true
    };
  }

  // Phase G — typed scenario pill for the quest row. Returns a
  // QuestPillData shape (or null) the React `QuestPill` renders.
  function _questScenarioPill(quest = {}, activeRun = null, activeScenario = null) {
    if (!quest?.id) return null;
    if (_activeRunQuestId(activeRun, activeScenario) === quest.id) {
      return {
        variant: 'running',
        label: `▶ Running: ${activeScenario?.name || activeRun?.scenarioId || 'scenario'}`,
        title: 'A scenario for this quest is currently running',
        linkable: true,
        muted: false
      };
    }
    const linkedId = quest.linkedScenario || quest.scenarioId || quest.scenario;
    if (linkedId) {
      const sc = CS().getScenarioById?.(linkedId);
      return {
        variant: 'linked',
        label: `📜 Linked: ${sc?.name || linkedId}`,
        title: 'This quest has a pre-built scenario linked to it',
        linkable: false,
        muted: false
      };
    }
    const generated = Object.values(CS().getState()?.sideContent?.generatedScenarios || {})
      .find((sc) => sc?.source?.questId === quest.id);
    if (generated) {
      return {
        variant: 'generated',
        label: `🗺 Generated: ${generated.name || generated.id}`,
        title: 'A scenario was previously generated for this quest',
        linkable: false,
        muted: false
      };
    }
    return {
      variant: 'noMap',
      label: 'no map yet',
      title: 'No scenario yet — Map Run will generate one',
      linkable: false,
      muted: true
    };
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
  // _bindEvents removed in Phase H.2. The campaign-root click/change
  // delegation moved into the React shell: `CampaignShell.tsx` forwards
  // every bridged-body `data-campaign-action` / `-mode` / `-tab` /
  // `-panel` (external-module tabs, maps, roster detail row) through its
  // `<main>` onClick/onChange to `handleAction` / `setActive*`, and the
  // hidden import-file input's change runs `importSaveFile`. Migrated JSX
  // tabs already dispatch via onClick. The drawer keeps its own forwarder.

  // Phase H.1 — public typed action boundary. React components call
  // `CampaignActions.dispatchCampaignAction(name, data)` which routes
  // here directly (no synthetic DOM-button click). The delegated
  // `_bindEvents` listener still feeds `_handleAction` for buttons
  // inside the remaining HTML-bridge tabs (HubTab / PartyTab /
  // WorldMapTab, ported in K.3). `data` carries camelCase keys that
  // mirror the dataset names each case reads (id, choice, worldId,
  // targetTab, tab, mode, table, bucket, dir, tool, x, y, ...).
  function handleAction(name, data = {}) {
    return _handleAction({ campaignAction: String(name), ...data });
  }

  function _handleAction(data) {
    // Phase H.3 — ported handlers live in TS modules registered on
    // window.CJS.CampaignActionsRuntime. Consult that registry first; it
    // is the single seam for every dispatch path (React onClick →
    // dispatchCampaignAction → handleAction, the shell/drawer
    // forwarders, and internal delegated callers like the party-sheet
    // modal). Any name not registered there falls through to the switch
    // below, which holds the not-yet-ported cases.
    const runtime = window.CJS.CampaignActionsRuntime;
    if (runtime && runtime.has(data.campaignAction)) {
      return runtime.run(data.campaignAction, data);
    }
    switch (data.campaignAction) {
      case 'open-world-gate': return _goto('world', 'worldGate');
      case 'open-world-content': return _goto(data.mode || _modeForTab(data.tab), data.tab || 'worldGate');
      case 'travel-world-card': return _travelWorldCard(data.worldId || data.world, data.targetTab);
      case 'rel-activity': return _doRelActivity(data.characterId, data.activityId);
      // Ported to TS handlers (H.3) registered in actions/registry.ts:
      //   world-map-* / world-activity-use -> actions/worldmap.ts
      //   save + log -> actions.ts ; roster ops -> actions/roster.ts
      //   pass-phase + thin engine ops -> actions/ops.ts
      //   farm/haven -> actions/farm.ts ; forge saves -> actions/forge.ts
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
      case 'start-chain': return _startQuestChainRun(data.id);
      case 'advance-chain': return _advanceQuestChainStep(data.id);
      case 'complete-chain': return _completeQuestChain(data.id);
      case 'fail-chain': return _failQuestChain(data.id);
      case 'promote-chain': return _addQuestChainToTracker(data.id);
      case 'chain-scenario': return _startQuestChainScenario(data.id);
      case 'chain-battle': return _questChainBattle(data.id);
      case 'copy-battle-card': return _copyBattleCard(data.id);
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
      case 'roll-travel-surprise': return _rollTravelSurprise();
      case 'run-queue-set-battle': return _runQueueSetBattle(data.battleId);
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
      case 'clear-node': return _clearNode(data.nodeId);
      case 'run-battle': return _runBattle();
      case 'manual-battle': return _manualBattleModal();
      case 'apply-combat-result': return _applyCombatResult();
      case 'inventory-delta': return _inventoryDelta(data);
      case 'quick-add-inventory': return _quickAddInventory(data.bucket);
      case 'shop-buy': return _shopBuy(data);
      case 'plant-seed': return _plantSeed(data.plotId);
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
      case 'damage-char': return _charNumberOp(data.id, 'damage_character', 'Damage amount');
      case 'heal-char': return _charNumberOp(data.id, 'heal_character', 'Heal amount');
      case 'mp-char': return _charMpModal(data.id);
      case 'status-char': return _charStatusModal(data.id);
      case 'party-sheet': return _partySheetModal(data.id);
      case 'recruit-character': return _recruitCharacterModal();
      case 'remove-character': return _removeCharacter(data.id);
      case 'learn-skill': return _learnSkillModal(data.id);
      case 'learn-passive': return _learnPassiveModal(data.id);
      case 'equip-item': return _equipItemModal(data.id, data.slot);
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
      // Roster pure-ops (bench/activate-character, unlearn/equip/unequip
      // skill + passive, unequip-item, party-available) ported to
      // src/campaign/actions/{roster,actions}.ts (H.3 roster).
      case 'pick-equip-skill':   return _openSkillPoolPicker(data.id);
      case 'pick-equip-passive': return _openPassivePoolPicker(data.id);
      case 'show-skill-detail': return _showSkillDetailModal(data.id, data.skillId);
      case 'unlock-job-from-tree': return _confirmUnlockJob(data.id, data.jobId);
      case 'switch-job-from-tree': return _switchJob(data.id, data.jobId);
      case 'party-availability': return _partyAvailabilityModal(data.id);
      case 'gm-override': return _gmOverride();
      case 'gm-member-override': return _gmOverride(data.id);
      // load-slot / delete-slot / delete-all-saves / export-slot /
      // export-log / clear-log / export-event-log / clear-event-log
      // ported to src/campaign/actions/registry.ts (H.3 save + log).
      default: break;
    }
  }

  // Save-management handlers (_newSave / _loadSlot / _deleteSlot /
  // _deleteAllSaves / _exportSlot / _pushGitHub) ported to
  // src/campaign/actions.ts + registered in actions/registry.ts (H.3).

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

  // _renderAiStoryContextPanel removed in Phase G.12. The React
  // `AiStoryContextPanel` (`src/campaign/tabs/StoryHomePanels.tsx`)
  // renders from typed data produced by `_aiStoryContextData`.
  function _aiStoryContextData(state) {
    const ctx = _storyContextFor(state.currentWorld || 'haven');
    const manual = state.storyMode?.manualSummaryEntries || [];
    const branches = window.CJS.CampaignStoryBranch?.getBranches?.(state.currentWorld)
      || state.storyMode?.manualBranches || [];
    const loaded = [ctx.indexData ? 1 : 0, ctx.allWorldText ? 1 : 0, ctx.worldText ? 1 : 0, ctx.structuredWorldData ? 1 : 0].reduce((a, b) => a + b, 0);
    const arcs = Array.isArray(ctx.structuredWorldData?.arcs) ? ctx.structuredWorldData.arcs : [];
    return {
      loaded,
      total: 4,
      staticLines: [
        { path: String(ctx.allWorldPath), statusLabel: _label(ctx.allWorldStatus) },
        { path: String(ctx.worldPath), statusLabel: _label(ctx.worldStatus) }
      ],
      indexLines: [
        { path: String(ctx.indexPath), statusLabel: _label(ctx.indexStatus) },
        { path: String(ctx.structuredWorldPath), statusLabel: _label(ctx.structuredWorldStatus) }
      ],
      arcsCount: arcs.length,
      manualCount: manual.length,
      branchCount: branches.length
    };
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
    const shapePillsMarkup = `<div class="campaign-chip-row">${_shapePillsData(scenario).pills.map((p) => `<span class="campaign-chip">${_esc(p.label)}</span>`).join('')}</div>`;
    body.innerHTML = `
      <div class="campaign-preview">
        <b>${_esc(scenario.name || scenario.id)}</b><br>
        ${_esc(scenario.notes || scenario.summary || 'No notes.')}<br>
        ${shapePillsMarkup}
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

  // Log-management handlers (_exportLog / _clearLog / _exportEventLog /
  // _clearEventLog) ported to src/campaign/actions.ts + registered in
  // actions/registry.ts (H.3 log).

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

  // ── Typed tab data for Phase F/G per-tab ports ─────────────────────
  // Each `get<Tab>Data` returns a JSON-friendly snapshot the matching
  // React component reads. Heavy / shared sub-panels that haven't yet
  // ported produce HTML fragments via closure-private helpers; the
  // React component embeds them via dangerouslySetInnerHTML chunks.

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
  // renderEventResultHtml / renderOracleHtml removed in Phase G.2 —
  // the React shell now reads typed `getEventResultData(state)` /
  // `getOracleData(state)` and renders JSX via
  // `src/campaign/tabs/ResultPanels.tsx`.

  // Quest Home (non-zombie). The hero / quest-types panel / quest-run
  // tools render in JSX from this typed snapshot; the active-quest
  // cards and the optional active-sequence panel still go through
  // HTML bridges (renderQuestRowHtml, renderActiveSequenceHtml).
  // Typed snapshot for the React ActiveSequencePanel. Accepts an
  // optional `scopes` filter so each tab only shows its own scope
  // (story / quest / event). Returns null when no sequence matches.
  function getActiveSequenceData(state = CS().getState(), scopes = null) {
    if (!state) return null;
    const Seq = window.CJS.CampaignSequences;
    const active = Seq?.active?.(state);
    if (!active || (scopes && !scopes.includes(active.scope))) return null;
    const sequence = Seq.cachedSequence?.(active.sequenceId, state.currentWorld) || null;
    const meta = Seq?.storyMeta?.(sequence || active.sequenceId, state.currentWorld) || {};
    const node = sequence ? Seq.findNode?.(sequence, active.nodeId) : null;
    const vnActive = !!(window.CJS.CampaignSequenceVN?.isEnabled?.() && active);
    return {
      title: active.title || active.sequenceId || '',
      scopeLabel: _label(active.scope || 'sequence'),
      chapterLabel: meta.chapterLabel || '',
      nodeId: active.nodeId || '',
      replayMode: active.applyConsequences === false,
      vnActive,
      node: node ? _sequenceNodeSnapshot(node, active, state) : null
    };
  }

  // Typed snapshot for one sequence node. The React `SequenceNodePanel`
  // (`src/campaign/tabs/SequenceNode.tsx`) consumes this directly —
  // it replaces the closure-private `_renderSequenceNode` HTML helper
  // (deleted in Phase G.8). Discriminated by `type`. The choice variant
  // pre-resolves eligibility + alignment hint per choice so the React
  // tree doesn't need to reach back into CJS.CampaignSequences /
  // CampaignAlignment.
  function _sequenceNodeSnapshot(node = {}, active = {}, state = CS().getState() || {}) {
    const Seq = window.CJS.CampaignSequences;
    const type = String(node.type || 'narration').toLowerCase();
    const replay = active?.applyConsequences === false;
    const speaker = node.speaker || '';
    const text = node.text || node.prompt || node.summary || node.title || '';
    const meta = _sequenceNodeMetaBits(node);
    if (type === 'choice') {
      const choices = (node.choices || []).map((choice) => {
        const eligibility = Seq?.choiceEligibility?.(choice, node, state, { active }) || { ok: true, blockers: [], hidden: false };
        if (eligibility.hidden) return null;
        const locked = !eligibility.ok;
        const alignmentHint = window.CJS.CampaignAlignment?.describeDeltas?.(
          choice.alignment ?? choice.karma ?? choice.consequencePoints ?? choice.alignmentDelta
        );
        const hint = locked
          ? (eligibility.blockers || []).join(' | ')
          : (choice.summary || alignmentHint || choice.next || '');
        return {
          id: String(choice.id || ''),
          label: String(choice.label || choice.id || ''),
          hint: String(hint || ''),
          locked
        };
      }).filter(Boolean);
      return { type: 'choice', speaker, text: text || 'Choose a path.', choices };
    }
    if (type === 'stat_check') {
      return {
        type: 'stat_check',
        text: text || `${node.actor || 'Party'} checks ${node.stat || '?'} vs ${node.difficulty || node.dc || '?'}.`,
        meta
      };
    }
    if (type === 'combat') {
      return {
        type: 'combat',
        text: text || node.label || 'Combat encounter',
        meta,
        replay,
        encounterId: String(node.encounterId || ''),
        battleSetId: String(node.battleSetId || '')
      };
    }
    if (type === 'minigame') {
      const gameId = node.minigame?.gameId || node.minigameId || node.gameId || '';
      return {
        type: 'minigame',
        text: text || `${_label(gameId || 'Mini-game')} challenge`,
        meta,
        replay,
        gameId: String(gameId),
        gameLabel: gameId ? _label(gameId) : ''
      };
    }
    if (type === 'scenario') {
      const activeRun = state.activeScenarioRun;
      const scenarioId = String(node.scenarioId || '');
      const scenarioOpen = !!(activeRun && activeRun.scenarioId === scenarioId);
      return {
        type: 'scenario',
        text: text || node.label || node.title || 'Exploration run',
        meta,
        replay,
        scenarioId,
        scenarioOpen
      };
    }
    if (type === 'end') {
      return { type: 'end', text: text || 'This sequence is ready to close.' };
    }
    return {
      type: 'default',
      kind: type,
      speaker,
      text,
      meta,
      replay,
      next: String(node.next || '')
    };
  }

  function _sequenceNodeMetaBits(node = {}) {
    const bits = [];
    if (node.stat) bits.push(`${node.stat} DC ${node.difficulty || node.dc || '?'}`);
    if (node.encounterId) bits.push(String(node.encounterId));
    if (node.battleSetId) bits.push(String(node.battleSetId));
    if (node.scenarioId) bits.push(`Scenario: ${_label(node.scenarioId)}`);
    const gameId = node.minigame?.gameId || node.minigameId || node.gameId;
    const difficulty = node.minigame?.difficulty || node.difficulty;
    if (gameId) bits.push(`Mini-Game: ${_label(gameId)} Lv ${difficulty || 1}`);
    if (node.tags?.length) bits.push((node.tags || []).map(_label).join(', '));
    return bits;
  }

  function getScenarioSummaryData(state = CS().getState()) {
    if (!state) return null;
    const run = state.activeScenarioRun;
    if (!run) {
      return { hasRun: false };
    }
    const scenario = CS().getScenarioById(run.scenarioId);
    const location = run.travelMode === 'grid_map' && run.currentCell
      ? `${run.currentCell.x},${run.currentCell.y}`
      : (run.currentNode || '-');
    const objective = run.objectiveState || null;
    return {
      hasRun: true,
      name: scenario?.name || run.scenarioId || 'Run',
      questPill: _runQuestPill(state, run, scenario),
      isGrid: run.travelMode === 'grid_map',
      location,
      danger: run.danger,
      dangerMax: run.dangerMax,
      campsUsed: run.usedCampRests,
      campsMax: run.limits?.campRests ?? 0,
      eventsUsed: run.eventsUsed,
      eventsMax: run.limits?.events ?? 0,
      battlesUsed: run.randomBattlesUsed,
      battlesMax: run.limits?.randomBattles ?? 0,
      roamerCount: (run.movingThreats || []).length,
      objective: objective ? {
        completed: !!objective.completed,
        visible: objective.visible !== false,
        label: objective.label || 'Reach the target',
        meta: _scenarioObjectiveMeta(run, objective)
      } : null,
      questRunTaskHtml: _renderQuestRunTask(state, run, scenario) || '',
      hasGeneratedScenario: !!scenario?.generated
    };
  }

  // Typed snapshots for small shared panels used across tabs.
  function getTravelSurpriseData(state = CS().getState()) {
    if (!state) return null;
    const notice = state.lastTravelSurprise;
    if (!notice || !state.activeScenarioRun) return null;
    return {
      title: notice.title || 'Travel Surprise',
      categoryLabel: _label(notice.category || 'surprise'),
      prompt: notice.prompt || '',
      areaLabel: notice.area || 'Area',
      repeatLabel: notice.repeated ? `Revisit ${notice.visitCount || 2}` : 'New route',
      locationLabel: notice.location || ''
    };
  }

  function getCombatResultData(state = CS().getState()) {
    if (!state) return null;
    const result = state.pendingBattleResult;
    if (!result) return null;
    return {
      resultLabel: result.result || 'resolved',
      encounterId: result.encounterId || '',
      rounds: result.rounds || 0,
      lootHtml: _renderLootSummary(result.loot || []),
      consequenceNoticeHtml: _renderCombatConsequenceNotice(result, state)
    };
  }

  function getLastCombatResultData(state = CS().getState()) {
    if (!state) return null;
    const result = state.lastCombatResult;
    if (!result) return null;
    return {
      resultLabel: result.result || 'resolved',
      label: result.encounterId || result.label || 'Campaign battle',
      rounds: result.rounds || 0,
      summary: result.summary || '',
      pulseHtml: _renderCombatPulseSummary(result.combatPulse) || '',
      lootHtml: _renderLootSummary(result.loot || [])
    };
  }

  function getLastReportData(state = CS().getState()) {
    if (!state) return null;
    const report = state.lastScenarioReport;
    if (!report) return null;
    return {
      outcome: report.outcome || '',
      danger: report.danger || 0,
      campsUsed: report.usedCampRests || 0,
      eventsUsed: report.eventsUsed || 0,
      battlesCount: (report.completedBattles || []).length,
      diffJson: JSON.stringify(report.diff, null, 2)
    };
  }

  function getPendingBattleData(state = CS().getState()) {
    if (!state) return null;
    const battle = state.pendingBattle;
    if (!battle) return null;
    const isRandom = battle.source === 'random';
    const canRun = !!(battle.encounterId || battle.battleSetId || (battle.monsterIds || []).length);
    return {
      sourceLabel: _battleSourceLabel(battle),
      label: battle.label || battle.encounterId || '',
      subLabel: battle.encounterId || battle.battleSetId || (battle.monsterIds || []).join(', ') || '',
      autoMapLabel: battle.battleMap?.theme ? _label(battle.battleMap.theme) : '',
      contextHtml: _renderPendingBattleContext(state, battle) || '',
      partySummaryHtml: _renderBattlePartySummary(state) || '',
      canRun,
      isRandom
    };
  }

  // Typed snapshot for the React SoloNotice panel. Returns null when
  // there's no pending solo hook card. Shared by Overview / EventTab /
  // QuestHome / QuestsPanel / StoryHome.
  function getSoloNoticeData(state = CS().getState()) {
    if (!state) return null;
    const card = _pendingSoloHookCard(state);
    if (!card) return null;
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
    return {
      tone: summary.tone,
      summaryLabel: summary.label,
      kindLabel: _label(kind),
      choiceLabel,
      risk,
      riskClass: Side().riskClass(risk),
      title: card.title || card.name || card.id || '',
      prompt,
      inlinePurposeHtml: _renderInlinePurpose(kind === 'rumor_offer' ? 'rumor' : _purposeKeyForCard(card)),
      consequencePreviewHtml: _renderConsequencePreview(ops, {
        emptyTitle: 'Flavor only',
        emptyText: 'No mechanical change yet. Save it as text, make it a rumor, or turn it into a quest.'
      }),
      flavorTrailHtml: _renderFlavorTrail(card),
      acceptLabel: ops.length ? 'Accept & Apply' : 'Accept as Quest',
      acceptHint
    };
  }

  // Typed snapshot of state.lastEvent for the React EventResult panel.
  // Returns null when no event has been rolled. Used by EventLog,
  // EventTab, Overview, and Maps. Embedded sub-fragments (inline
  // purpose, consequence preview, flavor trail) still come through
  // closure-private helpers because their inner data shapes live in
  // sibling modules (HubTab, Controls).
  function getEventResultData(state = CS().getState()) {
    if (!state) return null;
    const event = state.lastEvent;
    if (!event) return null;
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
    const opsDesc = suggested.length ? Ops().describe(suggested).filter(Boolean) : [];
    return {
      title: event.title || event.id || 'Event',
      subLabel: event.tableName || event.type || 'event',
      tone: summary.tone,
      summaryLabel: summary.label,
      ideaPillLabel: event.gmIdea ? (ideaLabels[event.gmIdea] || event.gmIdea) : '',
      prompt: event.prompt || '',
      gmHook: event.gmHook || '',
      inlinePurposeHtml: _renderInlinePurpose('event'),
      manualSummary: event.manualSummary ? {
        short: event.manualSummary.short || 'No short result written yet.',
        main: event.manualSummary.main || '',
        tags: (event.manualSummary.tags || []).filter(Boolean)
      } : null,
      consequencePreviewHtml: _renderConsequencePreview(suggested, {
        emptyTitle: 'Flavor or plot text only',
        emptyText: 'No reward or damage is applied. Save the text, pin it as a plot seed, or ignore it.'
      }),
      flavorTrailHtml: _renderFlavorTrail(event),
      applyLabel: suggested.length ? 'Apply Listed Changes' : 'Log Flavor',
      applyHint: opsDesc.length ? 'Commit: ' + opsDesc.join('; ') : 'Log the event with no stat changes',
      hasManualSummary: !!event.manualSummary,
      hasPlotSeedTrigger: !!(event.gmHook || event.gmIdea),
      hasOracleTableId: !!event.oracleTableId
    };
  }

  // Typed snapshot of state.lastOracle for the React Oracle panel.
  function getOracleData(state = CS().getState()) {
    if (!state) return null;
    const oracle = state.lastOracle;
    if (!oracle) return null;
    return {
      text: oracle.text || '',
      inlinePurposeHtml: _renderInlinePurpose('oracle'),
      consequencePreviewHtml: _renderConsequencePreview([], {
        emptyTitle: 'Flavor prompt',
        emptyText: 'Use as narration now, save it as a note, or reroll for a sharper prompt.'
      })
    };
  }

  // Typed snapshot of one quest for the React QuestRow component.
  // Used by QuestHome (active rows, capped) and QuestsPanel (active +
  // resolved rows). Replaces the per-row HTML bridge with structured
  // data so the row body can render as JSX.
  function getQuestRowData(quest = {}, opts = {}) {
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
    const scenarioDisabled = !!(activeRun && !isRunQuest);
    const tags = Array.from(new Set([
      ...(quest.tags || []),
      ...(quest.contextTags || []),
      ...(quest.monsterTags || [])
    ].filter(Boolean))).slice(0, 8).map((t) => _label(t));
    const variant = quest.activeVariant || null;
    const variantLabel = variant?.label || quest.variantLabel || '';
    const variantText = quest.variantDialogue || quest.variantSummary || variant?.dialogue || variant?.summary || '';
    const variantRepeat = quest.repeatCycle ? `Cycle ${quest.repeatCycle + 1}` : '';
    return {
      id: String(quest.id || ''),
      title: quest.title || quest.id || 'Quest',
      summary: quest.summary || '',
      statusLabel: _label(quest.status || 'active'),
      statusClass: _questStatusClass(quest),
      metaLine: meta,
      resolved: !!opts.resolved,
      isRunQuest,
      scenarioDisabled,
      scenarioLabel: isRunQuest ? 'Open Map' : 'Map Run',
      scenarioHint: isRunQuest
        ? 'Jump to the active map for this quest'
        : 'Start (or generate) the map run for this quest',
      scenarioPill: _questScenarioPill(quest, activeRun, activeScenario),
      hasMiniGame: !!_questMiniGameObjective(quest),
      tagChips: tags,
      variant: (variantLabel || variantText || variantRepeat)
        ? { label: variantLabel, text: variantText, repeat: variantRepeat }
        : null,
      phaseLabel: opts.resolved ? 'Resolved' : (nextObjective?.label || 'Open'),
      doneCount: done,
      totalCount: total,
      objectives: objectives.map((obj) => {
        const cur = Number(obj.current || 0);
        const req = Math.max(1, Number(obj.required || 1));
        const pct = Math.max(0, Math.min(100, Math.round((cur / req) * 100)));
        return {
          id: String(obj.id || obj.label || ''),
          label: obj.label || obj.id || 'Objective',
          current: cur,
          required: req,
          pct,
          done: cur >= req,
          pulseHints: (obj.progressTriggers || []).slice(0, 2).map((trigger) => _triggerLabel(trigger))
        };
      })
    };
  }

  function getStoryDirectorData(state = CS().getState()) {
    if (!state) return null;
    const theme = _storyTheme(state);
    const themeStyleVars = {};
    if (theme.backdrop) themeStyleVars['--story-backdrop'] = `url('${_cssVarAssetUrl(theme.backdrop)}')`;
    if (theme.accent) themeStyleVars['--story-accent'] = theme.accent;
    if (theme.danger) themeStyleVars['--story-danger'] = theme.danger;
    const director = SD();
    if (!director) {
      return {
        moduleAvailable: false,
        themeClassName: theme.className || '',
        themeStyleVars
      };
    }
    const snap = director.snapshot();
    const pack = snap.pack;
    if (!pack) {
      const next = {
        index: 0,
        title: 'No story pack loaded',
        text: 'This world has a visual theme, but no Story Director pack yet. Add one later to unlock scene rolls, routes, clues, and side route guidance.',
        actions: []
      };
      return {
        moduleAvailable: true,
        hasPack: false,
        themeClassName: theme.className || '',
        themeStyleVars,
        vnHero: _storyVnHeroData({ state, pack: null, stage: null, next, theme })
      };
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
    return {
      moduleAvailable: true,
      hasPack: true,
      themeClassName: theme.className || '',
      themeStyleVars,
      stageName: stage.name || stage.id || 'No stage',
      stageSummary: stage.summary || '',
      vnHero: _storyVnHeroData({ state, pack, stage, next, theme }),
      soloGuideActiveIndex: Number(next.index || 0),
      actionDeckFlowSynced: !!flowSynced,
      actionDeckHasFlow: !!flow,
      stageRailEntries: _storyStageRailData(stages, stage),
      lastCard: _storyDirectorCardData(snap.last),
      pressureBoard: _storyPressureBoardData(metrics, snap, pack),
      sideFlow: _storySideFlowData(flow, flowSynced),
      clues: _storyCluesPanelData(clues, facts),
      queue: _storyQueuePanelData(queue),
      truths: _storyTruthsPanelData(pack)
    };
  }

  function getWorldGateData(state = CS().getState()) {
    if (!state) return null;
    const worlds = CS().getContent().worlds || {};
    const options = _worldOptions();
    const current = state.currentWorld || 'haven';
    return {
      currentWorldName: worlds[current]?.displayName || current,
      pressures: _pressureStripChips(state),
      cards: options.map((option) => _worldGateCardData(option.value, worlds[option.value] || {}, state))
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
        { action: 'story-manual-note', label: 'Manual Note', hint: 'Add a GM-written scene to the story summary', kind: 'manual' },
        { action: 'open-story-summary', label: 'Summary', hint: 'Read what has happened so far' },
        { action: 'story-copy-prompt', label: 'Copy AI Context', hint: 'Copy static summaries, live GM notes, branches, and current route state for AI drafting', kind: 'manual' }
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
      vnHero: _storyVnHeroData({ state, pack, stage, next, theme }),
      chapterTree: _chapterTreeData(state),
      choiceConsequence: _choiceConsequenceData(state),
      aiStoryContext: _aiStoryContextData(state),
      storyPipeline: _storyPipelinePanelData(pipeline),
      syncSummary: _syncSummaryData('After This Part Changes', pipeline.syncSummary, pipeline.syncTitle)
    };
  }

  function getQuestPanelData(state = CS().getState()) {
    if (!state) return null;
    if (state.currentWorld === 'zombie') {
      return { isZombie: true, zombie: _zombieScavengeTrackerData(state) };
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
      activeQuestRows: active.map((quest) => getQuestRowData(quest)),
      finishedQuestRows: finished.map((quest) => getQuestRowData(quest, { resolved: true }))
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
        questPill: null,
        shapePills: { pills: [] },
        run: null,
        freeform: null,
        linear: null
      };
    }
    const mode = run.travelMode || (run.mapId ? 'node_map' : 'freeform');
    const scenario = CS().getActiveScenario();
    const shared = {
      hasRun: true,
      mode,
      scenarioName: scenario?.name || 'Run',
      scenarioNotes: scenario?.notes || '',
      questPill: _runQuestPill(state, run, scenario),
      shapePills: _shapePillsData(scenario || {}),
      run: {
        danger: run.danger,
        dangerMax: run.dangerMax,
        campsUsed: run.usedCampRests,
        campsMax: run.limits?.campRests ?? 0,
        battlesUsed: run.randomBattlesUsed,
        battlesMax: run.limits?.randomBattles ?? 0,
        eventsUsed: run.eventsUsed,
        eventsMax: run.limits?.events ?? 0
      }
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
        questPill: _scenarioQuestPillData(scenario, state),
        shapePills: _shapePillsData(scenario),
        runActions: _scenarioRunActionsData(scenario, state)
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
        delivery: _sequenceDeliveryData(entry, 'event'),
        action: _sequenceActionData(entry, 'event')
      })),
      questChains: kind === 'side' ? {
        activeCount: activeChains.length,
        availableCount: availableChains.length,
        active: activeChains.map((chain) => _questChainActiveData(chain)),
        available: availableChains.map((chain) => _questChainTemplateData(chain))
      } : null
    };
  }

  function getQuestHomeData(state = CS().getState()) {
    if (!state) return null;
    const isZombie = state.currentWorld === 'zombie';
    if (isZombie) {
      return { isZombie: true, zombie: _zombieScavengeHomeData(state) };
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
      activeQuestRows: active.slice(0, 4).map((quest) => getQuestRowData(quest))
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

  // Phase G.16 — typed Town Snapshot + Roll Float data for the
  // Overview tab. The HubTab still owns the underlying hub state
  // (CampaignHub.getCurrentHubDefinition / getCurrentHubState); the
  // rumor row markup stays as an HTML bridge until HubTab itself
  // ports (K.3).
  function getTownSnapshotData(state = CS().getState()) {
    if (!state) return null;
    const Hub = window.CJS.CampaignHub;
    const HubTab = window.CJS.CampaignUIInternal.HubTab;
    const hub = Hub?.getCurrentHubDefinition?.() || {};
    const hubState = Hub?.getCurrentHubState?.() || {};
    const activeQuests = Object.values(state.quests || {}).filter((quest) => !_isQuestResolved(quest));
    const activeChains = CS().getActiveQuestChains?.() || [];
    const problems = hubState.activeProblems || [];
    const rumors = HubTab?.openRumors?.(hubState) || [];
    const stats = ['security', 'prosperity', 'warmth', 'weirdness'].map((stat) => ({
      id: stat,
      label: _label(stat),
      value: Number(hubState[stat] ?? 0)
    }));
    return {
      hubName: String(hub.name || 'Town Overview'),
      hubDescription: String(hub.description || 'Town phase command view.'),
      moodLabel: _label(hubState.mood || 'neutral'),
      stats,
      kpis: [
        { count: activeQuests.length, label: 'Open quests', tone: '' },
        { count: activeChains.length, label: 'Quest arcs', tone: '' },
        { count: problems.length, label: 'Problems', tone: problems.length ? 'is-risk' : '' },
        { count: rumors.length, label: 'Rumors', tone: rumors.length ? 'is-plot' : '' }
      ],
      problems: problems.slice(0, 4).map((problem) => ({
        id: String(problem),
        label: _label(problem)
      })),
      rumors: rumors.slice(0, 3).map((rumor) => _rumorRowData(rumor, { compact: true })),
      locations: (hub.locations || []).slice(0, 5).map((loc) => ({
        id: String(loc.id || ''),
        name: String(loc.name || loc.id || ''),
        detail: String(loc.notes || _label(loc.type || 'location'))
      }))
    };
  }

  function getTownRollFloatData(state = CS().getState()) {
    if (!state) return null;
    const pending = _pendingSoloHookCard(state);
    if (!pending) {
      return { pending: null };
    }
    const ops = _cardChoiceOps(pending);
    const hasOps = ops.length > 0;
    const HubTab = window.CJS.CampaignUIInternal.HubTab;
    const summary = HubTab?.consequenceSummary?.(ops, {
      hasText: !!(pending.prompt || pending.summary || pending.text)
    }) || { tone: 'flavor', label: 'flavor', short: '' };
    return {
      pending: {
        title: String(pending.title || pending.name || pending.id || ''),
        toneLabel: String(summary.label || ''),
        toneClass: `is-${summary.tone}`,
        short: String(summary.short || ''),
        hasOps
      }
    };
  }

  // K.3 — typed bridges for the Battle Sets / Map Seeds forge tabs.
  // Replaces HubTab.renderBattleSets / renderMapSeeds (HTML strings with
  // data-campaign-action) with structured data the React tree renders as
  // JSX (src/campaign/tabs/CampaignHubTabs.tsx).
  function getBattleSetsData() {
    const cards = window.CJS.CampaignBattleSetForge?.getCards?.() || [];
    return {
      cards: cards.map((card) => ({
        id: String(card.id || ''),
        name: String(card.name || card.id || ''),
        canonRisk: String(card.canonRisk || 'green'),
        canonRiskClass: Side().riskClass(card.canonRisk),
        rank: String(card.rank || '-'),
        objective: String(card.objective || ''),
        tags: Array.isArray(card.tags) ? card.tags.map(String) : [],
        enemyMix: (card.enemyMix || []).map((enemy) => ({
          qty: Number(enemy.qty || 1),
          label: String(enemy.label || enemy.name || enemy.id || 'unit')
        })),
        gimmick: String(card.gimmick || ''),
        queueLabel: card.encounterId ? 'Queue Combat' : 'Queue Manual'
      }))
    };
  }

  function getQuestChainsData() {
    const QC = window.CJS.CampaignQuestChains;
    if (!QC) {
      return { activeCount: 0, availableCount: 0, flowGuide: null, active: [], finished: [], available: [] };
    }
    const available = QC.getAvailable?.() || [];
    const active = QC.getActive?.() || [];
    const finished = QC.getFinished?.() || [];
    const guideSource = active[0]?.template || available[0] || null;
    return {
      activeCount: active.length,
      availableCount: available.length,
      flowGuide: guideSource ? _sideStoryFlowGuideData(guideSource) : null,
      active: active.map((chain) => _questChainActiveData(chain)),
      finished: finished.map((chain) => _questChainResolvedData(chain)),
      available: available.map((chain) => _questChainTemplateData(chain))
    };
  }

  function getMapSeedsData() {
    const seeds = window.CJS.CampaignMapSeedForge?.getSeeds?.() || [];
    return {
      seeds: seeds.map((seed) => ({
        id: String(seed.id || ''),
        name: String(seed.name || seed.id || ''),
        canonRisk: String(seed.canonRisk || 'green'),
        canonRiskClass: Side().riskClass(seed.canonRisk),
        purpose: (Array.isArray(seed.purpose) ? seed.purpose : [seed.purpose].filter(Boolean))
          .map(String).join(', '),
        nodes: (seed.nodes || []).map((node) => ({
          name: String(node.name || node.id || ''),
          detail: String(node.role || node.notes || '')
        }))
      }))
    };
  }

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

  function getSideForgeData(state = CS().getState()) {
    if (!state) return null;
    const Hub = window.CJS.CampaignHub;
    const hub = Hub?.getCurrentHubDefinition?.() || {};
    const hubState = Hub?.getCurrentHubState?.() || {};
    const last = state.lastSideContentCard;
    const ideas = Object.values(state.sideContent?.generatedIdeas || {});
    const saved = ideas.filter((idea) => idea.status === 'saved' || idea.status === 'active');
    const review = state.sideContent?.reviewQueue || [];
    const history = state.sideContent?.contentHistory || [];
    return {
      hubName: String(hub.name || 'Living Hub'),
      hubDescription: String(hub.description || 'Town pulse, rumors, problems, and content review queue.'),
      hubId: String(hub.id || ''),
      moodLabel: _label(hubState.mood || 'neutral'),
      stats: {
        security: Number(hubState.security ?? 0),
        prosperity: Number(hubState.prosperity ?? 0),
        warmth: Number(hubState.warmth ?? 0),
        weirdness: Number(hubState.weirdness ?? 0)
      },
      problemPurposeHtml: _renderInlinePurpose('problem'),
      problems: (hubState.activeProblems || []).map((problem) => ({
        id: String(problem),
        label: _label(problem)
      })),
      lastCard: last ? _sideCardData(last, { mode: 'last' }) : null,
      rumors: _openRumors(hubState).slice(0, 6).map((rumor) => _rumorRowData(rumor)),
      savedIdeas: saved.slice(0, 8).map((idea) => _sideCardData(idea, { compact: true })),
      review: review.slice(0, 8).map((item) => ({
        id: String(item.id || ''),
        contentId: String(item.contentId || ''),
        reason: String(item.reason || ''),
        canonRisk: String(item.canonRisk || 'red'),
        canonRiskClass: Side().riskClass(item.canonRisk)
      })),
      history: history.slice(0, 10).map((line) => ({
        title: String(line.title || line.type || ''),
        result: String(line.result || ''),
        phaseLabel: String(line.phase ?? '')
      }))
    };
  }

  function getOracleForgeData(state = CS().getState()) {
    if (!state) return null;
    const last = state.lastSideContentCard?.type === 'oracle_prompt' ? state.lastSideContentCard : null;
    const tables = window.CJS.CampaignDataLoader?.getOracleTables?.() || [];
    return {
      purposeHtml: _renderInlinePurpose('oracle'),
      tableNames: tables.map((table) => String(table.name || table.id || '')).join(', ') || 'No oracle tables loaded.',
      lastCard: last ? _sideCardData(last, { mode: 'oracle' }) : null
    };
  }

  // K.3 — typed roster-tab data. Delegates the per-member breakdown to
  // PartyTab.rosterMemberData (hero + vitals + stats + affinities typed;
  // the skills/passives/statuses/equipment detail row stays one HTML
  // island until its own K.3 step). React renders CampaignRosterTab.tsx.
  function getRosterData(state = CS().getState()) {
    if (!state) return null;
    const PartyTab = window.CJS.CampaignUIInternal.PartyTab;
    if (!PartyTab?.rosterMemberData) return null;
    const h = _tabHelpers();
    const entries = Object.entries(state.party || {});
    const toData = ([id, member]) => PartyTab.rosterMemberData(id, member, h);
    return {
      active: entries.filter(([, m]) => (m.rosterRole || 'active') !== 'bench').map(toData),
      bench: entries.filter(([, m]) => (m.rosterRole || 'active') === 'bench').map(toData)
    };
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
    // Phase E React Shell bridge. See enableReactShell() above for the
    // contract — when this is set, render() no longer clobbers _root
    // and instead emits `campaign:state-tick` events for the shell to
    // re-render against.
    enableReactShell,
    getChromeData,
    getEventLogData,
    getMinigameTestData,
    getTownSnapshotData,
    getTownRollFloatData,
    getRosterData,
    getSideForgeData,
    getOracleForgeData,
    getBattleSetsData,
    getMapSeedsData,
    getQuestChainsData,
    getAdventureLegendVisible,
    getStorySummaryData,
    getQuestHomeData,
    getEventTabData,
    getScenariosData,
    getRunData,
    getQuestPanelData,
    getStoryHomeData,
    getWorldGateData,
    getStoryDirectorData,
    getQuestRowData,
    getEventResultData,
    getOracleData,
    getSoloNoticeData,
    getTravelSurpriseData,
    getCombatResultData,
    getLastCombatResultData,
    getLastReportData,
    getPendingBattleData,
    getScenarioSummaryData,
    getActiveSequenceData,
    getSequenceShelfData,
    getMainBody,
    getPanelDefs,
    getPanelOrder,
    renderDrawerBody,
    handleAction,
    setActiveMode,
    setActiveTab,
    setActivePanel,
    getActiveTab: () => _activeTab,
    getActiveMode: () => _activeMode,
    getActivePanel: () => _activePanel
  });
})();
