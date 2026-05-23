// enemy-modifiers.js
// Procedural prefix modifiers for normal monsters. Adds Diablo-style
// variety: a base "Wolf" can spawn as "Frozen Wolf" (ice aura), "Rabid
// Wolf" (attacks twice, takes more damage), or "Alpha Wolf" (buffs
// nearby allies). Boss / mid-boss tiers are skipped — they already
// carry authored kits and shouldn't randomize.
//
// Modifiers are applied at unit-compile time. They modify the baseUnit
// record in-place (additive to existing fields) BEFORE stat-compiler
// runs, so derived stats / HP / MP all account for the bonus.
//
// Context-aware: each prefix may declare biomes/elements/tags it suits,
// so a Frozen modifier won't appear on a Fire elemental.
//
// Reads:  data-store (for monster lookups), constants
// Used by: combat-manager (StatCompiler entry point), encounter-runner
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.EnemyModifiers = (() => {
  'use strict';

  // Each modifier is a small, self-contained recipe. `weight` controls
  // base spawn chance; `suits` returns true if the modifier fits the
  // given context (biome, base element, tags). `apply` mutates a copy
  // of the baseUnit and returns the modified record.
  const MODIFIERS = {
    frozen: {
      id: 'frozen',
      label: 'Frozen',
      icon: '❄️',
      weight: 1.0,
      summary: 'Ice aura, slows attackers.',
      suits(ctx) {
        const elem = String(ctx.element || '').toLowerCase();
        if (elem === 'fire') return false;
        const biome = String(ctx.biome || '').toLowerCase();
        return biome.includes('ice') || biome.includes('frost')
          || biome.includes('mountain') || biome.includes('tundra')
          || ctx.tags?.includes('cold') || elem === 'ice' || elem === 'water'
          || !biome; // generic worlds still allow it
      },
      apply(unit) {
        unit.name = unit.name ? `Frozen ${unit.name}` : 'Frozen';
        unit.resist = _mergeUnique(unit.resist || [], ['Ice']);
        unit.weak = _mergeUnique(unit.weak || [], ['Fire']);
        unit.element = unit.element || 'Ice';
        // Slightly tougher; deals ice splash through a passive ref.
        unit.stats = _bumpStats(unit.stats, { E: 1 });
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_frozen_aura']);
        return unit;
      }
    },
    rabid: {
      id: 'rabid',
      label: 'Rabid',
      icon: '🦷',
      weight: 0.85,
      summary: 'Attacks twice, takes more damage.',
      suits(ctx) {
        // Avoid on undead / construct / divine types — rabid implies
        // a living beast.
        const type = String(ctx.type || '').toLowerCase();
        if (['undead', 'construct', 'spirit', 'divine'].includes(type)) return false;
        return true;
      },
      apply(unit) {
        unit.name = unit.name ? `Rabid ${unit.name}` : 'Rabid';
        unit.stats = _bumpStats(unit.stats, { S: 1, A: 1 });
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_rabid_doublestrike']);
        // Fragile — 15% more damage taken via a passive flag the
        // damage-calc picks up.
        unit.damageTakenMultiplier = Number(unit.damageTakenMultiplier ?? 1) * 1.15;
        return unit;
      }
    },
    alpha: {
      id: 'alpha',
      label: 'Alpha',
      icon: '👑',
      weight: 0.55,
      summary: 'Buffs nearby allies of the same family.',
      suits(ctx) {
        // Pack-style modifier: needs >=2 same-family enemies in the
        // encounter for the aura to matter.
        return (ctx.packSize || 1) >= 2;
      },
      apply(unit) {
        unit.name = unit.name ? `Alpha ${unit.name}` : 'Alpha';
        unit.stats = _bumpStats(unit.stats, { S: 2, E: 2, C: 1 });
        unit.maxHpFlat = Number(unit.maxHpFlat || 0) + 6;
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_alpha_aura']);
        // Slightly larger XP / RP / loot bag from compile downstream
        unit._modifierLootBoost = 1.25;
        return unit;
      }
    },
    swift: {
      id: 'swift',
      label: 'Swift',
      icon: '💨',
      weight: 0.9,
      summary: 'Higher initiative and evasion.',
      suits() { return true; },
      apply(unit) {
        unit.name = unit.name ? `Swift ${unit.name}` : 'Swift';
        unit.stats = _bumpStats(unit.stats, { A: 2, P: 1 });
        unit.movement = Math.max(2, Number(unit.movement || 3) + 1);
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_swift_evasion']);
        return unit;
      }
    },
    tough: {
      id: 'tough',
      label: 'Tough',
      icon: '🛡️',
      weight: 0.8,
      summary: 'Hardened hide. +30% HP, +2 DR.',
      suits() { return true; },
      apply(unit) {
        unit.name = unit.name ? `Tough ${unit.name}` : 'Tough';
        unit.stats = _bumpStats(unit.stats, { E: 2, C: 1 });
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_tough_hide']);
        return unit;
      }
    },
    hungry: {
      id: 'hungry',
      label: 'Hungry',
      icon: '🍖',
      weight: 0.7,
      summary: 'Bites heal; deals less damage but eats yours.',
      suits(ctx) {
        const type = String(ctx.type || '').toLowerCase();
        return !['construct', 'undead', 'spirit'].includes(type);
      },
      apply(unit) {
        unit.name = unit.name ? `Hungry ${unit.name}` : 'Hungry';
        unit.stats = _bumpStats(unit.stats, { S: 1, E: 1 });
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_hungry_drain']);
        return unit;
      }
    }
  };

  // ── PUBLIC API ─────────────────────────────────────────────────────
  //
  // shouldModify(baseUnit, opts)
  //   Returns true if this base unit is eligible for procedural modifier
  //   rolling (only "normal" enemies; bosses/mid-bosses are skipped).
  function shouldModify(baseUnit, opts = {}) {
    if (!baseUnit || baseUnit.team === 'ally' || baseUnit.team === 'player') return false;
    // Skip authored bosses / mid-bosses / named uniques.
    if (baseUnit.isBoss || baseUnit.isMidBoss || baseUnit.isUnique) return false;
    const role = String(baseUnit.role || baseUnit.tier || '').toLowerCase();
    if (['boss', 'midboss', 'mid-boss', 'unique', 'elite_unique'].includes(role)) return false;
    // Already carries a procedural modifier (don't double-apply).
    if (baseUnit._procModifier) return false;
    // Authors can opt out explicitly.
    if (baseUnit.noProceduralModifier) return false;
    // Some types are reserved (story-essential NPCs).
    if (baseUnit.type === 'npc_essential') return false;
    return true;
  }

  // pickModifier(baseUnit, ctx)
  //   Roll a single modifier id (or null) appropriate for the unit and
  //   context. ctx: { biome, element, type, tags, packSize, chance }.
  function pickModifier(baseUnit, ctx = {}) {
    if (!shouldModify(baseUnit, ctx)) return null;
    // Spawn chance gate. Default 22% per non-boss enemy; encounters can
    // boost it via ctx.chance for "infestation" / "elite" modifiers.
    const chance = Number(ctx.chance ?? 0.22);
    if (Math.random() > chance) return null;

    const merged = {
      biome: ctx.biome || ctx.world || '',
      element: ctx.element || baseUnit.element || '',
      type: ctx.type || baseUnit.type || '',
      tags: [...(ctx.tags || []), ...(baseUnit.tags || [])],
      packSize: ctx.packSize || 1
    };

    const pool = [];
    for (const mod of Object.values(MODIFIERS)) {
      if (!mod.suits(merged)) continue;
      pool.push({ mod, weight: Number(mod.weight ?? 1) });
    }
    if (!pool.length) return null;
    const total = pool.reduce((s, e) => s + e.weight, 0);
    let r = Math.random() * total;
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) return e.mod.id;
    }
    return pool[pool.length - 1].mod.id;
  }

  // applyModifier(baseUnit, modifierId)
  //   Returns a NEW baseUnit object with the modifier applied. The
  //   original is left untouched (so authored data stays clean).
  function applyModifier(baseUnit, modifierId) {
    if (!baseUnit || !modifierId) return baseUnit;
    const mod = MODIFIERS[modifierId];
    if (!mod) return baseUnit;
    // Clone shallowly. Stat-compiler treats most refs as additive, so
    // deep clone is unnecessary, but we copy mutable arrays to avoid
    // contaminating DataStore records.
    const copy = {
      ...baseUnit,
      stats: { ...(baseUnit.stats || {}) },
      innatePassives: [...(baseUnit.innatePassives || [])],
      resist: [...(baseUnit.resist || [])],
      weak: [...(baseUnit.weak || [])],
      immune: [...(baseUnit.immune || [])],
      tags: [...(baseUnit.tags || [])]
    };
    const out = mod.apply(copy);
    out._procModifier = modifierId;
    out._procModifierLabel = mod.label;
    out._procModifierIcon = mod.icon;
    return out;
  }

  // rollAndApply(baseUnit, ctx)
  //   Convenience: pick + apply in one call. Returns either a modified
  //   copy or the original baseUnit if no modifier was selected.
  function rollAndApply(baseUnit, ctx = {}) {
    const id = pickModifier(baseUnit, ctx);
    if (!id) return baseUnit;
    return applyModifier(baseUnit, id);
  }

  // getModifier(id) — for UI labels and lookup.
  function getModifier(id) {
    return MODIFIERS[id] ? { ...MODIFIERS[id] } : null;
  }

  // listModifiers()
  function listModifiers() {
    return Object.values(MODIFIERS).map((mod) => ({
      id: mod.id, label: mod.label, icon: mod.icon, summary: mod.summary, weight: mod.weight
    }));
  }

  // ── HELPERS ────────────────────────────────────────────────────────
  function _bumpStats(stats, delta) {
    const out = { ...(stats || {}) };
    for (const [k, v] of Object.entries(delta || {})) {
      out[k] = Math.max(0, (Number(out[k]) || 0) + Number(v || 0));
    }
    return out;
  }

  function _appendUnique(list, items) {
    const seen = new Set(Array.isArray(list) ? list : []);
    const out = Array.isArray(list) ? [...list] : [];
    for (const item of items || []) {
      if (!item || seen.has(item)) continue;
      seen.add(item);
      out.push(item);
    }
    return out;
  }

  function _mergeUnique(a, b) {
    return _appendUnique(a, b);
  }

  return Object.freeze({
    shouldModify,
    pickModifier,
    applyModifier,
    rollAndApply,
    getModifier,
    listModifiers
  });
})();
