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
  const Gen = () => window.CJS.CampaignScenarioGenerator;
  const Chat = () => window.CJS.CampaignPartyChat;
  const C = () => window.CJS.CONST;

  let _root = null;
  let _activeMode = 'town';
  let _activeTab = 'overview';
  let _booted = false;
  let _combatResultUnsub = null;
  let _combatReturnEventsBound = false;
  let _lastCombatResultKey = '';
  let _activePanel = null;
  let _lastFocus = null;
  let _escBound = false;
  let _drawerEl = null;
  let _drawerBackdropEl = null;

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
      ['pocket', 'Pocket Haven'],
      ['inventory', 'Inventory']
    ],
    scenario: [
      ['scenarios', 'Briefing'],
      ['maps', 'Run'],
      ['battleSets', 'Battle Sets'],
      ['mapSeeds', 'Map Seeds']
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

  async function init(root) {
    _root = root;
    _root.innerHTML = '<div class="campaign-loading">Loading Campaign Mode...</div>';

    try {
      await CM().loadDefaultData();
      await Chat()?.load?.();
      CS().loadContentFromDataStore();
      if (!Save().loadActive()) {
        CS().createNewSave(Object.values(CS().getContent().campaigns)[0]?.id);
        Save().saveCurrent();
      }
      _bindEvents();
      _bindEscapeForPanels();
      _bindCombatResultListener();
      _bindCombatReturnEvents();
      CS().subscribe(() => {
        Save().saveCurrent();
        render();
      });
      _booted = true;
      _consumeCombatResult();
      render();
    } catch (error) {
      console.error(error);
      _root.innerHTML = `<div class="campaign-error">Campaign Mode failed to load: ${_esc(error.message || error)}</div>`;
    }
  }

  function render() {
    if (!_root || !CS().getState()) return;
    const state = CS().getState();
    const campaign = CS().getCurrentCampaign();

    const isUtility = UTILITY_TABS.some(([id]) => id === _activeTab);
    const subTabs = isUtility ? UTILITY_TABS : (MODE_TABS[_activeMode] || []);

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

    const mapRegion = _root.querySelector('#campaign-map-region');
    if (mapRegion) window.CJS.CampaignMap.render(mapRegion);
    _bindRunPanel();
    _renderPanelLayer();
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
    _activeMode = 'scenario';
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
          <span>${_esc(world?.displayName || state.currentWorld)} | Chapter ${state.currentChapter} | Phase ${state.phase.number}: ${_esc(state.phase.name || state.phase.type)}</span>
        </div>
        ${_renderCompactCurrencies(state)}
        <div class="campaign-header-actions">
          <button class="campaign-action" data-campaign-action="new-save">New</button>
          <button class="campaign-action" data-campaign-action="save-slot">Save</button>
          <button class="campaign-action" data-campaign-action="fork-save">Fork</button>
          <button class="campaign-action" data-campaign-action="export-save">Export</button>
          <button class="campaign-action" data-campaign-action="import-save">Import</button>
          <button class="campaign-action" data-campaign-action="push-github">GitHub</button>
          <a class="campaign-action" href="editor.html">Editor</a>
          <a class="campaign-action" href="combat.html">Combat</a>
        </div>
      </header>
    `;
  }

  function _renderCompactCurrencies(state) {
    const values = _currencyAmounts(state);
    return `
      <div class="campaign-stats campaign-stats-compact" aria-label="Currencies">
        <span><small>Gold</small><b>${values.gold}</b></span>
      </div>
    `;
  }

  function _currencyAmounts(state) {
    const currencies = state.currencies || {};
    const worldGold = `${state.currentWorld || 'haven'}_gold`;
    const goldId = currencies[worldGold] != null ? worldGold
      : Object.keys(currencies).find((id) => String(id).toLowerCase().endsWith('_gold') || String(id).toLowerCase() === 'gold');
    return {
      gold: goldId ? Number(currencies[goldId] || 0) : 0
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
    const modeButtons = MODES.map(([id, label, icon]) => {
      const active = id === _activeMode && !UTILITY_TABS.some(([u]) => u === _activeTab);
      return `<button class="campaign-mode-btn ${active ? 'active' : ''}" data-campaign-mode="${id}">
        <span class="campaign-mode-icon">${icon}</span><span>${label}</span>
      </button>`;
    }).join('');
    const utilityButtons = UTILITY_TABS.map(([id, label]) => {
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

  function _renderParty(state) {
    const active = Object.entries(state.party || {}).filter(([, member]) => (member.rosterRole || 'active') !== 'bench');
    const bench = Object.entries(state.party || {}).filter(([, member]) => (member.rosterRole || 'active') === 'bench');
    return `
      <div class="campaign-panel-head">
        <h2>Party</h2>
        <button class="campaign-icon-btn" data-campaign-action="open-roster-tab">Roster</button>
      </div>
      ${active.map(([id, member]) => _renderPartyCard(id, member)).join('') || '<div class="campaign-empty">No active party members.</div>'}
      ${bench.length ? `<div class="campaign-muted campaign-sidebar-label">Bench</div>${bench.map(([id, member]) => _renderPartyCard(id, member)).join('')}` : ''}
    `;
  }

  function _renderPartyCard(id, member) {
    const hpPct = Math.round(((member.currentHp || 0) / (member.maxHp || 1)) * 100);
    const mpPct = Math.round(((member.currentMp || 0) / (member.maxMp || 1)) * 100);
    const statuses = (member.statuses || []).map((status) => `<span class="campaign-chip">${_esc(status.label || status.id)}</span>`).join('');
    const battleReady = Bridge()?.isMemberBattleReady ? Bridge().isMemberBattleReady(member) : true;
    const availability = battleReady ? 'Ready' : (Bridge()?.availabilityLabel?.(member) || 'Unavailable');
    const isBench = (member.rosterRole || 'active') === 'bench';
    return `
      <section class="campaign-character ${battleReady ? '' : 'is-unavailable'}">
        <div class="campaign-character-head">
          <div class="campaign-avatar">${member.portrait ? `<img src="${_escAttr(member.portrait)}" alt="">` : _esc(member.icon || member.name?.[0] || '?')}</div>
          <div>
            <strong>${_esc(member.name || id)}</strong>
            <div class="campaign-muted">Lv ${member.level || 1} | Rank ${_esc(member.rank || 'F')}</div>
          </div>
          <span class="campaign-pill ${battleReady ? 'is-current' : 'is-blocked'}">${_esc(availability)}</span>
        </div>
        <div class="campaign-bar"><span class="hp" style="width:${hpPct}%"></span><b>HP ${member.currentHp}/${member.maxHp}</b></div>
        <div class="campaign-bar"><span class="mp" style="width:${mpPct}%"></span><b>MP ${member.currentMp}/${member.maxMp}</b></div>
        <div class="campaign-chip-row">${statuses || '<span class="campaign-muted">No statuses</span>'}</div>
        <div class="campaign-mini-actions">
          <button data-campaign-action="damage-char" data-id="${_escAttr(id)}">Damage</button>
          <button data-campaign-action="heal-char" data-id="${_escAttr(id)}">Heal</button>
          <button data-campaign-action="mp-char" data-id="${_escAttr(id)}">MP</button>
          <button data-campaign-action="status-char" data-id="${_escAttr(id)}">Status</button>
          <button data-campaign-action="party-sheet" data-id="${_escAttr(id)}">Sheet</button>
          <button data-campaign-action="${isBench ? 'activate-character' : 'bench-character'}" data-id="${_escAttr(id)}">${isBench ? 'Activate' : 'Bench'}</button>
          <button data-campaign-action="party-availability" data-id="${_escAttr(id)}">Availability</button>
          ${battleReady ? '' : `<button data-campaign-action="party-available" data-id="${_escAttr(id)}">Return</button>`}
        </div>
      </section>
    `;
  }

  function _renderRoster(state) {
    const entries = Object.entries(state.party || {});
    const active = entries.filter(([, member]) => (member.rosterRole || 'active') !== 'bench');
    const bench = entries.filter(([, member]) => (member.rosterRole || 'active') === 'bench');
    return `
      <div class="campaign-tab-stack">
        <section class="campaign-panel">
          <div class="campaign-panel-head">
            <h2>Roster</h2>
            <button class="campaign-action" data-campaign-action="recruit-character">Recruit</button>
          </div>
          ${active.length ? active.map(([id, member]) => _renderRosterMember(id, member)).join('') : '<div class="campaign-empty">No active roster.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h2>Bench</h2></div>
          ${bench.length ? bench.map(([id, member]) => _renderRosterMember(id, member)).join('') : '<div class="campaign-empty">No benched members.</div>'}
        </section>
      </div>
    `;
  }

  function _renderRosterMember(id, member) {
    const base = _memberBase(id, member);
    const stats = _memberStats(id, member);
    const skills = _memberSkillEntries(id, member);
    const passives = _memberPassives(id, member);
    const statuses = member.statuses || [];
    const isBench = (member.rosterRole || 'active') === 'bench';
    return `
      <div class="campaign-roster-member">
        <div class="campaign-roster-head">
          <div class="campaign-character-head">
            <div class="campaign-avatar">${member.portrait ? `<img src="${_escAttr(member.portrait)}" alt="">` : _esc(member.icon || member.name?.[0] || '?')}</div>
            <div>
              <strong>${_esc(member.name || base?.name || id)}</strong>
              <div class="campaign-muted">Lv ${member.level || 1} | XP ${member.xp || 0} | Rank ${_esc(member.rank || base?.rank || 'F')} | ${isBench ? 'Bench' : 'Active'}</div>
              <div class="campaign-muted">${_esc(id)}${base?.id && base.id !== id ? ` from ${_esc(base.id)}` : ''}</div>
            </div>
          </div>
          <div class="campaign-row-actions">
            <button class="campaign-action" data-campaign-action="${isBench ? 'activate-character' : 'bench-character'}" data-id="${_escAttr(id)}">${isBench ? 'Activate' : 'Bench'}</button>
            <button class="campaign-action" data-campaign-action="level-char" data-id="${_escAttr(id)}">Level</button>
            <button class="campaign-action" data-campaign-action="stat-boost" data-id="${_escAttr(id)}">Stats</button>
            <button class="campaign-action danger" data-campaign-action="remove-character" data-id="${_escAttr(id)}">Remove</button>
          </div>
        </div>
        <div class="campaign-roster-resources">
          <div class="campaign-bar"><span class="hp" style="width:${Math.round(((member.currentHp || 0) / (member.maxHp || 1)) * 100)}%"></span><b>HP ${member.currentHp}/${member.maxHp}</b></div>
          <div class="campaign-bar"><span class="mp" style="width:${Math.round(((member.currentMp || 0) / (member.maxMp || 1)) * 100)}%"></span><b>MP ${member.currentMp}/${member.maxMp}</b></div>
        </div>
        <div class="campaign-stat-grid">
          ${Object.entries(stats).map(([stat, value]) => `<span><b>${_esc(stat)}</b>${Number(value || 0)}<small>${_esc(_statName(stat))}</small></span>`).join('')}
        </div>
        <div class="campaign-detail-grid">
          <div>
            <div class="campaign-section-title">Skills <button class="campaign-icon-btn" data-campaign-action="learn-skill" data-id="${_escAttr(id)}">+</button></div>
            ${skills.length ? skills.map((entry) => _renderKnownSkill(id, entry)).join('') : '<div class="campaign-empty">No skills.</div>'}
          </div>
          <div>
            <div class="campaign-section-title">Passives <button class="campaign-icon-btn" data-campaign-action="learn-passive" data-id="${_escAttr(id)}">+</button></div>
            ${passives.length ? passives.map((passive) => _renderKnownPassive(id, passive)).join('') : '<div class="campaign-empty">No passives.</div>'}
          </div>
          <div>
            <div class="campaign-section-title">Statuses <button class="campaign-icon-btn" data-campaign-action="status-char" data-id="${_escAttr(id)}">+</button></div>
            ${statuses.length ? statuses.map((status) => _renderKnownStatus(status)).join('') : '<div class="campaign-empty">No statuses.</div>'}
          </div>
          <div>
            <div class="campaign-section-title">Equipment</div>
            ${_renderEquipmentLoadout(id, member)}
          </div>
        </div>
      </div>
    `;
  }

  function _renderKnownSkill(memberId, entry) {
    const skillId = _skillEntryId(entry);
    const skill = DS().get('skills', skillId);
    const learned = entry.source === 'campaign' || _memberLearnedSkillIds(memberId).includes(skillId);
    return _renderKnownRecord({
      title: skill?.name || skillId,
      meta: _skillMeta(skill, entry),
      description: _desc(skill),
      removeAction: learned ? 'unlearn-skill' : '',
      removeData: learned ? `data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}"` : ''
    });
  }

  function _renderKnownPassive(memberId, passiveId) {
    const passive = DS().get('passives', passiveId) || DS().get('effects', passiveId);
    const learned = (CS().getState()?.party?.[memberId]?.learnedPassives || []).includes(passiveId);
    return _renderKnownRecord({
      title: passive?.name || passiveId,
      meta: passive?.trigger || passive?.category || passiveId,
      description: _desc(passive),
      removeAction: learned ? 'unlearn-passive' : '',
      removeData: learned ? `data-id="${_escAttr(memberId)}" data-passive-id="${_escAttr(passiveId)}"` : ''
    });
  }

  function _renderKnownStatus(status) {
    const def = _statusDef(status.id);
    return _renderKnownRecord({
      title: def?.name || status.label || status.id,
      meta: `${status.duration || 'manual'} | stacks ${status.stacks || 1}`,
      description: status.notes || _desc(def)
    });
  }

  function _renderKnownItem(bucket, id) {
    const record = DS().get(bucket, id) || DS().get('items', id);
    return _renderKnownRecord({
      title: record?.name || id,
      meta: record?.type || record?._world || id,
      description: _desc(record)
    });
  }

  function _renderKnownRecord({ title, meta, description, removeAction, removeData }) {
    return `
      <div class="campaign-record-line">
        <div>
          <strong>${_esc(title || '')}</strong>
          <small>${_esc(meta || '')}</small>
          <p>${_esc(description || 'No description yet.')}</p>
        </div>
        ${removeAction ? `<button class="campaign-icon-btn danger" title="Remove" data-campaign-action="${removeAction}" ${removeData}>-</button>` : ''}
      </div>
    `;
  }

  function _renderMain(state) {
    switch (_activeTab) {
      case 'roster': return _renderRoster(state);
      case 'sideForge': return _renderSideForge(state);
      case 'questChains': return _renderQuestChains(state);
      case 'battleSets': return _renderBattleSets(state);
      case 'mapSeeds': return _renderMapSeeds(state);
      case 'oracleForge': return _renderOracleForge(state);
      case 'inventory': return window.CJS.CampaignInventory.render();
      case 'shops': return `${window.CJS.CampaignEconomy.renderRest()}${window.CJS.CampaignEconomy.renderShops()}`;
      case 'craft': return window.CJS.PocketHaven.renderCraft();
      case 'cook': return window.CJS.PocketHaven.renderCook();
      case 'farm': return window.CJS.PocketHaven.renderFarm();
      case 'pocket': return window.CJS.PocketHaven.renderPocket();
      case 'scenarios': return _renderScenarios(state);
      case 'maps': return _renderRun(state);
      case 'quests': return _renderQuestPanel(state);
      case 'logs': return _renderLogPanel(state);
      case 'settings': return _renderSettings(state);
      case 'overview':
      default: return _renderOverview(state);
    }
  }

  function _renderOverview(state) {
    return `
      <div class="campaign-dashboard">
        <section class="campaign-panel campaign-actions-panel">
          <div class="campaign-panel-head"><h2>Adventure Desk</h2></div>
          <div class="campaign-control-stack">
            ${_controlGroup('Story Prompts', `
              <button class="campaign-action primary" data-campaign-action="solo-surprise">Story Offer</button>
              <button class="campaign-action" data-campaign-action="random-quest-offer">Quest Run</button>
              <button class="campaign-action" data-campaign-action="random-rumor-offer">Rumor Hook</button>
              <button class="campaign-action" data-campaign-action="roll-event">Event</button>
              <button class="campaign-action" data-campaign-action="roll-oracle">GM Prompt</button>
            `)}
            ${_controlGroup('Manual Control', `
              <button class="campaign-action" data-campaign-action="add-quest">Add Quest</button>
              <button class="campaign-action" data-campaign-action="manual-rumor">Manual Rumor</button>
              <button class="campaign-action" data-campaign-action="pick-event">Pick Event</button>
              <button class="campaign-action" data-campaign-action="custom-event">Custom Event</button>
              <button class="campaign-action" data-campaign-action="pick-oracle">Pick GM Prompt</button>
              <button class="campaign-action" data-campaign-action="custom-oracle">Custom GM Prompt</button>
            `)}
            ${_controlGroup('Campaign Admin', `
              <button class="campaign-action" data-campaign-action="pass-phase">Pass Phase</button>
              <button class="campaign-action" data-campaign-action="full-rest">Full Rest</button>
              <button class="campaign-action" data-campaign-action="travel-world">Travel World</button>
            `)}
          </div>
          <div class="campaign-action-grid" hidden>
            <button class="campaign-action primary" data-campaign-action="pass-phase">Pass Phase</button>
            <button class="campaign-action" data-campaign-action="add-quest">Add Quest</button>
            <button class="campaign-action" data-campaign-action="solo-surprise">Story Offer</button>
            <button class="campaign-action" data-campaign-action="full-rest">Full Rest</button>
            <button class="campaign-action" data-campaign-action="travel-world">Travel World</button>
          </div>
          <div class="campaign-trio-row" style="margin-top:12px" hidden>
            <span class="campaign-trio-label">Event</span>
            <button class="campaign-action" data-campaign-action="roll-event">🎲 Random</button>
            <button class="campaign-action" data-campaign-action="pick-event">📋 Pick</button>
            <button class="campaign-action" data-campaign-action="custom-event">✏️ Custom</button>
          </div>
          <div class="campaign-trio-row" hidden>
            <span class="campaign-trio-label">GM Prompt</span>
            <button class="campaign-action" data-campaign-action="roll-oracle">🎲 Random</button>
            <button class="campaign-action" data-campaign-action="pick-oracle">📋 Pick</button>
            <button class="campaign-action" data-campaign-action="custom-oracle">✏️ Custom</button>
          </div>
        </section>
        ${_renderSoloNotice(state)}
        ${_renderScenarioSummary(state)}
        ${_renderTravelSurprise(state)}
        ${_renderPendingBattle(state)}
        ${_renderCombatResult(state)}
        ${_renderLastCombatResult(state)}
        ${_renderEventResult(state)}
        ${_renderOracle(state)}
        ${_renderLastReport(state)}
      </div>
    `;
  }

  function _renderSideForge(state) {
    const hub = window.CJS.CampaignHub.getCurrentHubDefinition();
    const hubState = window.CJS.CampaignHub.getCurrentHubState();
    const last = state.lastSideContentCard;
    const ideas = Object.values(state.sideContent?.generatedIdeas || {});
    const saved = ideas.filter((idea) => idea.status === 'saved' || idea.status === 'active');
    const review = state.sideContent?.reviewQueue || [];
    const history = state.sideContent?.contentHistory || [];
    return `
      <div class="campaign-dashboard side-forge">
        <section class="campaign-panel side-forge-hero">
          <div class="campaign-panel-head">
            <div>
              <h2>${_esc(hub?.name || 'Living Hub')}</h2>
              <div class="campaign-muted">${_esc(hub?.description || '')}</div>
            </div>
            <span class="campaign-pill">${_esc(hubState?.mood || 'neutral')}</span>
          </div>
          <div class="campaign-stat-grid">
            <span>Security <b>${hubState?.security ?? 0}</b></span>
            <span>Prosperity <b>${hubState?.prosperity ?? 0}</b></span>
            <span>Warmth <b>${hubState?.warmth ?? 0}</b></span>
            <span>Weirdness <b>${hubState?.weirdness ?? 0}</b></span>
          </div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="roll-hub-pulse" data-table="town">Town Pulse</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="guild">Guild</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="tavern">Tavern</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="forge">Forge</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="weird">Weird</button>
            <button class="campaign-action" data-campaign-action="random-quest-offer">Quest Run</button>
            <button class="campaign-action" data-campaign-action="random-rumor-offer">Rumor Hook</button>
            <button class="campaign-action" data-campaign-action="manual-rumor">Manual Rumor</button>
            <button class="campaign-action" data-campaign-action="roll-forge-oracle">Oracle</button>
          </div>
        </section>
        ${_renderSoloNotice(state)}
        ${last ? _renderSideCard(last, { mode: 'last' }) : ''}
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Hub Problems</h3></div>
          ${(hubState?.activeProblems || []).map((problem) => `
            <div class="campaign-row">
              <strong>${_esc(problem)}</strong>
              <button class="campaign-action" data-campaign-action="resolve-hub-problem" data-id="${_escAttr(problem)}" data-hub-id="${_escAttr(hub?.id || '')}">Resolve</button>
            </div>
          `).join('') || '<div class="campaign-empty">No active hub problems.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Rumors</h3><button class="campaign-action" data-campaign-action="manual-rumor">Add Rumor</button></div>
          ${(hubState?.rumors || []).slice(0, 6).map((rumor) => `
            <div class="campaign-row">
              <div>
                <strong>${_esc(rumor.text || rumor.id)}</strong>
                <div class="campaign-muted">${_esc(rumor.status || 'active')}</div>
              </div>
              <span class="campaign-risk ${Side().riskClass(rumor.canonRisk)}">${_esc(rumor.canonRisk || 'green')}</span>
            </div>
          `).join('') || '<div class="campaign-empty">No rumors yet.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Saved Ideas</h3></div>
          ${saved.length ? saved.slice(0, 8).map((idea) => _renderSideCard(idea, { compact: true })).join('') : '<div class="campaign-empty">No saved ideas yet.</div>'}
        </section>
        <section class="campaign-panel review-panel">
          <div class="campaign-panel-head"><h3>Review Queue</h3></div>
          ${review.length ? review.slice(0, 8).map((item) => `
            <div class="campaign-row">
              <div>
                <strong>${_esc(item.contentId)}</strong>
                <div class="campaign-muted">${_esc(item.reason || '')}</div>
              </div>
              <div class="campaign-row-actions">
                <span class="campaign-risk ${Side().riskClass(item.canonRisk)}">${_esc(item.canonRisk || 'red')}</span>
                <button class="campaign-action" data-campaign-action="review-resolve" data-id="${_escAttr(item.id)}" data-decision="approved">Approve</button>
                <button class="campaign-action danger" data-campaign-action="review-resolve" data-id="${_escAttr(item.id)}" data-decision="rejected">Reject</button>
              </div>
            </div>
          `).join('') : '<div class="campaign-empty">No pending review.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Side History</h3></div>
          ${history.slice(0, 10).map((line) => `<div class="campaign-log-line"><span>${_esc(line.title || line.type)}: ${_esc(line.result || '')}</span><small>Phase ${line.phase}</small></div>`).join('') || '<div class="campaign-empty">No side content history.</div>'}
        </section>
      </div>
    `;
  }

  function _renderQuestChains() {
    const available = window.CJS.CampaignQuestChains.getAvailable();
    const active = window.CJS.CampaignQuestChains.getActive();
    const finished = window.CJS.CampaignQuestChains.getFinished?.() || [];
    return `
      <div class="campaign-tab-grid">
        <section class="campaign-panel campaign-wide-panel">
          <div class="campaign-panel-head">
            <h2>Quest Arcs</h2>
            <span class="campaign-pill">${active.length} active · ${available.length} available</span>
          </div>
          ${active.length ? active.map((chain) => _renderQuestChainActive(chain)).join('') : '<div class="campaign-empty">No active quest arcs. Start one below or use Quest Run for a single quest.</div>'}
          ${finished.length ? `<details class="campaign-resolved-quests"><summary>Resolved arcs (${finished.length})</summary>${finished.map(_renderQuestChainResolved).join('')}</details>` : ''}
        </section>
        ${available.length ? available.map((chain) => _renderQuestChainTemplate(chain)).join('') : '<section class="campaign-panel campaign-wide-panel"><div class="campaign-empty">No quest arc templates available for this world. Add some in the editor or import a side content pack.</div></section>'}
      </div>
    `;
  }

  function _renderQuestChainActive(chain) {
    const template = chain.template || {};
    const step = (template.steps || []).find((entry) => entry.id === chain.currentStepId);
    const steps = template.steps || [];
    const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === chain.currentStepId));
    return `
      <div class="campaign-row">
        <div>
          <strong>${_esc(chain.title || template.title || chain.templateId)}</strong>
          <div class="campaign-muted">${_esc(chain.status)} | Step ${currentIndex + 1}/${steps.length || 1}: ${_esc(step?.label || chain.currentStepId || '-')}</div>
          <div class="campaign-muted">${_esc(step?.text || '')}</div>
          ${_renderChainStakes(template)}
        </div>
        <div class="campaign-row-actions">
          <button class="campaign-action primary" data-campaign-action="chain-scenario" data-id="${_escAttr(chain.templateId)}">Map Run</button>
          <button class="campaign-action" data-campaign-action="chain-battle" data-id="${_escAttr(chain.templateId)}">Battle</button>
          <button class="campaign-action" data-campaign-action="advance-chain" data-id="${_escAttr(chain.templateId)}">Complete Step</button>
          <button class="campaign-action" data-campaign-action="complete-chain" data-id="${_escAttr(chain.templateId)}">Resolve</button>
          <button class="campaign-action danger" data-campaign-action="fail-chain" data-id="${_escAttr(chain.templateId)}">Fail</button>
        </div>
      </div>
    `;
  }

  function _renderQuestChainResolved(chain) {
    const template = chain.template || {};
    return `
      <div class="campaign-row">
        <div>
          <strong>${_esc(chain.title || template.title || chain.templateId)}</strong>
          <div class="campaign-muted">${_esc(_label(chain.status || 'resolved'))} at phase ${_esc(chain.completedAtPhase || chain.failedAtPhase || '-')}</div>
        </div>
      </div>
    `;
  }

  function _renderQuestChainTemplate(chain) {
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>${_esc(chain.title || chain.name || chain.id)}</h3>
          <span class="campaign-risk ${Side().riskClass(chain.canonRisk)}">${_esc(chain.canonRisk || 'green')}</span>
        </div>
        <div class="campaign-muted">${_esc(chain.summary || '')}</div>
        <div class="campaign-chip-row">${(chain.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('')}</div>
        ${_renderChainStakes(chain)}
        ${(chain.steps || []).map((step) => `<div class="campaign-step"><b>${_esc(step.label || step.id)}</b><span>${_esc(step.text || '')}</span></div>`).join('')}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="start-chain" data-id="${_escAttr(chain.id)}">Start Quest Run</button>
          <button class="campaign-action" data-campaign-action="save-chain" data-id="${_escAttr(chain.id)}">Save Idea</button>
          <button class="campaign-action" data-campaign-action="promote-chain" data-id="${_escAttr(chain.id)}">Add To Quests</button>
        </div>
      </section>
    `;
  }

  function _renderChainStakes(chain = {}) {
    const rewards = Ops().describe(chain.rewardOps || chain.rewards || []);
    const failures = Ops().describe(chain.failureOps || chain.failureConsequences || []);
    const battleCount = (chain.battleSetIds || []).length;
    const mapCount = (chain.mapSeedIds || []).length + (chain.linkedScenario ? 1 : 0);
    return `
      <div class="campaign-preview">
        <b>Run</b>: ${mapCount ? `${mapCount} map hook${mapCount === 1 ? '' : 's'}` : 'generated map'}${battleCount ? ` · ${battleCount} battle hook${battleCount === 1 ? '' : 's'}` : ''}<br>
        ${rewards.length ? `<b>Reward</b>: ${rewards.map(_esc).join('; ')}<br>` : ''}
        ${failures.length ? `<b>If failed</b>: ${failures.map(_esc).join('; ')}` : '<b>If failed</b>: GM consequence or mark failed'}
      </div>
    `;
  }

  function _startQuestChainRun(templateId) {
    const chain = window.CJS.CampaignQuestChains?.getTemplate?.(templateId);
    if (!chain) return UI().toast('Quest arc not found', 'info');
    if (CS().getState()?.activeScenarioRun) {
      _activeMode = 'scenario';
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
      if (_activeRunQuestId(activeRun, activeScenario) === quest.id || activeRun.questChainId === templateId) return _goto('scenario', 'maps');
      return UI().toast('End the active scenario before starting this quest arc map', 'info');
    }
    return _startQuestScenario(quest.id, {
      quest,
      source: 'quest_chain',
      questChainId: templateId,
      mapForm: chain.mapForm || 'node_map',
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
    _activeMode = 'town';
    _activeTab = 'quests';
    render();
    UI().toast('Quest arc added to Quests', 'success');
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

  function _renderBattleSets() {
    const cards = window.CJS.CampaignBattleSetForge.getCards();
    return `
      <div class="campaign-tab-grid">
        ${cards.map((card) => `
          <section class="campaign-panel">
            <div class="campaign-panel-head">
              <h3>${_esc(card.name || card.id)}</h3>
              <span class="campaign-risk ${Side().riskClass(card.canonRisk)}">${_esc(card.canonRisk || 'green')}</span>
            </div>
            <div class="campaign-muted">Rank ${_esc(card.rank || '-')} | ${_esc(card.objective || '')}</div>
            <div class="campaign-chip-row">${(card.tags || []).map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('')}</div>
            <div class="campaign-preview">
              <b>Enemy Mix</b><br>
              ${(card.enemyMix || []).map((enemy) => `${_esc(enemy.qty || 1)}x ${_esc(enemy.label || enemy.name || enemy.id || 'unit')}`).join('<br>') || 'Manual enemy mix'}
            </div>
            <div class="campaign-muted">${_esc(card.gimmick || '')}</div>
            <div class="campaign-action-grid">
              <button class="campaign-action primary" data-campaign-action="queue-battle-set" data-id="${_escAttr(card.id)}">${card.encounterId ? 'Queue Combat' : 'Queue Manual'}</button>
              <button class="campaign-action" data-campaign-action="save-battle-card" data-id="${_escAttr(card.id)}">Save Idea</button>
              <button class="campaign-action" data-campaign-action="copy-battle-card" data-id="${_escAttr(card.id)}">Copy</button>
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No battle set cards.</div>'}
      </div>
    `;
  }

  function _renderMapSeeds() {
    const seeds = window.CJS.CampaignMapSeedForge.getSeeds();
    return `
      <div class="campaign-tab-grid">
        ${seeds.map((seed) => `
          <section class="campaign-panel">
            <div class="campaign-panel-head">
              <h3>${_esc(seed.name || seed.id)}</h3>
              <span class="campaign-risk ${Side().riskClass(seed.canonRisk)}">${_esc(seed.canonRisk || 'green')}</span>
            </div>
            <div class="campaign-muted">${(Array.isArray(seed.purpose) ? seed.purpose : [seed.purpose].filter(Boolean)).map(_esc).join(', ')}</div>
            ${(seed.nodes || []).map((node, index) => `<div class="campaign-step"><b>${index + 1}. ${_esc(node.name || node.id)}</b><span>${_esc(node.role || node.notes || '')}</span></div>`).join('')}
            <div class="campaign-action-grid">
              <button class="campaign-action primary" data-campaign-action="save-map-seed" data-id="${_escAttr(seed.id)}">Save Idea</button>
              <button class="campaign-action" data-campaign-action="copy-map-seed" data-id="${_escAttr(seed.id)}">Copy</button>
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No map seeds.</div>'}
      </div>
    `;
  }

  function _renderOracleForge(state) {
    const last = state.lastSideContentCard?.type === 'oracle_prompt' ? state.lastSideContentCard : null;
    const tables = window.CJS.CampaignDataLoader.getOracleTables();
    return `
      <div class="campaign-dashboard">
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h2>Oracle / Keyword Forge</h2></div>
          <div class="campaign-muted">${tables.map((table) => _esc(table.name || table.id)).join(', ') || 'No oracle tables loaded.'}</div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="roll-forge-oracle">Roll Oracle</button>
            <button class="campaign-action" data-campaign-action="import-side-pack">Import Pack</button>
            <button class="campaign-action" data-campaign-action="export-side-pack">Export Save Ideas</button>
          </div>
        </section>
        ${last ? _renderSideCard(last, { mode: 'oracle' }) : ''}
      </div>
    `;
  }

  function _renderSideCard(card, options = {}) {
    const compact = !!options.compact;
    const choices = card.suggestedChoices || [];
    return `
      <section class="campaign-panel campaign-side-card ${compact ? 'compact' : ''}">
        <div class="campaign-panel-head">
          <div>
            <h3>${_esc(card.title || card.name || card.id)}</h3>
            <div class="campaign-muted">${_esc(card.type || 'side content')} | ${_esc(card.source || '')}</div>
          </div>
          <span class="campaign-risk ${Side().riskClass(card.canonRisk)}">${_esc(card.canonRisk || 'green')}</span>
        </div>
        ${card.prompt ? `<p>${_esc(card.prompt)}</p>` : ''}
        ${card.text ? `<p>${_esc(card.text)}</p>` : ''}
        ${card.summary && !compact ? `<p>${_esc(card.summary)}</p>` : ''}
        ${card.gmKeywords?.length && !compact ? `<div class="campaign-chip-row">${card.gmKeywords.map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('')}</div>` : ''}
        ${card.gmNote && !compact ? `<div class="campaign-warning">${_esc(card.gmNote)}</div>` : ''}
        ${choices.length && !compact ? choices.map((choice, index) => `
          <div class="campaign-preview">
            <b>${_esc(choice.label || `Choice ${index + 1}`)}</b><br>
            ${Ops().describe(choice.ops || []).map(_esc).join('<br>')}
          </div>
        `).join('') : ''}
        <div class="campaign-action-grid">
          ${choices.length ? `<button class="campaign-action primary" data-campaign-action="apply-side-choice" data-id="${_escAttr(card.id)}" data-choice="0">Apply Choice</button>` : ''}
          <button class="campaign-action" data-campaign-action="save-side-idea" data-id="${_escAttr(card.id)}">Save</button>
          <button class="campaign-action" data-campaign-action="copy-side-card" data-id="${_escAttr(card.id)}">Copy</button>
          <button class="campaign-action danger" data-campaign-action="reject-side-idea" data-id="${_escAttr(card.id)}">Reject</button>
        </div>
      </section>
    `;
  }

  function _controlGroup(title, buttons) {
    return `
      <div class="campaign-control-group">
        <div class="campaign-control-title">${_esc(title)}</div>
        <div class="campaign-action-grid">${buttons}</div>
      </div>
    `;
  }

  function _renderSoloNotice(state) {
    const card = _pendingSoloHookCard(state);
    if (!card) return '';
    const kind = state.pendingSoloHook?.kind || card.type || 'hook';
    const risk = Side().risk(card.canonRisk);
    const prompt = card.prompt || card.summary || card.gmHook || card.notes || '';
    const choice = card.suggestedChoices?.[0]?.label || 'Apply the first suggested choice';
    return `
      <section class="campaign-panel campaign-solo-notice ${risk === 'red' ? 'risk-red' : ''}">
        <div class="campaign-panel-head">
          <div>
            <h2>Story Offer</h2>
            <div class="campaign-muted">${_esc(_label(kind))} | ${_esc(choice)}</div>
          </div>
          <span class="campaign-risk ${Side().riskClass(risk)}">${_esc(risk)}</span>
        </div>
        <strong>${_esc(card.title || card.name || card.id)}</strong>
        ${prompt ? `<p>${_esc(prompt)}</p>` : ''}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="accept-solo-hook">Accept</button>
          <button class="campaign-action" data-campaign-action="solo-hook-quest">Make Quest</button>
          <button class="campaign-action" data-campaign-action="solo-hook-rumor">Make Rumor</button>
          <button class="campaign-action" data-campaign-action="save-solo-hook">Save</button>
          <button class="campaign-action danger" data-campaign-action="ignore-solo-hook">Ignore</button>
        </div>
      </section>
    `;
  }

  function _renderScenarioSummary(state) {
    const run = state.activeScenarioRun;
    if (!run) {
      return `
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h2>Scenario</h2></div>
          <div class="campaign-empty">No active scenario.</div>
          <button class="campaign-action primary" data-campaign-action="open-scenarios-tab">Start Scenario</button>
        </section>
      `;
    }
    const scenario = CS().getScenarioById(run.scenarioId);
    const location = run.travelMode === 'grid_map' && run.currentCell
      ? `${run.currentCell.x},${run.currentCell.y}`
      : (run.currentNode || '-');
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || run.scenarioId)}</h2>
          <span class="campaign-pill">Danger ${run.danger}/${run.dangerMax}</span>
        </div>
        <div class="campaign-stat-grid">
          <span>${run.travelMode === 'grid_map' ? 'Cell' : 'Node'} <b>${_esc(location)}</b></span>
          <span>Camp <b>${run.usedCampRests}/${run.limits?.campRests ?? 0}</b></span>
          <span>Events <b>${run.eventsUsed}/${run.limits?.events ?? 0}</b></span>
          <span>Battles <b>${run.randomBattlesUsed}/${run.limits?.randomBattles ?? 0}</b></span>
        </div>
        ${_renderQuestRunTask(state, run, scenario)}
        <div class="campaign-control-stack">
          ${_controlGroup('Scenario Tools', `
            <button class="campaign-action" data-campaign-action="open-maps-tab">Map</button>
            <button class="campaign-action primary" data-campaign-action="roll-travel-surprise">Movement Surprise</button>
            <button class="campaign-action" data-campaign-action="roll-party-chat">Party Banter</button>
            <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          `)}
          ${_controlGroup('Manual Control', `
            <button class="campaign-action" data-campaign-action="manual-battle">Manual Battle Result</button>
            <button class="campaign-action danger" data-campaign-action="end-scenario">End Scenario</button>
            ${scenario?.generated ? '<button class="campaign-action danger" data-campaign-action="cancel-scenario" title="Discard without report">Cancel Scenario</button>' : ''}
          `)}
        </div>
        <div class="campaign-action-grid" hidden>
          <button class="campaign-action" data-campaign-action="open-maps-tab">Map</button>
          <button class="campaign-action" data-campaign-action="roll-travel-surprise">Travel Surprise</button>
          <button class="campaign-action" data-campaign-action="roll-party-chat">Party Banter</button>
          <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          <button class="campaign-action" data-campaign-action="manual-battle">Manual Battle Result</button>
          <button class="campaign-action danger" data-campaign-action="end-scenario">End Scenario</button>
          ${scenario?.generated ? '<button class="campaign-action danger" data-campaign-action="cancel-scenario" title="Discard without report">Cancel Scenario</button>' : ''}
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
        ${_renderBattlePartySummary(state)}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="run-battle" ${canRun ? '' : 'disabled'}>Run in Combat App</button>
          <button class="campaign-action" data-campaign-action="manual-battle">Resolve Manually</button>
          ${isRandom ? '<button class="campaign-action" data-campaign-action="battle-reroll">🎲 Reroll</button>' : ''}
          <button class="campaign-action" data-campaign-action="battle-override">📋 Override</button>
          <button class="campaign-action" data-campaign-action="skip-victory">Manual Victory</button>
          <button class="campaign-action" data-campaign-action="skip-defeat">Manual Defeat (Penalty)</button>
          <button class="campaign-action danger" data-campaign-action="cancel-battle">Cancel</button>
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
    const ideaLabels = {
      new_char: '👤 New NPC',
      new_item: '🎁 Item idea',
      weapon: '⚔ Weapon idea',
      back_story: '📖 Backstory beat',
      main_plot: '🌌 Main plot thread',
      development: '✨ Character development',
      faction: '🏛 Faction hook',
      mystery: '🔮 Mystery hook'
    };
    const ideaPill = event.gmIdea ? `<span class="campaign-pill">${_esc(ideaLabels[event.gmIdea] || event.gmIdea)}</span>` : '';
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(event.title || event.id || 'Event')}</h2>
          <span class="campaign-pill">${_esc(event.tableName || event.type || 'event')}</span>
          ${ideaPill}
        </div>
        <p>${_esc(event.prompt || '')}</p>
        ${event.gmHook ? `<div class="campaign-warning"><b>GM hook:</b> ${_esc(event.gmHook)}</div>` : ''}
        ${(event.suggested || []).length ? `<div class="campaign-preview">${Ops().describe(event.suggested).map(_esc).join('<br>')}</div>` : ''}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="apply-event">Apply</button>
          <button class="campaign-action" data-campaign-action="edit-event">Edit First</button>
          <button class="campaign-action" data-campaign-action="note-event">Save Note</button>
          ${(event.gmHook || event.gmIdea) ? '<button class="campaign-action" data-campaign-action="pin-plot-seed">📌 Pin Plot Seed</button>' : ''}
          ${event.oracleTableId ? '<button class="campaign-action" data-campaign-action="event-to-oracle">🎴 Roll Oracle</button>' : ''}
          <button class="campaign-action danger" data-campaign-action="ignore-event">Ignore</button>
          <button class="campaign-action" data-campaign-action="roll-event">🎲 Reroll</button>
          <button class="campaign-action" data-campaign-action="pick-event">📋 Override</button>
        </div>
      </section>
    `;
  }

  function _renderOracle(state) {
    if (!state.lastOracle) return '';
    return `
      <section class="campaign-panel oracle">
        <div class="campaign-panel-head"><h2>GM Prompt</h2></div>
        <p>${_esc(state.lastOracle.text)}</p>
        <div class="campaign-action-grid">
          <button class="campaign-action" data-campaign-action="oracle-note">Save as Note</button>
          <button class="campaign-action" data-campaign-action="roll-oracle">🎲 Reroll</button>
          <button class="campaign-action" data-campaign-action="pick-oracle">📋 Override</button>
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
      ${_renderPartyChatCard(state)}
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

  function _renderPartyChatCard(state, opts = {}) {
    const chat = state.lastPartyChat;
    if (opts.full) {
      const past = (state.log || [])
        .filter((line) => line.op === 'party_chat')
        .slice(0, 12)
        .map(_chatFromLogLine)
        .filter(Boolean);
      const seen = new Set();
      const list = [];
      if (chat) { list.push(chat); seen.add(`${chat.speaker}|${chat.line}`); }
      for (const c of past) {
        const key = `${c.speaker}|${c.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        list.push(c);
      }
      return `
        <section class="campaign-side-section">
          <div class="campaign-panel-head">
            <h2>Party Banter</h2>
            <div class="campaign-panel-actions">
              <button class="campaign-icon-btn" data-campaign-action="roll-party-chat">Roll</button>
              ${list.length ? '<button class="campaign-icon-btn danger" data-campaign-action="clear-banter">Clear</button>' : ''}
            </div>
          </div>
          ${list.length
            ? `<div class="campaign-banter-history">${list.map(_renderBanterBox).join('')}</div>`
            : '<div class="campaign-banter-box is-empty">No banter rolled yet.</div>'}
        </section>
      `;
    }
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head">
          <h2>Party Banter</h2>
          <div class="campaign-panel-actions">
            <button class="campaign-icon-btn" data-campaign-action="roll-party-chat">Roll</button>
            ${chat ? '<button class="campaign-icon-btn danger" data-campaign-action="clear-banter">Clear</button>' : ''}
          </div>
        </div>
        ${chat ? _renderBanterBox(chat) : '<div class="campaign-banter-box is-empty">No banter rolled yet.</div>'}
      </section>
    `;
  }

  function _chatFromLogLine(line) {
    const text = String(line.text || '');
    const idx = text.indexOf(':');
    if (idx < 1) return null;
    const speakerName = text.slice(0, idx).trim();
    const body = text.slice(idx + 1).trim();
    if (!body) return null;
    const partyEntry = Object.entries(CS().getState()?.party || {})
      .find(([, m]) => (m.name || '').trim() === speakerName);
    return {
      speaker: partyEntry?.[0] || null,
      speakerName,
      line: body
    };
  }

  function _renderBanterBox(chat) {
    if (!chat) return '';
    const speaker = chat.speakerName || chat.speaker || 'Party';
    const portrait = _speakerPortrait(chat.speaker);
    return `
      <div class="campaign-banter-box">
        <span class="campaign-banter-name">${_esc(speaker)}</span>
        <span class="campaign-banter-text">${_esc(chat.line || '')}</span>
        ${chat.reply ? `<span class="campaign-banter-reply">${_esc(chat.reply)}</span>` : ''}
        ${portrait
          ? `<div class="campaign-banter-portrait"><img src="${_escAttr(portrait)}" alt=""></div>`
          : ''}
        <span class="campaign-banter-arrow">▼</span>
      </div>
    `;
  }

  function _speakerPortrait(speakerId) {
    if (!speakerId) return null;
    const member = CS().getState()?.party?.[speakerId];
    return member?.portrait || null;
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
    banter:    { icon: '💬', label: 'Banter', title: 'Party Banter' },
  };
  const RAIL_ORDER = ['party', 'inventory', 'quests', 'log', 'notes', 'banter'];

  function _renderCommandRail(state) {
    const activeQuests = Object.values(state.quests || {}).filter((q) => q.status === 'active').length;
    const logCount = (state.log || []).length;
    const notesCount = (state.pinnedNotes || []).length;
    const inventoryCount = ['items', 'materials', 'food', 'questItems']
      .reduce((sum, b) => sum + Object.values(state.inventory?.[b] || {}).filter((q) => q > 0).length, 0);
    const hasBanter = !!state.lastPartyChat;
    const partyCount = Object.keys(state.party || {}).length;
    const counts = {
      party: partyCount,
      inventory: inventoryCount,
      quests: activeQuests,
      log: logCount,
      notes: notesCount,
      banter: hasBanter ? 1 : 0
    };
    const currency = _currencyAmounts(state);
    const buttons = RAIL_ORDER.map((id) => {
      const def = PANEL_DEFS[id];
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
      <div class="campaign-rail-currency" title="Gold">
        <span>G ${currency.gold}</span>
      </div>
    `;
  }

  function _openPanel(panelId) {
    if (!PANEL_DEFS[panelId]) return;
    if (_activePanel === panelId) {
      _closePanel();
      return;
    }
    _lastFocus = document.activeElement;
    _activePanel = panelId;
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
    const def = PANEL_DEFS[_activePanel];
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
        const closesPanel = ['open-inventory-tab', 'open-roster-tab', 'open-scenarios-tab', 'open-maps-tab'];
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
        return typeof _renderLogPanel === 'function' ? _renderLogPanel(state) : _renderLogFallback(state);
      case 'notes':
        return _renderNotesPanel(state);
      case 'banter':
        return _renderPartyChatCard(state, { full: true });
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

  function _renderScenarios(state) {
    const campaign = CS().getCurrentCampaign();
    const authored = (campaign?.scenarios || []).map((id) => CS().getContent().scenarios[id]).filter(Boolean);
    const generated = CS().getGeneratedScenarios ? CS().getGeneratedScenarios() : Object.values(state.sideContent?.generatedScenarios || {});
    const scenarios = [...generated, ...authored];
    return `
      <div class="campaign-dashboard">
        <section class="campaign-panel">
          <div class="campaign-panel-head">
            <h2>Generate Scenario</h2>
            <span class="campaign-pill">Save-local</span>
          </div>
          <div class="campaign-generator-controls">
            <label>Source
              <select id="campaign-gen-source">
                <option value="random">Random</option>
                <option value="active_quest">Active Quest</option>
                <option value="quest_chain">Quest Arc</option>
              </select>
            </label>
            <label>Form
              <select id="campaign-gen-form">
                <option value="node_map">Node Map</option>
                <option value="grid_map">Grid Map</option>
              </select>
            </label>
            <label>Map Type
              <select id="campaign-gen-map-type">
                ${(Gen()?.options?.().mapTypes || ['any', 'urban', 'outdoor', 'forest', 'dungeon', 'cave', 'sewer', 'ruins', 'temple', 'house', 'tavern', 'castle', 'mountain', 'arena']).map((type) => `<option value="${type}">${_esc(_label(type))}</option>`).join('')}
              </select>
            </label>
            <label>Size
              <select id="campaign-gen-size">
                ${['tiny', 'small', 'medium', 'large'].map((size) => `<option value="${size}" ${size === 'small' ? 'selected' : ''}>${_esc(_label(size))}</option>`).join('')}
              </select>
            </label>
            <label>Layers
              <select id="campaign-gen-layers">
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </label>
          </div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="generate-scenario" ${state.activeScenarioRun ? 'disabled' : ''}>Generate & Start</button>
            <button class="campaign-action" data-campaign-action="generate-quest-scenario" ${state.activeScenarioRun ? 'disabled' : ''}>Quest-Based</button>
          </div>
        </section>
        <div class="campaign-tab-grid">
        ${scenarios.map((scenario) => `
          <section class="campaign-panel">
            <div class="campaign-panel-head">
              <h3>${_esc(scenario.name || scenario.id)}</h3>
              <span class="campaign-pill">${_esc(scenario.generated ? `generated · ${scenario.source?.kind || 'random'}` : (scenario.type || 'scenario'))}</span>
            </div>
            ${_renderShapePills(scenario)}
            <div class="campaign-muted">${_esc(scenario.notes || '')}</div>
            <div class="campaign-action-grid">
              <button class="campaign-action primary" data-campaign-action="start-scenario" data-id="${_escAttr(scenario.id)}" ${state.activeScenarioRun ? 'disabled' : ''}>Start</button>
              <button class="campaign-action" data-campaign-action="inspect-scenario" data-id="${_escAttr(scenario.id)}">Inspect</button>
              ${scenario.generated ? `<button class="campaign-action danger" data-campaign-action="discard-scenario" data-id="${_escAttr(scenario.id)}" ${state.activeScenarioRun?.scenarioId === scenario.id ? 'disabled' : ''}>Discard</button>` : ''}
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No scenarios available.</div>'}
        </div>
      </div>
    `;
  }

  function _renderShapePills(scenario) {
    const mode = scenario.travelMode || (scenario.mapId ? 'node_map' : 'freeform');
    const modeLabels = {
      node_map: '🗺 Map',
      grid_map: 'Grid',
      procedural: '🎲 Procedural',
      linear: '📜 Linear',
      freeform: '🎯 Freeform'
    };
    const settingLabels = {
      outdoor: '🌲 Outdoor',
      dungeon: '🏚 Dungeon',
      urban: '🏙 Urban',
      arena: '⚔ Arena',
      abstract: '✨ Abstract'
    };
    const sizeLabels = { tiny: 'XS', small: 'S', medium: 'M', large: 'L' };
    const pills = [];
    pills.push(`<span class="campaign-chip">${modeLabels[mode] || mode}</span>`);
    if (scenario.setting) pills.push(`<span class="campaign-chip">${settingLabels[scenario.setting] || scenario.setting}</span>`);
    if (scenario.size) pills.push(`<span class="campaign-chip">${sizeLabels[scenario.size] || scenario.size}</span>`);
    return `<div class="campaign-chip-row">${pills.join('')}</div>`;
  }

  function _renderRun(state) {
    const run = state.activeScenarioRun;
    if (!run) {
      return `
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h2>Scenario Run</h2></div>
          <div class="campaign-empty">No scenario active. Start one from the Briefing tab.</div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="open-scenarios-tab">Briefing</button>
          </div>
        </section>
      `;
    }
    const mode = run.travelMode || (run.mapId ? 'node_map' : 'freeform');
    let panel;
    if (mode === 'freeform') panel = _renderRunFreeform(state, run);
    else if (mode === 'linear') panel = _renderRunLinear(state, run);
    else panel = `<div id="campaign-map-region"></div>`;
    return `
      <div class="campaign-dashboard">
        ${panel}
        ${_renderTravelSurprise(state)}
        ${_renderPendingBattle(state)}
        ${_renderCombatResult(state)}
        ${_renderLastCombatResult(state)}
        ${_renderEventResult(state)}
      </div>
    `;
  }

  function _renderRunFreeform(state, run) {
    const scenario = CS().getActiveScenario();
    const setBattles = scenario?.setBattles || [];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || 'Run')}</h2>
          <span class="campaign-pill">Freeform</span>
        </div>
        ${_renderShapePills(scenario || {})}
        <div class="campaign-muted">${_esc(scenario?.notes || 'No map. Pick what happens next.')}</div>
        <div class="campaign-stat-grid">
          <span>Danger <b>${run.danger}/${run.dangerMax}</b></span>
          <span>Camps <b>${run.usedCampRests}/${run.limits?.campRests ?? 0}</b></span>
          <span>Battles <b>${run.randomBattlesUsed}/${run.limits?.randomBattles ?? 0}</b></span>
          <span>Events <b>${run.eventsUsed}/${run.limits?.events ?? 0}</b></span>
        </div>
        <div class="campaign-control-stack">
          ${_controlGroup('Solo / Random', `
            <button class="campaign-action primary" data-campaign-action="run-roll-battle">Random Battle</button>
            <button class="campaign-action" data-campaign-action="run-roll-event">Random Event</button>
            <button class="campaign-action" data-campaign-action="roll-travel-surprise">Movement Surprise</button>
          `)}
          ${_controlGroup('Manual Control', `
            <button class="campaign-action" data-campaign-action="run-pick-battle">Pick Battle</button>
            <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
            <button class="campaign-action" data-campaign-action="run-tick-danger">Tick Danger +1</button>
            <button class="campaign-action danger" data-campaign-action="end-scenario">End Scenario</button>
          `)}
        </div>
        <div class="campaign-action-grid" hidden>
          <button class="campaign-action primary" data-campaign-action="run-roll-battle">🎲 Random Battle</button>
          <button class="campaign-action" data-campaign-action="run-pick-battle">📋 Pick Battle</button>
          <button class="campaign-action" data-campaign-action="run-roll-event">🎴 Roll Event</button>
          <button class="campaign-action" data-campaign-action="roll-travel-surprise">Travel Surprise</button>
          <button class="campaign-action" data-campaign-action="camp-rest">🏕 Camp</button>
          <button class="campaign-action" data-campaign-action="run-tick-danger">⚠ Tick Danger +1</button>
          <button class="campaign-action danger" data-campaign-action="end-scenario">End Scenario</button>
        </div>
        ${setBattles.length ? `
          <div class="campaign-panel-head" style="margin-top:14px"><h3>Set Battles</h3></div>
          ${setBattles.map((b) => `
            <div class="campaign-row">
              <div>
                <strong>${_esc(b.label || b.name || b.encounterId || b.battleSetId)}</strong>
                <div class="campaign-muted">${_esc(b.encounterId || b.battleSetId || '')}</div>
              </div>
              <button class="campaign-action" data-campaign-action="run-queue-set-battle" data-battle-id="${_escAttr(b.id || b.battleSetId || b.encounterId)}">Queue</button>
            </div>
          `).join('')}
        ` : ''}
      </section>
    `;
  }

  function _renderRunLinear(state, run) {
    const scenario = CS().getActiveScenario();
    const beats = scenario?.beats || [];
    const idx = run.currentBeatIndex ?? 0;
    const done = idx >= beats.length;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || 'Run')}</h2>
          <span class="campaign-pill">Linear · Beat ${Math.min(idx + 1, beats.length)}/${beats.length}</span>
        </div>
        ${_renderShapePills(scenario || {})}
        <div class="campaign-muted">${_esc(scenario?.notes || '')}</div>
        <div class="campaign-stat-grid">
          <span>Danger <b>${run.danger}/${run.dangerMax}</b></span>
          <span>Camps <b>${run.usedCampRests}/${run.limits?.campRests ?? 0}</b></span>
        </div>
        <ol class="campaign-beat-list" id="campaign-beat-list">
          ${beats.map((b, i) => `
            <li class="campaign-beat ${i === idx ? 'is-current' : i < idx ? 'is-done' : ''}" data-beat-id="${_escAttr(b.id)}">
              <span class="campaign-beat-num">${i + 1}</span>
              <span class="campaign-beat-icon">${_beatIcon(b.kind)}</span>
              <div class="campaign-beat-body">
                <strong>${_esc(b.label || b.id)}</strong>
                <div class="campaign-muted">${_esc(b.kind || '')}${b.encounterId ? ' · ' + _esc(b.encounterId) : ''}${b.prompt ? ' · ' + _esc(b.prompt) : ''}</div>
              </div>
            </li>
          `).join('')}
        </ol>
        <div class="campaign-control-stack">
          ${_controlGroup('Scenario Flow', `
            <button class="campaign-action primary" data-campaign-action="run-next-beat" ${done ? 'disabled' : ''}>${done ? 'All Beats Done' : 'Next Beat'}</button>
            <button class="campaign-action" data-campaign-action="roll-travel-surprise">Movement Surprise</button>
            <button class="campaign-action" data-campaign-action="run-roll-event">Random Event</button>
          `)}
          ${_controlGroup('Manual Control', `
            <button class="campaign-action" data-campaign-action="run-pick-battle">Pick Battle</button>
            <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
            <button class="campaign-action danger" data-campaign-action="end-scenario">End Scenario</button>
          `)}
        </div>
        <div class="campaign-action-grid" hidden>
          <button class="campaign-action primary" data-campaign-action="run-next-beat" ${done ? 'disabled' : ''}>${done ? 'All Beats Done' : 'Next Beat ▶'}</button>
          <button class="campaign-action" data-campaign-action="run-pick-battle">📋 Pick Battle</button>
          <button class="campaign-action" data-campaign-action="run-roll-event">🎴 Roll Event</button>
          <button class="campaign-action" data-campaign-action="roll-travel-surprise">Travel Surprise</button>
          <button class="campaign-action" data-campaign-action="camp-rest">🏕 Camp</button>
          <button class="campaign-action danger" data-campaign-action="end-scenario">End</button>
        </div>
      </section>
    `;
  }

  function _beatIcon(kind) {
    const map = { battle: '⚔', event: '🎴', trap: '🪤', rest: '🏕', reward: '🎁', boss: '👹', exit: '🚪' };
    return map[kind] || '·';
  }

  function _renderQuestPanel(state) {
    const quests = Object.values(state.quests || {});
    const active = quests.filter((q) => !q.chainTemplateId && !_isQuestResolved(q));
    const finished = quests.filter((q) => !q.chainTemplateId && _isQuestResolved(q));
    const activeChains = window.CJS.CampaignQuestChains?.getActive?.() || [];
    const availableChains = window.CJS.CampaignQuestChains?.getAvailable?.() || [];
    const finishedChains = window.CJS.CampaignQuestChains?.getFinished?.() || [];
    const templateCount = Object.values(CS().getContent().campaignQuests || {})
      .reduce((sum, record) => sum + (record.templates?.length || 0), 0);
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>Quest Tracker</h2>
          <div class="campaign-panel-actions">
            <span class="campaign-pill">${active.length} active | ${finished.length} resolved | ${templateCount} templates</span>
            <button class="campaign-action primary" data-campaign-action="add-quest">Add Quest</button>
            <button class="campaign-action" data-campaign-action="random-quest-offer">Quest Run</button>
          </div>
        </div>
        ${_renderSoloNotice(state)}
        <div class="campaign-quest-list">
          ${active.length ? active.map((quest) => _renderQuestRow(quest)).join('') : '<div class="campaign-empty">No active quests.</div>'}
        </div>
        ${activeChains.length ? `
          <section class="campaign-subpanel">
            <div class="campaign-panel-head"><h3>Quest Arcs</h3><span class="campaign-pill">${activeChains.length} active</span></div>
            ${activeChains.map((chain) => _renderQuestChainActive(chain)).join('')}
          </section>
        ` : ''}
        ${availableChains.length ? `
          <details class="campaign-resolved-quests">
            <summary>Available Quest Arcs (${availableChains.length})</summary>
            <div class="campaign-tab-grid">${availableChains.map((chain) => _renderQuestChainTemplate(chain)).join('')}</div>
          </details>
        ` : ''}
        ${finished.length ? `
          <details class="campaign-resolved-quests">
            <summary>Resolved (${finished.length})</summary>
            <div class="campaign-quest-list">${finished.map((quest) => _renderQuestRow(quest, { resolved: true })).join('')}</div>
          </details>
        ` : ''}
        ${finishedChains.length ? `
          <details class="campaign-resolved-quests">
            <summary>Resolved Quest Arcs (${finishedChains.length})</summary>
            ${finishedChains.map(_renderQuestChainResolved).join('')}
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
    return `
      <article class="campaign-quest-card ${opts.resolved ? 'is-resolved' : ''}">
        <div class="campaign-quest-main">
          <div class="campaign-quest-title-row">
            <strong>${_esc(quest.title || quest.id)}</strong>
            <span class="campaign-pill campaign-quest-status ${_escAttr(_questStatusClass(quest))}">${_esc(_label(quest.status || 'active'))}</span>
          </div>
          ${meta ? `<div class="campaign-muted">${_esc(meta)}</div>` : ''}
          ${quest.summary ? `<div class="campaign-muted">${_esc(quest.summary)}</div>` : ''}
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
            <button class="campaign-action primary" data-campaign-action="quest-scenario" data-id="${_escAttr(quest.id)}" ${scenarioDisabled ? 'disabled' : ''}>${scenarioLabel}</button>
            <button class="campaign-action" data-campaign-action="quest-battle" data-id="${_escAttr(quest.id)}">Battle</button>
            <button class="campaign-action" data-campaign-action="quest-event" data-id="${_escAttr(quest.id)}">Event</button>
            <button class="campaign-action" data-campaign-action="quest-check" data-id="${_escAttr(quest.id)}">Check</button>
            <button class="campaign-action" data-campaign-action="quest-hand-in" data-id="${_escAttr(quest.id)}">Hand In</button>
            <button class="campaign-action" data-campaign-action="quest-answer" data-id="${_escAttr(quest.id)}">Answer</button>
            <button class="campaign-action" data-campaign-action="quest-progress" data-id="${_escAttr(quest.id)}">Progress</button>
            <button class="campaign-action" data-campaign-action="quest-complete" data-id="${_escAttr(quest.id)}">Resolve</button>
            <button class="campaign-action danger" data-campaign-action="quest-fail" data-id="${_escAttr(quest.id)}">Fail</button>
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
      </div>
    `;
  }

  function _questNextObjective(quest = {}) {
    const objectives = quest.objectives || [];
    return objectives.find((entry) => !_questObjectiveDone(entry)) || objectives[0] || null;
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

  function _renderLogPanel(state) {
    const hasLog = (state.log || []).length > 0;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>Session Log</h2>
          <div class="campaign-panel-actions">
            <button class="campaign-action" data-campaign-action="export-log">Export Log</button>
            ${hasLog ? '<button class="campaign-action danger" data-campaign-action="clear-log">Clear Log</button>' : ''}
          </div>
        </div>
        ${(state.log || []).map((line) => _renderLogEntry(line)).join('') || '<div class="campaign-empty">No log entries.</div>'}
      </section>
    `;
  }

  function _renderLogEntry(line, options = {}) {
    const kind = _logKind(line);
    return `
      <div class="campaign-log-line campaign-log-${_escAttr(kind.key)}">
        <div class="campaign-log-main">
          <span class="campaign-log-type">${_esc(kind.label)}</span>
          <span>${_esc(line.text || '')}</span>
        </div>
        <small>${_esc(_logMeta(line, options.compact))}</small>
      </div>
    `;
  }

  function _logKind(line = {}) {
    const op = String(line.op || '').toLowerCase();
    const text = String(line.text || '').toLowerCase();
    const starts = (value) => text.startsWith(value);

    if (op.includes('party') || / hp\b| mp\b|joined the roster|left the roster|availability|learned|forgot|gained status|active party|bench/.test(text)) return { key: 'party', label: 'Party' };
    if (op.includes('battle') || text.includes('battle') || text.includes('combat')) return { key: 'battle', label: 'Battle' };
    if (op.includes('event') || starts('event ') || starts('plot seed')) return { key: 'event', label: 'Event' };
    if (op.includes('quest') || starts('quest ')) return { key: 'quest', label: 'Quest' };
    if (op.includes('oracle') || text.includes('oracle')) return { key: 'oracle', label: 'Oracle' };
    if (op.includes('scenario') || starts('scenario ') || starts('moved ') || starts('move blocked') || text.includes('danger')) return { key: 'run', label: 'Run' };
    if (op.includes('shop') || op.includes('craft') || op.includes('farm') || starts('added ') || starts('removed ') || starts('gained ') || starts('spent ')) return { key: 'loot', label: 'Loot' };
    if (op.includes('hub') || starts('rumor ') || starts('npc ') || starts('bond ') || starts('clock ') || starts('memory shard')) return { key: 'hub', label: 'Hub' };
    if (starts('phase ')) return { key: 'phase', label: 'Phase' };
    return { key: 'system', label: 'Log' };
  }

  function _logMeta(line = {}, compact = false) {
    const phase = line.phase ? `Phase ${line.phase}` : 'Phase ?';
    const time = _formatLogTime(line.at, compact);
    return [phase, time].filter(Boolean).join(' | ');
  }

  function _formatLogTime(value, compact = false) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const options = compact
      ? { hour: '2-digit', minute: '2-digit' }
      : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString([], options);
  }

  function _renderSettings(state) {
    const slots = Object.values(Save().getSlots()).sort((a, b) => String(b.lastUpdated || '').localeCompare(String(a.lastUpdated || '')));
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h2>Save Slots</h2></div>
        ${slots.map((slot) => `
          <div class="campaign-row">
            <div>
              <strong>${_esc(slot.slotName || slot.saveId)}</strong>
              <div class="campaign-muted">${_esc(slot.currentWorld)} | ${_esc(slot.lastUpdated || '')}</div>
            </div>
            <div class="campaign-row-actions">
              <button class="campaign-action" data-campaign-action="load-slot" data-id="${_escAttr(slot.saveId)}">Load</button>
              <button class="campaign-action danger" data-campaign-action="delete-slot" data-id="${_escAttr(slot.saveId)}">Delete</button>
            </div>
          </div>
        `).join('') || '<div class="campaign-empty">No slots.</div>'}
      </section>
    `;
  }

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
        const firstTab = (MODE_TABS[id] || [])[0];
        if (firstTab) _activeTab = firstTab[0];
        render();
        return;
      }

      const tab = event.target.closest('[data-campaign-tab]');
      if (tab) {
        const id = tab.dataset.campaignTab;
        _activeTab = id;
        const owningMode = TAB_TO_MODE[id];
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
      case 'new-save': return _newSave();
      case 'save-slot': Save().saveCurrent(); return UI().toast('Campaign saved', 'success');
      case 'fork-save': Save().forkCurrent(); return UI().toast('Campaign forked', 'success');
      case 'export-save': return Save().exportCurrent();
      case 'import-save': return _root.querySelector('#campaign-import-file')?.click();
      case 'push-github': return _pushGitHub();
      case 'pass-phase': return Ops().apply({ op: 'pass_phase' }, { source: 'ui' });
      case 'roll-event': return _rollEvent();
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
      case 'copy-side-card': return _copySideCard(data.id);
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
      case 'import-side-pack': return _importSidePack();
      case 'export-side-pack': return _exportSidePack();
      case 'oracle-note': return _saveOracleNote();
      case 'apply-event': return _applyEvent();
      case 'edit-event': return _editEvent();
      case 'note-event': return _noteEvent();
      case 'ignore-event': return _ignoreEvent();
      case 'pin-plot-seed': return _pinPlotSeed();
      case 'event-to-oracle': return _eventToOracle();
      case 'add-quest': return _openQuestModal();
      case 'full-rest': return Ops().apply({ op: 'full_rest' }, { source: 'ui' });
      case 'camp-rest': return _campRestModal();
      case 'travel-world': return _travelWorld();
      case 'open-roster-tab': return _goto('town', 'roster');
      case 'open-scenarios-tab': return _goto('scenario', 'scenarios');
      case 'open-maps-tab': return _goto('scenario', 'maps');
      case 'open-inventory-tab': return _goto('workshop', 'inventory');
      case 'roll-party-chat': return _rollPartyChat();
      case 'clear-banter': return _clearBanter();
      case 'run-roll-battle': return _runRollBattle();
      case 'run-pick-battle': return _runPickBattle();
      case 'run-roll-event': return _runRollEvent();
      case 'roll-travel-surprise': return _rollTravelSurprise();
      case 'run-queue-set-battle': return _runQueueSetBattle(data.battleId);
      case 'run-tick-danger': return Ops().apply({ op: 'danger', amount: 1 }, { source: 'run' });
      case 'run-next-beat': return _runNextBeat();
      case 'generate-scenario': return _generateScenario();
      case 'generate-quest-scenario': return _generateScenario({ source: 'active_quest' });
      case 'start-scenario': return Runner().startScenario(data.id);
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
      case 'plant-seed': return _plantSeed(data.plotId);
      case 'harvest-plot': return window.CJS.PocketHaven.harvestPlot(data.plotId);
      case 'craft-recipe': return _craftRecipe(data.recipeId);
      case 'cook-food': return Ops().apply({ op: 'cook_basic', id: data.foodId, outputs: { food: { [data.foodId]: 1 } } }, { source: 'ui' });
      case 'add-pocket-note': return _addPocketNote();
      case 'add-note': return _addPinnedNote();
      case 'quest-progress': return _questProgress(data.id);
      case 'quest-scenario': return _questScenario(data.id);
      case 'quest-battle': return _questBattle(data.id);
      case 'quest-event': return _questEvent(data.id);
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
      case 'party-availability': return _partyAvailabilityModal(data.id);
      case 'party-available': return Ops().apply({ op: 'clear_party_availability', target: data.id }, { source: 'ui' });
      case 'gm-override': return _gmOverride();
      case 'load-slot': Save().loadSlot(data.id); return render();
      case 'delete-slot': Save().deleteSlot(data.id); return render();
      case 'export-log': return _exportLog();
      case 'clear-log': return _clearLog();
      default: break;
    }
  }

  function _newSave() {
    UI().confirm('Create a fresh campaign save?', () => {
      const campaign = Object.values(CS().getContent().campaigns)[0];
      CS().createNewSave(campaign?.id);
      Save().saveCurrent();
    });
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
    _activeMode = 'town';
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
    _activeMode = 'town';
    _activeTab = 'overview';
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
      _activeMode = 'scenario';
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
    const pick = options[Math.floor(Math.random() * options.length)];
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

  function _startQuestRunFromOffer(card) {
    if (!card) return null;
    if (CS().getState()?.activeScenarioRun) {
      _activeMode = 'scenario';
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
      mapForm: quest.mapForm || 'node_map',
      mapType: quest.mapType || _questMapType(quest)
    });
    if (result?.error) {
      _activeMode = 'town';
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
      _activeMode = 'town';
      _activeTab = 'overview';
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
      _activeMode = 'town';
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
    _activeMode = 'town';
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
    if (card?.canonRisk === 'red') {
      UI().confirm('This is red-risk content. Approve and apply it now?',
        () => window.CJS.CampaignHub.applyChoice(id, choiceIndex, { approved: true }),
        () => window.CJS.CampaignHub.applyChoice(id, choiceIndex, { approved: false }));
      return;
    }
    window.CJS.CampaignHub.applyChoice(id, choiceIndex, { approved: true });
  }

  function _saveSideIdea(id) {
    const card = _sideCardById(id);
    if (!card) return;
    Side().saveCard(card, { status: 'saved', source: 'ui' });
  }

  function _rejectSideIdea(id) {
    _textareaModal({
      title: 'Reject Idea',
      label: 'Reason (optional)',
      placeholder: 'Why is this rejected?',
      primaryLabel: 'Reject',
      onSubmit: (reason) => Side().rejectCard(id, reason || '')
    });
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
    _activeMode = 'town';
    _activeTab = 'oracleForge';
    const card = window.CJS.CampaignIdeaForge.rollOracle();
    if (!card) return UI().toast('No oracle table available', 'info');
    render();
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

  function _openQuestModal() {
    const templates = Object.values(CS().getContent().campaignQuests).flatMap((record) => record.templates || []);
    const body = document.createElement('div');
    body.innerHTML = `
      <label class="form-label">Template</label>
      <select id="campaign-quest-template">
        <option value="">Custom quest</option>
        ${templates.map((quest) => `<option value="${_escAttr(quest.id)}">${_esc(quest.title || quest.id)}</option>`).join('')}
      </select>
      <label class="form-label">Custom title</label>
      <input id="campaign-quest-title" type="text" placeholder="New quest">
      <label class="form-label">Summary</label>
      <textarea id="campaign-quest-summary"></textarea>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn" id="campaign-add-quest-back">Back</button>
      <button class="btn btn-primary" id="campaign-add-quest-commit">Add Quest</button>
    `;
    const overlay = UI().openModal({ title: 'Add Quest', content: body, footer, width: '520px' });
    footer.querySelector('#campaign-add-quest-back').onclick = () => UI().closeModal(overlay);
    footer.querySelector('#campaign-add-quest-commit').onclick = () => {
      const template = templates.find((quest) => quest.id === body.querySelector('#campaign-quest-template').value);
      const customTitle = body.querySelector('#campaign-quest-title').value.trim();
      const summary = body.querySelector('#campaign-quest-summary').value.trim();
      const quest = template ? CS().clone(template) : {
        id: `quest_${Date.now()}`,
        title: customTitle || 'New Quest',
        status: 'active',
        summary,
        objectives: [{ id: 'objective_1', label: 'Objective', current: 0, required: 1 }],
        rewards: []
      };
      if (customTitle) quest.title = customTitle;
      if (summary) quest.summary = summary;
      Ops().apply({ op: 'add_quest', quest }, { source: 'ui' });
      UI().closeModal(overlay);
    };
  }

  function _manualRumorModal() {
    const body = document.createElement('div');
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
    _activeMode = 'scenario';
    _activeTab = 'maps';
    render();
    UI().toast(`Started ${result.scenario.name}`, 'success');
    return result;
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
      _activeMode = 'scenario';
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
  }

  function _moveCell(x, y) {
    const moved = Runner().moveToCell?.(Number(x), Number(y));
    if (!moved) UI().toast('That cell is blocked or out of reach', 'info');
  }

  function _rollPartyChat() {
    const state = CS().getState();
    const run = state.activeScenarioRun;
    const currentNode = Runner().findCurrentNode?.();
    const currentCell = Runner().findCurrentCell?.();
    const chat = Chat()?.roll?.({
      world: state.currentWorld,
      situation: run ? 'scenario' : 'town',
      scenarioId: run?.scenarioId || '',
      mapId: run?.mapId || '',
      locationKind: currentNode?.kind || currentCell?.kind || '',
      tags: [...(currentNode?.tags || []), ...(currentCell?.tags || [])]
    });
    if (!chat) return UI().toast('No party banter available', 'info');
    CS().mutate((next) => {
      next.lastPartyChat = chat;
      next.log.unshift({
        id: `log_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        at: new Date().toISOString(),
        phase: next.phase?.number || 1,
        world: next.currentWorld,
        text: `${chat.speakerName || chat.speaker}: ${chat.line}`,
        op: 'party_chat'
      });
      next.log = next.log.slice(0, 500);
    }, { source: 'party_chat' });
  }

  function _clearBanter() {
    UI().confirm('Clear party banter history?', () => {
      CS().mutate((state) => {
        state.lastPartyChat = null;
        state.log = (state.log || []).filter((line) => line.op !== 'party_chat');
      }, { source: 'clear_banter' });
      UI().toast('Banter cleared', 'info');
    });
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
    const pick = fallbackPool[Math.floor(Math.random() * fallbackPool.length)];
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
      setting: pick.setting || scenario?.setting || null
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
        battleMap: _battleMapForCard(card)
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
      battleMap: _battleMapForArea(CS().getActiveScenario()?.setting || 'outdoor')
    }));
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
          battleMap: _battleMapForCard(card)
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
          battleMap: battle.battleMap || null
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
      battleMap: battle.battleMap || null
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
      title: 'Pocket Haven Note',
      label: 'Note',
      placeholder: 'A short note about your haven…',
      primaryLabel: 'Save Note',
      onSubmit: (text) => {
        if (!text) return false;
        CS().mutate((state) => state.pocketHaven.notes.unshift({ at: new Date().toISOString(), text }), { source: 'note' });
      }
    });
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
      if (_activeRunQuestId(activeRun, activeScenario) === questId) return _goto('scenario', 'maps');
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
    _activeMode = 'scenario';
    _activeTab = 'maps';
    render();
  }

  function _questEvent(questId) {
    const quest = _activeQuestById(questId);
    if (!quest) return UI().toast('Quest is not active', 'info');
    Ops().apply([
      { op: 'roll_event', setting: _questMapType(quest), tags: _questTags(quest) },
      { op: 'log', text: `Quest event rolled: ${quest.title || quest.id}.` }
    ], { source: 'quest_event' });
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
    if (!overrides.forceGenerated) {
      const existing = _startExistingQuestScenario(quest);
      if (existing) return existing;
    }
    const result = _generateScenario({
      source: 'active_quest',
      questId,
      mapForm: 'node_map',
      mapType: _questMapType(quest),
      size: 'small',
      ...overrides
    });
    if (result && !result.error) {
      _annotateQuestRun(quest, result.scenario);
      render();
    }
    return result;
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
    _activeMode = 'scenario';
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

  function _questMapType(quest = {}) {
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
    return ['quest', quest.id, ...(quest.tags || []), _questMapType(quest)].filter(Boolean);
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
    const portrait = member.portrait
      ? `<img src="${_escAttr(member.portrait)}" alt="${_escAttr(member.name || id)}">`
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
        Ops().apply({ op: 'world_transition', toWorld: value, carryoverProfile: 'carryover_new_world_default' }, { source: 'ui' });
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

  function _gmOverride() {
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
      { value: 'add_level', label: 'Add Level', kind: 'level' },
      { value: 'change_stat', label: 'Change Stat', kind: 'stat' },
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
      value: 'give_money',
      onChange: () => renderFields()
    });
    body.appendChild(opSelect);

    const fields = document.createElement('div');
    body.appendChild(fields);

    const partyOptions = () => Object.entries(CS().getState()?.party || {})
      .map(([id, m]) => ({ value: id, label: m.name || id }));

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
        active.target = UI().createSelect({ options: partyOptions(), value: partyOptions()[0]?.value || '' });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Amount'));
        active.amount = UI().createNumberSlider({ value: 5, min: 1, max: 999, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'level') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: partyOptions()[0]?.value || '' });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Levels'));
        active.amount = UI().createNumberSlider({ value: 1, min: 1, max: 20, step: 1 });
        fields.appendChild(active.amount);
      } else if (def.kind === 'stat') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: partyOptions()[0]?.value || '' });
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
      } else if (def.kind === 'skill') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: partyOptions()[0]?.value || '' });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Skill'));
        active.skill = UI().createSearchableSelect({ options: _skillOptions(active.target.value), placeholder: 'Search skills...', renderItem: _pickerItem });
        fields.appendChild(active.skill);
      } else if (def.kind === 'passive') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: partyOptions()[0]?.value || '' });
        fields.appendChild(active.target);
        fields.appendChild(_formLabel('Passive'));
        active.passive = UI().createSearchableSelect({ options: _passiveOptions(active.target.value), placeholder: 'Search passives...', renderItem: _pickerItem });
        fields.appendChild(active.passive);
      } else if (def.kind === 'status') {
        fields.appendChild(_formLabel('Character'));
        active.target = UI().createSelect({ options: partyOptions(), value: partyOptions()[0]?.value || '' });
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
          } else if (def.kind === 'level') {
            op = { op: def.value, target: active.target.value, amount: active.amount._getValue() || 1 };
          } else if (def.kind === 'stat') {
            op = { op: def.value, target: active.target.value, stat: active.stat.value, amount: active.amount._getValue() || 0 };
          } else if (def.kind === 'recruit') {
            const characterId = active.character._getValue();
            if (!characterId) { UI().toast('Pick a character', 'error'); return false; }
            op = { op: def.value, characterId };
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
      return `
        <div class="campaign-equipment-line">
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

  function _equipmentOptions(member, slot) {
    const kind = _slotKind(slot);
    const slots = _normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    const currentId = slots[slot];
    const otherAccessorySlot = slot === 'accessory1' ? 'accessory2' : 'accessory1';
    const otherAccessory = kind === 'accessory' ? DS().get('items', slots[otherAccessorySlot]) : null;
    const otherAccessoryType = otherAccessory ? _accessoryType(otherAccessory) : '';
    const state = CS().getState() || {};
    const world = state.currentWorld;
    const itemInventory = state.inventory?.items || {};
    const equipmentInventory = state.inventory?.equipment || {};
    const inWorld = (entry) => !entry._world || entry._world === world || entry._scope === 'universal' || entry._scope === 'system';
    return DS().getAllAsArray('items')
      .filter((entry) => entry?.id && inWorld(entry) && _equipmentKind(entry) === kind)
      .filter((entry) => {
        if (kind === 'weapon') return _memberCanUseWeapon(member, entry);
        if (kind === 'armor') return _memberCanUseArmor(member, entry);
        if (kind === 'accessory' && otherAccessoryType && entry.id !== currentId) return _accessoryType(entry) !== otherAccessoryType;
        return true;
      })
      .map((entry) => ({
        value: entry.id,
        label: entry.name || entry.id,
        sub: [_equipmentType(entry), entry.rarity, `Owned: ${itemInventory[entry.id] || equipmentInventory[entry.id] || 0}`].filter(Boolean).join(' | '),
        description: _equipmentDesc(entry),
        change: _equipmentChangeDescription(member, slot, entry, true),
        group: _slotLabel(slot),
        tags: [entry.id, entry.name, _equipmentType(entry), _equipmentKind(entry), ...(entry.tags || [])].filter(Boolean)
      }))
      .sort(_sortOptionLabel);
  }

  function _equipmentPickerItem(option) {
    return `
      <div class="campaign-picker-option campaign-equipment-option">
        <strong>${_esc(option.label || option.value)}</strong>
        ${option.sub ? `<small>${_esc(option.sub)}</small>` : ''}
        ${option.description ? `<span>${_esc(option.description)}</span>` : ''}
        ${option.change ? `<span class="campaign-picker-change">${_esc(option.change)}</span>` : ''}
      </div>
    `;
  }

  function _normalizeEquipmentSlots(rawSlots, equipment = []) {
    const slots = {
      weapon: rawSlots?.weapon || null,
      armor: rawSlots?.armor || null,
      accessory1: rawSlots?.accessory1 || null,
      accessory2: rawSlots?.accessory2 || null
    };
    const used = new Set(Object.values(slots).filter(Boolean));
    for (const itemId of equipment || []) {
      if (!itemId || used.has(itemId)) continue;
      const item = DS().get('items', itemId);
      const kind = _equipmentKind(item);
      if (kind === 'weapon' && !slots.weapon) slots.weapon = itemId;
      else if (kind === 'armor' && !slots.armor) slots.armor = itemId;
      else if (kind === 'accessory' && !slots.accessory1) slots.accessory1 = itemId;
      else if (kind === 'accessory' && !slots.accessory2) slots.accessory2 = itemId;
      used.add(itemId);
    }
    return slots;
  }

  function _slotKind(slot) {
    if (slot === 'weapon') return 'weapon';
    if (slot === 'armor') return 'armor';
    return 'accessory';
  }

  function _slotLabel(slot) {
    if (slot === 'accessory1') return 'Accessory 1';
    if (slot === 'accessory2') return 'Accessory 2';
    return _label(slot);
  }

  function _equipmentKind(item = {}) {
    const slot = item?.slot || '';
    if (item?.equipmentCategory) return item.equipmentCategory;
    if (slot === 'weapon' || slot === 'offhand') return 'weapon';
    if (['armor', 'head', 'body', 'legs', 'feet'].includes(slot)) return 'armor';
    if (['accessory', 'accessory1', 'accessory2'].includes(slot)) return 'accessory';
    return '';
  }

  function _equipmentType(item = {}) {
    const kind = _equipmentKind(item);
    if (kind === 'weapon') return _label(_weaponType(item) || 'weapon');
    if (kind === 'armor') return _label(_armorType(item) || 'armor');
    if (kind === 'accessory') return _label(_accessoryType(item) || 'accessory');
    return '';
  }

  function _equipmentDesc(item = {}) {
    return [
      _desc(item),
      item.characteristic ? `Characteristic: ${item.characteristic}` : '',
      item.changeNotes ? `Change: ${item.changeNotes}` : '',
      _weaponSummary(item),
      _effectSummary(item)
    ].filter(Boolean).join(' ');
  }

  function _equipmentChangeDescription(member, slot, item, includeCurrent = true) {
    const slots = _normalizeEquipmentSlots(member.equipmentSlots, member.equipment);
    const current = DS().get('items', slots[slot]);
    const parts = [];
    if (includeCurrent) parts.push(current ? `Replaces ${current.name || slots[slot]}` : 'Fills empty slot');
    if (_equipmentKind(item) === 'weapon') {
      const next = item.weaponData || {};
      const prior = current?.weaponData || {};
      if (next.baseDamage != null || prior.baseDamage != null) parts.push(`Damage ${_delta(next.baseDamage, prior.baseDamage)}`);
      if (next.range != null || prior.range != null) parts.push(`Range ${_delta(next.range, prior.range)}`);
      if (next.element || prior.element) parts.push(`Element ${next.element || 'None'}`);
    }
    if ((item.effects || []).length || (current?.effects || []).length) {
      parts.push(`Effects ${(current?.effects || []).length} -> ${(item.effects || []).length}`);
    }
    if (item.changeNotes) parts.push(item.changeNotes);
    return parts.filter(Boolean).join(' | ');
  }

  function _weaponSummary(item = {}) {
    const data = item.weaponData || {};
    if (_equipmentKind(item) !== 'weapon' || !Object.keys(data).length) return '';
    return [
      data.baseDamage != null ? `Damage ${data.baseDamage}` : '',
      data.range != null ? `Range ${data.range}` : '',
      data.damageType || '',
      data.element ? `${data.element} element` : ''
    ].filter(Boolean).join(', ');
  }

  function _effectSummary(item = {}) {
    const effects = item.effects || [];
    if (!effects.length) return '';
    return effects.slice(0, 3).map((effect) => {
      const def = DS().get('effects', effect.effectId || effect.id) || {};
      const value = effect.overrides?.value ?? effect.value ?? def.value;
      return `${def.name || effect.effectId || effect.id}${value != null ? ` ${Number(value) >= 0 ? '+' : ''}${value}` : ''}`;
    }).join(', ') + (effects.length > 3 ? `, +${effects.length - 3} more` : '');
  }

  function _delta(next, prior) {
    const diff = Number(next || 0) - Number(prior || 0);
    return `${Number(next || 0)} (${diff >= 0 ? '+' : ''}${diff})`;
  }

  function _memberCanUseWeapon(member, item) {
    const allowed = _allowedTypes(member, 'allowedWeaponTypes');
    return !allowed.length || allowed.includes(_weaponType(item));
  }

  function _memberCanUseArmor(member, item) {
    const allowed = _allowedTypes(member, 'allowedArmorTypes');
    return !allowed.length || allowed.includes(_armorType(item));
  }

  function _allowedTypes(member = {}, key) {
    const base = DS().get('characters', member.baseCharacterId) || {};
    const values = [...(base[key] || []), ...(member[key] || [])].map(_cleanType).filter(Boolean);
    return Array.from(new Set(values));
  }

  function _weaponType(item = {}) {
    return _cleanType(item.weaponType || item.weaponData?.weaponType || item.type || _inferType(item, C()?.WEAPON_TYPES || []));
  }

  function _armorType(item = {}) {
    return _cleanType(item.armorType || item.type || _inferType(item, C()?.ARMOR_TYPES || []));
  }

  function _accessoryType(item = {}) {
    return _cleanType(item.accessoryType || item.type || _inferType(item, C()?.ACCESSORY_TYPES || []));
  }

  function _inferType(item, types) {
    const text = [item?.id, item?.name, item?.slot, ...(item?.tags || [])].join(' ').toLowerCase();
    const aliases = {
      blade: 'sword', longsword: 'sword', shortsword: 'sword', katana: 'sword',
      fang: 'dagger', knife: 'dagger',
      longbow: 'bow', shortbow: 'bow',
      fist: 'knuckles', claw: 'knuckles', gauntlet: 'knuckles',
      rod: 'staff', tome: 'staff',
      leather: 'light', cloak: 'light', boots: 'light', cloth: 'robe', mail: 'heavy', plate: 'heavy',
      pendant: 'amulet', necklace: 'amulet', coin: 'charm', core: 'trinket'
    };
    for (const [alias, type] of Object.entries(aliases)) {
      if ((types || []).includes(type) && text.includes(alias)) return type;
    }
    return (types || []).find((type) => text.includes(type)) || '';
  }

  function _cleanType(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_ -]+/g, '').replace(/\s+/g, '_');
  }

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
    return DS().getAllAsArray('characters')
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
    return DS().getAllAsArray('skills')
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
    const passiveOptions = DS().getAllAsArray('passives').map((entry) => ({
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

  function _desc(record = {}) {
    return record.description || record.desc || record.flavor || record.notes || record.effectText || record.summary || '';
  }

  function _pickerItem(option) {
    return `
      <div class="campaign-picker-option">
        <strong>${_esc(option.label || option.value)}</strong>
        ${option.sub ? `<small>${_esc(option.sub)}</small>` : ''}
        ${option.description ? `<span>${_esc(option.description)}</span>` : ''}
      </div>
    `;
  }

  function _sortOptionLabel(a, b) {
    return String(a.label || '').localeCompare(String(b.label || ''));
  }

  function _formLabel(text) {
    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = text;
    lbl.style.marginTop = '10px';
    lbl.style.display = 'block';
    return lbl;
  }

  function _formModal({ title, body, onSubmit, primaryLabel = 'Apply', width = '480px' }) {
    const footer = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = primaryLabel;
    footer.appendChild(btn);
    const overlay = UI().openModal({ title, content: body, footer, width });
    btn.onclick = () => {
      const close = onSubmit();
      if (close !== false) UI().closeModal(overlay);
    };
    return overlay;
  }

  function _bucketOptions(bucket) {
    const world = CS().getState()?.currentWorld;
    const inWorld = (entry) => !entry._world || entry._world === world || entry._scope === 'universal' || entry._scope === 'system';
    const sortLabel = (a, b) => String(a.label).localeCompare(String(b.label));
    if (bucket === 'materials') {
      return DS().getAllAsArray('materials').filter(inWorld)
        .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry._world || entry.rarity || '', description: _desc(entry), tags: entry.tags || [] }))
        .sort(sortLabel);
    }
    if (bucket === 'food') {
      return DS().getAllAsArray('food').filter(inWorld)
        .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry._world || entry.type || '', description: _desc(entry), tags: entry.tags || [] }))
        .sort(sortLabel);
    }
    return DS().getAllAsArray('items').filter(inWorld)
      .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: [entry.type, entry.rarity, entry._world].filter(Boolean).join(' | '), description: _desc(entry), tags: entry.tags || [] }))
      .sort(sortLabel);
  }

  function _statusOptions() {
    const customIds = new Set();
    const opts = DS().getAllAsArray('statuses').map((entry) => {
      customIds.add(entry.id);
      return {
        value: entry.id,
        label: entry.name || entry.id,
        sub: entry.kind || entry.category || '',
        description: _desc(entry),
        tags: entry.tags || []
      };
    });
    for (const [id, def] of Object.entries(C()?.STATUS_DEFINITIONS || {})) {
      if (customIds.has(id)) continue;
      opts.push({
        value: id,
        label: def.name || id,
        sub: def.category || 'Built-in',
        description: _desc(def),
        tags: def.tags || []
      });
    }
    return opts.sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  function _seedOptions() {
    const world = CS().getState()?.currentWorld;
    return DS().getAllAsArray('crops')
      .filter((crop) => !crop._world || crop._world === world)
      .map((crop) => ({
        value: crop.id,
        label: crop.name || crop.id,
        sub: crop.growTime ? `${crop.growTime}t` : ''
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }

  function _worldOptions() {
    const campaign = CS().getCurrentCampaign();
    const worlds = CS().getContent().worlds || {};
    const allowed = campaign?.allowedWorlds || Object.keys(worlds);
    return allowed.map((id) => ({
      value: id,
      label: worlds[id]?.displayName || id,
      sub: id
    }));
  }

  function _tentOptions() {
    const inv = CS().getState()?.inventory?.items || {};
    const owned = Object.keys(inv).filter((id) => (inv[id] || 0) > 0);
    const items = DS().getAllAsArray('items');
    const tagged = items.filter((entry) => {
      const tags = entry.tags || [];
      return tags.includes('tent') || tags.includes('camp') || /tent|camp/i.test(entry.id || '');
    });
    const tentIds = new Set(tagged.map((entry) => entry.id));
    const all = new Set([...owned, ...tentIds]);
    return Array.from(all).map((id) => {
      const entry = items.find((e) => e.id === id);
      return { value: id, label: entry?.name || id, sub: `Owned: ${inv[id] || 0}` };
    });
  }

  function _opPickerModal({ title, options, primaryLabel = 'Apply', placeholder, withQty, qtyLabel = 'Qty', qtyMin = 1, qtyMax = 99, qtyDefault = 1, withDuration, renderItem = _pickerItem, onSubmit }) {
    const body = document.createElement('div');
    body.appendChild(_formLabel('Select'));
    const select = UI().createSearchableSelect({ options, placeholder: placeholder || 'Search...', renderItem });
    body.appendChild(select);

    let qty = null;
    if (withQty) {
      body.appendChild(_formLabel(qtyLabel));
      qty = UI().createNumberSlider({ value: qtyDefault, min: qtyMin, max: qtyMax, step: 1 });
      body.appendChild(qty);
    }

    let duration = null;
    if (withDuration) {
      body.appendChild(_formLabel('Duration'));
      duration = UI().createSelect({
        options: [
          { value: 'manual', label: 'Manual (GM clears)' },
          { value: 'scene', label: 'Scene' },
          { value: 'scenario', label: 'Scenario' },
          { value: '3', label: '3 turns' },
          { value: '5', label: '5 turns' },
          { value: '10', label: '10 turns' }
        ],
        value: 'manual'
      });
      body.appendChild(duration);
    }

    return _formModal({
      title,
      body,
      primaryLabel,
      onSubmit: () => {
        const value = select._getValue();
        if (!value) {
          UI().toast('Pick a value first', 'error');
          return false;
        }
        onSubmit({
          value,
          qty: qty ? qty._getValue() : undefined,
          duration: duration ? duration.value : undefined
        });
      }
    });
  }

  function _textareaModal({ title, label, placeholder, primaryLabel = 'Save', onSubmit, width = '520px', defaultValue = '' }) {
    const body = document.createElement('div');
    if (label) body.appendChild(_formLabel(label));
    const ta = document.createElement('textarea');
    ta.style.width = '100%';
    ta.style.minHeight = '120px';
    ta.placeholder = placeholder || '';
    ta.value = defaultValue;
    body.appendChild(ta);
    return _formModal({
      title,
      body,
      primaryLabel,
      width,
      onSubmit: () => onSubmit(ta.value.trim())
    });
  }

  function _numberModal({ title, label, primaryLabel = 'Apply', min = 1, max = 999, value = 5, onSubmit }) {
    const body = document.createElement('div');
    body.appendChild(_formLabel(label || 'Amount'));
    const slider = UI().createNumberSlider({ value, min, max, step: 1 });
    body.appendChild(slider);
    return _formModal({
      title,
      body,
      primaryLabel,
      onSubmit: () => onSubmit(slider._getValue())
    });
  }

  function _lootLine(drop) {
    if (drop.type === 'money') return `${drop.amount || drop.qty || 0} ${_currencyLabel(drop.currency || 'gold')}`;
    if (drop.type === 'jp') return `${drop.amount || drop.qty || 0} ${_currencyLabel('jp')}`;
    return `${drop.qty || 1}x ${drop.name || _recordName(drop.type === 'material' ? 'materials' : 'items', drop.id)}`;
  }

  function _currencyLabel(id) {
    const value = String(id || '').toLowerCase();
    if (value === 'jp' || value === 'jester_points') return 'Jester Points';
    if (value.endsWith('_gold')) return `${_label(value.replace(/_gold$/, ''))} Gold`;
    return _label(id);
  }

  function _recordName(bucketOrType, id) {
    const bucket = bucketOrType === 'material' ? 'materials'
      : bucketOrType === 'food' ? 'food'
        : bucketOrType === 'questItem' ? 'questItems'
          : bucketOrType || 'items';
    return DS().get(bucket, id)?.name || id;
  }

  function _label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function _safe(value) {
    return String(value || 'campaign').toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  }

  function _esc(value) {
    return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function _escAttr(value) {
    return _esc(value);
  }

  return Object.freeze({
    init,
    render,
    isBooted: () => _booted
  });
})();
