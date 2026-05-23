// pocket-haven-facilities.js
// Buildable Pocket Haven facilities: Training Ground, Advanced Craft
// Bench, Ranch. Each facility lives on the campaign save as a record
// inside `state.pocketHaven.facilities[id]`. Build costs and per-use
// limits are authored in the pocket_haven_rules data file; runtime
// state (level, usesRemaining, etc.) is per-save.
//
// Facilities expose a small set of operations that the campaign-ops
// dispatcher and the Pocket Haven UI call into:
//
//   build_facility       (state, op)        → unlock a facility for cost
//   upgrade_facility     (state, op)        → raise its level for cost
//   train_skill          (state, op)        → spend a daily slot to AP a skill
//   ranch_assign         (state, op)        → assign a beast to the ranch
//   ranch_collect        (state)            → collect daily output
//
// Daily limits are tracked per-phase: every phase pass resets the
// `usesRemaining` for each facility to its rule-defined daily cap.

window.CJS = window.CJS || {};

window.CJS.PocketHavenFacilities = (() => {
  'use strict';

  const CS = () => window.CJS.CampaignState;
  const DS = () => window.CJS.DataStore;
  const Ops = () => window.CJS.CampaignOps;

  // Default facility catalog. World/campaign authors can extend these
  // via pocket_haven_rules.facilities[] (see data file).
  const DEFAULT_CATALOG = Object.freeze({
    training_ground: {
      id: 'training_ground',
      name: 'Training Ground',
      icon: '⚔️',
      kind: 'training',
      category: 'combat',
      maxLevel: 3,
      buildCost: { currencies: { gold: 250, jp: 30 }, materials: { haven_iron_ingot: 4 } },
      upgradeCost: [
        { currencies: { gold: 500, jp: 60 }, materials: { haven_iron_ingot: 8 } },
        { currencies: { gold: 1000, jp: 120 }, materials: { haven_iron_ingot: 16, haven_memory_shard: 3 } }
      ],
      perPhaseUses: 2,
      perUseAp: 4,
      apPerLevel: 2,
      description: 'A reinforced sparring yard. Spend a daily slot to grant AP to one party member’s combat skill.',
      summary: 'Train one combat skill per slot · +AP per use.'
    },
    advanced_craft: {
      id: 'advanced_craft',
      name: 'Advanced Crafting Bench',
      icon: '🛠️',
      kind: 'craft',
      category: 'craft',
      maxLevel: 3,
      buildCost: { currencies: { gold: 320, jp: 40 }, materials: { haven_iron_ingot: 6, haven_sprite_dust: 4 } },
      upgradeCost: [
        { currencies: { gold: 640, jp: 80 }, materials: { haven_iron_ingot: 10, haven_sprite_dust: 8 } },
        { currencies: { gold: 1280, jp: 160 }, materials: { haven_iron_ingot: 18, haven_memory_shard: 4 } }
      ],
      perPhaseUses: 3,
      unlocksRecipeTier: 2,
      unlocksRecipeTierPerLevel: 1,
      description: 'A reinforced workbench with master tools. Unlocks higher-tier recipes and grants a craft-yield bonus.',
      summary: 'Unlocks higher-tier recipes · +craft yield.'
    },
    ranch: {
      id: 'ranch',
      name: 'Ranch',
      icon: '🐄',
      kind: 'ranch',
      category: 'production',
      maxLevel: 3,
      buildCost: { currencies: { gold: 200, jp: 20 }, materials: { haven_wolf_pelt: 2 } },
      upgradeCost: [
        { currencies: { gold: 400, jp: 50 }, materials: { haven_wolf_pelt: 4, haven_ice_crystal: 3 } },
        { currencies: { gold: 800, jp: 100 }, materials: { haven_wolf_pelt: 8, haven_memory_shard: 2 } }
      ],
      perPhaseUses: 1,
      capacity: 2,
      capacityPerLevel: 1,
      dailyMilkBucket: 'food',
      dailyOutputs: [
        { bucket: 'food', id: 'food_fresh_milk', qty: 1 },
        { bucket: 'materials', id: 'haven_wolf_pelt', qty: 0 }
      ],
      description: 'Pens for tamed beasts. Each phase the ranch yields food and rare materials per assigned beast.',
      summary: 'Assign beasts · daily food + materials.'
    }
  });

  // ── PUBLIC API ─────────────────────────────────────────────────────
  function getCatalog() {
    const fromRule = _ruleCatalog();
    if (fromRule && Object.keys(fromRule).length) return fromRule;
    return DEFAULT_CATALOG;
  }

  function getFacilityDef(id) {
    const catalog = getCatalog();
    return catalog[id] || DEFAULT_CATALOG[id] || null;
  }

  function listFacilities() {
    const catalog = getCatalog();
    return Object.values(catalog).map((f) => ({ ...f }));
  }

  // State accessors — `ensureState` normalizes a fresh facilities map.
  function ensureState(state) {
    state.pocketHaven = state.pocketHaven || { enabled: true };
    state.pocketHaven.facilities = state.pocketHaven.facilities || {};
    return state.pocketHaven.facilities;
  }

  function getInstance(state, id) {
    return ensureState(state)[id] || null;
  }

  function isBuilt(state, id) {
    return !!getInstance(state, id);
  }

  // build_facility — pay cost, create instance at level 1.
  function build(state, op = {}, opsApply = null) {
    const id = op.facilityId || op.id;
    const def = getFacilityDef(id);
    if (!def) return { ok: false, reason: 'unknown_facility' };
    if (isBuilt(state, id)) return { ok: false, reason: 'already_built' };
    const cost = _costBundle(def.buildCost);
    if (!_hasBundle(state, cost)) return { ok: false, reason: 'cannot_afford' };
    _consumeBundle(state, cost);
    ensureState(state)[id] = _freshInstance(def);
    return { ok: true, id, def };
  }

  // upgrade_facility — pay tiered cost, bump level.
  function upgrade(state, op = {}) {
    const id = op.facilityId || op.id;
    const inst = getInstance(state, id);
    const def = getFacilityDef(id);
    if (!inst || !def) return { ok: false, reason: 'not_built' };
    const nextLevel = (inst.level || 1) + 1;
    if (nextLevel > (def.maxLevel || 1)) return { ok: false, reason: 'max_level' };
    const upgradeCosts = Array.isArray(def.upgradeCost) ? def.upgradeCost : [def.upgradeCost];
    const costIdx = nextLevel - 2; // upgradeCost[0] = level 1 → 2
    const cost = _costBundle(upgradeCosts[costIdx] || upgradeCosts[upgradeCosts.length - 1] || {});
    if (!_hasBundle(state, cost)) return { ok: false, reason: 'cannot_afford' };
    _consumeBundle(state, cost);
    inst.level = nextLevel;
    // Per-level perks: usage allotment and capacity grow.
    if (def.perPhaseUses) inst.usesRemaining = (inst.usesRemaining || def.perPhaseUses) + 1;
    if (def.capacityPerLevel) inst.capacity = (inst.capacity || def.capacity || 1) + def.capacityPerLevel;
    return { ok: true, id, level: nextLevel };
  }

  // train_skill — spend a daily slot to grant AP to a skill.
  // op: { memberId, skillId, facilityId? }
  function trainSkill(state, op = {}) {
    const id = op.facilityId || 'training_ground';
    const inst = getInstance(state, id);
    const def = getFacilityDef(id);
    if (!inst || !def) return { ok: false, reason: 'not_built' };
    if ((inst.usesRemaining || 0) <= 0) return { ok: false, reason: 'no_uses_remaining' };
    const memberId = op.memberId || op.target;
    const skillId = op.skillId;
    if (!memberId || !skillId) return { ok: false, reason: 'missing_target' };
    const member = state.party?.[memberId];
    if (!member) return { ok: false, reason: 'unknown_member' };
    // AP per use scales with level.
    const apPerUse = (def.perUseAp || 4) + Math.max(0, (inst.level - 1) * (def.apPerLevel || 2));
    inst.usesRemaining = Math.max(0, (inst.usesRemaining || 0) - 1);
    inst.lastTrainedAt = new Date().toISOString();
    return { ok: true, apGranted: apPerUse, memberId, skillId };
  }

  // ranch_assign — put a beast id into the ranch.
  function ranchAssign(state, op = {}) {
    const inst = getInstance(state, 'ranch');
    const def = getFacilityDef('ranch');
    if (!inst || !def) return { ok: false, reason: 'not_built' };
    const capacity = (inst.capacity || def.capacity || 1);
    inst.assigned = inst.assigned || [];
    if (inst.assigned.length >= capacity) return { ok: false, reason: 'capacity_full' };
    if (!op.beastId) return { ok: false, reason: 'missing_beast' };
    if (inst.assigned.includes(op.beastId)) return { ok: false, reason: 'already_assigned' };
    inst.assigned.push(op.beastId);
    return { ok: true, beastId: op.beastId, slotsRemaining: capacity - inst.assigned.length };
  }

  function ranchRelease(state, op = {}) {
    const inst = getInstance(state, 'ranch');
    if (!inst) return { ok: false, reason: 'not_built' };
    if (!op.beastId) return { ok: false, reason: 'missing_beast' };
    const before = (inst.assigned || []).length;
    inst.assigned = (inst.assigned || []).filter((id) => id !== op.beastId);
    return { ok: before !== inst.assigned.length, beastId: op.beastId };
  }

  // ranch_collect — collect today's output (one phase per collect).
  function ranchCollect(state) {
    const inst = getInstance(state, 'ranch');
    const def = getFacilityDef('ranch');
    if (!inst || !def) return { ok: false, reason: 'not_built' };
    if ((inst.usesRemaining || 0) <= 0) return { ok: false, reason: 'already_collected' };
    const assigned = inst.assigned || [];
    if (!assigned.length) return { ok: false, reason: 'no_beasts' };
    inst.usesRemaining = 0;
    const outputs = [];
    for (const beastId of assigned) {
      // Each beast gets the base outputs scaled by ranch level. Authors
      // can extend with beast-specific output records on the monster.
      const beast = DS().get('monsters', beastId);
      const beastOuts = beast?.ranchOutputs || def.dailyOutputs || [];
      for (const out of beastOuts) {
        const qty = Math.max(0, Number(out.qty || 0)) * (inst.level || 1);
        if (qty <= 0) continue;
        outputs.push({ bucket: out.bucket, id: out.id, qty });
      }
    }
    return { ok: true, outputs };
  }

  // Refresh per-phase usage allotments. Called by passPhase.
  function refreshDailyUses(state) {
    const map = ensureState(state);
    for (const id of Object.keys(map)) {
      const def = getFacilityDef(id);
      if (!def) continue;
      // Base + a small bonus per level above 1, so an upgraded
      // facility lets a player do more per phase.
      const base = Number(def.perPhaseUses || 1);
      const bonus = Math.max(0, (map[id].level || 1) - 1);
      map[id].usesRemaining = base + bonus;
    }
  }

  // ── HELPERS ────────────────────────────────────────────────────────
  function _freshInstance(def) {
    return {
      id: def.id,
      kind: def.kind,
      level: 1,
      usesRemaining: Number(def.perPhaseUses || 1),
      capacity: Number(def.capacity || 0),
      assigned: [],
      builtAt: new Date().toISOString(),
      lastTrainedAt: null
    };
  }

  function _ruleCatalog() {
    const all = DS().getAllAsArray('pocketHavenRules') || [];
    const rule = all[0];
    if (!rule || !Array.isArray(rule.facilities)) return null;
    const map = {};
    for (const f of rule.facilities) {
      if (!f || !f.id) continue;
      map[f.id] = { ...(DEFAULT_CATALOG[f.id] || {}), ...f };
    }
    return map;
  }

  function _costBundle(input = {}) {
    return {
      currencies: input.currencies || {},
      items: input.items || {},
      materials: input.materials || {},
      food: input.food || {}
    };
  }

  function _hasBundle(state, bundle) {
    for (const [id, qty] of Object.entries(bundle.currencies || {})) {
      if ((state.currencies?.[id] || 0) < Number(qty || 0)) return false;
    }
    for (const bucket of ['items', 'materials', 'food']) {
      for (const [id, qty] of Object.entries(bundle[bucket] || {})) {
        if ((state.inventory?.[bucket]?.[id] || 0) < Number(qty || 0)) return false;
      }
    }
    return true;
  }

  function _consumeBundle(state, bundle) {
    for (const [id, qty] of Object.entries(bundle.currencies || {})) {
      state.currencies[id] = Math.max(0, (state.currencies[id] || 0) - Number(qty || 0));
    }
    for (const bucket of ['items', 'materials', 'food']) {
      for (const [id, qty] of Object.entries(bundle[bucket] || {})) {
        if (!state.inventory) state.inventory = {};
        if (!state.inventory[bucket]) state.inventory[bucket] = {};
        state.inventory[bucket][id] = Math.max(0, (state.inventory[bucket][id] || 0) - Number(qty || 0));
      }
    }
  }

  function describeCost(bundle = {}) {
    const parts = [];
    for (const [id, qty] of Object.entries(bundle.currencies || {})) parts.push(`${qty} ${id}`);
    for (const bucket of ['items', 'materials', 'food']) {
      for (const [id, qty] of Object.entries(bundle[bucket] || {})) {
        const def = DS().get(bucket, id);
        parts.push(`${qty} ${def?.name || id}`);
      }
    }
    return parts.join(' · ') || 'no cost';
  }

  return Object.freeze({
    getCatalog,
    getFacilityDef,
    listFacilities,
    ensureState,
    getInstance,
    isBuilt,
    build,
    upgrade,
    trainSkill,
    ranchAssign,
    ranchRelease,
    ranchCollect,
    refreshDailyUses,
    describeCost,
    DEFAULT_CATALOG
  });
})();
