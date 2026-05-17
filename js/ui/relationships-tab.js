// relationships-tab.js
// Renders a Campaign-Mode tab showing the main character's relationships
// with every known sub-character / companion. Reads state.bonds (owned by
// campaign-ops) and computes display tiers via RelationshipTiers.
//
// Activities: a small per-phase pool (state.relationshipActs) lets the
// player spend an act on hang_out / train / listen / help_task / compete,
// each of which nudges a specific bond field. The pool refreshes on phase
// pass (campaign-ops.passPhase) so social play is paced with the rest of
// the campaign rhythm.
//
// Future room: more activity kinds, persona-gated options, scene unlocks
// at higher tiers, and party-member specific dialogue beats can all be
// added without changing the underlying bond store.
//
// Reads: state.bonds, state.relationshipActs, DataStore (characters),
//        RelationshipTiers
// Used by: campaign-ui.js (dispatched from _renderMain when tab is active)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.RelationshipsTab = (() => {
  'use strict';

  const RT = () => window.CJS.RelationshipTiers;
  const DS = () => window.CJS.DataStore;

  const ACTIVITIES = [
    { id: 'hang_out',  label: 'Hang Out',  icon: '☕', hint: '+1 trust',      bondField: 'trust' },
    { id: 'train',     label: 'Train',     icon: '🥋', hint: '+1 confidence', bondField: 'confidence' },
    { id: 'listen',    label: 'Listen',    icon: '👂', hint: '+1 empathy',    bondField: 'empathy' },
    { id: 'help_task', label: 'Help',      icon: '🧰', hint: '+1 value',      bondField: 'value' },
    { id: 'compete',   label: 'Compete',   icon: '⚔️', hint: '+1 rivalry',    bondField: 'rivalry' }
  ];

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _portraitHtml(charId, base) {
    const portrait = base?.portrait || '';
    const icon = base?.icon || '🧑';
    if (portrait) {
      return `<img class="rel-portrait" src="${_esc(portrait)}" alt="${_esc(base?.name || charId)}" onerror="this.style.display='none'"/>`;
    }
    return `<div class="rel-portrait rel-portrait-fallback" aria-hidden="true">${_esc(icon)}</div>`;
  }

  function _fieldsBreakdown(bondEntry) {
    if (!bondEntry) return '';
    const fields = Object.entries(bondEntry)
      .filter(([k]) => !k.startsWith('_'))
      .sort(([a], [b]) => a.localeCompare(b));
    if (!fields.length) return '<div class="rel-fields-empty">No interactions yet.</div>';
    return `
      <ul class="rel-fields">
        ${fields.map(([k, v]) => `
          <li><span class="rel-field-name">${_esc(k)}</span><span class="rel-field-val">${_esc(v)}</span></li>
        `).join('')}
      </ul>`;
  }

  function _activityButtons(charId, actsRemaining) {
    const disabled = actsRemaining <= 0;
    return `
      <div class="rel-activities">
        <div class="rel-activities-head">
          <strong>Spend an Act</strong>
          <span class="rel-acts-pill">${actsRemaining} act${actsRemaining === 1 ? '' : 's'} left</span>
        </div>
        <div class="rel-activity-grid">
          ${ACTIVITIES.map((a) => `
            <button class="rel-activity-btn"
                    data-campaign-action="rel-activity"
                    data-character-id="${_esc(charId)}"
                    data-activity-id="${_esc(a.id)}"
                    title="${_esc(a.hint)} with this character"
                    ${disabled ? 'disabled' : ''}>
              <span class="rel-activity-icon" aria-hidden="true">${_esc(a.icon)}</span>
              <span class="rel-activity-label">${_esc(a.label)}</span>
              <span class="rel-activity-hint">${_esc(a.hint)}</span>
            </button>
          `).join('')}
        </div>
      </div>`;
  }

  function _renderCard(charId, bondEntry, actsRemaining) {
    const tiers = RT();
    const tier = tiers
      ? tiers.computeTier(bondEntry)
      : { id: 'stranger', label: 'Stranger', icon: '🌫️', score: 0, positive: 0, rivalry: 0 };
    const base = DS()?.get?.('characters', charId) || {};
    const name = base.name || charId;
    const scorePct = Math.max(0, Math.min(100, Number(tier.score) || 0));
    return `
      <div class="rel-card rel-tier-${_esc(tier.id)}" data-rel-character="${_esc(charId)}">
        <div class="rel-card-head">
          ${_portraitHtml(charId, base)}
          <div class="rel-card-id">
            <div class="rel-card-name">${_esc(name)}</div>
            <div class="rel-card-tier">${_esc(tier.icon)} ${_esc(tier.label)} <span class="rel-card-score">(${tier.score})</span></div>
          </div>
        </div>
        <div class="rel-bar-track"><div class="rel-bar-fill" style="width:${scorePct}%"></div></div>
        ${_activityButtons(charId, actsRemaining)}
        <details class="rel-card-detail">
          <summary>Details</summary>
          ${_fieldsBreakdown(bondEntry)}
        </details>
      </div>`;
  }

  function _renderEmpty() {
    return `
      <div class="rel-empty">
        <div class="rel-empty-icon">🤝</div>
        <h3>No characters known yet</h3>
        <p>As you make choices and complete quests, your bonds with characters here will grow. Check back after meeting someone new — then spend an Act to hang out, train, listen, help, or compete.</p>
      </div>`;
  }

  function _renderActsSummary(state) {
    const acts = state.relationshipActs || { remaining: 0, max: 3, history: [] };
    const remaining = Number(acts.remaining || 0);
    const max = Number(acts.max || 3);
    const lastEntries = (acts.history || []).slice(0, 3).map((entry) => {
      const name = (DS()?.get?.('characters', entry.characterId)?.name) || entry.characterId || 'someone';
      return `<li><b>${_esc(_activityLabel(entry.activityId))}</b> with ${_esc(name)} (+${entry.amount} ${entry.field})</li>`;
    }).join('');
    return `
      <section class="rel-acts-banner">
        <div class="rel-acts-banner-row">
          <div>
            <strong>Activity Acts</strong>
            <span class="rel-acts-banner-meter">${remaining} / ${max}</span>
          </div>
          <div class="rel-acts-banner-hint">
            Acts refresh when you Pass Phase. Each card has Hang Out / Train / Listen / Help / Compete actions.
          </div>
        </div>
        ${lastEntries ? `
          <details class="rel-acts-history">
            <summary>Recent activities</summary>
            <ul>${lastEntries}</ul>
          </details>
        ` : ''}
      </section>`;
  }

  function _activityLabel(id) {
    const found = ACTIVITIES.find((a) => a.id === id);
    return found ? found.label : (id || 'Activity');
  }

  function render(state) {
    if (!state) return '<div class="campaign-panel">No active campaign.</div>';
    const tiers = RT();
    const charIds = tiers
      ? (tiers.getKnownCharacters ? tiers.getKnownCharacters(state) : tiers.getKnownNpcs(state))
      : Object.keys(state.bonds || {});
    const acts = state.relationshipActs || { remaining: 0, max: 3 };
    const actsRemaining = Number(acts.remaining || 0);

    if (!charIds.length) {
      return `
        <section class="campaign-panel campaign-relationships-panel">
          <div class="campaign-panel-head">
            <h2>Relationships</h2>
            <span class="campaign-pill">0 known</span>
          </div>
          ${_renderActsSummary(state)}
          ${_renderEmpty()}
        </section>`;
    }

    // Sort: rivals first (most striking), then by score descending.
    const sorted = charIds.slice().sort((a, b) => {
      const ta = tiers ? tiers.computeTier(state.bonds[a]) : { score: 0, id: 'stranger' };
      const tb = tiers ? tiers.computeTier(state.bonds[b]) : { score: 0, id: 'stranger' };
      if (ta.id === 'rival' && tb.id !== 'rival') return -1;
      if (tb.id === 'rival' && ta.id !== 'rival') return 1;
      return (tb.score || 0) - (ta.score || 0);
    });

    return `
      <section class="campaign-panel campaign-relationships-panel">
        <div class="campaign-panel-head">
          <div>
            <h2>Relationships</h2>
            <div class="campaign-muted">How companions and other characters feel about you. Higher tiers unlock dialogue, scenes, and quest options.</div>
          </div>
          <span class="campaign-pill">${charIds.length} known</span>
        </div>
        ${_renderActsSummary(state)}
        <div class="rel-grid">
          ${sorted.map((id) => _renderCard(id, state.bonds[id], actsRemaining)).join('')}
        </div>
      </section>`;
  }

  return { render, ACTIVITIES };
})();
