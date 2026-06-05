// campaign-tags.ts — Tier 3 TS port of js/campaign/campaign-tags.js (engine
// cluster: campaign). Lightweight campaign tag ledger for story / quest / combat
// echoes: add (with dedupe), resolve / archive / remove, strength changes,
// phase-expiry, and active-tag queries. State-mutating but DOM-free.
// Reads: nothing. Used by: campaign-ops, campaign-conditions, story/quest flows.
//
// Exports `CampaignTags` and installs window.CJS.CampaignTags. Body verbatim
// from the legacy IIFE; the only change is `: any` on the `= {}`-default option
// params (TS infers `{}` and would reject the property reads otherwise).

export const CampaignTags = (() => {
  'use strict';

  function ensure(state) {
    if (!state) return { entries: {} };
    state.tagLedger = state.tagLedger || {};
    state.tagLedger.entries = state.tagLedger.entries || {};
    return state.tagLedger;
  }

  function addTag(state, op: any = {}) {
    const tag = cleanTag(op.tag || op.id);
    if (!state || !tag) return null;
    const ledger = ensure(state);
    const scope = op.scope || op.targetScope || 'campaign';
    const targetType = op.targetType || op.type || null;
    const targetId = op.targetId || op.target || null;
    const dedupe = op.dedupe !== false;
    const existing = dedupe
      ? Object.values<any>(ledger.entries).find((entry) => (
        entry.tag === tag
        && entry.status === 'active'
        && entry.scope === scope
        && (entry.targetType || null) === targetType
        && (entry.targetId || null) === targetId
      ))
      : null;

    const now = new Date().toISOString();
    if (existing) {
      existing.strength = Number(op.strength ?? existing.strength ?? 1);
      existing.note = op.note || existing.note || '';
      existing.updatedAt = now;
      if (op.expires || op.expiresAtPhase != null) {
        existing.expires = op.expires || existing.expires || null;
        existing.expiresAtPhase = op.expiresAtPhase ?? existing.expiresAtPhase ?? null;
      }
      return existing;
    }

    const id = op.entryId || `${scope}_${tag}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    ledger.entries[id] = {
      id,
      tag,
      label: op.label || tag,
      scope,
      targetType,
      targetId,
      status: op.status || 'active',
      strength: Number(op.strength ?? 1),
      source: op.source || 'campaign',
      note: op.note || '',
      createdAt: now,
      updatedAt: now,
      createdAtPhase: state.phase?.number || 1,
      expires: op.expires || null,
      expiresAtPhase: op.expiresAtPhase ?? null
    };
    return ledger.entries[id];
  }

  function resolveTag(state, op: any = {}) {
    return _setStatus(state, op, 'resolved');
  }

  function archiveTag(state, op: any = {}) {
    return _setStatus(state, op, 'archived');
  }

  function removeTag(state, op: any = {}) {
    const ledger = ensure(state);
    const ids = _matchingIds(ledger, op);
    for (const id of ids) delete ledger.entries[id];
    return ids.length;
  }

  function changeStrength(state, op: any = {}) {
    const ledger = ensure(state);
    const delta = Number(op.amount ?? op.delta ?? 0);
    let changed = 0;
    for (const id of _matchingIds(ledger, op)) {
      const entry = ledger.entries[id];
      entry.strength = Math.max(0, Number(entry.strength || 0) + delta);
      entry.updatedAt = new Date().toISOString();
      changed += 1;
    }
    return changed;
  }

  function expirePhaseTags(state) {
    const ledger = ensure(state);
    const phase = Number(state?.phase?.number || 1);
    const expired = [];
    for (const entry of Object.values<any>(ledger.entries)) {
      if (entry.status !== 'active') continue;
      if (entry.expires === 'phase' || (entry.expiresAtPhase != null && Number(entry.expiresAtPhase) <= phase)) {
        entry.status = 'expired';
        entry.updatedAt = new Date().toISOString();
        expired.push(entry);
      }
    }
    return expired;
  }

  function getActiveTags(state, filter: any = {}) {
    return Object.values<any>(ensure(state).entries).filter((entry) => (
      entry.status === 'active'
      && (!filter.scope || entry.scope === filter.scope)
      && (!filter.targetType || entry.targetType === filter.targetType)
      && (!filter.targetId || entry.targetId === filter.targetId)
    ));
  }

  function hasTag(state, tag, filter: any = {}) {
    const wanted = cleanTag(tag);
    return !!wanted && getActiveTags(state, filter).some((entry) => entry.tag === wanted);
  }

  function tagSet(state, filter: any = {}) {
    return new Set(getActiveTags(state, filter).map((entry) => entry.tag));
  }

  function cleanTag(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_:-]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function _setStatus(state, op: any = {}, status) {
    const ledger = ensure(state);
    const ids = _matchingIds(ledger, op);
    const now = new Date().toISOString();
    for (const id of ids) {
      ledger.entries[id].status = status;
      ledger.entries[id].updatedAt = now;
      if (op.note) ledger.entries[id].note = op.note;
    }
    return ids.length;
  }

  function _matchingIds(ledger, op: any = {}) {
    const direct = op.entryId || op.ledgerId;
    if (direct && ledger.entries[direct]) return [direct];
    const tag = cleanTag(op.tag || op.id);
    const scope = op.scope || op.targetScope || null;
    const targetType = op.targetType || op.type || null;
    const targetId = op.targetId || op.target || null;
    return Object.values<any>(ledger.entries)
      .filter((entry) => (
        (!tag || entry.tag === tag)
        && (!scope || entry.scope === scope)
        && (!targetType || entry.targetType === targetType)
        && (!targetId || entry.targetId === targetId)
        && (op.includeInactive || entry.status === 'active')
      ))
      .map((entry) => entry.id);
  }

  return Object.freeze({
    ensure,
    addTag,
    resolveTag,
    archiveTag,
    removeTag,
    changeStrength,
    expirePhaseTags,
    getActiveTags,
    hasTag,
    tagSet,
    cleanTag
  });
})();

// Runtime compatibility install — identical to the legacy IIFE.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.CampaignTags = CampaignTags;
