// relationships-tab.js
// Renders a Campaign-Mode tab showing the main character's relationships
// with every known sub-char / NPC. Reads state.bonds (the existing bond
// store owned by campaign-ops) and computes display tiers via the
// RelationshipTiers helper.
//
// This module is read-only — mutations go through campaign-ops
// (bond_change, relationship_set) as part of story scenes and quests.
//
// Reads: state.bonds, DataStore (characters), RelationshipTiers
// Used by: campaign-ui.js (dispatched from _renderMain when tab is active)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.RelationshipsTab = (() => {
  'use strict';

  const RT = () => window.CJS.RelationshipTiers;
  const DS = () => window.CJS.DataStore;

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _portraitHtml(npcId, base) {
    const portrait = base?.portrait || '';
    const icon = base?.icon || '🧑';
    if (portrait) {
      return `<img class="rel-portrait" src="${_esc(portrait)}" alt="${_esc(base?.name || npcId)}" onerror="this.style.display='none'"/>`;
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

  function _renderCard(npcId, bondEntry) {
    const tiers = RT();
    const tier = tiers ? tiers.computeTier(bondEntry) : { id: 'stranger', label: 'Stranger', icon: '🌫️', score: 0, positive: 0, rivalry: 0 };
    const base = DS()?.get?.('characters', npcId) || {};
    const name = base.name || npcId;
    const scorePct = Math.max(0, Math.min(100, Number(tier.score) || 0));
    return `
      <div class="rel-card rel-tier-${_esc(tier.id)}" data-rel-npc="${_esc(npcId)}">
        <div class="rel-card-head">
          ${_portraitHtml(npcId, base)}
          <div class="rel-card-id">
            <div class="rel-card-name">${_esc(name)}</div>
            <div class="rel-card-tier">${_esc(tier.icon)} ${_esc(tier.label)} <span class="rel-card-score">(${tier.score})</span></div>
          </div>
        </div>
        <div class="rel-bar-track"><div class="rel-bar-fill" style="width:${scorePct}%"></div></div>
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
        <h3>No relationships yet</h3>
        <p>As you make choices and complete quests, your bonds with characters here will grow. Check back after meeting someone new.</p>
      </div>`;
  }

  function render(state) {
    if (!state) return '<div class="campaign-panel">No active campaign.</div>';
    const tiers = RT();
    const npcIds = tiers ? tiers.getKnownNpcs(state) : Object.keys(state.bonds || {});

    if (!npcIds.length) {
      return `
        <section class="campaign-panel campaign-relationships-panel">
          <div class="campaign-panel-head">
            <h2>Relationships</h2>
            <span class="campaign-pill">0 known</span>
          </div>
          ${_renderEmpty()}
        </section>`;
    }

    // Sort: rivals first (most striking), then by score descending.
    const sorted = npcIds.slice().sort((a, b) => {
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
            <div class="campaign-muted">How sub-characters and NPCs feel about you. Some choices unlock once a tier is reached.</div>
          </div>
          <span class="campaign-pill">${npcIds.length} known</span>
        </div>
        <div class="rel-grid">
          ${sorted.map((id) => _renderCard(id, state.bonds[id])).join('')}
        </div>
      </section>`;
  }

  return { render };
})();
