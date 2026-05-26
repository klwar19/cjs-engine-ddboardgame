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
  const _QC = () => window.CJS.CampaignQuestChains;
  const _BSF = () => window.CJS.CampaignBattleSetForge;
  const _MSF = () => window.CJS.CampaignMapSeedForge;
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

  // ── Quest Chains tab ───────────────────────────────────────────────

  function renderQuestChains() {
    const QC = _QC();
    const available = QC.getAvailable();
    const active = QC.getActive();
    const finished = QC.getFinished?.() || [];
    return `
      <div class="campaign-tab-grid">
        <section class="campaign-panel campaign-wide-panel">
          <div class="campaign-panel-head">
            <h2>Event Side Stories</h2>
            <span class="campaign-pill">${active.length} active · ${available.length} available</span>
          </div>
          ${renderSideStoryFlowGuide(active[0]?.template || available[0])}
          ${active.length ? active.map((chain) => renderQuestChainActive(chain)).join('') : '<div class="campaign-empty">No active side stories. Start one below or use Normal Quest for a single farming run.</div>'}
          ${finished.length ? `<details class="campaign-resolved-quests"><summary>Resolved side stories (${finished.length})</summary>${finished.map(renderQuestChainResolved).join('')}</details>` : ''}
        </section>
        ${available.length ? available.map((chain) => renderQuestChainTemplate(chain)).join('') : '<section class="campaign-panel campaign-wide-panel"><div class="campaign-empty">No side-story templates available for this world. Add some in the editor or import a side content pack.</div></section>'}
      </div>
    `;
  }

  function renderQuestChainActive(chain) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const template = chain.template || {};
    const step = (template.steps || []).find((entry) => entry.id === chain.currentStepId);
    const steps = template.steps || [];
    const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === chain.currentStepId));
    return `
      <div class="campaign-row">
        <div>
          <strong>${esc(chain.title || template.title || chain.templateId)}</strong>
          <div class="campaign-muted">${esc(chain.status)} | Step ${currentIndex + 1}/${steps.length || 1}: ${esc(step?.label || chain.currentStepId || '-')}</div>
          ${renderQuestChainStepDetail(step)}
          ${renderContextTagsLocal([...(template.tags || []), ...(template.contextTags || []), ...(template.monsterTags || [])])}
          ${renderObjectivePulseHintLocal(step)}
          ${renderQuestChainVnPanel(chain, { active: true })}
          ${renderChainStakes(template)}
        </div>
        <div class="campaign-row-actions">
          <button class="campaign-action primary" data-campaign-action="chain-scenario" data-id="${escAttr(chain.templateId)}">Map Run</button>
          <button class="campaign-action" data-campaign-action="chain-battle" data-id="${escAttr(chain.templateId)}">Battle</button>
          <button class="campaign-action" data-campaign-action="advance-chain" data-id="${escAttr(chain.templateId)}">Complete Step</button>
          <button class="campaign-action" data-campaign-action="complete-chain" data-id="${escAttr(chain.templateId)}">Resolve</button>
          <button class="campaign-action danger" data-campaign-action="fail-chain" data-id="${escAttr(chain.templateId)}">Fail</button>
        </div>
      </div>
    `;
  }

  function renderQuestChainResolved(chain) {
    const esc = _U().esc;
    const label = _U().label;
    const template = chain.template || {};
    return `
      <div class="campaign-row">
        <div>
          <strong>${esc(chain.title || template.title || chain.templateId)}</strong>
          <div class="campaign-muted">${esc(label(chain.status || 'resolved'))} at phase ${esc(chain.completedAtPhase || chain.failedAtPhase || '-')}</div>
        </div>
      </div>
    `;
  }

  function renderQuestChainTemplate(chain) {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    return `
      <section class="campaign-panel">
        <div class="campaign-panel-head">
          <h3>${esc(chain.title || chain.name || chain.id)}</h3>
          <span class="campaign-risk ${_Side().riskClass(chain.canonRisk)}">${esc(chain.canonRisk || 'green')}</span>
        </div>
        <div class="campaign-muted">${esc(chain.summary || '')}</div>
        ${renderQuestChainVnPanel(chain)}
        <div class="campaign-chip-row">${(chain.tags || []).map((tag) => `<span class="campaign-chip">${esc(tag)}</span>`).join('')}</div>
        ${renderChainStakes(chain)}
        ${(chain.steps || []).map((step, index) => renderQuestChainStepCard(step, index)).join('')}
        <div class="campaign-action-grid">
          <button class="campaign-action primary" data-campaign-action="start-chain" data-id="${escAttr(chain.id)}">Start Quest Run</button>
          <button class="campaign-action" data-campaign-action="save-chain" data-id="${escAttr(chain.id)}">Save Idea</button>
          <button class="campaign-action" data-campaign-action="promote-chain" data-id="${escAttr(chain.id)}">Add To Quests</button>
        </div>
      </section>
    `;
  }

  function renderSideStoryFlowGuide(chain = {}) {
    if (!chain) return '';
    const esc = _U().esc;
    const phases = (chain.phasePlan || []).slice(0, 4).map((phase) => `${phase.chapterLabel || phase.id || ''} ${phase.title || phase.phaseType || ''}`.trim()).filter(Boolean);
    return `
      <div class="campaign-side-story-guide">
        <span class="campaign-impact-badge is-plot">Side Story VN</span>
        <strong>${esc(chain.title || chain.name || 'Side Story')}</strong>
        <span>${esc(chain.flowSummary || chain.summary || 'Side stories have their own plot rail, scene beats, optional map run, and manual resolve controls.')}</span>
        ${phases.length ? `<span>${esc(phases.join(' → '))}</span>` : ''}
      </div>
    `;
  }

  function renderQuestChainStepCard(step = {}, index = 0) {
    const esc = _U().esc;
    return `
      <div class="campaign-step">
        <b>${index + 1}. ${esc(step.label || step.id)}</b>
        ${renderQuestChainStepDetail(step)}
        ${renderObjectivePulseHintLocal(step)}
      </div>
    `;
  }

  function renderQuestChainStepDetail(step = {}) {
    if (!step) return '';
    const esc = _U().esc;
    const label = _U().label;
    const systems = questChainStepSystems(step);
    const meta = [
      step.chapterLabel ? `Chapter ${step.chapterLabel}` : '',
      step.phaseType ? label(step.phaseType) : '',
      step.kind ? label(step.kind) : ''
    ].filter(Boolean);
    const detail = [
      step.vn?.prompt || step.visualNovel?.prompt,
      step.character?.beat,
      step.event?.prompt,
      step.map?.objective,
      step.combat?.objective,
      step.minigame?.objective
    ].filter(Boolean);
    return `
      ${meta.length ? `<div class="campaign-muted">${esc(meta.join(' | '))}</div>` : ''}
      ${step.text ? `<span>${esc(step.text)}</span>` : ''}
      ${systems.length ? `<div class="campaign-chip-row">${systems.map((item) => `<span class="campaign-chip">${esc(item)}</span>`).join('')}</div>` : ''}
      ${detail.length ? `<div class="campaign-muted">${esc(detail.slice(0, 2).join(' | '))}</div>` : ''}
    `;
  }

  function questChainStepSystems(step = {}) {
    const systems = [];
    if (step.vn || step.visualNovel) systems.push('VN');
    if (step.character) systems.push('Character');
    if (step.event) systems.push('Event');
    if (step.map) systems.push('Map');
    if (step.combat) systems.push('Combat');
    if (step.minigame) systems.push('Mini-Game');
    return systems;
  }

  function renderQuestChainVnPanel(chain = {}, options = {}) {
    const esc = _U().esc;
    const template = chain.template || chain || {};
    const steps = template.steps || [];
    const currentId = options.active ? chain.currentStepId : steps[0]?.id;
    const currentIndex = Math.max(0, steps.findIndex((entry) => entry.id === currentId));
    const current = steps[currentIndex] || steps[0] || {};
    const npcs = (template.mainNpcs || []).slice(0, 4);
    const systems = questChainStepSystems(current);
    return `
      <div class="campaign-side-story-vn">
        <div class="campaign-side-story-scene">
          <span class="campaign-impact-badge is-plot">${options.active ? 'Current Scene' : 'Opening Scene'}</span>
          <strong>${esc(current.label || template.title || template.id || 'Side Story')}</strong>
          <p>${esc(current.text || template.summary || 'Pick a scene, run it as VN/table narration, then decide whether it becomes a map, battle, quest progress, or a parked lead.')}</p>
          ${systems.length ? `<div class="campaign-chip-row">${systems.map((item) => `<span class="campaign-chip">${esc(item)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="campaign-side-story-meta">
          <span><b>Plot</b> ${esc(template.flowSummary || template.type || 'side story')}</span>
          <span><b>Characters</b> ${esc(npcs.join(', ') || 'GM choice')}</span>
          <span><b>Control</b> Start map, battle manually, complete step, resolve, or fail.</span>
        </div>
        <div class="campaign-side-story-steps">
          ${steps.map((step, index) => `
            <span class="${index === currentIndex ? 'is-current' : index < currentIndex ? 'is-done' : ''}">
              <b>${index + 1}</b>${esc(step.label || step.id)}
            </span>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderChainStakes(chain = {}) {
    const esc = _U().esc;
    const Ops = _Ops();
    const rewards = Ops.describe(chain.rewardOps || chain.rewards || []);
    const failures = Ops.describe(chain.failureOps || chain.failureConsequences || []);
    const battleCount = (chain.battleSetIds || []).length;
    const mapCount = (chain.mapSeedIds || []).length + (chain.linkedScenario ? 1 : 0);
    return `
      <div class="campaign-preview">
        <b>Run</b>: ${mapCount ? `${mapCount} map hook${mapCount === 1 ? '' : 's'}` : 'generated map'}${battleCount ? ` · ${battleCount} battle hook${battleCount === 1 ? '' : 's'}` : ''}<br>
        ${rewards.length ? `<b>Reward</b>: ${rewards.map(esc).join('; ')}<br>` : ''}
        ${failures.length ? `<b>If failed</b>: ${failures.map(esc).join('; ')}` : '<b>If failed</b>: GM consequence or mark failed'}
      </div>
    `;
  }

  // Local clones of two small overview helpers used by quest chain cards.
  // Both helpers also exist in the shell (`_renderContextTags`,
  // `_renderObjectivePulseHint`) and need to render identically — the
  // pulse hint also reuses the shell's `_triggerLabel` logic, which is
  // inlined as `_triggerLabel` below to keep the chain cards self-
  // contained.
  function renderContextTagsLocal(tags = []) {
    const esc = _U().esc;
    const label = _U().label;
    const list = Array.from(new Set((tags || []).filter(Boolean))).slice(0, 8);
    if (!list.length) return '';
    return `
      <div class="campaign-chip-row campaign-context-tags">
        ${list.map((tag) => `<span class="campaign-chip">${esc(label(tag))}</span>`).join('')}
      </div>
    `;
  }

  function renderObjectivePulseHintLocal(obj = {}) {
    const triggers = obj?.progressTriggers || [];
    if (!triggers.length) return '';
    const esc = _U().esc;
    return `
      <div class="campaign-quest-pulse">
        ${triggers.slice(0, 2).map((trigger) => `<span>${esc(_triggerLabel(trigger))}</span>`).join('')}
      </div>
    `;
  }

  function _triggerLabel(trigger = {}) {
    const label = _U().label;
    const bits = [];
    if (trigger.outcome) bits.push(label(trigger.outcome));
    if (trigger.skillIds?.length) bits.push(trigger.skillIds.map(label).join(' / '));
    if (trigger.statusIds?.length) bits.push(`Status ${trigger.statusIds.map(label).join(' / ')}`);
    if (trigger.defeatedTypes?.length) bits.push(`Defeat ${trigger.defeatedTypes.map(label).join(' / ')}`);
    if (trigger.defeatedMonsterIds?.length) bits.push(`Defeat ${trigger.defeatedMonsterIds.map(label).join(' / ')}`);
    const tags = trigger.requiresTags || trigger.requiresAnyTags || trigger.anyTags || [];
    if (tags.length) bits.push((Array.isArray(tags) ? tags : [tags]).map(label).join(' / '));
    if (trigger.onlyPlayerActionTags?.length) bits.push(`Only ${trigger.onlyPlayerActionTags.map(label).join(' / ')}`);
    return bits.length ? `Auto: ${bits.join(' + ')}` : 'Auto progress available';
  }

  // ── Battle Sets / Map Seeds (Hub-adjacent forges) ──────────────────

  function renderBattleSets() {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const cards = _BSF().getCards();
    return `
      <div class="campaign-tab-grid">
        ${cards.map((card) => `
          <section class="campaign-panel">
            <div class="campaign-panel-head">
              <h3>${esc(card.name || card.id)}</h3>
              <span class="campaign-risk ${_Side().riskClass(card.canonRisk)}">${esc(card.canonRisk || 'green')}</span>
            </div>
            <div class="campaign-muted">Rank ${esc(card.rank || '-')} | ${esc(card.objective || '')}</div>
            <div class="campaign-chip-row">${(card.tags || []).map((tag) => `<span class="campaign-chip">${esc(tag)}</span>`).join('')}</div>
            <div class="campaign-preview">
              <b>Enemy Mix</b><br>
              ${(card.enemyMix || []).map((enemy) => `${esc(enemy.qty || 1)}x ${esc(enemy.label || enemy.name || enemy.id || 'unit')}`).join('<br>') || 'Manual enemy mix'}
            </div>
            <div class="campaign-muted">${esc(card.gimmick || '')}</div>
            <div class="campaign-action-grid">
              <button class="campaign-action primary" data-campaign-action="queue-battle-set" data-id="${escAttr(card.id)}">${card.encounterId ? 'Queue Combat' : 'Queue Manual'}</button>
              <button class="campaign-action" data-campaign-action="save-battle-card" data-id="${escAttr(card.id)}">Save Idea</button>
              <button class="campaign-action" data-campaign-action="copy-battle-card" data-id="${escAttr(card.id)}">Copy</button>
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No battle set cards.</div>'}
      </div>
    `;
  }

  function renderMapSeeds() {
    const esc = _U().esc;
    const escAttr = _U().escAttr;
    const seeds = _MSF().getSeeds();
    return `
      <div class="campaign-tab-grid">
        ${seeds.map((seed) => `
          <section class="campaign-panel">
            <div class="campaign-panel-head">
              <h3>${esc(seed.name || seed.id)}</h3>
              <span class="campaign-risk ${_Side().riskClass(seed.canonRisk)}">${esc(seed.canonRisk || 'green')}</span>
            </div>
            <div class="campaign-muted">${(Array.isArray(seed.purpose) ? seed.purpose : [seed.purpose].filter(Boolean)).map(esc).join(', ')}</div>
            ${(seed.nodes || []).map((node, index) => `<div class="campaign-step"><b>${index + 1}. ${esc(node.name || node.id)}</b><span>${esc(node.role || node.notes || '')}</span></div>`).join('')}
            <div class="campaign-action-grid">
              <button class="campaign-action primary" data-campaign-action="save-map-seed" data-id="${escAttr(seed.id)}">Save Idea</button>
              <button class="campaign-action" data-campaign-action="copy-map-seed" data-id="${escAttr(seed.id)}">Copy</button>
            </div>
          </section>
        `).join('') || '<div class="campaign-empty">No map seeds.</div>'}
      </div>
    `;
  }

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
    Tabs.register('questChains', {
      render: () => renderQuestChains()
    });
    Tabs.register('oracleForge', {
      render: (state) => renderOracleForge(state)
    });
    Tabs.register('battleSets', {
      render: () => renderBattleSets()
    });
    Tabs.register('mapSeeds', {
      render: () => renderMapSeeds()
    });
  }
  _registerTabs();

  return Object.freeze({
    // Tab body renderers
    renderSideForge,
    renderQuestChains,
    renderOracleForge,
    renderBattleSets,
    renderMapSeeds,
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
    isRumorOpen,
    renderQuestChainActive,
    renderQuestChainResolved,
    renderQuestChainTemplate,
    renderSideStoryFlowGuide,
    renderQuestChainStepCard,
    renderQuestChainStepDetail,
    questChainStepSystems,
    renderQuestChainVnPanel,
    renderChainStakes
  });
})();
