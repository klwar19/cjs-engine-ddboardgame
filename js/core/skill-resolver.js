// skill-resolver.js
// Single shared helper for skill reference normalization and resolution.
// Every consumer (editor, validator, compiler, UI, AI, action-handler)
// must use these helpers instead of ad-hoc logic.
//
// Canonical skill reference shape:
//   { skillId: "firebolt", overrides: { power: 24, range: 3 }, level: 4 }
//
// Backward-compatible: bare string "firebolt" normalizes to
//   { skillId: "firebolt", overrides: {}, level: 1 }
//
// Used by: stat-compiler, action-handler, combat-ui, ai-controller,
//          data-store (validate), char-editor, monster-editor
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.SkillResolver = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;

  // ── NORMALIZE ─────────────────────────────────────────────────────
  // Convert any skill reference format to the canonical object form.
  // Input: "firebolt" | { skillId: "firebolt", overrides?: {...}, level?: N }
  // Output: { skillId: "firebolt", overrides: {}, level: 1 }
  function normalize(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') {
      return { skillId: entry, overrides: {}, level: 1 };
    }
    if (typeof entry === 'object' && entry.skillId) {
      return {
        skillId: entry.skillId,
        overrides: entry.overrides || {},
        level: entry.level || 1
      };
    }
    console.warn('SkillResolver.normalize: unrecognized skill ref:', entry);
    return null;
  }

  // ── NORMALIZE ARRAY ───────────────────────────────────────────────
  function normalizeArray(skills) {
    if (!Array.isArray(skills)) return [];
    return skills.map(normalize).filter(Boolean);
  }

  // ── GET SKILL ID ──────────────────────────────────────────────────
  // Extract the skillId from any format (string or object).
  function getSkillId(entry) {
    if (!entry) return null;
    if (typeof entry === 'string') return entry;
    return entry.skillId || null;
  }

  // ── GET SKILL IDS ─────────────────────────────────────────────────
  function getSkillIds(skills) {
    if (!Array.isArray(skills)) return [];
    return skills.map(getSkillId).filter(Boolean);
  }

  // ── RESOLVE UNIT SKILL ────────────────────────────────────────────
  // Given a unit and a skillId, look up the base skill from DataStore,
  // merge per-unit overrides + level, return the fully resolved skill object.
  // Returns null if the skill doesn't exist in DataStore.
  function resolveUnitSkill(unit, skillId) {
    const base = DS().get('skills', skillId);
    if (!base) return null;

    const entry = _findEntry(unit, skillId);
    const overrides = entry?.overrides || {};
    const level = entry?.level || 1;

    // Merge: base + overrides, preserving base id
    return { ...base, ...overrides, id: base.id, level };
  }

  // ── RESOLVE ALL ───────────────────────────────────────────────────
  function resolveAllUnitSkills(unit) {
    const results = [];
    for (const raw of (unit.skills || [])) {
      const skillId = getSkillId(raw);
      if (!skillId) continue;
      const resolved = resolveUnitSkill(unit, skillId);
      if (!resolved) continue;
      results.push({ skillId, entry: normalize(raw), resolved });
    }
    return results;
  }

  // ── FIND ENTRY ────────────────────────────────────────────────────
  function _findEntry(unit, skillId) {
    for (const entry of (unit.skills || [])) {
      if (typeof entry === 'string' && entry === skillId) {
        return { skillId, overrides: {}, level: 1 };
      }
      if (typeof entry === 'object' && entry.skillId === skillId) {
        return entry;
      }
    }
    return null;
  }

  // ── HAS SKILL ─────────────────────────────────────────────────────
  function hasSkill(unit, skillId) {
    return !!_findEntry(unit, skillId);
  }

  // ── MERGE WITH GRANTED SKILLS ─────────────────────────────────────
  // Merge base unit skills + item-granted skills. Preserves overrides/level.
  // Returns normalized array (no duplicates by skillId).
  function mergeWithGrantedSkills(baseSkills, equipmentIds) {
    const seen = new Map(); // skillId → normalized entry

    for (const raw of (baseSkills || [])) {
      const norm = normalize(raw);
      if (norm && !seen.has(norm.skillId)) {
        seen.set(norm.skillId, norm);
      }
    }

    for (const itemId of (equipmentIds || [])) {
      const item = DS().get('items', itemId);
      if (item?.grantedSkills) {
        for (const sid of item.grantedSkills) {
          const id = getSkillId(sid);
          if (id && !seen.has(id)) {
            seen.set(id, normalize(sid));
          }
        }
      }
    }

    return Array.from(seen.values());
  }

  return Object.freeze({
    normalize,
    normalizeArray,
    getSkillId,
    getSkillIds,
    resolveUnitSkill,
    resolveAllUnitSkills,
    hasSkill,
    mergeWithGrantedSkills
  });
})();
