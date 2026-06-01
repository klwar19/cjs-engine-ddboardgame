// relationships-tab.js
// Campaign relationship UI. Player-facing social stats are intentionally
// simple: trust, respect, and romance for eligible characters.

window.CJS = window.CJS || {};

window.CJS.RelationshipsTab = (() => {
  'use strict';

  const RT = () => window.CJS.RelationshipTiers;
  const DS = () => window.CJS.DataStore;
  const Cond = () => window.CJS.CampaignConditions;
  const Seq = () => window.CJS.CampaignSequences;

  const ACTIVITIES = [
    { id: 'hang_out', label: 'Trust', icon: 'T', hint: '+1 trust', bondField: 'trust' },
    { id: 'train', label: 'Respect', icon: 'R', hint: '+1 respect', bondField: 'respect' },
    { id: 'romance', label: 'Romance', icon: 'H', hint: '+1 romance', bondField: 'romance', requiresRomance: true }
  ];

  const LEGACY_RESPECT_FIELDS = ['friendship', 'empathy', 'confidence', 'morale', 'value'];

  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function _portraitHtml(charId, base) {
    const portrait = base?.portrait || '';
    const icon = base?.icon || (base?.name || charId || '?').slice(0, 1).toUpperCase();
    if (portrait) {
      return `<img class="rel-portrait" src="${_esc(portrait)}" alt="${_esc(base?.name || charId)}" onerror="this.style.display='none'"/>`;
    }
    return `<div class="rel-portrait rel-portrait-fallback" aria-hidden="true">${_esc(icon)}</div>`;
  }

  function _isRomanceEligible(charId, base = {}) {
    const tags = (base.tags || []).map((tag) => String(tag || '').toLowerCase());
    return !!(
      base.romanceEligible
      || base.relationship?.romanceEligible
      || tags.includes('romanceable')
      || tags.includes('romance')
    );
  }

  function _simpleStats(bondEntry = {}, base = {}) {
    const trust = Number(bondEntry.trust || 0);
    const respect = Number(bondEntry.respect || 0)
      + LEGACY_RESPECT_FIELDS.reduce((sum, field) => sum + Number(bondEntry[field] || 0), 0);
    const romance = Number(bondEntry.romance || 0);
    const out = [
      { id: 'trust', label: 'Trust', value: trust },
      { id: 'respect', label: 'Respect', value: respect }
    ];
    if (_isRomanceEligible(base.id, base) || romance > 0) {
      out.push({ id: 'romance', label: 'Romance', value: romance });
    }
    return out;
  }

  function _simpleValue(bondEntry = {}, field = 'trust', base = {}) {
    const stats = _simpleStats(bondEntry, base);
    return Number(stats.find((entry) => entry.id === field)?.value || bondEntry[field] || 0);
  }

  function _fieldsBreakdown(bondEntry, base) {
    const stats = _simpleStats(bondEntry || {}, base || {});
    if (!stats.some((entry) => entry.value)) return '<div class="rel-fields-empty">No interactions yet.</div>';
    return `
      <div class="rel-stats">
        ${stats.map((entry) => `
          <div class="rel-stat">
            <span>${_esc(entry.label)}</span>
            <strong>${_esc(entry.value)}</strong>
          </div>
        `).join('')}
      </div>`;
  }

  function _storedFieldsBreakdown(bondEntry) {
    if (!bondEntry) return '';
    const fields = Object.entries(bondEntry)
      .filter(([k]) => !k.startsWith('_'))
      .sort(([a], [b]) => a.localeCompare(b));
    if (!fields.length) return '<div class="rel-fields-empty">No stored values yet.</div>';
    return `
      <ul class="rel-fields">
        ${fields.map(([k, v]) => `
          <li><span class="rel-field-name">${_esc(k)}</span><span class="rel-field-val">${_esc(v)}</span></li>
        `).join('')}
      </ul>`;
  }

  function _activityButtons(charId, actsRemaining, base) {
    const noActs = actsRemaining <= 0;
    const romanceEligible = _isRomanceEligible(charId, base);
    return `
      <div class="rel-activities">
        <div class="rel-activities-head">
          <strong>Spend an Act</strong>
          <span class="rel-acts-pill">${actsRemaining} act${actsRemaining === 1 ? '' : 's'} left</span>
        </div>
        <div class="rel-activity-grid">
          ${ACTIVITIES.map((a) => {
            const blocked = noActs || (a.requiresRomance && !romanceEligible);
            const title = a.requiresRomance && !romanceEligible
              ? 'Romance is not available for this character'
              : `${a.hint} with this character`;
            return `
              <button class="rel-activity-btn"
                      data-rel-activity-character="${_esc(charId)}"
                      data-rel-activity-id="${_esc(a.id)}"
                      title="${_esc(title)}"
                      ${blocked ? 'disabled' : ''}>
                <span class="rel-activity-icon" aria-hidden="true">${_esc(a.icon)}</span>
                <span class="rel-activity-label">${_esc(a.label)}</span>
                <span class="rel-activity-hint">${_esc(a.hint)}</span>
              </button>
            `;
          }).join('')}
        </div>
      </div>`;
  }

  function _relationshipEventsFor(charId, state, bondEntry, base) {
    const seq = Seq();
    const entries = seq?.list?.('event', state?.currentWorld) || [];
    const name = String(base?.name || charId || '').toLowerCase();
    const idNeedles = new Set([charId, base?.id, name].filter(Boolean).map((value) => String(value).toLowerCase()));
    return entries
      .filter((entry) => {
        const rel = entry.relationship || {};
        const tags = (entry.tags || []).map((tag) => String(tag || '').toLowerCase());
        if (rel.characterId && String(rel.characterId).toLowerCase() === String(charId).toLowerCase()) return true;
        if (tags.includes('character_event') && Array.from(idNeedles).some((needle) => tags.includes(needle))) return true;
        return Array.from(idNeedles).some((needle) => String(entry.id || '').toLowerCase().includes(needle));
      })
      .map((entry) => _eventViewModel(entry, state, bondEntry, base))
      .sort((a, b) => Number(b.completed) - Number(a.completed) || Number(b.unlocked) - Number(a.unlocked) || a.threshold - b.threshold);
  }

  function _eventViewModel(entry, state, bondEntry, base) {
    const rel = entry.relationship || {};
    const field = rel.field || 'trust';
    const threshold = Number(rel.threshold ?? rel.min ?? 1);
    const value = _simpleValue(bondEntry, field, base);
    const conditions = rel.conditions || entry.conditions || null;
    const result = conditions ? Cond()?.evaluate?.(conditions, state, { characterId: base.id, tags: entry.tags || [] }) : { ok: true, blockers: [] };
    const completed = _sequenceCompleted(state, entry.id);
    const deliveryBlocked = !!entry.deliveryStatus && entry.deliveryStatus !== 'ready';
    return {
      id: entry.id,
      title: entry.title || entry.id,
      summary: rel.summary || entry.summary?.short || entry.summary?.default || '',
      field,
      threshold,
      value,
      bonus: rel.bonus || '',
      completed,
      unlocked: !completed && !deliveryBlocked && !!entry.file && value >= threshold && result?.ok !== false,
      blocked: deliveryBlocked || value < threshold || result?.ok === false,
      blockers: deliveryBlocked ? [entry.deliveryNote || 'Coming soon.'] : (result?.blockers || []),
      deliveryBlocked
    };
  }

  function _sequenceCompleted(state, sequenceId) {
    const history = state?.sequenceRuntime?.history || [];
    const eventLog = state?.eventLog?.entries || [];
    return history.some((entry) => entry.sequenceId === sequenceId)
      || eventLog.some((entry) => entry.relatedId === sequenceId);
  }

  function _eventsSection(charId, state, bondEntry, base) {
    const events = _relationshipEventsFor(charId, state, bondEntry || {}, base || {});
    if (!events.length) return '';
    return `
      <div class="rel-events">
        <div class="rel-events-head">Character Events</div>
        ${events.map((event) => `
          <div class="rel-event-card ${event.completed ? 'is-complete' : event.unlocked ? 'is-unlocked' : 'is-locked'}">
            <div>
              <strong>${_esc(event.title)}</strong>
              <span>${_esc(_eventStatusText(event))}</span>
            </div>
            ${event.unlocked
              ? `<button class="campaign-action primary" data-sequence-start-id="${_esc(event.id)}">Start</button>`
              : `<span class="campaign-pill">${event.completed ? 'Done' : 'Locked'}</span>`}
          </div>
        `).join('')}
      </div>`;
  }

  function _eventStatusText(event) {
    if (event.completed) return event.bonus ? `Done. Bonus: ${event.bonus}` : 'Done.';
    if (event.unlocked) return event.bonus ? `Ready. Bonus: ${event.bonus}` : 'Ready.';
    if (event.value < event.threshold) return `Needs ${event.field} ${event.threshold} (${event.value}/${event.threshold}).`;
    return (event.blockers || []).join(' ') || 'Locked.';
  }

  function _renderCard(charId, bondEntry, actsRemaining, state) {
    const base = DS()?.get?.('characters', charId) || { id: charId };
    base.id = base.id || charId;
    const tiers = RT();
    const tier = tiers
      ? tiers.computeTier(bondEntry)
      : { id: 'stranger', label: 'Stranger', icon: '', score: 0, positive: 0, rivalry: 0 };
    const name = base.name || charId;
    const scorePct = Math.max(0, Math.min(100, Number(tier.score) || 0));
    return `
      <div class="rel-card rel-tier-${_esc(tier.id)}" data-rel-character="${_esc(charId)}">
        <div class="rel-card-head">
          ${_portraitHtml(charId, base)}
          <div class="rel-card-id">
            <div class="rel-card-name">${_esc(name)}</div>
            <div class="rel-card-tier">${_esc(tier.icon || '')} ${_esc(tier.label)} <span class="rel-card-score">(${tier.score})</span></div>
          </div>
        </div>
        <div class="rel-bar-track"><div class="rel-bar-fill" style="width:${scorePct}%"></div></div>
        ${_fieldsBreakdown(bondEntry, base)}
        ${_activityButtons(charId, actsRemaining, base)}
        ${_eventsSection(charId, state, bondEntry, base)}
        <details class="rel-card-detail">
          <summary>Stored values</summary>
          ${_storedFieldsBreakdown(bondEntry)}
        </details>
      </div>`;
  }

  function _renderEmpty() {
    return `
      <div class="rel-empty">
        <div class="rel-empty-icon">?</div>
        <h3>No characters known yet</h3>
        <p>Characters appear here after story scenes, quests, or manual bond changes. Spend Acts to build trust, respect, or romance when a character is eligible.</p>
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
            Acts refresh when you Pass Phase. Relationship buttons now build trust, respect, or eligible romance.
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
    if (found) return found.label;
    if (id === 'listen') return 'Trust';
    if (id === 'help_task') return 'Respect';
    return id || 'Activity';
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
            <div class="campaign-muted">Simple social bonds. Higher trust, respect, or romance can unlock character events.</div>
          </div>
          <span class="campaign-pill">${charIds.length} known</span>
        </div>
        ${_renderActsSummary(state)}
        <div class="rel-grid">
          ${sorted.map((id) => _renderCard(id, state.bonds[id], actsRemaining, state)).join('')}
        </div>
      </section>`;
  }

  return { render, ACTIVITIES };
})();
