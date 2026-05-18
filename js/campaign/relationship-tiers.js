// relationship-tiers.js
// Reads existing state.bonds entries and maps them to display tiers.
// The bond store (state.bonds[characterId][field]) is owned by campaign-ops;
// this is a pure read-only helper for UI and condition checks.
//
// Tier mapping (default):
//   score < 10    → stranger
//   10–24         → acquaintance
//   25–49         → friend
//   50–74         → close
//   ≥ 75          → bonded
//   rivalry ≥ 25 AND rivalry > positive sum → rival
//
// Score = trust + friendship + empathy + confidence + morale + value − rivalry.
//
// Reads: nothing (pure)
// Used by: relationships-tab.js (UI), campaign-conditions.js (tierMin)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.RelationshipTiers = (() => {
  'use strict';

  const SIMPLE_FIELDS = ['trust', 'respect', 'romance'];
  const LEGACY_POSITIVE_FIELDS = ['friendship', 'empathy', 'confidence', 'morale', 'value'];
  const POSITIVE_FIELDS = [...SIMPLE_FIELDS, ...LEGACY_POSITIVE_FIELDS];
  const NEGATIVE_FIELDS = ['rivalry'];

  const TIERS = [
    { id: 'stranger',     label: 'Stranger',     icon: '🌫️', min: -Infinity, max: 9 },
    { id: 'acquaintance', label: 'Acquaintance', icon: '👋', min: 10,        max: 24 },
    { id: 'friend',       label: 'Friend',       icon: '🤝', min: 25,        max: 49 },
    { id: 'close',        label: 'Close',        icon: '💞', min: 50,        max: 74 },
    { id: 'bonded',       label: 'Bonded',       icon: '💖', min: 75,        max: Infinity }
  ];

  const RIVAL_TIER = { id: 'rival', label: 'Rival', icon: '⚔️' };
  const TIER_ORDER = ['stranger', 'acquaintance', 'friend', 'close', 'bonded'];

  function _scoreOf(bondEntry) {
    if (!bondEntry || typeof bondEntry !== 'object') return { positive: 0, rivalry: 0, score: 0 };
    let positive = 0;
    for (const k of POSITIVE_FIELDS) positive += Number(bondEntry[k] || 0);
    let rivalry = 0;
    for (const k of NEGATIVE_FIELDS) rivalry += Number(bondEntry[k] || 0);
    return { positive, rivalry, score: positive - rivalry };
  }

  function computeTier(bondEntry) {
    const { positive, rivalry, score } = _scoreOf(bondEntry);
    if (rivalry >= 25 && rivalry > positive) {
      return { ...RIVAL_TIER, score, positive, rivalry };
    }
    const tier = TIERS.find((t) => score >= t.min && score <= t.max) || TIERS[0];
    return { id: tier.id, label: tier.label, icon: tier.icon, score, positive, rivalry };
  }

  // Returns true if the bond's tier is at least `tierId` (rival is special).
  function meetsTier(bondEntry, tierId) {
    if (!tierId) return true;
    const t = computeTier(bondEntry);
    if (tierId === 'rival') return t.id === 'rival';
    const havePos = TIER_ORDER.indexOf(t.id);
    const wantPos = TIER_ORDER.indexOf(tierId);
    if (havePos < 0 || wantPos < 0) return false;
    return havePos >= wantPos;
  }

  function getKnownCharacters(state) {
    const bonds = state?.bonds || {};
    return Object.keys(bonds);
  }

  function listTiers() {
    return [...TIERS, RIVAL_TIER];
  }

  return {
    computeTier,
    meetsTier,
    getKnownCharacters,
    // Backwards-compat alias for older tests / call sites that used the
    // legacy NPC-flavored name.
    getKnownNpcs: getKnownCharacters,
    listTiers,
    SIMPLE_FIELDS,
    LEGACY_POSITIVE_FIELDS,
    POSITIVE_FIELDS,
    NEGATIVE_FIELDS
  };
})();
