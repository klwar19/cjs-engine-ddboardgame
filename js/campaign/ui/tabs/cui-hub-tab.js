// cui-hub-tab.js — Hub tab rendering for Campaign UI.
//
// Owns three tabs:
//   * `sideForge` — the Living Hub dashboard (pulse, rumors, problems,
//      saved ideas, review queue, side history)
//   * `questChains` — Event Side Stories index
//   * `oracleForge` — Oracle / keyword forge
//
// Owns the shared side-content rendering primitives (side card, rumor row,
// consequence preview/summary, flavor trail, operation tone). The shell
// re-exposes them on `window.CJS.CampaignUIInternal.HubTab` so the story
// home / event result / overview can keep using them without growing a
// new private dependency on this module.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.HubTab = (function () {
  'use strict';

  const _U = () => window.CJS.CampaignUIInternal.Utils;
  const _C = () => window.CJS.CampaignUIInternal.Controls;
  const _DS = () => window.CJS.DataStore;
  const _CS = () => window.CJS.CampaignState;
  const _UI = () => window.CJS.UI;
  const _Ops = () => window.CJS.CampaignOps;
  const _Side = () => window.CJS.CampaignSideContent;
  const _Hub = () => window.CJS.CampaignHub;
  const _DL = () => window.CJS.CampaignDataLoader;

  // ── Tone / consequence math ────────────────────────────────────────

  function operationTone(op = {}) {
    const name = String(op.op || '').toLowerCase();
    if (!name || name === 'log') return 'flavor';
    if (/^(give_|heal_|restore_mp|recruit_character|learn_|unlock_|add_xp|add_level)/.test(name)) return 'reward';
    if (/^(take_|damage_|spend_|add_status|remove_character|bench_character)/.test(name)) return 'risk';
    if (name === 'danger') return Number(op.amount || 0) > 0 ? 'risk' : 'reward';
    if (/quest|scenario|battle|node|map|hub_problem|hub_service|clock/.test(name)) return 'quest';
    if (/rumor|flag|bond|reputation|npc_mood|hub_mood|hub_stat|memory|side_idea|review|world_transition|chapter_transition/.test(name)) return 'plot';
    return 'plot';
  }

  function consequenceSummary(ops = [], options = {}) {
    const list = Array.isArray(ops) ? ops.filter(Boolean) : [];
    const counts = { reward: 0, risk: 0, quest: 0, plot: 0, flavor: 0 };
    for (const op of list) counts[operationTone(op)] += 1;
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

  function cardChoiceOps(card = {}) {
    const firstChoice = card.suggestedChoices?.[0]?.ops;
    const ops = firstChoice || card.suggested || card.suggestedOps || card.rewardOps || [];
    return Array.isArray(ops) ? ops : [];
  }

  function renderChoiceConsequence(choice = {}, index = 0) {
    return renderConsequencePreview(choice.ops || [], {
      title: choice.label || `Choice ${index + 1}`,
      emptyTitle: choice.label || `Choice ${index + 1}`,
      emptyText: 'Flavor choice only. Save it as text or use it to steer the next scene.'
    });
  }

  function renderConsequencePreview(ops = [], options = {}) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const list = Array.isArray(ops) ? ops.filter(Boolean) : [];
    const summary = consequenceSummary(list, { hasText: options.hasText });
    const title = options.title || (list.length ? summary.title : options.emptyTitle) || summary.title;
    const text = list.length ? summary.detail : (options.emptyText || summary.detail);
    const lines = list.length ? _Ops().describe(list) : [];
    return `
      <div class="campaign-consequence is-${escAttr(summary.tone)}">
        <div class="campaign-consequence-head">
          <span class="campaign-impact-badge is-${escAttr(summary.tone)}">${esc(summary.label)}</span>
          <strong>${esc(title)}</strong>
        </div>
        <span>${esc(text)}</span>
        ${lines.length ? `<ul>${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
      </div>
    `;
  }

  function renderFlavorTrail(entry = {}) {
    const esc = _U().esc;
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
            <b>${esc(label)}</b>
            <span>${esc(text)}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Rumor helpers ──────────────────────────────────────────────────

  function isRumorOpen(rumor = {}) {
    return !['resolved', 'promoted', 'dismissed', 'archived'].includes(String(rumor.status || 'active').toLowerCase());
  }

  function openRumors(hubState) {
    return (hubState?.rumors || []).filter(isRumorOpen);
  }

  function renderRumorRow(rumor = {}, options = {}) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const label = _U().label;
    const hubId = _Hub()?.getCurrentHubId?.() || '';
    const compact = !!options.compact;
    return `
      <div class="campaign-row campaign-rumor-row ${compact ? 'is-compact' : ''}">
        <div>
          <strong>${esc(rumor.text || rumor.id)}</strong>
          <div class="campaign-muted">${esc(rumor.status || 'active')} | ${esc(label(rumor.canonRisk || 'green'))} lead | parked until promoted</div>
        </div>
        <div class="campaign-row-actions">
          <span class="campaign-risk ${_Side().riskClass(rumor.canonRisk)}">${esc(rumor.canonRisk || 'green')}</span>
          <button class="campaign-action" data-campaign-action="rumor-to-quest" data-id="${escAttr(rumor.id)}" data-hub-id="${escAttr(hubId)}">Make Quest</button>
          <button class="campaign-action" data-campaign-action="rumor-to-problem" data-id="${escAttr(rumor.id)}" data-hub-id="${escAttr(hubId)}">Make Problem</button>
          <button class="campaign-action danger" data-campaign-action="resolve-rumor" data-id="${escAttr(rumor.id)}" data-hub-id="${escAttr(hubId)}">Resolve</button>
        </div>
      </div>
    `;
  }

  // ── Side card ──────────────────────────────────────────────────────

  function renderSideCard(card, options = {}) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const C = _C();
    const compact = !!options.compact;
    const choices = card.suggestedChoices || [];
    const primaryOps = cardChoiceOps(card);
    const summary = consequenceSummary(primaryOps, { hasText: !!(card.prompt || card.text || card.summary) });
    return `
      <section class="campaign-panel campaign-side-card campaign-result-card is-${escAttr(summary.tone)} ${compact ? 'compact' : ''}">
        <div class="campaign-panel-head">
          <div>
            <h3>${esc(card.title || card.name || card.id)}</h3>
            <div class="campaign-muted">${esc(card.type || 'side content')} | ${esc(card.source || '')} | ${esc(card.status || 'idea')}</div>
          </div>
          <div class="campaign-impact-row">
            <span class="campaign-impact-badge is-${escAttr(summary.tone)}">${esc(summary.label)}</span>
            <span class="campaign-risk ${_Side().riskClass(card.canonRisk)}">${esc(card.canonRisk || 'green')}</span>
          </div>
        </div>
        ${!compact ? C.renderInlinePurpose(C.purposeKeyForCard(card)) : ''}
        ${card.prompt ? `<p>${esc(card.prompt)}</p>` : ''}
        ${card.text ? `<p>${esc(card.text)}</p>` : ''}
        ${card.summary && !compact ? `<p>${esc(card.summary)}</p>` : ''}
        ${!compact ? renderFlavorTrail(card) : ''}
        ${card.gmKeywords?.length && !compact ? `<div class="campaign-chip-row">${card.gmKeywords.map((tag) => `<span class="campaign-chip">${esc(tag)}</span>`).join('')}</div>` : ''}
        ${card.gmNote && !compact ? `<div class="campaign-warning">${esc(card.gmNote)}</div>` : ''}
        ${choices.length && !compact ? `<div class="campaign-choice-stack">${choices.map((choice, index) => renderChoiceConsequence(choice, index)).join('')}</div>` : ''}
        <div class="campaign-action-grid">
          ${choices.length ? choices.map((choice, index) => `
            <button class="campaign-action ${index === 0 ? 'primary' : ''}" data-campaign-action="apply-side-choice" data-id="${escAttr(card.id)}" data-choice="${index}" title="${escAttr('Apply: ' + (choice.label || ('Choice ' + (index + 1))))}"><span class="ku-action-prefix">Apply</span><span class="ku-action-label">${esc(choice.label || `Choice ${index + 1}`)}</span></button>
          `).join('') : ''}
          <button class="campaign-action" data-campaign-action="save-side-idea" data-id="${escAttr(card.id)}" title="Save this idea to the bank without committing it.">Save</button>
          <button class="campaign-action" data-campaign-action="copy-side-card" data-id="${escAttr(card.id)}" title="Copy the card text to clipboard.">Copy</button>
          ${!compact ? `<button class="campaign-action" data-campaign-action="dismiss-side-card" data-id="${escAttr(card.id)}" title="Hide this card from the current result slot.">Dismiss</button>` : ''}
          <button class="campaign-action campaign-action-reject" data-campaign-action="reject-side-idea" data-id="${escAttr(card.id)}" title="Discard this idea. Nothing is committed.">Reject</button>
        </div>
      </section>
    `;
  }

  // ── Town pulse (overview helpers) ──────────────────────────────────
  // renderTownSnapshot / renderTownRollFloat / _questResolvedSnapshot
  // removed in Phase G.16. The Overview tab now reads typed
  // `getTownSnapshotData` / `getTownRollFloatData` from campaign-ui.js
  // and renders JSX via `src/campaign/tabs/TownPanels.tsx`. The typed
  // bridge still calls `HubTab.openRumors` / `renderRumorRow` /
  // `consequenceSummary`, so those stay exported below.

  // ── Side Forge (Hub) tab ───────────────────────────────────────────

  function renderSideForge(state, h) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const label = _U().label;
    const C = _C();
    const hub = _Hub().getCurrentHubDefinition();
    const hubState = _Hub().getCurrentHubState();
    const last = state.lastSideContentCard;
    const ideas = Object.values(state.sideContent?.generatedIdeas || {});
    const saved = ideas.filter((idea) => idea.status === 'saved' || idea.status === 'active');
    const review = state.sideContent?.reviewQueue || [];
    const history = state.sideContent?.contentHistory || [];
    const soloNotice = (typeof h?.renderSoloNotice === 'function') ? h.renderSoloNotice(state) : '';
    return `
      <div class="campaign-dashboard side-forge">
        <section class="campaign-panel side-forge-hero">
          <div class="campaign-panel-head">
            <div>
              <h2>${esc(hub?.name || 'Living Hub')}</h2>
              <div class="campaign-muted">${esc(hub?.description || 'Town pulse, rumors, problems, and content review queue.')}</div>
            </div>
            <span class="campaign-pill">${esc(label(hubState?.mood || 'neutral'))}</span>
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
            <button class="campaign-action" data-campaign-action="rank-up-apply" title="Apply for a rank-up trial at the Adventurer Guild.">Rank Up</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="tavern" title="Roll the tavern table — gossip, suppliers, drinking-spot drama.">Tavern</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="forge" title="Roll the forge / craft table — weapons, materials, smith requests.">Forge</button>
            <button class="campaign-action" data-campaign-action="roll-hub-pulse" data-table="weird" title="Roll the weirdness table — ominous omens, supernatural beats.">Weird</button>
            <button class="campaign-action" data-campaign-action="random-quest-offer" title="Pick a random quest template and auto-start its map run.">Quest Run</button>
            <button class="campaign-action" data-campaign-action="random-rumor-offer" title="Create a marked lead. Mechanics only happen when you promote it later.">Rumor Hook</button>
            <button class="campaign-action" data-campaign-action="manual-rumor" title="Type a custom rumor / lead into the hub bank.">Manual Rumor</button>
            <button class="campaign-action" data-campaign-action="roll-forge-oracle" title="Roll a GM inspiration prompt — text only, no mechanics.">Oracle</button>
          </div>
        </section>
        ${soloNotice}
        ${last ? renderSideCard(last, { mode: 'last' }) : ''}
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Hub Problems</h3><span class="campaign-muted">Pressure cards on this hub. Resolve them by spending phases or addressing the cause.</span></div>
          ${C.renderInlinePurpose('problem')}
          ${(hubState?.activeProblems || []).map((problem) => `
            <div class="campaign-row">
              <strong>${esc(label(problem))}</strong>
              <button class="campaign-action" data-campaign-action="resolve-hub-problem" data-id="${escAttr(problem)}" data-hub-id="${escAttr(hub?.id || '')}" title="Mark this problem solved. Frees Pressure budget.">Resolve</button>
            </div>
          `).join('') || '<div class="campaign-empty">No active hub problems.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Rumors</h3><button class="campaign-action" data-campaign-action="manual-rumor">Add Rumor</button></div>
          ${C.renderRumorPurpose()}
          ${openRumors(hubState).slice(0, 6).map((rumor) => renderRumorRow(rumor)).join('') || '<div class="campaign-empty">No open rumors.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Saved Ideas</h3></div>
          ${saved.length ? saved.slice(0, 8).map((idea) => renderSideCard(idea, { compact: true })).join('') : '<div class="campaign-empty">No saved ideas yet.</div>'}
        </section>
        <section class="campaign-panel review-panel">
          <div class="campaign-panel-head"><h3>Review Queue</h3></div>
          ${review.length ? review.slice(0, 8).map((item) => `
            <div class="campaign-row">
              <div>
                <strong>${esc(item.contentId)}</strong>
                <div class="campaign-muted">${esc(item.reason || '')}</div>
              </div>
              <div class="campaign-row-actions">
                <span class="campaign-risk ${_Side().riskClass(item.canonRisk)}">${esc(item.canonRisk || 'red')}</span>
                <button class="campaign-action" data-campaign-action="review-resolve" data-id="${escAttr(item.id)}" data-decision="approved">Approve</button>
                <button class="campaign-action campaign-action-reject" data-campaign-action="review-resolve" data-id="${escAttr(item.id)}" data-decision="rejected" title="Reject this content. It will not be added.">Reject</button>
              </div>
            </div>
          `).join('') : '<div class="campaign-empty">No pending review.</div>'}
        </section>
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h3>Side History</h3></div>
          ${history.slice(0, 10).map((line) => `<div class="campaign-log-line"><span>${esc(line.title || line.type)}: ${esc(line.result || '')}</span><small>Phase ${line.phase}</small></div>`).join('') || '<div class="campaign-empty">No side content history.</div>'}
        </section>
      </div>
    `;
  }

  // Quest Chains tab body ported to JSX in Phase K.3. The React tree
  // reads typed `getQuestChainsData()` from campaign-ui.js (which reuses
  // the `_questChainActiveData` / `_questChainTemplateData` builders the
  // EventTab side panel already used) and renders
  // `src/campaign/tabs/CampaignHubTabs.tsx` + `QuestChain.tsx`.

  // Battle Sets / Map Seeds tab bodies ported to JSX in Phase K.3.
  // The React tree reads typed `getBattleSetsData()` / `getMapSeedsData()`
  // from campaign-ui.js and renders `src/campaign/tabs/CampaignHubTabs.tsx`.

  // ── Oracle Forge tab ───────────────────────────────────────────────

  function renderOracleForge(state) {
    const esc = _U().esc;
    const C = _C();
    const last = state.lastSideContentCard?.type === 'oracle_prompt' ? state.lastSideContentCard : null;
    const tables = _DL().getOracleTables();
    return `
      <div class="campaign-dashboard">
        <section class="campaign-panel">
          <div class="campaign-panel-head"><h2>Oracle / Keyword Forge</h2></div>
          ${C.renderInlinePurpose('oracle')}
          <div class="campaign-muted">${tables.map((table) => esc(table.name || table.id)).join(', ') || 'No oracle tables loaded.'}</div>
          <div class="campaign-action-grid">
            <button class="campaign-action primary" data-campaign-action="roll-forge-oracle">Roll Oracle</button>
            <button class="campaign-action" data-campaign-action="import-side-pack">Import Pack</button>
            <button class="campaign-action" data-campaign-action="export-side-pack">Export Save Ideas</button>
          </div>
        </section>
        ${last ? renderSideCard(last, { mode: 'oracle' }) : ''}
      </div>
    `;
  }

  // ── Tab registration ───────────────────────────────────────────────

  function _registerTabs() {
    const Tabs = window.CJS.CampaignUIInternal.Tabs;
    if (!Tabs) return;
    Tabs.register('sideForge', {
      render: (state, helpers) => renderSideForge(state, helpers)
    });
    Tabs.register('oracleForge', {
      render: (state) => renderOracleForge(state)
    });
    // questChains is React-owned (K.3) — registered as a React mount
    // point by cui-react-bridge.js, rendered as JSX by the shell.
    // battleSets / mapSeeds are React-owned (K.3) — registered as React
    // mount points by cui-react-bridge.js, rendered as JSX by the shell.
  }
  _registerTabs();

  return Object.freeze({
    // Tab body renderers
    renderSideForge,
    renderOracleForge,
    // Shared side-content primitives used by overview, story home, event log
    operationTone,
    consequenceSummary,
    cardChoiceOps,
    renderChoiceConsequence,
    renderConsequencePreview,
    renderFlavorTrail,
    renderSideCard,
    renderRumorRow,
    openRumors,
    isRumorOpen
  });
})();
