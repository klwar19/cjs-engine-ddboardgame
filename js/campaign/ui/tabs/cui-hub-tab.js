// cui-hub-tab.js — Shared side-content primitives for Campaign UI.
//
// The hub-family tab bodies (sideForge, questChains, oracleForge,
// battleSets, mapSeeds) were ported to JSX in Phase K.3 — they now read
// typed `get*Data` bridges from campaign-ui.js and render React
// components in `src/campaign/tabs/`. This module no longer renders or
// registers any tab.
//
// What remains is the shared side-content rendering / math primitives
// (operation tone, consequence summary + preview, flavor trail, rumor
// open-filter). The shell re-exposes them on
// `window.CJS.CampaignUIInternal.HubTab` so the typed bridges
// (`getEventResultData`, `getOracleData`, `getSideForgeData`,
// `getTownSnapshotData`, …) and the JSX SideCard can keep using them
// without a new private dependency. The consequence-preview / flavor-
// trail strings carry no `data-campaign-action`; they are display-only
// HTML bridges that get a full JSX port when this module is deleted in
// Phase H.4.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.HubTab = (function () {
  'use strict';

  const _U = () => window.CJS.CampaignUIInternal.Utils;
  const _Ops = () => window.CJS.CampaignOps;

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

  // ── Consequence preview / flavor trail (display-only HTML) ──────────
  // No data-campaign-action; consumed by the typed bridges (ResultPanels,
  // SideCard, SoloNotice) as a dangerouslySetInnerHTML island.

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

  return Object.freeze({
    // Shared side-content primitives used by the typed bridges in
    // campaign-ui.js (overview, story home, event log, side forge) and
    // the JSX SideCard.
    operationTone,
    consequenceSummary,
    cardChoiceOps,
    renderConsequencePreview,
    renderFlavorTrail,
    openRumors,
    isRumorOpen
  });
})();
