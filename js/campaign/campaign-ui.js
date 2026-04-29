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

  let _root = null;
  let _activeTab = 'overview';
  let _booted = false;

  const TABS = [
    ['overview', 'Overview'],
    ['sideForge', 'Side Forge'],
    ['questChains', 'Quest Chains'],
    ['battleSets', 'Battle Sets'],
    ['mapSeeds', 'Map Seeds'],
    ['oracleForge', 'Oracle'],
    ['inventory', 'Inventory'],
    ['shops', 'Shops'],
    ['craft', 'Forge'],
    ['cook', 'Cook'],
    ['farm', 'Farm'],
    ['pocket', 'Pocket Haven'],
    ['scenarios', 'Scenarios'],
    ['maps', 'Maps'],
    ['quests', 'Quests'],
    ['logs', 'Logs'],
    ['settings', 'Settings']
  ];

  async function init(root) {
    _root = root;
    _root.innerHTML = '<div class="campaign-loading">Loading Campaign Mode...</div>';

    try {
      await CM().loadDefaultData();
      CS().loadContentFromDataStore();
      if (!Save().loadActive()) {
        CS().createNewSave(Object.values(CS().getContent().campaigns)[0]?.id);
        Save().saveCurrent();
      }
      _consumeCombatResult();
      _bindEvents();
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

    _root.innerHTML = `
      <div class="campaign-shell">
        ${_renderHeader(state, campaign)}
        <div class="campaign-body">
          <aside class="campaign-party">${_renderParty(state)}</aside>
          <main class="campaign-main">${_renderMain(state)}</main>
          <aside class="campaign-side">${_renderSide(state)}</aside>
        </div>
        <nav class="campaign-tabs">${TABS.map(([id, label]) => `<button class="campaign-tab ${id === _activeTab ? 'active' : ''}" data-campaign-tab="${id}">${label}</button>`).join('')}</nav>
        <button class="campaign-gm" data-campaign-action="gm-override">GM Override</button>
        <input type="file" id="campaign-import-file" accept=".json" hidden>
      </div>
    `;

    const mapRegion = _root.querySelector('#campaign-map-region');
    if (mapRegion) window.CJS.CampaignMap.render(mapRegion);
  }

  function _renderHeader(state, campaign) {
    const world = CS().getCurrentWorld();
    const currency = `${state.currentWorld}_gold`;
    const danger = state.activeScenarioRun ? `<span>Danger <b>${state.activeScenarioRun.danger}/${state.activeScenarioRun.dangerMax}</b></span>` : '';
    return `
      <header class="campaign-header">
        <a class="campaign-back" href="index.html">Main Menu</a>
        <div class="campaign-title">
          <h1>${_esc(campaign?.name || 'Campaign')}</h1>
          <span>${_esc(world?.displayName || state.currentWorld)} | Chapter ${state.currentChapter} | Phase ${state.phase.number}: ${_esc(state.phase.name || state.phase.type)}</span>
        </div>
        <div class="campaign-stats">
          <span>${_esc(currency)} <b>${state.currencies[currency] || 0}</b></span>
          <span>JP <b>${state.currencies.jp || 0}</b></span>
          ${danger}
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
    return `
      <section class="campaign-character">
        <div class="campaign-character-head">
          <div class="campaign-avatar">${member.portrait ? `<img src="${_escAttr(member.portrait)}" alt="">` : _esc(member.icon || member.name?.[0] || '?')}</div>
          <div>
            <strong>${_esc(member.name || id)}</strong>
            <div class="campaign-muted">Lv ${member.level || 1} | Rank ${_esc(member.rank || 'F')}</div>
          </div>
        </div>
        <div class="campaign-bar"><span class="hp" style="width:${hpPct}%"></span><b>HP ${member.currentHp}/${member.maxHp}</b></div>
        <div class="campaign-bar"><span class="mp" style="width:${mpPct}%"></span><b>MP ${member.currentMp}/${member.maxMp}</b></div>
        <div class="campaign-chip-row">${statuses || '<span class="campaign-muted">No statuses</span>'}</div>
        <div class="campaign-mini-actions">
          <button data-campaign-action="damage-char" data-id="${_escAttr(id)}">Damage</button>
          <button data-campaign-action="heal-char" data-id="${_escAttr(id)}">Heal</button>
          <button data-campaign-action="mp-char" data-id="${_escAttr(id)}">MP</button>
          <button data-campaign-action="status-char" data-id="${_escAttr(id)}">Status</button>
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
      case 'maps': return '<div id="campaign-map-region"></div>';
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
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="pass-phase">Pass Phase</button>
            <button class="campaign-action" data-campaign-action="roll-event">Roll Event</button>
            <button class="campaign-action" data-campaign-action="roll-oracle">Roll GM Prompt</button>
            <button class="campaign-action" data-campaign-action="add-quest">Add Quest</button>
            <button class="campaign-action" data-campaign-action="full-rest">Full Rest</button>
            <button class="campaign-action" data-campaign-action="travel-world">Travel World</button>
          </div>
        </section>
        ${_renderScenarioSummary(state)}
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
            <button class="campaign-action" data-campaign-action="roll-forge-oracle">Oracle</button>
          </div>
        </section>
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
          <div class="campaign-panel-head"><h3>Rumors</h3></div>
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
          <div class="campaign-panel-head"><h2>Active Quest Chains</h2></div>
          ${active.length ? active.map((chain) => _renderQuestChainActive(chain)).join('') : '<div class="campaign-empty">No active side chains.</div>'}
        </section>
        ${available.map((chain) => _renderQuestChainTemplate(chain)).join('') || '<section class="campaign-panel"><div class="campaign-empty">No available chains.</div></section>'}
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
    const scenario = CS().getContent().scenarios[run.scenarioId];
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(scenario?.name || run.scenarioId)}</h2>
          <span class="campaign-pill">Danger ${run.danger}/${run.dangerMax}</span>
        </div>
        <div class="campaign-stat-grid">
          <span>Node <b>${_esc(run.currentNode || '-')}</b></span>
          <span>Camp <b>${run.usedCampRests}/${run.limits?.campRests ?? 0}</b></span>
          <span>Events <b>${run.eventsUsed}/${run.limits?.events ?? 0}</b></span>
          <span>Battles <b>${run.randomBattlesUsed}/${run.limits?.randomBattles ?? 0}</b></span>
        </div>
        <div class="campaign-action-grid">
          <button class="campaign-action" data-campaign-action="open-maps-tab">Map</button>
          <button class="campaign-action" data-campaign-action="camp-rest">Camp Rest</button>
          <button class="campaign-action" data-campaign-action="manual-battle">Manual Battle Result</button>
          <button class="campaign-action danger" data-campaign-action="end-scenario">End Scenario</button>
        </div>
      </section>
    `;
  }

  function _renderPendingBattle(state) {
    const battle = state.pendingBattle;
    if (!battle) return '';
    return `
      <section class="campaign-panel battle-ready">
        <div class="campaign-panel-head">
          <h2>Battle Ready</h2>
          <span class="campaign-pill">${_esc(battle.source || 'manual')}</span>
        </div>
        <strong>${_esc(battle.label || battle.encounterId)}</strong>
        <div class="campaign-muted">${_esc(battle.encounterId || '')}</div>
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="run-battle" ${battle.encounterId ? '' : 'disabled'}>Run in Combat App</button>
          <button class="campaign-action" data-campaign-action="manual-battle">Resolve Manually</button>
          <button class="campaign-action" data-campaign-action="skip-victory">Skip as Victory</button>
          <button class="campaign-action" data-campaign-action="skip-defeat">Skip as Defeat</button>
          <button class="campaign-action danger" data-campaign-action="cancel-battle">Cancel</button>
        </div>
      </section>
    `;
  }

  function _renderCombatResult(state) {
    const result = state.pendingBattleResult;
    if (!result) return '';
    return `
      <section class="campaign-panel battle-result">
        <div class="campaign-panel-head"><h2>Combat Result</h2><span class="campaign-pill">${_esc(result.result)}</span></div>
        <div class="campaign-muted">${_esc(result.encounterId || '')} | ${result.rounds || 0} rounds</div>
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="apply-combat-result">Apply Result</button>
          <button class="campaign-action danger" data-campaign-action="ignore-combat-result">Ignore</button>
        </div>
      </section>
    `;
  }

  function _renderEventResult(state) {
    const event = state.lastEvent;
    if (!event) return '';
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>${_esc(event.title || event.id || 'Event')}</h2>
          <span class="campaign-pill">${_esc(event.type || 'event')}</span>
        </div>
        <p>${_esc(event.prompt || '')}</p>
        ${(event.suggested || []).length ? `<div class="campaign-preview">${Ops().describe(event.suggested).map(_esc).join('<br>')}</div>` : ''}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="apply-event">Apply</button>
          <button class="campaign-action" data-campaign-action="edit-event">Edit First</button>
          <button class="campaign-action" data-campaign-action="note-event">Save Note</button>
          <button class="campaign-action danger" data-campaign-action="ignore-event">Ignore</button>
          <button class="campaign-action" data-campaign-action="roll-event">Reroll</button>
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
        <button class="campaign-action" data-campaign-action="oracle-note">Save as Note</button>
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
    const scenarios = (campaign?.scenarios || []).map((id) => CS().getContent().scenarios[id]).filter(Boolean);
    return `
      <div class="campaign-tab-grid">
        ${scenarios.map((scenario) => `
          <section class="campaign-panel">
            <div class="campaign-panel-head">
              <h3>${_esc(scenario.name || scenario.id)}</h3>
              <span class="campaign-pill">${_esc(scenario.type || 'scenario')}</span>
            </div>
            <div class="campaign-muted">${_esc(scenario.notes || '')}</div>
            <div class="campaign-action-grid">
              <button class="campaign-action primary" data-campaign-action="start-scenario" data-id="${_escAttr(scenario.id)}" ${state.activeScenarioRun ? 'disabled' : ''}>Start</button>
              <button class="campaign-action" data-campaign-action="inspect-scenario" data-id="${_escAttr(scenario.id)}">Inspect</button>
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No scenarios available.</div>'}
      </div>
    `;
  }

  function _renderQuestPanel(state) {
    const quests = Object.values(state.quests || {});
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h2>Quest Tracker</h2>
          <button class="campaign-action primary" data-campaign-action="add-quest">Add Quest</button>
        </div>
        ${quests.length ? quests.map((quest) => `
          <div class="campaign-row">
            <div>
              <strong>${_esc(quest.title || quest.id)}</strong>
              <div class="campaign-muted">${_esc(quest.status || 'active')} | ${_esc(quest.summary || '')}</div>
              ${(quest.objectives || []).map((obj) => `<div class="campaign-muted">${_esc(obj.label || obj.id)} ${obj.current || 0}/${obj.required || 1}</div>`).join('')}
            </div>
            <div class="campaign-row-actions">
              <button class="campaign-action" data-campaign-action="quest-progress" data-id="${_escAttr(quest.id)}">Progress</button>
              <button class="campaign-action" data-campaign-action="quest-complete" data-id="${_escAttr(quest.id)}">Complete</button>
              <button class="campaign-action danger" data-campaign-action="quest-fail" data-id="${_escAttr(quest.id)}">Fail</button>
            </div>
          </div>
        `).join('') : '<div class="campaign-empty">No quests yet.</div>'}
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
      const tab = event.target.closest('[data-campaign-tab]');
      if (tab) {
        _activeTab = tab.dataset.campaignTab;
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
      case 'roll-oracle': return _rollOracle();
      case 'roll-hub-pulse': return _rollHubPulse(data.table);
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
      case 'add-quest': return _openQuestModal();
      case 'full-rest': return Ops().apply({ op: 'full_rest' }, { source: 'ui' });
      case 'camp-rest': return Ops().apply({ op: 'camp_rest', consumeItem: 'haven_basic_tent', dangerChange: 1 }, { source: 'ui' });
      case 'travel-world': return _travelWorld();
      case 'open-scenarios-tab': _activeTab = 'scenarios'; return render();
      case 'open-maps-tab': _activeTab = 'maps'; return render();
      case 'start-scenario': return Runner().startScenario(data.id);
      case 'end-scenario': return Runner().endScenario('manual');
      case 'move-node': return _moveNode(data.nodeId);
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
      case 'shop-buy': return Ops().apply({ op: 'shop_buy', id: data.id, type: data.type, price: Number(data.price || 0), currency: data.currency, qty: 1 }, { source: 'ui' });
      case 'shop-sell': return Ops().apply({ op: 'shop_sell', id: data.id, bucket: data.type === 'material' ? 'materials' : 'items', price: Number(data.price || 0), currency: data.currency, qty: 1 }, { source: 'ui' });
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
      case 'gm-override': return _gmOverride();
      case 'load-slot': Save().loadSlot(data.id); return render();
      case 'delete-slot': Save().deleteSlot(data.id); return render();
      case 'export-log': return _exportLog();
      default: break;
    }
  }

  function _newSave() {
    if (!window.confirm('Create a fresh campaign save?')) return;
    const campaign = Object.values(CS().getContent().campaigns)[0];
    CS().createNewSave(campaign?.id);
    Save().saveCurrent();
  }

  function _pushGitHub() {
    Save().pushCurrentToGitHub()
      .then(() => UI().toast('Campaign save pushed to GitHub', 'success'))
      .catch((error) => UI().toast(error.message || 'GitHub save failed', 'error', 5000));
  }

  function _rollEvent() {
    const campaign = CS().getCurrentCampaign();
    const tableId = campaign?.eventTables?.find((id) => id.includes(CS().getState().currentWorld)) || campaign?.eventTables?.[0];
    const event = window.CJS.CampaignEvents.roll(tableId);
    if (!event) UI().toast('No event table available', 'info');
  }

  function _rollOracle() {
    const oracle = window.CJS.CampaignOracle.roll();
    CS().mutate((state) => { state.lastOracle = oracle; }, { source: 'oracle' });
  }

  function _rollHubPulse(table) {
    _activeTab = 'sideForge';
    const card = window.CJS.CampaignHub.rollHubPulse(table);
    if (!card) return UI().toast('No hub events available', 'info');
    render();
  }

  function _applySideChoice(id, choiceIndex) {
    const card = _sideCardById(id);
    const approved = card?.canonRisk === 'red'
      ? window.confirm('This is red-risk content. Approve and apply it now?')
      : true;
    window.CJS.CampaignHub.applyChoice(id, choiceIndex, { approved });
  }

  function _saveSideIdea(id) {
    const card = _sideCardById(id);
    if (!card) return;
    Side().saveCard(card, { status: 'saved', source: 'ui' });
  }

  function _rejectSideIdea(id) {
    const reason = window.prompt('Reject reason', '');
    Side().rejectCard(id, reason || '');
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
    _activeTab = 'oracleForge';
    const card = window.CJS.CampaignIdeaForge.rollOracle();
    if (!card) return UI().toast('No oracle table available', 'info');
    render();
  }

  function _importSidePack() {
    const raw = window.prompt('Paste side content pack JSON');
    if (!raw) return;
    try {
      const pack = JSON.parse(raw);
      window.CJS.CampaignSideContent.importPack(pack);
      UI().toast('Side content pack imported', 'success');
    } catch (error) {
      UI().toast(error.message || 'Invalid JSON', 'error');
    }
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

  function _moveNode(nodeId) {
    const current = Runner().findCurrentNode();
    const link = (current?.exits || []).find((exit) => exit.to === nodeId) || null;
    Runner().moveToNode(nodeId, link);
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
    if (!battle.encounterId) return UI().toast('This battle set is manual-only until converted to an encounter.', 'info');
    Bridge().openBattle(battle);
    Save().saveCurrent();
    UI().toast('Battle request sent to combat app', 'info');
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
    const id = window.prompt('ID to add');
    if (!id) return;
    const qty = Number(window.prompt('Quantity', '1') || 1);
    _inventoryDelta({ bucket, id, delta: qty });
  }

  function _plantSeed(plotId) {
    const seeds = DS().getAllAsArray('crops').filter((crop) => !crop._world || crop._world === CS().getState().currentWorld);
    const seedId = window.prompt(`Seed ID (${seeds.map((seed) => seed.id).join(', ')})`, seeds[0]?.id || '');
    if (seedId) window.CJS.PocketHaven.plantSeed(plotId, seedId);
  }

  function _craftRecipe(recipeId) {
    const recipe = DS().get('crafting', recipeId);
    if (!recipe) return;
    Ops().apply({ op: 'craft_basic', id: recipe.id, label: recipe.name, inputs: recipe.inputs || {}, outputs: recipe.outputs || {} }, { source: 'ui' });
  }

  function _addPocketNote() {
    const text = window.prompt('Pocket Haven note');
    if (!text) return;
    CS().mutate((state) => state.pocketHaven.notes.unshift({ at: new Date().toISOString(), text }), { source: 'note' });
  }

  function _addPinnedNote() {
    const text = window.prompt('Pinned note');
    if (!text) return;
    CS().mutate((state) => state.pinnedNotes.unshift({ at: new Date().toISOString(), text }), { source: 'note' });
  }

  function _questProgress(questId) {
    const quest = CS().getState().quests[questId];
    const objective = quest?.objectives?.[0];
    if (!objective) return;
    Ops().apply({ op: 'update_quest_progress', questId, objectiveId: objective.id, amount: 1 }, { source: 'ui' });
  }

  function _charNumberOp(id, op, label) {
    const amount = Number(window.prompt(label, '5') || 0);
    if (amount) Ops().apply({ op, target: id, amount }, { source: 'ui' });
  }

  function _charMpModal(id) {
    const amount = Number(window.prompt('MP change (positive restore, negative spend)', '5') || 0);
    if (!amount) return;
    Ops().apply({ op: amount >= 0 ? 'restore_mp' : 'spend_mp', target: id, amount: Math.abs(amount) }, { source: 'ui' });
  }

  function _charStatusModal(id) {
    const status = window.prompt('Status ID');
    if (status) Ops().apply({ op: 'add_status', target: id, status, duration: 'manual' }, { source: 'ui' });
  }

  function _travelWorld() {
    const worlds = CS().getCurrentCampaign()?.allowedWorlds || Object.keys(CS().getContent().worlds);
    const toWorld = window.prompt(`World ID (${worlds.join(', ')})`, worlds.find((id) => id !== CS().getState().currentWorld) || worlds[0]);
    if (toWorld) Ops().apply({ op: 'world_transition', toWorld, carryoverProfile: 'carryover_new_world_default' }, { source: 'ui' });
  }

  function _gmOverride() {
    const body = document.createElement('div');
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Operation</label>
          <select id="gm-op">
            <option value="give_money">Give Money</option>
            <option value="take_money">Take Money</option>
            <option value="give_jp">Give JP</option>
            <option value="take_jp">Take JP</option>
            <option value="give_item">Give Item</option>
            <option value="take_item">Take Item</option>
            <option value="give_material">Give Material</option>
            <option value="take_material">Take Material</option>
            <option value="give_food">Give Food</option>
            <option value="take_food">Take Food</option>
            <option value="damage_character">Damage Character</option>
            <option value="heal_character">Heal Character</option>
            <option value="add_status">Add Status</option>
            <option value="remove_status">Remove Status</option>
            <option value="set_flag">Set Flag</option>
            <option value="clear_flag">Clear Flag</option>
            <option value="log">Log Note</option>
            <option value="custom">Custom JSON</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Target/Currency</label><input id="gm-target" placeholder="party, character id, haven_gold"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">ID/Status/Flag</label><input id="gm-id"></div>
        <div class="form-group"><label class="form-label">Amount/Qty</label><input id="gm-amount" type="number" value="1"></div>
      </div>
      <label class="form-label">Text or Custom JSON</label>
      <textarea id="gm-text" placeholder='{"op":"give_material","id":"haven_wolf_pelt","qty":2}'></textarea>
    `;
    const footer = document.createElement('div');
    footer.innerHTML = '<button class="btn btn-primary">Apply</button>';
    const overlay = UI().openModal({ title: 'GM Override', content: body, footer, width: '640px' });
    footer.querySelector('button').onclick = () => {
      try {
        const opName = body.querySelector('#gm-op').value;
        const target = body.querySelector('#gm-target').value.trim();
        const id = body.querySelector('#gm-id').value.trim();
        const amount = Number(body.querySelector('#gm-amount').value || 0);
        const text = body.querySelector('#gm-text').value.trim();
        let op;
        if (opName === 'custom') op = JSON.parse(text);
        else if (opName === 'log') op = { op: 'log', text };
        else if (opName.includes('money')) op = { op: opName, currency: target || `${CS().getState().currentWorld}_gold`, amount };
        else if (opName.includes('character')) op = { op: opName, target, amount };
        else if (opName.includes('status')) op = { op: opName, target, status: id, duration: 'manual' };
        else if (opName.includes('flag')) op = { op: opName, flag: id || target, value: text || true };
        else op = { op: opName, id, qty: amount || 1 };
        Ops().apply(op, { source: 'gm_override' });
        UI().closeModal(overlay);
      } catch (error) {
        UI().toast(error.message || 'Invalid override', 'error');
      }
    };
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
    CS().mutate((state) => { state.pendingBattleResult = result; }, { source: 'combat_bridge' });
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
