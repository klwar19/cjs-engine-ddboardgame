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
  const Gen = () => window.CJS.CampaignScenarioGenerator;
  const Chat = () => window.CJS.CampaignPartyChat;
  const C = () => window.CJS.CONST;
  const Icons = () => window.CJS.UIIcons;

  // Render an entity icon using UIIcons; safe fallback if module is missing.
  function _icon(entity, opts = {}) {
    const I = Icons();
    if (I) return I.renderIcon(entity, opts);
    const fallback = entity?.icon || (opts.kind === 'passive' ? '🛡️' : '⚔️');
    return `<span class="cjs-icon cjs-icon-${opts.size || 'md'}">${_esc(fallback)}</span>`;
  }

  let _root = null;
  let _activeMode = 'story';
  let _activeTab = 'storyHome';
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
      ['storyDirector', 'Story Director'],
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

  const APP_MODES = [
    ['story', 'Story', 'ST'],
    ['quest', 'Quest', 'QT'],
    ['event', 'Event', 'EV']
  ];

  const APP_MODE_TABS = {
    story: [
      ['storyHome', 'Story Home'],
      ['storyDirector', 'Director']
    ],
    quest: [
      ['questHome', 'Quest Home'],
      ['quests', 'Normal Quests'],
      ['farm', 'Farm'],
      ['cook', 'Cook'],
      ['craft', 'Forge'],
      ['inventory', 'Inventory']
    ],
    event: [
      ['eventHome', 'Event Home'],
      ['questChains', 'Side Stories'],
      ['sideForge', 'Hub'],
      ['oracleForge', 'Oracle'],
      ['battleSets', 'Battles'],
      ['mapSeeds', 'Map Seeds']
    ]
  };

  const APP_UTILITY_TABS = [
    ['maps', 'Current Run'],
    ['scenarios', 'Run Setup'],
    ['roster', 'Party'],
    ['shops', 'Shop/Rest'],
    ['pocket', 'Pocket Haven'],
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

    const isUtility = APP_UTILITY_TABS.some(([id]) => id === _activeTab);
    const subTabs = isUtility ? APP_UTILITY_TABS : (APP_MODE_TABS[_activeMode] || []);

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
    if (_activeTab === 'farm') window.CJS.FarmingMode?.bindControls?.(_root);
    _bindRunPanel();
    _renderPanelLayer();
    setTimeout(() => window.CJS.CampaignStoryScenes?.openPendingNodeEntry?.(), 0);
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
          <span>${_esc(world?.displayName || state.currentWorld)} | Chapter ${state.currentChapter} | Phase ${state.phase.number}: ${_esc(state.phase.name || state.phase.type)}</span>
        </div>
        ${_renderCompactCurrencies(state)}
        <div class="campaign-header-actions">
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
    const modeButtons = APP_MODES.map(([id, label, icon]) => {
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
          <div class="campaign-avatar">${member.portrait ? `<img src="${_escAttr(member.portrait)}" alt="">` : _icon(member, { kind: 'character', size: 'lg', alt: member.name || id })}</div>
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
    const F = window.CJS.Formulas;
    const charLevel = Number(member.level || 1);
    const charXp = Number(member.xp || 0);
    const xpToNext = F?.calcCharXpToNextLevel ? F.calcCharXpToNextLevel(charXp, charLevel) : null;
    const charXpMeta = xpToNext != null ? `XP ${charXp} (${xpToNext} to next)` : `XP ${charXp} (max)`;
    const battleReady = Bridge()?.isMemberBattleReady ? Bridge().isMemberBattleReady(member) : true;
    const availLabel = battleReady ? 'Ready' : (Bridge()?.availabilityLabel?.(member) || 'Unavailable');
    const portraitContent = member.portrait
      ? `<img src="${_escAttr(member.portrait)}" alt="">`
      : `<span class="campaign-roster-portrait-fallback">${_esc(member.icon || member.name?.[0] || '?')}</span>`;
    return `
      <article class="campaign-roster-member ${isBench ? 'is-bench' : 'is-active'} ${battleReady ? '' : 'is-unavailable'}">
        <header class="campaign-roster-hero">
          <div class="campaign-roster-portrait">${portraitContent}</div>
          <div class="campaign-roster-hero-info">
            <div class="campaign-roster-hero-title">
              <strong class="campaign-roster-name">${_esc(member.name || base?.name || id)}</strong>
              <span class="campaign-pill ${battleReady ? 'is-current' : 'is-blocked'}">${_esc(availLabel)}</span>
              <span class="campaign-pill">${isBench ? 'Bench' : 'Active'}</span>
            </div>
            <div class="campaign-roster-hero-meta">
              <span><b>Lv</b> ${charLevel}</span>
              <span><b>Rank</b> ${_esc(member.rank || base?.rank || 'F')}</span>
              <span class="campaign-roster-hero-job">${_renderJobChip(id, member)}</span>
              <span title="${_escAttr(charXpMeta)}"><b>XP</b> ${charXp}${xpToNext != null ? ` <small>(${xpToNext} to next)</small>` : ' <small>(max)</small>'}</span>
              <span class="campaign-muted">${_esc(id)}${base?.id && base.id !== id ? ` from ${_esc(base.id)}` : ''}</span>
            </div>
            <div class="campaign-roster-hero-actions campaign-row-actions">
              <button class="campaign-action" data-campaign-action="${isBench ? 'activate-character' : 'bench-character'}" data-id="${_escAttr(id)}">${isBench ? 'Activate' : 'Bench'}</button>
              <button class="campaign-action" data-campaign-action="level-char" data-id="${_escAttr(id)}">Level</button>
              <button class="campaign-action" data-campaign-action="grant-xp" data-id="${_escAttr(id)}">+XP</button>
              <button class="campaign-action" data-campaign-action="change-job" data-id="${_escAttr(id)}">Job</button>
              <button class="campaign-action" data-campaign-action="show-job-tree" data-id="${_escAttr(id)}">Tree</button>
              <button class="campaign-action" data-campaign-action="grant-job-xp" data-id="${_escAttr(id)}">+JobXP</button>
              <button class="campaign-action" data-campaign-action="stat-boost" data-id="${_escAttr(id)}">Stats</button>
              <button class="campaign-action danger" data-campaign-action="remove-character" data-id="${_escAttr(id)}">Remove</button>
            </div>
          </div>
        </header>

        <div class="campaign-roster-vitals-row">
          <section class="campaign-roster-card campaign-roster-vitals">
            <div class="campaign-roster-card-title">Vitals</div>
            <div class="campaign-bar"><span class="hp" style="width:${Math.round(((member.currentHp || 0) / (member.maxHp || 1)) * 100)}%"></span><b>HP ${member.currentHp}/${member.maxHp}</b></div>
            <div class="campaign-bar"><span class="mp" style="width:${Math.round(((member.currentMp || 0) / (member.maxMp || 1)) * 100)}%"></span><b>MP ${member.currentMp}/${member.maxMp}</b></div>
            <div class="campaign-roster-stats-grid">
              ${Object.entries(stats).map(([stat, value]) => `
                <div class="campaign-roster-stat">
                  <span>${_esc(_statName(stat))}</span>
                  <strong>${Number(value || 0)}</strong>
                </div>
              `).join('')}
            </div>
          </section>
          <section class="campaign-roster-card campaign-roster-affinities">
            <div class="campaign-roster-card-title">Affinities</div>
            ${_renderResistances(base, member, stats)}
          </section>
        </div>

        <div class="campaign-roster-detail-row">
          <section class="campaign-roster-card campaign-roster-skills">
            <div class="campaign-roster-card-title">
              <span>Skills</span>
              <small class="campaign-muted">${_renderSelectionBudgetBadge(id, member, 'skill')}</small>
              <button class="campaign-icon-btn" data-campaign-action="learn-skill" data-id="${_escAttr(id)}" title="Add to pool">+</button>
            </div>
            ${_renderSkillSlotView(id, member)}
            <details class="campaign-pool-details"><summary class="campaign-pool-summary">Manage Pool (${_memberSkillPoolCount(id, member)} in pool)</summary>${_renderSkillPoolList(id, member, skills)}</details>
          </section>
          <section class="campaign-roster-card campaign-roster-passives">
            <div class="campaign-roster-card-title">
              <span>Passives</span>
              <small class="campaign-muted">${_renderSelectionBudgetBadge(id, member, 'passive')}</small>
              <button class="campaign-icon-btn" data-campaign-action="learn-passive" data-id="${_escAttr(id)}" title="Add to pool">+</button>
            </div>
            ${_renderPassiveSlotView(id, member)}
            <details class="campaign-pool-details"><summary class="campaign-pool-summary">Manage Pool (${_memberPassivePoolCount(id, member)} in pool)</summary>${_renderPassivePoolList(id, member, passives)}</details>
          </section>
          <section class="campaign-roster-card campaign-roster-statuses">
            <div class="campaign-roster-card-title">
              <span>Statuses</span>
              <button class="campaign-icon-btn" data-campaign-action="status-char" data-id="${_escAttr(id)}">+</button>
            </div>
            ${statuses.length ? statuses.map((status) => _renderKnownStatus(status)).join('') : '<div class="campaign-empty">No statuses.</div>'}
          </section>
          <section class="campaign-roster-card campaign-roster-equipment">
            <div class="campaign-roster-card-title"><span>Equipment</span></div>
            ${_renderEquipmentLoadout(id, member)}
          </section>
        </div>
      </article>
    `;
  }

  // Selection budget chip — shows "X/Y slots · A/B SP" for a member.
  function _renderSelectionBudgetBadge(memberId, member, kind /* 'skill' | 'passive' */) {
    const F = window.CJS.Formulas;
    if (!F) return '';
    const base = DS().get('characters', member.baseCharacterId || memberId) || {};
    const eqField = kind === 'skill' ? 'equippedSkills' : 'equippedPassives';
    const slotCap = kind === 'skill'
      ? (F.calcEffectiveSkillSlots ? F.calcEffectiveSkillSlots(member, base) : member.skillSlots || 0)
      : (F.calcEffectivePassiveSlots ? F.calcEffectivePassiveSlots(member, base) : member.passiveSlots || 0);
    const spCap = kind === 'skill'
      ? (F.calcEffectiveSkillPoints ? F.calcEffectiveSkillPoints(member, base) : member.skillPoints || 0)
      : (F.calcEffectivePassivePoints ? F.calcEffectivePassivePoints(member, base) : member.passivePoints || 0);
    const equipped = member[eqField] || [];
    const used = F.calcEquippedSpCost
      ? F.calcEquippedSpCost(equipped, kind === 'skill' ? 'skills' : 'passives')
      : equipped.length;
    return `${equipped.length}/${slotCap} slots · ${used}/${spCap} SP`;
  }

  // Render the FULL skill pool for a member, with equip/unequip controls
  // per row. authoredEntries: the merged list from base + learned (used by
  // _renderKnownSkill so per-skill overrides like authored level still apply).
  function _renderSkillPoolList(memberId, member, authoredEntries) {
    const pool = CS().skillPoolIds ? CS().skillPoolIds(member, DS().get('characters', member.baseCharacterId || memberId) || {}) : [];
    if (!pool.length) return '<div class="campaign-empty">No skills in pool. Use the + button to learn one.</div>';
    const equippedSet = new Set(member.equippedSkills || []);
    // Map id → authored entry (so per-character overrides + level survive).
    const entryById = new Map();
    for (const e of authoredEntries || []) {
      const sid = typeof e === 'string' ? e : e?.skillId;
      if (sid) entryById.set(sid, e);
    }
    return pool.map((sid) => {
      const entry = entryById.get(sid) || { skillId: sid };
      return _renderKnownSkill(memberId, entry, equippedSet.has(sid));
    }).join('');
  }

  function _renderPassivePoolList(memberId, member, authoredPassives) {
    const pool = CS().passivePoolIds ? CS().passivePoolIds(member, DS().get('characters', member.baseCharacterId || memberId) || {}) : [];
    if (!pool.length) return '<div class="campaign-empty">No passives in pool. Use the + button to learn one.</div>';
    const equippedSet = new Set(member.equippedPassives || []);
    return pool.map((pid) => _renderKnownPassive(memberId, pid, equippedSet.has(pid))).join('');
  }

  // ── Slot-based equip views ──────────────────────────────────────────
  // Show equipped items as filled slots, empty slots as [+] picker buttons.
  function _renderSkillSlotView(memberId, member) {
    const F = window.CJS.Formulas;
    if (!F) return '';
    const base = DS().get('characters', member.baseCharacterId || memberId) || {};
    const slotCap = F.calcEffectiveSkillSlots ? F.calcEffectiveSkillSlots(member, base) : (member.skillSlots || 4);
    const equipped = member.equippedSkills || [];
    let html = '<div class="campaign-slot-grid">';
    for (let i = 0; i < slotCap; i++) {
      if (i < equipped.length) {
        const sid = equipped[i];
        const skill = DS().get('skills', sid);
        const spCost = F.calcSpCost ? F.calcSpCost(skill) : 1;
        html += `<div class="campaign-slot filled" title="${_escAttr(skill?.name || sid)} (SP ${spCost})">
          ${_icon(skill, { kind: 'skill', size: 'md', alt: skill?.name || sid })}
          <span class="campaign-slot-name">${_esc(skill?.name || sid)}</span>
          <button class="campaign-slot-remove" data-campaign-action="unequip-skill" data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(sid)}" title="Unequip">✕</button>
        </div>`;
      } else {
        html += `<div class="campaign-slot empty" data-campaign-action="pick-equip-skill" data-id="${_escAttr(memberId)}" title="Equip a skill from pool">
          <span class="campaign-slot-plus">+</span>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function _renderPassiveSlotView(memberId, member) {
    const F = window.CJS.Formulas;
    if (!F) return '';
    const base = DS().get('characters', member.baseCharacterId || memberId) || {};
    const slotCap = F.calcEffectivePassiveSlots ? F.calcEffectivePassiveSlots(member, base) : (member.passiveSlots || 3);
    const equipped = member.equippedPassives || [];
    let html = '<div class="campaign-slot-grid">';
    for (let i = 0; i < slotCap; i++) {
      if (i < equipped.length) {
        const pid = equipped[i];
        const passive = DS().get('passives', pid) || DS().get('effects', pid);
        const spCost = F.calcSpCost ? F.calcSpCost(passive) : 1;
        const rankInfo = _passiveRankInfo(memberId, pid, passive);
        html += `<div class="campaign-slot filled" title="${_escAttr(passive?.name || pid)} (SP ${spCost}, Rank ${rankInfo.rank}/${rankInfo.max})">
          ${_icon(passive, { kind: 'passive', size: 'md', alt: passive?.name || pid })}
          <span class="campaign-slot-name">${_esc(passive?.name || pid)} <small>R ${rankInfo.rank}/${rankInfo.max}</small></span>
          <button class="campaign-slot-remove" data-campaign-action="unequip-passive" data-id="${_escAttr(memberId)}" data-passive-id="${_escAttr(pid)}" title="Unequip">✕</button>
        </div>`;
      } else {
        html += `<div class="campaign-slot empty" data-campaign-action="pick-equip-passive" data-id="${_escAttr(memberId)}" title="Equip a passive from pool">
          <span class="campaign-slot-plus">+</span>
        </div>`;
      }
    }
    html += '</div>';
    return html;
  }

  function _memberSkillPoolCount(memberId, member) {
    const pool = CS().skillPoolIds ? CS().skillPoolIds(member, DS().get('characters', member.baseCharacterId || memberId) || {}) : [];
    return pool.length;
  }

  function _memberPassivePoolCount(memberId, member) {
    const pool = CS().passivePoolIds ? CS().passivePoolIds(member, DS().get('characters', member.baseCharacterId || memberId) || {}) : [];
    return pool.length;
  }

  // Pool picker modal — shows unequipped items from the char's pool for quick equip
  function _openSkillPoolPicker(memberId) {
    const member = CS().getState()?.party?.[memberId];
    if (!member) return;
    const F = window.CJS.Formulas;
    const base = DS().get('characters', member.baseCharacterId || memberId) || {};
    const pool = CS().skillPoolIds ? CS().skillPoolIds(member, base) : [];
    const equippedSet = new Set(member.equippedSkills || []);
    const available = pool.filter((sid) => !equippedSet.has(sid));

    if (!available.length) return UI().toast('No unequipped skills in pool.', 'info');

    const body = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search skills...';
    search.style.cssText = 'width:100%;margin-bottom:8px';
    body.appendChild(search);

    const list = document.createElement('div');
    list.className = 'data-list';
    list.style.maxHeight = '400px';
    body.appendChild(list);

    let overlay;
    function renderList(q) {
      list.innerHTML = '';
      const query = (q || '').toLowerCase();
      for (const sid of available) {
        const skill = DS().get('skills', sid);
        if (!skill) continue;
        if (query && !(skill.name || '').toLowerCase().includes(query) && !sid.toLowerCase().includes(query)) continue;
        const spCost = F?.calcSpCost ? F.calcSpCost(skill) : 1;
        const prog = member.skillProgress?.[sid] || { level: 1 };
        const row = document.createElement('div');
        row.className = 'data-list-item';
        row.style.cursor = 'pointer';
        row.innerHTML = `${_icon(skill, { kind: 'skill', size: 'sm', alt: skill.name || sid })}<div><div class="item-name">${_esc(skill.name || sid)}</div><div class="item-sub">SP ${spCost} | Lv ${prog.level || 1} | ${_esc(skill.description?.substring(0, 60) || '')}</div></div>`;
        row.onclick = () => {
          Ops().apply({ op: 'equip_skill', target: memberId, skillId: sid }, { source: 'ui' });
          UI().closeModal(overlay);
        };
        list.appendChild(row);
      }
      if (!list.children.length) list.innerHTML = '<div class="data-list-empty">No matching skills.</div>';
    }

    search.oninput = () => renderList(search.value);
    renderList('');

    overlay = UI().openModal({ title: 'Equip Skill from Pool', content: body, width: '500px' });
    search.focus();
  }

  function _openPassivePoolPicker(memberId) {
    const member = CS().getState()?.party?.[memberId];
    if (!member) return;
    const F = window.CJS.Formulas;
    const base = DS().get('characters', member.baseCharacterId || memberId) || {};
    const pool = CS().passivePoolIds ? CS().passivePoolIds(member, base) : [];
    const equippedSet = new Set(member.equippedPassives || []);
    const available = pool.filter((pid) => !equippedSet.has(pid));

    if (!available.length) return UI().toast('No unequipped passives in pool.', 'info');

    const body = document.createElement('div');
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Search passives...';
    search.style.cssText = 'width:100%;margin-bottom:8px';
    body.appendChild(search);

    const list = document.createElement('div');
    list.className = 'data-list';
    list.style.maxHeight = '400px';
    body.appendChild(list);

    let overlay;
    function renderList(q) {
      list.innerHTML = '';
      const query = (q || '').toLowerCase();
      for (const pid of available) {
        const passive = DS().get('passives', pid) || DS().get('effects', pid);
        if (!passive) continue;
        if (query && !(passive.name || '').toLowerCase().includes(query) && !pid.toLowerCase().includes(query)) continue;
        const spCost = F?.calcSpCost ? F.calcSpCost(passive) : 1;
        const rankInfo = _passiveRankInfo(memberId, pid, passive);
        const row = document.createElement('div');
        row.className = 'data-list-item';
        row.style.cursor = 'pointer';
        row.innerHTML = `${_icon(passive, { kind: 'passive', size: 'sm', alt: passive.name || pid })}<div><div class="item-name">${_esc(passive.name || pid)}</div><div class="item-sub">SP ${spCost} | Rank ${rankInfo.rank}/${rankInfo.max} | ${_esc(passive.trigger || passive.category || '')} | ${_esc(passive.description?.substring(0, 60) || '')}</div></div>`;
        row.onclick = () => {
          Ops().apply({ op: 'equip_passive', target: memberId, passiveId: pid }, { source: 'ui' });
          UI().closeModal(overlay);
        };
        list.appendChild(row);
      }
      if (!list.children.length) list.innerHTML = '<div class="data-list-empty">No matching passives.</div>';
    }

    search.oninput = () => renderList(search.value);
    renderList('');

    overlay = UI().openModal({ title: 'Equip Passive from Pool', content: body, width: '500px' });
    search.focus();
  }

  function _renderKnownSkill(memberId, entry, isEquipped) {
    const skillId = _skillEntryId(entry);
    const skill = DS().get('skills', skillId);
    const learned = entry.source === 'campaign' || _memberLearnedSkillIds(memberId).includes(skillId);
    const member = CS().getState()?.party?.[memberId] || {};
    const prog = member.skillProgress?.[skillId] || { ap: 0, level: 1 };
    const F = window.CJS.Formulas;
    const cap = F?.getSkillMaxLevel ? F.getSkillMaxLevel(skill || {}) : 5;
    const apTotal = Number(prog.ap || 0);
    const level = Math.max(1, Number(prog.level || 1));
    const apToNext = (skill && F?.calcSkillApToNextLevel) ? F.calcSkillApToNextLevel(skill, apTotal, level) : null;
    const apMeta = level >= cap
      ? `Lv ${level}/${cap} (max)`
      : (apToNext != null ? `Lv ${level}/${cap} | ${apToNext} AbP to next` : `Lv ${level}/${cap}`);
    const baseMeta = _skillMeta(skill, entry);
    const meta = [baseMeta, apMeta].filter(Boolean).join(' | ');
    const apButton = (skill && level < cap)
      ? `<button class="campaign-action" data-campaign-action="grant-skill-ap" data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}" title="Grant AbP for this skill (edit-mode)">+AbP</button>`
      : '';
    const levelButton = (skill && level < cap)
      ? `<button class="campaign-action" data-campaign-action="level-up-skill" data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}" title="Force level-up (edit-mode)">+Lv</button>`
      : '';
    const detailButton = skill
      ? `<button class="campaign-action" data-campaign-action="show-skill-detail" data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}" title="Show full perk tree">Detail</button>`
      : '';
    const equippedFlag = isEquipped === true;
    const spCost = (skill && window.CJS.Formulas?.calcSpCost) ? window.CJS.Formulas.calcSpCost(skill) : 1;
    const equipButton = isEquipped == null
      ? '' // older callers (back-compat) don't pass an equip state
      : (equippedFlag
          ? `<button class="campaign-action danger" data-campaign-action="unequip-skill" data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}" title="Unequip (frees slot/SP)">Unequip</button>`
          : `<button class="campaign-action" data-campaign-action="equip-skill" data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}" title="Equip (uses ${spCost} SP)">Equip</button>`);
    const extraActions = `${equipButton}${apButton}${levelButton}${detailButton}`;

    // Inline preview of earned perks + next perk so progress is visible
    // without opening the detail modal.
    const earned = (skill && F?.getEarnedSkillPerks) ? F.getEarnedSkillPerks(skill, level) : [];
    const next = (skill && F?.getNextSkillPerk) ? F.getNextSkillPerk(skill, level) : null;
    const earnedLine = earned.length
      ? `<div class="campaign-muted" style="font-size:0.8em">Perks: ${earned.map((p) => `Lv${p.level} — ${_esc(p.description || '...')}`).join(' • ')}</div>`
      : '';
    const nextLine = next
      ? `<div class="campaign-muted" style="font-size:0.8em;color:var(--accent)">Next at Lv${next.level}: ${_esc(next.description || '...')}</div>`
      : '';
    const baseDesc = _desc(skill) || '';
    const descriptionHtml = `<p>${_esc(baseDesc || 'No description yet.')}</p>${earnedLine}${nextLine}`;
    const titlePrefix = isEquipped === true ? '✓ ' : (isEquipped === false ? '☐ ' : '');
    return _renderKnownRecord({
      title: `${titlePrefix}${skill?.name || skillId}`,
      meta: `SP ${spCost} | ${meta}`,
      descriptionHtml,
      removeAction: learned ? 'unlearn-skill' : '',
      removeData: learned ? `data-id="${_escAttr(memberId)}" data-skill-id="${_escAttr(skillId)}"` : '',
      extraActions
    });
  }

  function _renderKnownPassive(memberId, passiveId, isEquipped) {
    const passiveRecord = DS().get('passives', passiveId);
    const passive = passiveRecord || DS().get('effects', passiveId);
    const learned = (CS().getState()?.party?.[memberId]?.learnedPassives || []).includes(passiveId);
    const spCost = (passive && window.CJS.Formulas?.calcSpCost) ? window.CJS.Formulas.calcSpCost(passive) : 1;
    const rankInfo = _passiveRankInfo(memberId, passiveId, passive);
    const rankCostText = _passiveRankCostText(passive, rankInfo.rank);
    const equippedFlag = isEquipped === true;
    const equipButton = isEquipped == null
      ? ''
      : (equippedFlag
          ? `<button class="campaign-action danger" data-campaign-action="unequip-passive" data-id="${_escAttr(memberId)}" data-passive-id="${_escAttr(passiveId)}" title="Unequip (frees slot/SP)">Unequip</button>`
          : `<button class="campaign-action" data-campaign-action="equip-passive" data-id="${_escAttr(memberId)}" data-passive-id="${_escAttr(passiveId)}" title="Equip (uses ${spCost} SP)">Equip</button>`);
    const rankButton = (passiveRecord && !rankInfo.isMax)
      ? `<button class="campaign-action" data-campaign-action="rank-up-passive" data-id="${_escAttr(memberId)}" data-passive-id="${_escAttr(passiveId)}" title="Consumes ${_escAttr(rankCostText || 'rank material')}">Rank Up</button>`
      : '';
    const F = window.CJS.Formulas;
    const earned = (passiveRecord && F?.getEarnedPassiveRankPerks) ? F.getEarnedPassiveRankPerks(passiveRecord, rankInfo.rank) : [];
    const next = (passiveRecord && F?.getNextPassiveRankPerk) ? F.getNextPassiveRankPerk(passiveRecord, rankInfo.rank) : null;
    const earnedLine = earned.length
      ? `<div class="campaign-muted" style="font-size:0.8em">Perks: ${earned.map((p) => `R${_passivePerkRank(p)} - ${_esc(p.description || '...')}`).join(' | ')}</div>`
      : '';
    const nextLine = next
      ? `<div class="campaign-muted" style="font-size:0.8em;color:var(--accent)">Next at R${_passivePerkRank(next)}: ${_esc(next.description || '...')}</div>`
      : '';
    const descriptionHtml = `<p>${_esc(_desc(passive) || 'No description yet.')}</p>${earnedLine}${nextLine}`;
    const titlePrefix = isEquipped === true ? '✓ ' : (isEquipped === false ? '☐ ' : '');
    return _renderKnownRecord({
      title: `${titlePrefix}${passive?.name || passiveId}`,
      meta: `SP ${spCost} | Rank ${rankInfo.rank}/${rankInfo.max}${rankInfo.isMax ? ' (max)' : ''} | ${passive?.trigger || passive?.category || passiveId}`,
      descriptionHtml,
      removeAction: learned ? 'unlearn-passive' : '',
      removeData: learned ? `data-id="${_escAttr(memberId)}" data-passive-id="${_escAttr(passiveId)}"` : '',
      extraActions: `${equipButton}${rankButton}`
    });
  }

  function _passivePerkRank(perk = {}) {
    return Number(perk.rank ?? perk.level ?? perk.targetRank ?? 0) || '?';
  }

  function _passiveRankInfo(memberId, passiveId, passive = null) {
    const member = CS().getState()?.party?.[memberId] || {};
    const rank = Math.max(1, Number(member.passiveProgress?.[passiveId]?.rank || 1));
    const F = window.CJS.Formulas;
    const max = F?.getPassiveMaxRank ? F.getPassiveMaxRank(passive || DS().get('passives', passiveId) || {}) : 5;
    return { rank, max, isMax: rank >= max };
  }

  function _passiveRankCostText(passive, currentRank) {
    const F = window.CJS.Formulas;
    const cost = passive && F?.calcPassiveRankCost ? F.calcPassiveRankCost(passive, currentRank) : null;
    return _formatBundleText(cost);
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

  function _renderKnownRecord({ title, meta, description, descriptionHtml, removeAction, removeData, extraActions }) {
    const body = descriptionHtml != null
      ? descriptionHtml
      : `<p>${_esc(description || 'No description yet.')}</p>`;
    return `
      <div class="campaign-record-line">
        <div>
          <strong>${_esc(title || '')}</strong>
          <small>${_esc(meta || '')}</small>
          ${body}
        </div>
        <div style="display:flex;gap:4px;align-items:center">
          ${extraActions || ''}
          ${removeAction ? `<button class="campaign-icon-btn danger" title="Remove" data-campaign-action="${removeAction}" ${removeData}>-</button>` : ''}
        </div>
      </div>
    `;
  }

  function _renderMain(state) {
    switch (_activeTab) {
      case 'storyHome': return _renderStoryHome(state);
      case 'questHome': return _renderQuestHome(state);
      case 'eventHome': return _renderEventHome(state);
      case 'roster': return _renderRoster(state);
      case 'storyDirector': return _renderStoryDirector(state);
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

  function _renderStoryHome(state) {
    const director = SD();
    const snap = director?.snapshot?.() || {};
    const pack = snap.pack || null;
    const stage = snap.stage || {};
    const flow = snap.flow || null;
    const syncKey = pack?.id && flow?.stageId ? `${pack.id}:${flow.stageId}` : '';
    const flowSynced = !!(syncKey && state.storyDirector?.sideQuestSync?.[syncKey]);
    const theme = _storyTheme(state);
    const next = director
      ? _storyNextStep(snap, state, flowSynced)
      : {
          index: 0,
          title: 'Story tools are offline',
          text: 'Story Mode could not find the Story Director module.',
          actions: []
        };
    const queue = (snap.queue || []).slice(0, 3);
    const clues = (snap.clues || []).slice(0, 4);
    const activeRun = state.activeScenarioRun;
    const campaign = CS().getCurrentCampaign();
    const authoredRuns = (campaign?.scenarios || []).map((id) => CS().getContent().scenarios[id]).filter(Boolean);

    return `
      <div class="campaign-dashboard campaign-mode-home campaign-story-home campaign-story-vn ${_escAttr(theme.className)}" ${_storyThemeStyle(theme)}>
        ${_renderStoryVnHero({ state, pack, stage, next, theme })}
        ${_renderModeFlow('Story Flow', [
          ['Episode', 'Pick the current chapter beat.'],
          ['Scene', 'Roll or write VN/table text.'],
          ['Choice', 'Choose the route to commit.'],
          ['Run', 'Launch a map or battle if needed.'],
          ['Reward', 'Save consequences to the campaign.']
        ], Math.min(next.index || 0, 4))}

        <section class="campaign-panel campaign-wide-panel campaign-home-focus">
          <div class="campaign-panel-head">
            <div>
              <h2>Main Story</h2>
              <div class="campaign-muted">${_esc(stage.summary || pack?.summary || 'Play the main arc, one episode at a time.')}</div>
            </div>
            <span class="campaign-pill">${_esc(stage.name || 'No stage selected')}</span>
          </div>
          <div class="campaign-home-actions">
            ${_actionBtn({ action: 'story-roll-scene', label: 'Next Story Scene', hint: 'Rolls a route popup before applying anything', kind: 'primary story' })}
            ${_actionBtn({ action: 'story-manual-note', label: 'Write Scene', hint: 'Manual story beat, saved to the story queue', kind: 'manual' })}
            ${_actionBtn({ action: 'open-scenarios-tab', label: activeRun ? 'Open Run Setup' : 'Story Run Setup', hint: 'Pick or generate a playable run' })}
            ${_actionBtn({ action: 'open-maps-tab', label: activeRun ? 'Continue Current Run' : 'Current Run', hint: activeRun ? 'Return to the active map' : 'No run active yet', kind: activeRun ? 'primary' : '' })}
          </div>
        </section>

        <section class="campaign-panel campaign-wide-panel">
          <div class="campaign-panel-head">
            <div>
              <h3>Episode Route</h3>
              <div class="campaign-muted">This guides tables and random rolls; it does not lock the story.</div>
            </div>
          </div>
          ${_renderStoryStageRail(pack?.stages || [], stage)}
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Current Story Card</h3></div>
          ${snap.last ? `
            <div class="campaign-home-card">
              <strong>${_esc(snap.last.title || snap.last.id)}</strong>
              <p>${_esc(snap.last.prompt || snap.last.summary || snap.last.text || '')}</p>
              <div class="campaign-chip-row">
                <span class="campaign-chip">${_esc(snap.last.kind || snap.last.type || 'scene')}</span>
                <span class="campaign-risk ${Side().riskClass(snap.last.canonRisk)}">${_esc(snap.last.canonRisk || 'green')}</span>
              </div>
              <div class="campaign-action-grid">
                ${_actionBtn({ action: 'story-open-last', label: 'Open Popup', hint: 'Review route choices' })}
                ${_actionBtn({ action: 'story-save-beat', label: 'Hold', hint: 'Keep this scene for later' })}
                ${_actionBtn({ action: 'story-reject-beat', label: 'Skip', hint: 'Reject this roll', kind: 'danger' })}
              </div>
            </div>
          ` : '<div class="campaign-empty">No active story roll. Use Next Story Scene when you want the app to offer a beat.</div>'}
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Held Scenes</h3><button class="campaign-action" data-campaign-action="story-open-last">Open Last</button></div>
          ${queue.length ? queue.map((card) => `<div class="campaign-row"><div><strong>${_esc(card.title || card.id)}</strong><div class="campaign-muted">${_esc(card.status || 'saved')} | ${_esc(card.kind || card.type || 'scene')}</div></div><span class="campaign-risk ${Side().riskClass(card.canonRisk)}">${_esc(card.canonRisk || 'green')}</span></div>`).join('') : '<div class="campaign-empty">No held scenes yet.</div>'}
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Story Clues</h3><button class="campaign-action" data-campaign-action="story-roll-memory">Memory / Clue</button></div>
          ${clues.length ? clues.map((clue) => `<div class="campaign-row"><div><strong>${_esc(clue.title || clue.id)}</strong><div class="campaign-muted">${_esc(clue.text || '')}</div></div><span class="campaign-risk ${Side().riskClass(clue.canonRisk)}">${_esc(clue.canonRisk || 'green')}</span></div>`).join('') : '<div class="campaign-empty">No clue ledger entries yet.</div>'}
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Manual Story Control</h3></div>
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'story-roll-peri', label: 'Peri Interrupt', hint: 'Comedy/system beat' })}
            ${_actionBtn({ action: 'story-pressure-tick', label: 'Offscreen Trouble', hint: 'Advance pressure without forcing canon', kind: 'risk' })}
            ${_actionBtn({ action: 'story-sync-sidequests', label: flowSynced ? 'Routes Updated' : 'Update Side Routes', hint: 'Syncs recommended side route pressure once', disabled: !flow || flowSynced, kind: 'quest' })}
            ${_actionBtn({ action: 'story-copy-prompt', label: 'Copy GM Prompt', hint: 'Current stage, card, clues, and queue' })}
          </div>
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Story-Ready Runs</h3></div>
          ${authoredRuns.slice(0, 3).map((scenario) => `
            <div class="campaign-row">
              <div>
                <strong>${_esc(scenario.name || scenario.id)}</strong>
                <div class="campaign-muted">${_esc(scenario.travelMode || (scenario.mapId ? 'node_map' : 'freeform'))} | ${_esc(scenario.notes || '')}</div>
              </div>
              <button class="campaign-action" data-campaign-action="start-scenario" data-id="${_escAttr(scenario.id)}" ${activeRun ? 'disabled' : ''}>Start</button>
            </div>
          `).join('') || '<div class="campaign-empty">No story runs loaded.</div>'}
        </section>

        ${_renderPurposeGuide(['hubPulse', 'rumor', 'problem', 'oracle'], {
          wide: true,
          note: 'Use the lightest tool first, then promote only when you want commitment.'
        })}
        ${_renderSoloNotice(state)}
        ${activeRun ? _renderScenarioSummary(state) : ''}
        ${_renderPendingBattle(state)}
        ${_renderCombatResult(state)}
        ${_renderTravelSurprise(state)}
        ${_renderEventResult(state)}
        ${_renderOracle(state)}
      </div>
    `;
  }

  function _renderQuestHome(state) {
    const quests = Object.values(state.quests || {});
    const active = quests.filter((q) => !q.chainTemplateId && !_isQuestResolved(q));
    const finished = quests.filter((q) => !q.chainTemplateId && _isQuestResolved(q));
    const nextQuest = active[0] || null;
    const templateCount = Object.values(CS().getContent().campaignQuests || {})
      .reduce((sum, record) => sum + (record.templates?.length || 0), 0);
    const run = state.activeScenarioRun;

    return `
      <div class="campaign-dashboard campaign-mode-home campaign-quest-home">
        ${_renderGachaHomeHero({
          tone: 'quest',
          kicker: 'Normal Quest',
          title: nextQuest ? nextQuest.title || nextQuest.id : 'Quest Board',
          text: nextQuest
            ? nextQuest.summary || 'Continue the current farming/adventure request.'
            : 'Pick repeatable work, farm resources, or create a small story-flavored quest run.',
          meta: [`${active.length} active`, `${finished.length} resolved`, `${templateCount} templates`],
          actions: [
            _actionBtn({ action: 'add-quest', label: 'Add Quest', hint: 'Create or edit a normal quest', kind: 'primary' }),
            _actionBtn({ action: 'random-quest-offer', label: 'Quick Quest Run', hint: 'Pick a quest template and start its run' }),
            _actionBtn({ action: 'generate-quest-scenario', label: 'Generate From Quest', hint: 'Use the active quest to create a run', disabled: !!run }),
            _actionBtn({ action: 'open-maps-tab', label: run ? 'Continue Run' : 'Current Run', hint: run ? 'Return to the active run' : 'No run is active yet' })
          ]
        })}
        ${_renderModeFlow('Quest Flow', [
          ['Accept', 'Add a normal quest.'],
          ['Run', 'Start a linked or generated stage.'],
          ['Farm', 'Collect drops and materials.'],
          ['Wrap', 'Apply run result to objectives.'],
          ['Turn In', 'Resolve or leave open.']
        ], run ? 2 : (nextQuest ? 1 : 0))}

        <section class="campaign-panel campaign-wide-panel campaign-home-focus">
          <div class="campaign-panel-head">
            <div>
              <h2>Normal Quest Board</h2>
              <div class="campaign-muted">Repeatable and low-canon content. It can still have scenes, banter, events, and choices.</div>
            </div>
            <span class="campaign-pill">${active.length} active</span>
          </div>
          <div class="campaign-quest-list">
            ${active.length ? active.slice(0, 4).map((quest) => _renderQuestRow(quest)).join('') : '<div class="campaign-empty">No active normal quests. Add one or use Quick Quest Run.</div>'}
          </div>
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Farming Stages</h3></div>
          <div class="campaign-stage-grid">
            ${_renderFarmingStageCard('Materials', 'Forest and cave routes for pelts, crystals, food hooks, and craft parts.', 'generate-material-run')}
            ${_renderFarmingStageCard('Gold / JP', 'Short guild work with light story color and manual result support.', 'random-quest-offer')}
            ${_renderFarmingStageCard('Pocket Haven', 'Farm growth, cooking, and forge prep between runs.', 'open-farm-tab')}
          </div>
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Quest Story Wrapper</h3></div>
          <div class="campaign-muted">Use these to add a small scene around a farming run without turning it into main canon.</div>
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'roll-event', label: 'Draw Quest Event', hint: 'A table event with visible consequences' })}
            ${_actionBtn({ action: 'roll-oracle', label: 'Quest Oracle', hint: 'Prompt only, no mechanics' })}
            ${_actionBtn({ action: 'random-rumor-offer', label: 'Rumor Lead', hint: 'Save a lead to the hub bank' })}
            ${_actionBtn({ action: 'roll-party-chat', label: 'Party Banter', hint: 'Small character beat' })}
          </div>
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Manual Quest Control</h3></div>
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'open-scenarios-tab', label: 'Run Setup', hint: 'Pick authored or generated scenarios' })}
            ${_actionBtn({ action: 'manual-battle', label: 'Manual Battle Result', hint: 'Resolve without opening combat' })}
            ${_actionBtn({ action: 'pass-phase', label: 'Pass Phase', hint: 'Advance timers and phase state' })}
            ${_actionBtn({ action: 'full-rest', label: 'Full Rest', hint: 'Restore party in allowed phases' })}
          </div>
        </section>

        ${_renderSoloNotice(state)}
        ${run ? _renderScenarioSummary(state) : ''}
        ${_renderPendingBattle(state)}
        ${_renderCombatResult(state)}
        ${_renderEventResult(state)}
        ${_renderOracle(state)}
        ${_renderLastReport(state)}
      </div>
    `;
  }

  function _renderEventHome(state) {
    const hub = window.CJS.CampaignHub?.getCurrentHubDefinition?.();
    const hubState = window.CJS.CampaignHub?.getCurrentHubState?.();
    const activeChains = window.CJS.CampaignQuestChains?.getActive?.() || [];
    const availableChains = window.CJS.CampaignQuestChains?.getAvailable?.() || [];
    const review = state.sideContent?.reviewQueue || [];
    const last = state.lastSideContentCard;
    const run = state.activeScenarioRun;

    return `
      <div class="campaign-dashboard campaign-mode-home campaign-event-home">
        ${_renderGachaHomeHero({
          tone: 'event',
          kicker: 'Current Event',
          title: hub?.name ? `${hub.name} Side Stories` : 'Event Hub',
          text: hub?.description || 'Special side stories, hub pulses, event quests, oracle prompts, and challenge battles.',
          meta: [`${activeChains.length} active stories`, `${availableChains.length} available`, `${review.length} review`],
          actions: [
            _actionBtn({ action: 'roll-hub-pulse', label: 'Draw Event Pulse', hint: 'Roll hub content for the current event', kind: 'primary', data: { table: 'town' } }),
            _actionBtn({ action: 'open-event-stories-tab', label: 'Side Stories', hint: 'Open event questlines' }),
            _actionBtn({ action: 'roll-forge-oracle', label: 'Event Oracle', hint: 'Prompt only, no mechanics' }),
            _actionBtn({ action: 'open-event-battles-tab', label: 'Challenge Battles', hint: 'Open event battle cards' })
          ]
        })}
        ${_renderModeFlow('Event Flow', [
          ['Banner', 'Pick the current event.'],
          ['Side Story', 'Start a questline.'],
          ['Event Quest', 'Run map/battle content.'],
          ['Shop/Hub', 'Spend rewards or solve pressure.'],
          ['Challenge', 'Optional harder battle.']
        ], activeChains.length ? 2 : 0)}
        ${_renderPurposeGuide(['oracle', 'rumor', 'problem', 'hubPulse', 'event'], {
          wide: true,
          note: 'Same idea, different commitment level.'
        })}

        <section class="campaign-panel campaign-wide-panel campaign-home-focus">
          <div class="campaign-panel-head">
            <div>
              <h2>Event Side Stories</h2>
              <div class="campaign-muted">Quest chains live here. They are special/event stories, not normal farming quests.</div>
            </div>
            <span class="campaign-pill">${activeChains.length} active</span>
          </div>
          ${activeChains.length
            ? activeChains.slice(0, 3).map((chain) => _renderQuestChainActive(chain)).join('')
            : (availableChains.length
              ? `<div class="campaign-tab-grid">${availableChains.slice(0, 3).map((chain) => _renderQuestChainTemplate(chain)).join('')}</div>`
              : '<div class="campaign-empty">No event side stories available.</div>')}
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Hub State</h3><button class="campaign-action" data-campaign-action="open-sideforge-tab">Open Hub</button></div>
          <div class="campaign-stat-grid">
            <span>Security <b>${hubState?.security ?? 0}</b></span>
            <span>Prosperity <b>${hubState?.prosperity ?? 0}</b></span>
            <span>Warmth <b>${hubState?.warmth ?? 0}</b></span>
            <span>Weirdness <b>${hubState?.weirdness ?? 0}</b></span>
          </div>
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'roll-hub-pulse', label: 'Hub Pulse', hint: 'General event hub card', data: { table: 'town' } })}
            ${_actionBtn({ action: 'roll-hub-pulse', label: 'Guild Pulse', hint: 'Contracts and rivals', data: { table: 'guild' } })}
            ${_actionBtn({ action: 'roll-hub-pulse', label: 'Tavern Pulse', hint: 'Rumors and social beats', data: { table: 'tavern' } })}
            ${_actionBtn({ action: 'manual-rumor', label: 'Manual Rumor', hint: 'Add a lead by hand' })}
          </div>
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Event Tools</h3></div>
          <div class="campaign-action-grid">
            ${_actionBtn({ action: 'roll-event', label: 'Draw Random Event', hint: 'Prepared event table result' })}
            ${_actionBtn({ action: 'pick-event', label: 'Pick Event', hint: 'Manual event selection' })}
            ${_actionBtn({ action: 'custom-event', label: 'Manual Event', hint: 'Guided builder for quest, map, battle, plot, character, rewards, and summary', kind: 'manual' })}
            ${_actionBtn({ action: 'roll-oracle', label: 'Roll Oracle', hint: 'Prompt only' })}
            ${_actionBtn({ action: 'custom-oracle', label: 'Custom Prompt', hint: 'Write your own event prompt' })}
          </div>
        </section>

        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Problems & Rumors</h3></div>
          ${_renderInlinePurpose('problem')}
          ${_renderInlinePurpose('rumor')}
          ${(hubState?.activeProblems || []).slice(0, 3).map((problem) => `<div class="campaign-town-line is-risk"><strong>${_esc(_label(problem))}</strong><span>Active event pressure</span></div>`).join('') || '<div class="campaign-empty">No active hub problems.</div>'}
          ${_openRumors(hubState).slice(0, 3).map((rumor) => _renderRumorRow(rumor, { compact: true })).join('') || '<div class="campaign-empty">No open rumors.</div>'}
        </section>

        ${last ? _renderSideCard(last, { mode: 'last' }) : ''}
        ${_renderSoloNotice(state)}
        ${run ? _renderScenarioSummary(state) : ''}
        ${_renderPendingBattle(state)}
        ${_renderCombatResult(state)}
        ${_renderEventResult(state)}
        ${_renderOracle(state)}
      </div>
    `;
  }

  function _renderGachaHomeHero({ tone = 'story', kicker = '', title = '', text = '', meta = [], actions = [] } = {}) {
    return `
      <section class="campaign-gacha-hero campaign-wide-panel is-${_escAttr(tone)}">
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

  function _renderModeFlow(title, steps, activeIndex = 0) {
    return `
      <section class="campaign-panel campaign-wide-panel campaign-flow-panel">
        <div class="campaign-panel-head"><h3>${_esc(title)}</h3></div>
        <div class="campaign-flow-steps">
          ${steps.map(([label, text], index) => `
            <div class="campaign-flow-step ${index === activeIndex ? 'is-active' : index < activeIndex ? 'is-done' : ''}">
              <span>${index + 1}</span>
              <b>${_esc(label)}</b>
              <small>${_esc(text)}</small>
            </div>
          `).join('')}
        </div>
      </section>
    `;
  }

  function _renderFarmingStageCard(title, text, action) {
    return `
      <article class="campaign-stage-card">
        <strong>${_esc(title)}</strong>
        <p>${_esc(text)}</p>
        <button class="campaign-action" data-campaign-action="${_escAttr(action)}">Start</button>
      </article>
    `;
  }

  const TOOL_PURPOSES = {
    oracle: {
      label: 'Oracle',
      role: 'GM prompt / keywords',
      use: 'Use when you need inspiration, a line of narration, or a sharper scene image.',
      flow: 'Text only -> Save Note -> Make Rumor/Event if you want it to matter later.',
      commit: 'No mechanics by default.'
    },
    rumor: {
      label: 'Rumor',
      role: 'Stored lead bank',
      use: 'Use when an idea is interesting but should not become canon or a quest yet.',
      flow: 'Hear lead -> Hold in hub -> Promote later to quest, event, NPC scene, map seed, oracle, or problem.',
      commit: 'Saved as a lead until promoted.'
    },
    problem: {
      label: 'Problem',
      role: 'Active hub pressure',
      use: 'Use when the hub is already affected and the party should see pressure building.',
      flow: 'Add pressure -> Show in hub -> Resolve manually or through quest/event results.',
      commit: 'Counts as active state until resolved.'
    },
    hubPulse: {
      label: 'Hub Pulse',
      role: 'Living hub moment',
      use: 'Use when you want town, guild, tavern, forge, or weird local activity.',
      flow: 'Roll/pick pulse -> Review card -> Apply choice, save idea, make rumor, or reject.',
      commit: 'Only commits when you apply a choice.'
    },
    event: {
      label: 'Random Event',
      role: 'Immediate happening',
      use: 'Use during story, quest, travel, aftermath, or event play when something happens now.',
      flow: 'Roll/pick event -> Review rewards/risks/text -> Apply, edit, note only, pin, or ignore.',
      commit: 'May change rewards, danger, flags, rumors, quests, or notes.'
    }
  };

  function _renderPurposeGuide(keys = ['oracle', 'rumor', 'problem', 'hubPulse', 'event'], options = {}) {
    const title = options.title || 'Purpose & Flow';
    return `
      <section class="campaign-panel campaign-purpose-guide ${options.wide ? 'campaign-wide-panel' : ''}">
        <div class="campaign-panel-head">
          <h3>${_esc(title)}</h3>
          ${options.note ? `<span class="campaign-muted">${_esc(options.note)}</span>` : ''}
        </div>
        <div class="campaign-purpose-grid">
          ${keys.map((key) => _renderPurposeCard(key)).join('')}
        </div>
      </section>
    `;
  }

  function _renderPurposeCard(key, options = {}) {
    const item = TOOL_PURPOSES[key] || TOOL_PURPOSES.oracle;
    const compact = options.compact ? 'is-compact' : '';
    return `
      <article class="campaign-purpose-card ${compact}">
        <div>
          <span class="campaign-impact-badge is-${_escAttr(_purposeTone(key))}">${_esc(item.label)}</span>
          <strong>${_esc(item.role)}</strong>
        </div>
        <p>${_esc(item.use)}</p>
        <small>${_esc(item.flow)}</small>
        <em>${_esc(item.commit)}</em>
      </article>
    `;
  }

  function _renderInlinePurpose(key) {
    const item = TOOL_PURPOSES[key] || TOOL_PURPOSES.oracle;
    return `
      <div class="campaign-purpose-inline">
        <span class="campaign-impact-badge is-${_escAttr(_purposeTone(key))}">${_esc(item.label)}</span>
        <span><b>${_esc(item.role)}.</b> ${_esc(item.flow)} ${_esc(item.commit)}</span>
      </div>
    `;
  }

  function _purposeTone(key) {
    if (key === 'event') return 'mixed';
    if (key === 'hubPulse' || key === 'problem') return 'quest';
    if (key === 'rumor') return 'plot';
    return 'flavor';
  }

  function _purposeKeyForCard(card = {}) {
    const type = String(card.type || '').toLowerCase();
    const source = String(card.source || '').toLowerCase();
    if (type.includes('oracle') || source.includes('oracle')) return 'oracle';
    if (type.includes('rumor')) return 'rumor';
    if (source.includes('hub_pulse') || type.includes('hub_pulse')) return 'hubPulse';
    if (type.includes('event')) return 'event';
    return 'hubPulse';
  }

  function _renderOverview(state) {
    return `
      <div class="campaign-dashboard campaign-town-dashboard">
        ${_renderTownSnapshot(state)}
        <div class="campaign-town-float-stack">
          ${_renderTownRollFloat(state)}
          ${_renderSoloNotice(state)}
        </div>
        <section class="campaign-panel campaign-actions-panel campaign-town-actions">
          <div class="campaign-panel-head">
            <div>
              <h2>Adventure Desk</h2>
              <div class="campaign-muted">Roll something random, pick something specific, or run admin tools. Every result shows its consequence before it touches the save.</div>
            </div>
          </div>
          <div class="campaign-control-stack">
            ${_controlGroup('Roll Random', `
              ${_actionBtn({ action: 'solo-surprise',       label: 'Story Offer',  hint: 'Hook card you can accept, make quest, plant as rumor, save, or ignore', kind: 'primary' })}
              ${_actionBtn({ action: 'random-quest-offer',  label: 'Quest Run',    hint: 'Pick a random quest template and auto-start its map run' })}
              ${_actionBtn({ action: 'random-rumor-offer',  label: 'Rumor Hook',   hint: 'Create a marked lead bank item. No mechanics happen until you promote it later' })}
              ${_actionBtn({ action: 'roll-event',          label: 'Roll Event',   hint: 'Table event with visible gain/risk/quest/plot consequences before apply' })}
              ${_actionBtn({ action: 'roll-oracle',         label: 'Roll GM Prompt', hint: 'GM inspiration text only. No bonuses applied' })}
            `, 'Random outputs land in the floating box and result cards. Nothing is committed until you accept it.')}
            ${_controlGroup('Pick / Customize', `
              ${_actionBtn({ action: 'add-quest',      label: 'Add Quest',     hint: 'Quest builder: pick template, edit fields, optionally start its run' })}
              ${_actionBtn({ action: 'manual-rumor',   label: 'Write Rumor',   hint: 'Type a custom lead into the hub rumor bank' })}
              ${_actionBtn({ action: 'pick-event',     label: 'Pick Event',    hint: 'Choose a specific authored event from the catalog' })}
              ${_actionBtn({ action: 'custom-event',   label: 'Custom Event',  hint: 'Write your own event with optional quick consequence' })}
              ${_actionBtn({ action: 'pick-oracle',    label: 'Pick GM Prompt', hint: 'Pick a specific GM prompt from the catalog' })}
              ${_actionBtn({ action: 'custom-oracle',  label: 'Custom Prompt', hint: 'Type your own GM scene prompt' })}
            `, 'Same outputs as Roll Random but you choose what shows up. Rumors are saved leads, not automatic mechanics.')}
            ${_controlGroup('Run Admin', `
              ${_actionBtn({ action: 'pass-phase',    label: 'Pass Phase',  hint: 'Advance the campaign phase: ticks timers, ages rumors, advances quests' })}
              ${_actionBtn({ action: 'full-rest',     label: 'Full Rest',   hint: 'Restore party HP/MP and clear non-permanent statuses' })}
              ${_actionBtn({ action: 'travel-world',  label: 'Travel World', hint: 'Switch to a different world / region in your campaign' })}
            `, 'Game-state controls. These commit immediately.')}
          </div>
        </section>
        ${_renderAdventureLegend(state)}
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
    return {
      id: cfg.id || 'default',
      className: cfg.className || '',
      backdrop: cfg.backdrop || '',
      accent: cfg.accent || world.color || '#76d3b1',
      danger: cfg.danger || '#ef6666',
      motif: cfg.motif || world.tone || 'story',
      worldName: world.displayName || state.currentWorld || 'World'
    };
  }

  function _storyThemeStyle(theme = {}) {
    const parts = [];
    if (theme.backdrop) parts.push(`--story-backdrop: url('${_escAttr(theme.backdrop)}')`);
    if (theme.accent) parts.push(`--story-accent: ${_escAttr(theme.accent)}`);
    if (theme.danger) parts.push(`--story-danger: ${_escAttr(theme.danger)}`);
    return parts.length ? `style="${parts.join('; ')}"` : '';
  }

  function _renderStoryVnHero({ state = {}, pack = null, stage = null, next = {}, theme = {} }) {
    const phase = state.phase || {};
    const title = pack?.name || `${theme.worldName || 'World'} Story Mode`;
    const summary = pack?.summary || 'Story Mode is ready for this world theme, but no authored story pack is loaded yet.';
    const actions = next.actions?.length ? `<div class="campaign-story-next-actions">${next.actions.join('')}</div>` : '';
    return `
      <section class="campaign-story-vn-hero campaign-wide-panel has-video">
        <video class="campaign-story-vn-video" autoplay muted loop playsinline preload="auto" aria-hidden="true" tabindex="-1">
          <source src="assets/videos/story-mode/banners/3%20f%C3%ACght%20chimera_reduced.mp4" type="video/mp4">
        </video>
        <div class="campaign-story-vn-shade" aria-hidden="true"></div>
        <div class="campaign-story-vn-content">
          <div class="campaign-story-vn-kicker">
            <span>${_esc(theme.worldName || state.currentWorld || 'World')}</span>
            <span>Chapter ${_esc(state.currentChapter || 1)} / Phase ${_esc(phase.number || 1)}</span>
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
        _actionBtn({ action: 'story-roll-scene', label: 'Next Scene', hint: 'Continue the story flow', kind: 'primary story' }),
        _actionBtn({ action: 'roll-party-chat', label: 'Party Banter', hint: 'Let the cast talk before more trouble arrives', kind: 'random' })
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
              <div class="campaign-muted">${_esc(hub?.description || 'Town pulse, rumors, problems, and content review queue.')}</div>
            </div>
            <span class="campaign-pill">${_esc(_label(hubState?.mood || 'neutral'))}</span>
          </div>
          <div class="campaign-stat-grid">
            <span>Security <b>${hubState?.security ?? 0}</b></span>
            <span>Prosperity <b>${hubState?.prosperity ?? 0}</b></span>
            <span>Warmth <b>${hubState?.warmth ?? 0}</b></span>
            <span>Weirdness <b>${hubState?.weirdness ?? 0}</b></span>
          </div>
          <div class="campaign-control-help">Roll a pulse table for a flavorful idea, or roll a quest / rumor hook. Each result lands in the floating box and only commits when you accept it.</div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="roll-hub-pulse" data-table="town" title="Roll the general hub pulse table - gossip, mood, mundane problems.">Hub Pulse</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="guild" title="Roll the adventurer guild table — contracts, recruits, factions.">Guild</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="tavern" title="Roll the tavern table — gossip, suppliers, drinking-spot drama.">Tavern</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="forge" title="Roll the forge / craft table — weapons, materials, smith requests.">Forge</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="weird" title="Roll the weirdness table — ominous omens, supernatural beats.">Weird</button>
            <button class="campaign-action" data-campaign-action="random-quest-offer" title="Pick a random quest template and auto-start its map run.">Quest Run</button>
            <button class="campaign-action" data-campaign-action="random-rumor-offer" title="Create a marked lead. Mechanics only happen when you promote it later.">Rumor Hook</button>
            <button class="campaign-action" data-campaign-action="manual-rumor" title="Type a custom rumor / lead into the hub bank.">Manual Rumor</button>
            <button class="campaign-action" data-campaign-action="roll-forge-oracle" title="Roll a GM inspiration prompt — text only, no mechanics.">Oracle</button>
          </div>
        </section>
        ${_renderSoloNotice(state)}
        ${last ? _renderSideCard(last, { mode: 'last' }) : ''}
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Hub Problems</h3><span class="campaign-muted">Pressure cards on this hub. Resolve them by spending phases or addressing the cause.</span></div>
          ${_renderInlinePurpose('problem')}
          ${(hubState?.activeProblems || []).map((problem) => `
            <div class="campaign-row">
              <strong>${_esc(_label(problem))}</strong>
              <button class="campaign-action" data-campaign-action="resolve-hub-problem" data-id="${_escAttr(problem)}" data-hub-id="${_escAttr(hub?.id || '')}" title="Mark this problem solved. Frees Pressure budget.">Resolve</button>
            </div>
          `).join('') || '<div class="campaign-empty">No active hub problems.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Rumors</h3><button class="campaign-action" data-campaign-action="manual-rumor">Add Rumor</button></div>
          ${_renderRumorPurpose()}
          ${_openRumors(hubState).slice(0, 6).map((rumor) => _renderRumorRow(rumor)).join('') || '<div class="campaign-empty">No open rumors.</div>'}
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
                <button class="campaign-action campaign-action-reject" data-campaign-action="review-resolve" data-id="${_escAttr(item.id)}" data-decision="rejected" title="Reject this content. It will not be added.">Reject</button>
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
            <h2>Event Side Stories</h2>
            <span class="campaign-pill">${active.length} active · ${available.length} available</span>
          </div>
          ${_renderSideStoryFlowGuide(active[0]?.template || available[0])}
          ${active.length ? active.map((chain) => _renderQuestChainActive(chain)).join('') : '<div class="campaign-empty">No active side stories. Start one below or use Normal Quest for a single farming run.</div>'}
          ${finished.length ? `<details class="campaign-resolved-quests"><summary>Resolved side stories (${finished.length})</summary>${finished.map(_renderQuestChainResolved).join('')}</details>` : ''}
        </section>
        ${available.length ? available.map((chain) => _renderQuestChainTemplate(chain)).join('') : '<section class="campaign-panel campaign-wide-panel"><div class="campaign-empty">No side-story templates available for this world. Add some in the editor or import a side content pack.</div></section>'}
      </div>
    `;
  }

  function _renderTownSnapshot(state) {
    const hub = window.CJS.CampaignHub?.getCurrentHubDefinition?.();
    const hubState = window.CJS.CampaignHub?.getCurrentHubState?.();
    const activeQuests = Object.values(state.quests || {}).filter((quest) => !_isQuestResolved(quest));
    const activeChains = CS().getActiveQuestChains?.() || [];
    const problems = hubState?.activeProblems || [];
    const rumors = _openRumors(hubState);
    const metrics = ['security', 'prosperity', 'warmth', 'weirdness']
      .map((stat) => `<span>${_esc(_label(stat))} <b>${_esc(hubState?.[stat] ?? 0)}</b></span>`)
      .join('');
    const locations = (hub?.locations || []).slice(0, 5).map((loc) => `
      <div class="campaign-town-line">
        <strong>${_esc(loc.name || loc.id)}</strong>
        <span>${_esc(loc.notes || _label(loc.type || 'location'))}</span>
      </div>
    `).join('');

    return `
      <section class="campaign-panel campaign-town-snapshot">
        <div class="campaign-panel-head">
          <div>
            <h2>${_esc(hub?.name || 'Town Overview')}</h2>
            <div class="campaign-muted">${_esc(hub?.description || 'Town phase command view.')}</div>
          </div>
          <span class="campaign-pill">${_esc(_label(hubState?.mood || 'neutral'))}</span>
        </div>
        <div class="campaign-town-summary">
          <div class="campaign-stat-grid campaign-town-stats">${metrics}</div>
          <div class="campaign-town-now">
            <div class="campaign-town-kpi">
              <b>${activeQuests.length}</b>
              <span>Open quests</span>
            </div>
            <div class="campaign-town-kpi">
              <b>${activeChains.length}</b>
              <span>Quest arcs</span>
            </div>
            <div class="campaign-town-kpi ${problems.length ? 'is-risk' : ''}">
              <b>${problems.length}</b>
              <span>Problems</span>
            </div>
            <div class="campaign-town-kpi ${rumors.length ? 'is-plot' : ''}">
              <b>${rumors.length}</b>
              <span>Rumors</span>
            </div>
          </div>
        </div>
        ${_renderRumorPurpose()}
        <div class="campaign-town-columns">
          <div>
            <div class="campaign-section-title">Pressure</div>
            ${(problems.length ? problems.slice(0, 4).map((problem) => `
              <div class="campaign-town-line is-risk">
                <strong>${_esc(_label(problem))}</strong>
                <span>Active hub problem</span>
              </div>
            `).join('') : '<div class="campaign-empty">No active hub problems.</div>')}
            ${(rumors.length ? rumors.slice(0, 3).map((rumor) => _renderRumorRow(rumor, { compact: true })).join('') : '')}
          </div>
          <div>
            <div class="campaign-section-title">Places</div>
            ${locations || '<div class="campaign-empty">No hub locations loaded.</div>'}
          </div>
        </div>
      </section>
    `;
  }

  function _renderTownRollFloat(state) {
    const pending = _pendingSoloHookCard(state);
    const pendingOps = pending ? _cardChoiceOps(pending) : [];
    const pendingSummary = pending
      ? _consequenceSummary(pendingOps, { hasText: !!(pending.prompt || pending.summary || pending.text) })
      : null;
    return `
      <section class="campaign-panel campaign-random-float ${pending ? 'has-pending' : ''}">
        <div class="campaign-floating-eyebrow">Roll Random</div>
        <h3>${pending ? 'Resolve Current Roll' : 'Hub Pulse Box'}</h3>
        ${pending
          ? `<p>${_esc(pending.title || pending.name || pending.id)}</p>
             <div class="campaign-impact-row">
               <span class="campaign-impact-badge is-${_escAttr(pendingSummary.tone)}">${_esc(pendingSummary.label)}</span>
               <span>${_esc(pendingSummary.short)}</span>
             </div>`
          : '<p>Click once, then deal with the result before rolling again.</p>'}
        <div class="campaign-action-grid">
          ${pending
            ? `<button class="campaign-action primary" data-campaign-action="accept-solo-hook">${pendingOps.length ? 'Accept & Apply' : 'Accept as Quest'}</button>
               <button class="campaign-action" data-campaign-action="save-solo-hook">Save Text</button>
               <button class="campaign-action danger" data-campaign-action="ignore-solo-hook">Reject</button>`
            : '<button class="campaign-action primary campaign-roll-now" data-campaign-action="solo-surprise">Roll Random</button>'}
        </div>
        <div class="campaign-impact-legend">
          ${_impactLegendItem('reward', 'gain')}
          ${_impactLegendItem('risk', 'risk')}
          ${_impactLegendItem('quest', 'quest')}
          ${_impactLegendItem('plot', 'plot')}
          ${_impactLegendItem('flavor', 'text')}
        </div>
      </section>
    `;
  }

  function _renderRumorPurpose() {
    return `
      <div class="campaign-rumor-purpose">
        <span class="campaign-impact-badge is-plot">Rumor purpose</span>
        <span>Rumors are parked leads, not current events. Collect whispers now, check canon risk, then promote one later into a quest, event, map seed, NPC beat, oracle prompt, or hub problem when the party is ready.</span>
      </div>
    `;
  }

  function _isRumorOpen(rumor = {}) {
    return !['resolved', 'promoted', 'dismissed', 'archived'].includes(String(rumor.status || 'active').toLowerCase());
  }

  function _openRumors(hubState) {
    return (hubState?.rumors || []).filter(_isRumorOpen);
  }

  function _renderRumorRow(rumor = {}, options = {}) {
    const hubId = window.CJS.CampaignHub?.getCurrentHubId?.() || '';
    const compact = !!options.compact;
    return `
      <div class="campaign-row campaign-rumor-row ${compact ? 'is-compact' : ''}">
        <div>
          <strong>${_esc(rumor.text || rumor.id)}</strong>
          <div class="campaign-muted">${_esc(rumor.status || 'active')} | ${_esc(_label(rumor.canonRisk || 'green'))} lead | parked until promoted</div>
        </div>
        <div class="campaign-row-actions">
          <span class="campaign-risk ${Side().riskClass(rumor.canonRisk)}">${_esc(rumor.canonRisk || 'green')}</span>
          <button class="campaign-action" data-campaign-action="rumor-to-quest" data-id="${_escAttr(rumor.id)}" data-hub-id="${_escAttr(hubId)}">Make Quest</button>
          <button class="campaign-action" data-campaign-action="rumor-to-problem" data-id="${_escAttr(rumor.id)}" data-hub-id="${_escAttr(hubId)}">Make Problem</button>
          <button class="campaign-action danger" data-campaign-action="resolve-rumor" data-id="${_escAttr(rumor.id)}" data-hub-id="${_escAttr(hubId)}">Resolve</button>
        </div>
      </div>
    `;
  }

  function _renderTownActionButton({ action, tone, title, meta, text }) {
    return `
      <button class="campaign-town-option is-${_escAttr(tone)}" data-campaign-action="${_escAttr(action)}">
        <span class="campaign-impact-badge is-${_escAttr(tone)}">${_esc(meta)}</span>
        <strong>${_esc(title)}</strong>
        <span>${_esc(text)}</span>
      </button>
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
          ${_renderQuestChainVnPanel(chain, { active: true })}
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
        ${_renderQuestChainVnPanel(chain)}
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

  function _renderSideStoryFlowGuide(chain = {}) {
    if (!chain) return '';
    return `
      <div class="campaign-side-story-guide">
        <span class="campaign-impact-badge is-plot">Side Story VN</span>
        <strong>${_esc(chain.title || chain.name || 'Side Story')}</strong>
        <span>${_esc(chain.summary || 'Side stories have their own plot rail, scene beats, optional map run, and manual resolve controls.')}</span>
      </div>
    `;
  }

  function _renderQuestChainVnPanel(chain = {}, options = {}) {
    const template = chain.template || chain || {};
    const steps = template.steps || [];
    const currentId = options.active ? chain.currentStepId : steps[0]?.id;
    const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === currentId));
    const current = steps[currentIndex] || steps[0] || {};
    const npcs = (template.mainNpcs || []).slice(0, 4);
    return `
      <div class="campaign-side-story-vn">
        <div class="campaign-side-story-scene">
          <span class="campaign-impact-badge is-plot">${options.active ? 'Current Scene' : 'Opening Scene'}</span>
          <strong>${_esc(current.label || template.title || template.id || 'Side Story')}</strong>
          <p>${_esc(current.text || template.summary || 'Pick a scene, run it as VN/table narration, then decide whether it becomes a map, battle, quest progress, or a parked lead.')}</p>
        </div>
        <div class="campaign-side-story-meta">
          <span><b>Plot</b> ${_esc(template.type || 'side story')}</span>
          <span><b>NPCs</b> ${_esc(npcs.join(', ') || 'GM choice')}</span>
          <span><b>Control</b> Start map, battle manually, complete step, resolve, or fail.</span>
        </div>
        <div class="campaign-side-story-steps">
          ${steps.map((step, index) => `
            <span class="${index === currentIndex ? 'is-current' : index < currentIndex ? 'is-done' : ''}">
              <b>${index + 1}</b>${_esc(step.label || step.id)}
            </span>
          `).join('')}
        </div>
      </div>
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
          ${_renderInlinePurpose('oracle')}
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
    const primaryOps = _cardChoiceOps(card);
    const summary = _consequenceSummary(primaryOps, { hasText: !!(card.prompt || card.text || card.summary) });
    return `
      <section class="campaign-panel campaign-side-card campaign-result-card is-${_escAttr(summary.tone)} ${compact ? 'compact' : ''}">
        <div class="campaign-panel-head">
          <div>
            <h3>${_esc(card.title || card.name || card.id)}</h3>
            <div class="campaign-muted">${_esc(card.type || 'side content')} | ${_esc(card.source || '')} | ${_esc(card.status || 'idea')}</div>
          </div>
          <div class="campaign-impact-row">
            <span class="campaign-impact-badge is-${_escAttr(summary.tone)}">${_esc(summary.label)}</span>
            <span class="campaign-risk ${Side().riskClass(card.canonRisk)}">${_esc(card.canonRisk || 'green')}</span>
          </div>
        </div>
        ${!compact ? _renderInlinePurpose(_purposeKeyForCard(card)) : ''}
        ${card.prompt ? `<p>${_esc(card.prompt)}</p>` : ''}
        ${card.text ? `<p>${_esc(card.text)}</p>` : ''}
        ${card.summary && !compact ? `<p>${_esc(card.summary)}</p>` : ''}
        ${!compact ? _renderFlavorTrail(card) : ''}
        ${card.gmKeywords?.length && !compact ? `<div class="campaign-chip-row">${card.gmKeywords.map((tag) => `<span class="campaign-chip">${_esc(tag)}</span>`).join('')}</div>` : ''}
        ${card.gmNote && !compact ? `<div class="campaign-warning">${_esc(card.gmNote)}</div>` : ''}
        ${choices.length && !compact ? `<div class="campaign-choice-stack">${choices.map((choice, index) => _renderChoiceConsequence(choice, index)).join('')}</div>` : ''}
        <div class="campaign-action-grid">
          ${choices.length ? choices.map((choice, index) => `
            <button class="campaign-action ${index === 0 ? 'primary' : ''}" data-campaign-action="apply-side-choice" data-id="${_escAttr(card.id)}" data-choice="${index}" title="${_escAttr('Apply: ' + (choice.label || ('Choice ' + (index + 1))))}"><span class="ku-action-prefix">Apply</span><span class="ku-action-label">${_esc(choice.label || `Choice ${index + 1}`)}</span></button>
          `).join('') : ''}
          <button class="campaign-action" data-campaign-action="save-side-idea" data-id="${_escAttr(card.id)}" title="Save this idea to the bank without committing it.">Save</button>
          <button class="campaign-action" data-campaign-action="copy-side-card" data-id="${_escAttr(card.id)}" title="Copy the card text to clipboard.">Copy</button>
          ${!compact ? `<button class="campaign-action" data-campaign-action="dismiss-side-card" data-id="${_escAttr(card.id)}" title="Hide this card from the current result slot.">Dismiss</button>` : ''}
          <button class="campaign-action campaign-action-reject" data-campaign-action="reject-side-idea" data-id="${_escAttr(card.id)}" title="Discard this idea. Nothing is committed.">Reject</button>
        </div>
      </section>
    `;
  }

  function _cardChoiceOps(card = {}) {
    const firstChoice = card.suggestedChoices?.[0]?.ops;
    const ops = firstChoice || card.suggested || card.suggestedOps || card.rewardOps || [];
    return Array.isArray(ops) ? ops : [];
  }

  function _renderChoiceConsequence(choice = {}, index = 0) {
    return _renderConsequencePreview(choice.ops || [], {
      title: choice.label || `Choice ${index + 1}`,
      emptyTitle: choice.label || `Choice ${index + 1}`,
      emptyText: 'Flavor choice only. Save it as text or use it to steer the next scene.'
    });
  }

  function _renderConsequencePreview(ops = [], options = {}) {
    const list = Array.isArray(ops) ? ops.filter(Boolean) : [];
    const summary = _consequenceSummary(list, { hasText: options.hasText });
    const title = options.title || (list.length ? summary.title : options.emptyTitle) || summary.title;
    const text = list.length ? summary.detail : (options.emptyText || summary.detail);
    const lines = list.length ? Ops().describe(list) : [];
    return `
      <div class="campaign-consequence is-${_escAttr(summary.tone)}">
        <div class="campaign-consequence-head">
          <span class="campaign-impact-badge is-${_escAttr(summary.tone)}">${_esc(summary.label)}</span>
          <strong>${_esc(title)}</strong>
        </div>
        <span>${_esc(text)}</span>
        ${lines.length ? `<ul>${lines.map((line) => `<li>${_esc(line)}</li>`).join('')}</ul>` : ''}
      </div>
    `;
  }

  function _renderFlavorTrail(entry = {}) {
    const lines = [];
    if (entry.suggestedUse) lines.push(['Use', entry.suggestedUse]);
    if (entry.objective) lines.push(['Objective', entry.objective]);
    if (entry.gimmick) lines.push(['Scene logic', entry.gimmick]);
    if (entry.followUpHooks?.length) lines.push(['Follow-up', entry.followUpHooks.join(' / ')]);
    if (entry.oracleTableId) lines.push(['Oracle', 'Roll a linked prompt if the text needs a sharper direction.']);
    if (!lines.length) return '';
    return `
      <div class="campaign-flavor-trail">
        ${lines.map(([label, text]) => `
          <div>
            <b>${_esc(label)}</b>
            <span>${_esc(text)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  function _consequenceSummary(ops = [], options = {}) {
    const list = Array.isArray(ops) ? ops.filter(Boolean) : [];
    const counts = { reward: 0, risk: 0, quest: 0, plot: 0, flavor: 0 };
    for (const op of list) counts[_operationTone(op)] += 1;
    let tone = 'flavor';
    if (counts.reward && !counts.risk && !counts.quest && !counts.plot) tone = 'reward';
    else if (counts.risk && !counts.reward && !counts.quest && !counts.plot) tone = 'risk';
    else if (counts.quest && !counts.reward && !counts.risk) tone = 'quest';
    else if (counts.plot && !counts.reward && !counts.risk && !counts.quest) tone = 'plot';
    else if (counts.reward || counts.risk || counts.quest || counts.plot) tone = 'mixed';
    else if (options.hasText) tone = 'flavor';

    const labels = {
      reward: 'Gain',
      risk: 'Risk / Cost',
      quest: 'Quest / Progress',
      plot: 'Plot / Text',
      flavor: 'Flavor Only',
      mixed: 'Mixed'
    };
    const titles = {
      reward: 'Applies rewards',
      risk: 'Applies a cost or danger',
      quest: 'Changes quest or hub progress',
      plot: 'Adds plot state or table text',
      flavor: 'Flavor text only',
      mixed: 'Applies mixed consequences'
    };
    const details = {
      reward: 'Clicking applies gains such as items, money, JP, healing, unlocks, or roster growth.',
      risk: 'Clicking applies loss, damage, danger, status pressure, or a similar cost.',
      quest: 'Clicking starts or advances a quest, scenario, hub problem, service, map, or clock.',
      plot: 'Clicking records story state such as rumors, flags, bonds, reputation, notes, or review items.',
      flavor: 'No mechanical change yet. Keep it as narration, save it as a note, or turn it into a plot seed.',
      mixed: 'Clicking applies more than one kind of result. Review the exact list before applying.'
    };
    const shorts = {
      reward: 'You get something.',
      risk: 'Something pushes back.',
      quest: 'The campaign state moves forward.',
      plot: 'Story text or plot state changes.',
      flavor: 'Text only until you save or promote it.',
      mixed: 'Multiple consequences apply.'
    };
    return { tone, label: labels[tone], title: titles[tone], detail: details[tone], short: shorts[tone] };
  }

  function _operationTone(op = {}) {
    const name = String(op.op || '').toLowerCase();
    if (!name || name === 'log') return 'flavor';
    if (/^(give_|heal_|restore_mp|recruit_character|learn_|unlock_|add_xp|add_level)/.test(name)) return 'reward';
    if (/^(take_|damage_|spend_|add_status|remove_character|bench_character)/.test(name)) return 'risk';
    if (name === 'danger') return Number(op.amount || 0) > 0 ? 'risk' : 'reward';
    if (/quest|scenario|battle|node|map|hub_problem|hub_service|clock/.test(name)) return 'quest';
    if (/rumor|flag|bond|reputation|npc_mood|hub_mood|hub_stat|memory|side_idea|review|world_transition|chapter_transition/.test(name)) return 'plot';
    return 'plot';
  }

  function _impactLegendItem(tone, label) {
    return `<span class="campaign-impact-badge is-${_escAttr(tone)}">${_esc(label)}</span>`;
  }

  function _controlGroup(title, buttons, description = '') {
    return `
      <div class="campaign-control-group">
        <div class="campaign-control-title">${_esc(title)}</div>
        ${description ? `<div class="campaign-control-help">${_esc(description)}</div>` : ''}
        <div class="campaign-action-grid">${buttons}</div>
      </div>
    `;
  }

  function _actionMenu(label, buttons, options = {}) {
    const cls = ['campaign-action-menu'];
    if (options.align === 'end') cls.push('align-end');
    if (options.compact) cls.push('is-compact');
    return `
      <details class="${cls.join(' ')}">
        <summary class="campaign-action-menu-trigger">
          <span>${_esc(label)}</span>
        </summary>
        <div class="campaign-action-menu-panel">
          ${buttons}
        </div>
      </details>
    `;
  }

  function _actionBtn({ action, label, hint, kind = '', data = {}, disabled = false }) {
    const cls = ['campaign-action'];
    if (kind) cls.push(kind);
    if (hint) cls.push('has-hint');
    const dataAttrs = Object.entries(data)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `data-${k}="${_escAttr(String(v))}"`)
      .join(' ');
    const disable = disabled ? 'disabled' : '';
    const titleAttr = hint ? ` title="${_escAttr(hint)}"` : '';
    return `
      <button class="${cls.join(' ')}" data-campaign-action="${_escAttr(action)}" ${dataAttrs}${titleAttr} ${disable}>
        <span class="campaign-action-label">${_esc(label)}</span>
        ${hint ? `<small class="campaign-action-hint">${_esc(hint)}</small>` : ''}
      </button>
    `;
  }

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
        </div>
        ${_renderQuestRunTask(state, run, scenario)}
        <div class="campaign-control-stack">
          ${_controlGroup('Run Tools', `
            <button class="campaign-action" data-campaign-action="open-maps-tab">Map</button>
            <button class="campaign-action primary" data-campaign-action="roll-travel-surprise">Movement Surprise</button>
            <button class="campaign-action" data-campaign-action="roll-party-chat">Party Banter</button>
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
          <button class="campaign-action" data-campaign-action="roll-party-chat">Party Banter</button>
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
    const suggested = event.suggested || [];
    const summary = _consequenceSummary(suggested, { hasText: !!(event.prompt || event.gmHook) });
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
        <div class="campaign-control-help">Pick one: <b>Apply</b> commits the listed ops now. <b>Edit First</b> lets you tweak ops before applying. <b>Save Note</b> only logs the event text. <b>Ignore</b> drops it. Reroll/Override change which event is shown.</div>
        <div class="campaign-action-grid">
          ${_actionBtn({ action: 'apply-event', label: suggested.length ? 'Apply Listed Changes' : 'Log Flavor', hint: opsDesc.length ? 'Commit: ' + opsDesc.join('; ') : 'Log the event with no stat changes', kind: 'primary' })}
          ${_actionBtn({ action: 'edit-event', label: 'Edit Changes', hint: 'Tweak the ops, then apply' })}
          ${event.manualSummary ? _actionBtn({ action: 'copy-event-summary', label: 'Copy Summary', hint: 'Copy the event summary and separate main-story notes for outside writing', kind: 'manual' }) : ''}
          ${_actionBtn({ action: 'note-event', label: 'Save Text Note', hint: 'Log the event text without applying ops' })}
          ${(event.gmHook || event.gmIdea) ? _actionBtn({ action: 'pin-plot-seed', label: 'Pin Plot Seed', hint: 'Save as a future plot hook in pinned notes' }) : ''}
          ${event.oracleTableId ? _actionBtn({ action: 'event-to-oracle', label: 'Roll Linked Oracle', hint: 'Roll an oracle prompt linked to this event' }) : ''}
          ${_actionBtn({ action: 'ignore-event', label: 'Ignore', hint: 'Discard this event with no log entry', kind: 'danger' })}
          ${_actionBtn({ action: 'roll-event', label: 'Reroll Event', hint: 'Roll a different random event' })}
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
        <div class="campaign-control-help">Pure narrative. <b>No stats or items change.</b> Use the prompt to describe a scene, then <b>Save Text Note</b> to remember it or <b>Reroll</b> for a new one.</div>
        <div class="campaign-action-grid">
          ${_actionBtn({ action: 'oracle-note', label: 'Save Text Note', hint: 'Pin this prompt to your notes', kind: 'primary' })}
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
      <div class="campaign-rail-currency" title="Gold and Jester Points">
        <span>G ${currency.gold}</span>
        <span class="campaign-rail-jp" title="Jester Points">JP ${currency.jp}</span>
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
        const closesPanel = [
          'open-inventory-tab', 'open-roster-tab', 'open-scenarios-tab', 'open-maps-tab',
          'open-quests-tab', 'open-shops-tab', 'open-sideforge-tab', 'open-story-home',
          'open-quest-home', 'open-event-home', 'open-farm-tab', 'open-event-stories-tab',
          'open-event-battles-tab'
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
            <h2>Run Setup</h2>
            <span class="campaign-pill">Save-local</span>
          </div>
          <div class="campaign-generator-controls">
            <label>Source
              <select id="campaign-gen-source">
                <option value="random">Random</option>
                <option value="active_quest">Active Quest</option>
                <option value="quest_chain">Side Story</option>
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
              ${_scenarioQuestPill(scenario, state)}
            </div>
            ${_renderShapePills(scenario)}
            <div class="campaign-muted">${_esc(scenario.notes || '')}</div>
            <div class="campaign-action-grid">
              ${_renderScenarioRunActions(scenario, state)}
              ${scenario.generated ? `<button class="campaign-action danger" data-campaign-action="discard-scenario" data-id="${_escAttr(scenario.id)}" ${state.activeScenarioRun?.scenarioId === scenario.id ? 'disabled' : ''}>Discard</button>` : ''}
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No runs available.</div>'}
        </div>
      </div>
    `;
  }

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
          <div class="campaign-panel-head"><h2>Current Run</h2></div>
          <div class="campaign-empty">No run active. Start one from Run Setup.</div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="open-scenarios-tab">Run Setup</button>
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
    const questPill = _runQuestPill(state, run, scenario);
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || 'Run')}</h2>
          <span class="campaign-pill">Freeform</span>
          ${questPill}
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
          ${_controlGroup('Roll Random', `
            ${_actionBtn({ action: 'run-roll-battle',     label: 'Random Battle',    hint: 'Roll from this scenario’s battle pool', kind: 'primary' })}
            ${_actionBtn({ action: 'run-roll-event',      label: 'Random Event',     hint: 'Roll a scenario event with consequences' })}
            ${_actionBtn({ action: 'roll-travel-surprise', label: 'Movement Surprise', hint: 'Random encounter from movement (loot, danger, NPC)' })}
          `, 'Random output appears below the panel as a card you accept, edit, or ignore.')}
          ${_controlGroup('Pick / Manual', `
            ${_actionBtn({ action: 'run-pick-battle',  label: 'Pick Battle',  hint: 'Pick a specific battle from the catalog' })}
            ${_actionBtn({ action: 'camp-rest',         label: 'Camp Rest',     hint: 'Spend a camp slot to heal and recover' })}
            ${_actionBtn({ action: 'run-tick-danger',  label: 'Tick Danger +1', hint: 'Manually raise danger (GM control)' })}
            ${_actionBtn({ action: 'end-scenario',      label: 'End Run',       hint: 'Finish run and write a report', kind: 'danger' })}
          `, 'Direct controls. End Run writes a report; Cancel (in summary) discards without one.')}
        </div>
        <div class="campaign-action-grid" hidden>
          <button class="campaign-action primary" data-campaign-action="run-roll-battle">🎲 Random Battle</button>
          <button class="campaign-action" data-campaign-action="run-pick-battle">📋 Pick Battle</button>
          <button class="campaign-action" data-campaign-action="run-roll-event">🎴 Roll Event</button>
          <button class="campaign-action" data-campaign-action="roll-travel-surprise">Travel Surprise</button>
          <button class="campaign-action" data-campaign-action="camp-rest">🏕 Camp</button>
          <button class="campaign-action" data-campaign-action="run-tick-danger">⚠ Tick Danger +1</button>
          <button class="campaign-action danger" data-campaign-action="end-scenario">End Run</button>
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
    const questPill = _runQuestPill(state, run, scenario);
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || 'Run')}</h2>
          <span class="campaign-pill">Linear · Beat ${Math.min(idx + 1, beats.length)}/${beats.length}</span>
          ${questPill}
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
          ${_controlGroup('Run Flow', `
            <button class="campaign-action primary" data-campaign-action="run-next-beat" ${done ? 'disabled' : ''}>${done ? 'All Beats Done' : 'Next Beat'}</button>
            <button class="campaign-action" data-campaign-action="roll-travel-surprise">Movement Surprise</button>
            <button class="campaign-action" data-campaign-action="run-roll-event">Random Event</button>
          `)}
          ${_controlGroup('Manual Control', `
            <button class="campaign-action" data-campaign-action="run-pick-battle">Pick Battle</button>
            <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
            <button class="campaign-action danger" data-campaign-action="end-scenario">End Run</button>
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
        ${activeChains.length || availableChains.length ? `
          <section class="campaign-subpanel">
            <div class="campaign-panel-head">
              <h3>Event Side Stories</h3>
              <span class="campaign-pill">${activeChains.length} active | ${availableChains.length} available</span>
            </div>
            <div class="campaign-muted">Side-story chains now live in Event so Normal Quest can stay focused on farming and repeatable runs.</div>
            <div class="campaign-action-grid">
              <button class="campaign-action" data-campaign-action="open-event-stories-tab">Open Side Stories</button>
              <button class="campaign-action" data-campaign-action="open-event-home">Event Home</button>
            </div>
          </section>
        ` : ''}
        ${finished.length ? `
          <details class="campaign-resolved-quests">
            <summary>Resolved (${finished.length})</summary>
            <div class="campaign-quest-list">${finished.map((quest) => _renderQuestRow(quest, { resolved: true })).join('')}</div>
          </details>
        ` : ''}
        ${finishedChains.length ? `
          <details class="campaign-resolved-quests">
            <summary>Resolved Side Stories (${finishedChains.length})</summary>
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
    const scenarioPill = _questScenarioPill(quest, activeRun, activeScenario);
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
              ${_actionBtn({ action: 'quest-event',   label: 'Event',    hint: 'Roll an event tagged for this quest', data: { id: quest.id } })}
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
        const firstTab = (APP_MODE_TABS[id] || [])[0];
        if (firstTab) _activeTab = firstTab[0];
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
      case 'import-side-pack': return _importSidePack();
      case 'export-side-pack': return _exportSidePack();
      case 'oracle-note': return _saveOracleNote();
      case 'apply-event': return _applyEvent();
      case 'edit-event': return _editEvent();
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
      case 'open-quest-home': return _goto('quest', 'questHome');
      case 'open-event-home': return _goto('event', 'eventHome');
      case 'open-roster-tab': return _goto(null, 'roster');
      case 'open-scenarios-tab': return _goto(null, 'scenarios');
      case 'open-maps-tab': return _goto(null, 'maps');
      case 'open-inventory-tab': return _goto('quest', 'inventory');
      case 'open-farm-tab': return _goto('quest', 'farm');
      case 'open-quests-tab': return _goto('quest', 'quests');
      case 'open-shops-tab': return _goto(null, 'shops');
      case 'open-sideforge-tab': return _goto('event', 'sideForge');
      case 'open-event-stories-tab': return _goto('event', 'questChains');
      case 'open-event-battles-tab': return _goto('event', 'battleSets');
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
      case 'generate-material-run': return _generateScenario({ source: 'random', mapType: 'forest', size: 'small', mapForm: 'node_map' });
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
      case 'craft-recipe': return _craftRecipe(data.recipeId);
      case 'cook-food': {
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
      case 'grant-xp': return _grantXpModal(data.id);
      case 'grant-job-xp': return _grantJobXpModal(data.id);
      case 'change-job': return _changeJobModal(data.id);
      case 'show-job-tree': return _showJobTreeModal(data.id);
      case 'grant-skill-ap': return _grantSkillApModal(data.id, data.skillId);
      case 'level-up-skill': return _levelUpSkillConfirm(data.id, data.skillId);
      case 'rank-up-passive': return _rankUpPassiveConfirm(data.id, data.passiveId);
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
    _openManualEventBuilder();
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

  function _openManualEventBuilder() {
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
              <option value="manual">Manual</option>
              <option value="oracle">Oracle</option>
              <option value="rumor">Rumor</option>
              <option value="keywords">Keywords</option>
              <option value="ai_draft">AI Draft</option>
            </select>
          </label>
          <label class="form-label">Open Rumor
            <select id="manual-rumor">
              <option value="">No rumor selected</option>
              ${rumorOptions.map((rumor) => `<option value="${_escAttr(rumor.value)}">${_esc(rumor.label)}</option>`).join('')}
            </select>
          </label>
        </div>
        <textarea id="manual-seed" placeholder="Seed, oracle line, rumor, or outside AI draft."></textarea>
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
          <label class="form-label">Title<input id="manual-title" type="text" placeholder="Event title"></label>
          <label class="form-label">Scope
            <select id="manual-scope">
              <option value="event">Event / table beat</option>
              <option value="quest">Quest support</option>
              <option value="main_story">Main story</option>
              <option value="hub">Hub / town</option>
            </select>
          </label>
        </div>
        <label class="form-label">Very Short Event Summary
          <textarea id="manual-short" placeholder="One sentence: what happened at the table?"></textarea>
        </label>
        <label class="form-label">Scene / Conversation / Hook
          <textarea id="manual-scene" placeholder="Dialogue, hook, clue, obstacle, or GM note."></textarea>
        </label>
        <label class="form-label">Main Story Summary (separate)
          <textarea id="manual-main" placeholder="Only the main-plot meaning, if any. Leave blank for side or farming events."></textarea>
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
          <textarea id="manual-character-note" placeholder="What changed with this character, NPC, rival, or party member?"></textarea>
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
    lines.push('Main story summary:', draft.mainStory || '(none)', '');
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

  function _manualEventTags(draft = {}) {
    return ['manual_event', draft.scope || 'event', draft.source || 'manual']
      .concat(draft.selectedRumor ? ['rumor'] : [])
      .filter(Boolean);
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
      mapForm: quest.mapForm || 'node_map',
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
    _textareaModal({
      title: 'Write Scene',
      label: 'Write the scene you want the campaign to remember',
      placeholder: 'Example: Bin lets the official explain the rule, then signs the wrong form on purpose. Corvin suffers professionally.',
      primaryLabel: 'Hold Scene',
      width: '620px',
      onSubmit: (raw) => {
        const text = raw.trim();
        if (!text) {
          UI().toast('Story scene is empty', 'info');
          return false;
        }
        const title = text.split(/\n+/)[0].slice(0, 78) || 'Manual Story Note';
        const beat = {
          id: `story_manual_${Date.now()}`,
          type: 'story_manual',
          kind: 'manual',
          title,
          prompt: text,
          stageId: stage.id || '',
          stageName: stage.name || '',
          canonRisk: 'green',
          tags: ['manual', 'table_control'],
          suggestedChoices: [
            {
              label: 'Accept as table note',
              ops: [{ op: 'log', text: `Story note: ${text}` }]
            }
          ]
        };
        Ops().apply({ op: 'story_beat_save', beat, status: 'manual' }, { source: 'story_director_manual' });
        render();
        UI().toast('Manual story scene held', 'success');
      }
    });
  }

  function _copyStoryPrompt() {
    const text = _storyPromptText();
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => UI().toast('Story prompt copied', 'success'))
        .catch(() => _openCopyTextModal('Story Prompt', text));
      return;
    }
    _openCopyTextModal('Story Prompt', text);
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
    return [
      'CJS Story Mode GM Prompt',
      '',
      `Tone: ${(pack.tonePillars || []).join(', ') || 'light, human, funny, hopeful, slightly snarky'}`,
      `Campaign: ${pack.name || 'Campaign story'}`,
      `Current stage: ${stage.name || stage.id || 'No stage'} - ${stage.summary || ''}`,
      `Party: ${party}`,
      `Chapter/phase: chapter ${state.currentChapter || 1}, phase ${state.phase?.number || 1} (${state.phase?.type || 'unknown'})`,
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
      'Suggest the next playable scene for solo or GM-led tabletop play. Keep it clear, practical, funny when appropriate, and avoid locking protected canon unless explicitly chosen.'
    ].join('\n');
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

  function _copyEventSummary() {
    const event = CS().getState().lastEvent;
    const text = event?.manualSummary?.full || [
      event?.title || 'Event',
      event?.prompt || '',
      event?.gmHook ? `GM hook: ${event.gmHook}` : ''
    ].filter(Boolean).join('\n\n');
    _copyPlainText('Event Summary', text, 'Event summary copied');
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
        tag: 'materials',
        mapType: 'forest'
      },
      {
        label: 'NPC request',
        summary: 'A nearby NPC asks for a small extra favor while the party is already out.',
        objective: 'Answer the extra request',
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
    next.objectives = [
      ...(template.objectives || []),
      { id: `variant_${_safe(variant.label)}`, label: variant.objective, current: 0, required: 1 }
    ];
    if (!template.mapType || template.mapType === 'any') next.mapType = variant.mapType;
    return next;
  }

  function _openQuestModal() {
    const templates = Object.values(CS().getContent().campaignQuests).flatMap((record) => record.templates || []);
    const body = document.createElement('div');
    body.className = 'campaign-quest-builder';
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
        <label class="form-label">Giver <small class="campaign-muted">— optional NPC name</small>
          <input id="campaign-quest-giver" type="text" placeholder="e.g. Captain Reed">
        </label>
        <label class="form-label">Tags <small class="campaign-muted">— comma separated</small>
          <input id="campaign-quest-tags" type="text" placeholder="e.g. forest, escort">
        </label>
      </div>
      <label class="form-label">Objectives <small class="campaign-muted">— one per line, "label x required" (e.g. "Find clue x 3")</small></label>
      <textarea id="campaign-quest-objectives" placeholder="Reach the ruins x 1
Recover the relic x 1"></textarea>
      <label class="form-label">Map type <small class="campaign-muted">— used if you start the run</small></label>
      <select id="campaign-quest-map-type">
        ${(Gen()?.options?.().mapTypes || ['any', 'urban', 'outdoor', 'forest', 'dungeon', 'cave', 'ruins', 'temple']).map((type) => `<option value="${type}">${_esc(_label(type))}</option>`).join('')}
      </select>
      <div class="campaign-preview" id="campaign-quest-preview" hidden></div>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = `
      <button class="btn" id="campaign-add-quest-back">Cancel</button>
      <button class="btn" id="campaign-add-quest-commit">Add Quest</button>
      <button class="btn btn-primary" id="campaign-add-quest-start">Add &amp; Start Run</button>
    `;
    const overlay = UI().openModal({ title: 'Add Quest', content: body, footer, width: '600px' });

    const $ = (sel) => body.querySelector(sel);
    const previewBox = $('#campaign-quest-preview');
    let currentTemplateVariant = null;

    function applyTemplate(template) {
      currentTemplateVariant = template?.randomVariant ? template : null;
      $('#campaign-quest-title').value = template?.title || '';
      $('#campaign-quest-summary').value = template?.summary || '';
      $('#campaign-quest-giver').value = template?.giver || '';
      $('#campaign-quest-tags').value = (template?.tags || []).join(', ');
      const objs = template?.objectives || [];
      $('#campaign-quest-objectives').value = objs.length
        ? objs.map((obj) => `${obj.label || obj.id || 'Objective'} x ${Math.max(1, Number(obj.required || 1))}`).join('\n')
        : '';
      const mapType = template?.mapType || _questMapType(template || {});
      const sel = $('#campaign-quest-map-type');
      if (sel && Array.from(sel.options).some((opt) => opt.value === mapType)) sel.value = mapType;
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
      const objectiveLines = $('#campaign-quest-objectives').value.split('\n').map((s) => s.trim()).filter(Boolean);
      const objectives = objectiveLines.map((line, idx) => {
        const match = line.match(/^(.*?)(?:\s*[x×]\s*(\d+))?$/i);
        const label = (match?.[1] || line).trim();
        const required = Math.max(1, Number(match?.[2] || 1));
        return { id: `obj_${idx + 1}`, label: label || `Objective ${idx + 1}`, current: 0, required };
      });
      const base = template ? CS().clone(template) : {
        id: `quest_${Date.now()}`,
        title: title || 'New Quest',
        status: 'active',
        summary,
        objectives: objectives.length ? objectives : [{ id: 'obj_1', label: 'Objective', current: 0, required: 1 }],
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
      if (objectives.length) base.objectives = objectives;
      const mapType = $('#campaign-quest-map-type').value;
      if (mapType) base.mapType = mapType;
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
    body.querySelectorAll('input, textarea, select').forEach((el) => {
      if (el.id !== 'campaign-quest-template') el.addEventListener('input', refreshPreview);
    });
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
      _startQuestScenario(quest.id, { quest, mapType: quest.mapType });
    };

    refreshPreview();
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
          `).join('') || '<div class="campaign-empty">Freeform run. Use manual controls, random events, and battle picks.</div>'}
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
    return `${_icon(job, { kind: 'job', size: 'xs' })} ${_esc(job.name || jobId)} Lv ${level}/${cap} | XP ${xp} ${meta}`;
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

  function _formatBundleText(bundle) {
    const parts = [];
    for (const [id, qty] of Object.entries(bundle?.currencies || {})) parts.push(`${qty} ${_currencyLabel(id)}`);
    for (const [id, qty] of Object.entries(bundle?.items || {})) parts.push(`${qty} ${_recordName('items', id)}`);
    for (const [id, qty] of Object.entries(bundle?.materials || {})) parts.push(`${qty} ${_recordName('materials', id)}`);
    for (const [id, qty] of Object.entries(bundle?.food || {})) parts.push(`${qty} ${_recordName('food', id)}`);
    for (const [id, qty] of Object.entries(bundle?.questItems || {})) parts.push(`${qty} ${_recordName('questItems', id)}`);
    return parts.join(', ');
  }

  function _label(value) {
    return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function _safe(value) {
    return String(value || 'campaign').toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
  }

  function _truncate(value, max = 60) {
    const text = String(value || '').trim();
    return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
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
