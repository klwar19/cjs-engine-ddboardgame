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

  let _root = null;
  let _activeMode = 'town';
  let _activeTab = 'overview';
  let _booted = false;
  let _combatResultUnsub = null;

  const MODES = [
    ['town', 'Town', '🏠'],
    ['workshop', 'Workshop', '🛠'],
    ['scenario', 'Scenario', '⚔']
  ];

  const MODE_TABS = {
    town: [
      ['overview', 'Overview'],
      ['oracleForge', 'Events & Oracle'],
      ['sideForge', 'Hub Pulse'],
      ['shops', 'Shops & Rest'],
      ['questChains', 'Quest Chains']
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
      _consumeCombatResult();
      _bindEvents();
      _bindCombatResultListener();
      CS().subscribe(() => {
        Save().saveCurrent();
        render();
      });
      _booted = true;
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
      <div class="campaign-shell">
        ${_renderHeader(state, campaign)}
        ${_renderModeBar(state)}
        ${_renderSubTabs(subTabs, isUtility)}
        <div class="campaign-body">
          <aside class="campaign-party">${_renderParty(state)}</aside>
          <main class="campaign-main">${_renderMain(state)}</main>
          <aside class="campaign-side">${_renderSide(state)}</aside>
        </div>
        <button class="campaign-gm" data-campaign-action="gm-override">GM Override</button>
        <input type="file" id="campaign-import-file" accept=".json" hidden>
      </div>
    `;

    const mapRegion = _root.querySelector('#campaign-map-region');
    if (mapRegion) window.CJS.CampaignMap.render(mapRegion);
    _bindRunPanel();
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
      _storeCombatResult(result);
      Bridge().consumeResult();
    });
  }

  function _storeCombatResult(result) {
    if (!result) return;
    const state = CS().getState();
    if (result.saveId && state?.saveId && result.saveId !== state.saveId) return;
    _activeMode = 'scenario';
    _activeTab = 'maps';
    CS().mutate((next) => { next.pendingBattleResult = result; }, { source: 'combat_bridge' });
    UI()?.toast?.('Combat result returned. Apply it to update campaign state.', 'success');
  }

  function _renderHeader(state, campaign) {
    const world = CS().getCurrentWorld();
    const currencies = Object.entries(state.currencies || {});
    return `
      <header class="campaign-header">
        <a class="campaign-back" href="index.html">Main Menu</a>
        <div class="campaign-title">
          <h1>${_esc(campaign?.name || 'Campaign')}</h1>
          <span>${_esc(world?.displayName || state.currentWorld)} | Chapter ${state.currentChapter} | Phase ${state.phase.number}: ${_esc(state.phase.name || state.phase.type)}</span>
        </div>
        <div class="campaign-stats">
          ${currencies.length ? currencies.map(([id, amount]) => `<span>${_esc(_currencyLabel(id))} <b>${amount || 0}</b></span>`).join('') : '<span>No currency <b>0</b></span>'}
        </div>
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
    return `
      <div class="campaign-panel-head"><h2>Party</h2></div>
      ${Object.entries(state.party || {}).map(([id, member]) => _renderPartyCard(id, member)).join('') || '<div class="campaign-empty">No party members.</div>'}
    `;
  }

  function _renderPartyCard(id, member) {
    const hpPct = Math.round(((member.currentHp || 0) / (member.maxHp || 1)) * 100);
    const mpPct = Math.round(((member.currentMp || 0) / (member.maxMp || 1)) * 100);
    const statuses = (member.statuses || []).map((status) => `<span class="campaign-chip">${_esc(status.label || status.id)}</span>`).join('');
    const battleReady = Bridge()?.isMemberBattleReady ? Bridge().isMemberBattleReady(member) : true;
    const availability = battleReady ? 'Ready' : (Bridge()?.availabilityLabel?.(member) || 'Unavailable');
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
          <button data-campaign-action="party-availability" data-id="${_escAttr(id)}">Availability</button>
          ${battleReady ? '' : `<button data-campaign-action="party-available" data-id="${_escAttr(id)}">Return</button>`}
        </div>
      </section>
    `;
  }

  function _renderMain(state) {
    switch (_activeTab) {
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
          <div class="campaign-panel-head"><h2>Control Desk</h2></div>
          <div class="campaign-control-stack">
            ${_controlGroup('Solo / Random', `
              <button class="campaign-action primary" data-campaign-action="solo-surprise">Solo Offer</button>
              <button class="campaign-action" data-campaign-action="random-quest-offer">Random Quest</button>
              <button class="campaign-action" data-campaign-action="random-rumor-offer">Random Rumor</button>
              <button class="campaign-action" data-campaign-action="roll-event">Random Event</button>
              <button class="campaign-action" data-campaign-action="roll-oracle">Random GM Prompt</button>
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
            <button class="campaign-action" data-campaign-action="solo-surprise">Solo Surprise</button>
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
            <button class="campaign-action" data-campaign-action="random-quest-offer">Random Quest</button>
            <button class="campaign-action" data-campaign-action="random-rumor-offer">Random Rumor</button>
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
    return `
      <div class="campaign-tab-grid">
        <section class="campaign-panel campaign-wide-panel">
          <div class="campaign-panel-head">
            <h2>Active Quest Chains</h2>
            <span class="campaign-pill">${active.length} active · ${available.length} available</span>
          </div>
          ${active.length ? active.map((chain) => _renderQuestChainActive(chain)).join('') : '<div class="campaign-empty">No active side chains. Pick one below to begin.</div>'}
        </section>
        ${available.length ? available.map((chain) => _renderQuestChainTemplate(chain)).join('') : '<section class="campaign-panel campaign-wide-panel"><div class="campaign-empty">No quest chain templates available for this world. Add some in the editor or import a side content pack.</div></section>'}
      </div>
    `;
  }

  function _renderQuestChainActive(chain) {
    const template = chain.template || {};
    const step = (template.steps || []).find((entry) => entry.id === chain.currentStepId);
    return `
      <div class="campaign-row">
        <div>
          <strong>${_esc(chain.title || template.title || chain.templateId)}</strong>
          <div class="campaign-muted">${_esc(chain.status)} | Current: ${_esc(step?.label || chain.currentStepId || '-')}</div>
          <div class="campaign-muted">${_esc(step?.text || '')}</div>
        </div>
        <div class="campaign-row-actions">
          <button class="campaign-action" data-campaign-action="advance-chain" data-id="${_escAttr(chain.templateId)}">Advance</button>
          <button class="campaign-action" data-campaign-action="complete-chain" data-id="${_escAttr(chain.templateId)}">Complete</button>
          <button class="campaign-action danger" data-campaign-action="fail-chain" data-id="${_escAttr(chain.templateId)}">Fail</button>
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
        ${(chain.steps || []).map((step) => `<div class="campaign-step"><b>${_esc(step.label || step.id)}</b><span>${_esc(step.text || '')}</span></div>`).join('')}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="start-chain" data-id="${_escAttr(chain.id)}">Start</button>
          <button class="campaign-action" data-campaign-action="save-chain" data-id="${_escAttr(chain.id)}">Save Idea</button>
          <button class="campaign-action" data-campaign-action="promote-chain" data-id="${_escAttr(chain.id)}">Quest Tracker</button>
        </div>
      </section>
    `;
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
            <h2>Solo Offer</h2>
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
        <div class="campaign-control-stack">
          ${_controlGroup('Solo / Random', `
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
          <button class="campaign-action" data-campaign-action="skip-victory">Skip Victory</button>
          <button class="campaign-action" data-campaign-action="skip-defeat">Skip Defeat</button>
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
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="apply-combat-result">Apply to Campaign</button>
          <button class="campaign-action danger" data-campaign-action="ignore-combat-result">Ignore</button>
        </div>
      </section>
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
        ${(state.log || []).slice(0, 10).map((line) => `<div class="campaign-log-line"><span>${_esc(line.text)}</span><small>Phase ${line.phase}</small></div>`).join('') || '<div class="campaign-empty">No log entries.</div>'}
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

  function _renderInventorySnapshot(state) {
    const buckets = [
      ['items', 'Items'],
      ['materials', 'Materials'],
      ['food', 'Food'],
      ['questItems', 'Quest Items']
    ];
    const rows = buckets.flatMap(([bucket, label]) => Object.entries(state.inventory?.[bucket] || {})
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ bucket, label, id, qty })));
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Inventory</h2><button class="campaign-icon-btn" data-campaign-action="open-inventory-tab">Open</button></div>
        ${rows.length ? rows.slice(0, 8).map((row) => `
          <div class="campaign-log-line">
            <span>${_esc(_recordName(row.bucket, row.id))}</span>
            <small>${_esc(row.label)} x${row.qty}</small>
          </div>
        `).join('') : '<div class="campaign-empty">No inventory yet.</div>'}
      </section>
    `;
  }

  function _renderPartyChatCard(state) {
    const chat = state.lastPartyChat;
    return `
      <section class="campaign-side-section">
        <div class="campaign-panel-head"><h2>Party Banter</h2><button class="campaign-icon-btn" data-campaign-action="roll-party-chat">Roll</button></div>
        ${chat ? `
          <div class="campaign-chat-line">
            <strong>${_esc(chat.speakerName || chat.speaker || 'Party')}</strong>
            <span>${_esc(chat.line || '')}</span>
            ${chat.reply ? `<small>${_esc(chat.reply)}</small>` : ''}
          </div>
        ` : '<div class="campaign-empty">No banter rolled yet.</div>'}
      </section>
    `;
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
                <option value="quest_chain">Quest Chain</option>
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
    const active = quests.filter((q) => !['complete', 'completed', 'failed'].includes(String(q.status || 'active')));
    const finished = quests.filter((q) => ['complete', 'completed', 'failed'].includes(String(q.status || 'active')));
    const templateCount = Object.values(CS().getContent().campaignQuests || {})
      .reduce((sum, record) => sum + (record.templates?.length || 0), 0);
    const renderRow = (quest) => `
      <div class="campaign-row">
        <div>
          <strong>${_esc(quest.title || quest.id)}</strong>
          <div class="campaign-muted">${_esc(quest.status || 'active')}${quest.giver ? ' · ' + _esc(quest.giver) : ''}${quest.timer?.phasesRemaining ? ' · ' + quest.timer.phasesRemaining + ' phases left' : ''}</div>
          ${quest.summary ? `<div class="campaign-muted">${_esc(quest.summary)}</div>` : ''}
          ${(quest.objectives || []).map((obj) => `<div class="campaign-muted">• ${_esc(obj.label || obj.id)} ${obj.current || 0}/${obj.required || 1}</div>`).join('')}
        </div>
        <div class="campaign-row-actions">
          <button class="campaign-action" data-campaign-action="quest-progress" data-id="${_escAttr(quest.id)}">Progress</button>
          <button class="campaign-action" data-campaign-action="quest-complete" data-id="${_escAttr(quest.id)}">Complete</button>
          <button class="campaign-action danger" data-campaign-action="quest-fail" data-id="${_escAttr(quest.id)}">Fail</button>
        </div>
      </div>
    `;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>Quest Tracker</h2>
          <span class="campaign-pill">${active.length} active · ${finished.length} resolved · ${templateCount} templates</span>
          <button class="campaign-action primary" data-campaign-action="add-quest">Add Quest</button>
          <button class="campaign-action" data-campaign-action="random-quest-offer">Random Quest</button>
        </div>
        ${_renderSoloNotice(state)}
        ${active.length ? active.map(renderRow).join('') : '<div class="campaign-empty">No active quests. Use Add Quest to start one from a template or write your own.</div>'}
        ${finished.length ? `<div class="campaign-panel-head" style="margin-top:14px"><h3>Resolved</h3></div>${finished.map(renderRow).join('')}` : ''}
      </section>
    `;
  }

  function _renderLogPanel(state) {
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head"><h2>Session Log</h2><button class="campaign-action" data-campaign-action="export-log">Export Log</button></div>
        ${(state.log || []).map((line) => `<div class="campaign-log-line"><span>${_esc(line.text)}</span><small>${_esc(line.at || '')}</small></div>`).join('') || '<div class="campaign-empty">No log entries.</div>'}
      </section>
    `;
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
      case 'start-chain': return window.CJS.CampaignQuestChains.start(data.id);
      case 'advance-chain': return window.CJS.CampaignQuestChains.advance(data.id);
      case 'complete-chain': return window.CJS.CampaignQuestChains.complete(data.id);
      case 'fail-chain': return window.CJS.CampaignQuestChains.fail(data.id);
      case 'save-chain': return window.CJS.CampaignQuestChains.saveAsIdea(data.id);
      case 'promote-chain': return window.CJS.CampaignQuestChains.promoteToQuest(data.id);
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
      case 'open-scenarios-tab': return _goto('scenario', 'scenarios');
      case 'open-maps-tab': return _goto('scenario', 'maps');
      case 'open-inventory-tab': return _goto('workshop', 'inventory');
      case 'roll-party-chat': return _rollPartyChat();
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
      case 'quest-complete': return Ops().apply({ op: 'complete_quest', questId: data.id }, { source: 'ui' });
      case 'quest-fail': return Ops().apply({ op: 'fail_quest', questId: data.id }, { source: 'ui' });
      case 'damage-char': return _charNumberOp(data.id, 'damage_character', 'Damage amount');
      case 'heal-char': return _charNumberOp(data.id, 'heal_character', 'Heal amount');
      case 'mp-char': return _charMpModal(data.id);
      case 'status-char': return _charStatusModal(data.id);
      case 'party-availability': return _partyAvailabilityModal(data.id);
      case 'party-available': return Ops().apply({ op: 'clear_party_availability', target: data.id }, { source: 'ui' });
      case 'gm-override': return _gmOverride();
      case 'load-slot': Save().loadSlot(data.id); return render();
      case 'delete-slot': Save().deleteSlot(data.id); return render();
      case 'export-log': return _exportLog();
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
    UI().toast('Solo offer ready', 'success');
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
    const card = _randomQuestOfferCard();
    if (!card) return UI().toast('No quest templates available', 'info');
    Side().saveCard(card, { status: 'idea', source: 'solo_quest_offer' });
    _setPendingSoloHook(card, 'quest_offer');
    _activeMode = 'town';
    _activeTab = 'quests';
    render();
  }

  function _randomQuestOfferCard() {
    const activeQuestIds = new Set(Object.keys(CS().getState()?.quests || {}));
    const templates = Object.values(CS().getContent().campaignQuests || {})
      .flatMap((record) => record.templates || [])
      .filter((quest) => !activeQuestIds.has(quest.id));
    const chains = window.CJS.CampaignQuestChains?.getAvailable?.() || [];
    const options = [
      ...templates.map((quest) => ({ type: 'quest_template', quest })),
      ...chains.map((chain) => ({ type: 'quest_chain', chain }))
    ];
    if (!options.length) return null;
    const pick = options[Math.floor(Math.random() * options.length)];
    if (pick.type === 'quest_chain') {
      const chain = pick.chain;
      return {
        id: `idea_offer_${chain.id}_${Date.now()}`,
        type: 'quest_offer',
        title: chain.title || chain.name || chain.id,
        summary: chain.summary || '',
        canonRisk: chain.canonRisk || 'green',
        tags: chain.tags || [],
        questChainTemplateId: chain.id,
        suggestedChoices: [{
          label: 'Start this quest chain',
          ops: [{ op: 'start_quest_chain', templateId: chain.id }]
        }]
      };
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
        label: 'Add this quest',
        ops: [{ op: 'add_quest', quest }]
      }]
    };
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
      const choice = card.suggestedChoices?.[0];
      if (choice?.ops?.length) {
        Ops().apply(choice.ops, { source: 'solo_hook_accept' });
        Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'hub_event', approved: true }, { source: 'solo_hook' });
      } else {
        _soloHookToQuest(true);
        return;
      }
      _clearPendingSoloHook();
      UI().toast('Solo offer accepted', 'success');
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
    const quest = card.questTemplate ? CS().clone(card.questTemplate) : {
      id: `quest_${card.id}`,
      title: card.title || card.name || 'Solo Quest',
      status: 'active',
      summary: card.summary || card.prompt || '',
      objectives: [{ id: 'follow_hook', label: 'Follow this hook', current: 0, required: 1 }],
      rewards: card.rewardOps || []
    };
    Ops().apply({ op: 'add_quest', quest }, { source: 'solo_hook_quest' });
    Ops().apply({ op: 'side_idea_promote', contentId: card.id, targetType: 'accepted_hook', approved: true }, { source: 'solo_hook' });
    _clearPendingSoloHook();
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
    if (card) Side().rejectCard(card.id, 'Ignored from solo offer.');
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
    footer.innerHTML = '<button class="btn btn-primary" id="campaign-add-quest-commit">Add Quest</button>';
    const overlay = UI().openModal({ title: 'Add Quest', content: body, footer, width: '520px' });
    footer.querySelector('button').onclick = () => {
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
        no_active_chain: 'No active quest chain. Start one in the Quest Chains tab first.'
      };
      const msg = messages[result?.error] || 'Scenario generation skipped';
      return UI().toast(msg, 'info');
    }
    _activeMode = 'scenario';
    _activeTab = 'maps';
    render();
    UI().toast(`Started ${result.scenario.name}`, 'success');
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
    Bridge().openBattle(battle);
    Save().saveCurrent();
    UI().toast('Battle opened. Combat will return here when it ends.', 'info');
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
      <select id="campaign-manual-result"><option value="victory">Victory</option><option value="defeat">Defeat</option><option value="draw">Draw</option></select>
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

  function _questProgress(questId) {
    const quest = CS().getState().quests[questId];
    const objective = quest?.objectives?.[0];
    if (!objective) return;
    Ops().apply({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount: 1 }, { source: 'ui' });
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
    const text = (state.log || []).map((line) => `[${line.at}] Phase ${line.phase} ${line.world}: ${line.text}`).join('\n');
    window.CJS.SaveManager.downloadTextFile(`${_safe(state.slotName)}-log.txt`, `${text}\n`, 'text/plain');
  }

  function _consumeCombatResult() {
    const result = Bridge().consumeResult();
    if (!result) return;
    _storeCombatResult(result);
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
        .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry._world || '' }))
        .sort(sortLabel);
    }
    if (bucket === 'food') {
      return DS().getAllAsArray('food').filter(inWorld)
        .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry._world || '' }))
        .sort(sortLabel);
    }
    return DS().getAllAsArray('items').filter(inWorld)
      .map((entry) => ({ value: entry.id, label: entry.name || entry.id, sub: entry.type || entry._world || '' }))
      .sort(sortLabel);
  }

  function _statusOptions() {
    const opts = DS().getAllAsArray('statuses').map((entry) => ({
      value: entry.id,
      label: entry.name || entry.id,
      sub: entry.kind || ''
    }));
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

  function _opPickerModal({ title, options, primaryLabel = 'Apply', placeholder, withQty, qtyLabel = 'Qty', qtyMin = 1, qtyMax = 99, qtyDefault = 1, withDuration, onSubmit }) {
    const body = document.createElement('div');
    body.appendChild(_formLabel('Select'));
    const select = UI().createSearchableSelect({ options, placeholder: placeholder || 'Search…' });
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
