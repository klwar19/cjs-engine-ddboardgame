// cui-controls.js — Stateless HTML builders for Campaign UI controls.
//
// Extracted from campaign-ui.js. Each function returns an HTML string for
// a small reusable widget (action button, menu, control group, inline
// purpose chip, etc.). They use only `Utils.esc`/`Utils.escAttr`/`Utils.label`
// and a module-private constant map.

window.CJS = window.CJS || {};
window.CJS.CampaignUIInternal = window.CJS.CampaignUIInternal || {};

window.CJS.CampaignUIInternal.Controls = (function () {
  'use strict';

  function _U() { return window.CJS.CampaignUIInternal.Utils; }
  const _esc = (v) => _U().esc(v);
  const _escAttr = (v) => _U().escAttr(v);
  const _label = (v) => _U().label(v);

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
      flow: 'Hear lead -> Hold in hub -> Promote later to quest, event, character scene, map seed, oracle, or problem.',
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
      label: 'Authored Event',
      role: 'Immediate happening',
      use: 'Use during story, quest, travel, aftermath, or event play when something happens now.',
      flow: 'Roll/pick event -> Review rewards/risks/text -> Apply, edit, note only, pin, or ignore.',
      commit: 'May change rewards, danger, flags, rumors, quests, or notes.'
    }
  };

  function purposeTone(key) {
    if (key === 'event') return 'mixed';
    if (key === 'hubPulse' || key === 'problem') return 'quest';
    if (key === 'rumor') return 'plot';
    return 'flavor';
  }

  function purposeKeyForCard(card = {}) {
    const type = String(card.type || '').toLowerCase();
    const source = String(card.source || '').toLowerCase();
    if (type.includes('oracle') || source.includes('oracle')) return 'oracle';
    if (type.includes('rumor')) return 'rumor';
    if (source.includes('hub_pulse') || type.includes('hub_pulse')) return 'hubPulse';
    if (type.includes('event')) return 'event';
    return 'hubPulse';
  }

  function renderInlinePurpose(key) {
    const item = TOOL_PURPOSES[key] || TOOL_PURPOSES.oracle;
    return `
      <div class="campaign-purpose-inline">
        <span class="campaign-impact-badge is-${_escAttr(purposeTone(key))}">${_esc(item.label)}</span>
        <span><b>${_esc(item.role)}.</b> ${_esc(item.flow)} ${_esc(item.commit)}</span>
      </div>
    `;
  }

  function renderRumorPurpose() {
    return `
      <div class="campaign-rumor-purpose">
        <span class="campaign-impact-badge is-plot">Rumor purpose</span>
        <span>Rumors are parked leads, not current events. Collect whispers now, check canon risk, then promote one later into a quest, event, map seed, character beat, oracle prompt, or hub problem when the party is ready.</span>
      </div>
    `;
  }

  function impactLegendItem(tone, label) {
    return `<span class="campaign-impact-badge is-${_escAttr(tone)}">${_esc(label)}</span>`;
  }

  function controlGroup(title, buttons, description = '') {
    return `
      <div class="campaign-control-group">
        <div class="campaign-control-title">${_esc(title)}</div>
        ${description ? `<div class="campaign-control-help">${_esc(description)}</div>` : ''}
        <div class="campaign-action-grid">${buttons}</div>
      </div>
    `;
  }

  function actionMenu(label, buttons, options = {}) {
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

  function actionBtn({ action, label, hint, kind = '', data = {}, disabled = false }) {
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

  function renderTownActionButton({ action, tone, title, meta, text }) {
    return `
      <button class="campaign-town-option is-${_escAttr(tone)}" data-campaign-action="${_escAttr(action)}">
        <span class="campaign-impact-badge is-${_escAttr(tone)}">${_esc(meta)}</span>
        <strong>${_esc(title)}</strong>
        <span>${_esc(text)}</span>
      </button>
    `;
  }

  return Object.freeze({
    purposeTone,
    purposeKeyForCard,
    renderInlinePurpose,
    renderRumorPurpose,
    impactLegendItem,
    controlGroup,
    actionMenu,
    actionBtn,
    renderTownActionButton
  });
})();
