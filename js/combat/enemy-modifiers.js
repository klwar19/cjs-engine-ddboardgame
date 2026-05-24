// enemy-modifiers.js
// Procedural prefix modifiers for normal monsters. These are intentionally
// small twists, not elite templates: bosses, uniques, and authored setpieces
// opt out unless a placement explicitly pins a modifier.

window.CJS = window.CJS || {};

window.CJS.EnemyModifiers = (() => {
  'use strict';

  const MODIFIERS = {
    frozen: {
      id: 'frozen',
      label: 'Frozen',
      icon: '*',
      weight: 0.9,
      summary: 'Ice resistance and a small defensive bump.',
      suits(ctx) {
        const elem = String(ctx.element || '').toLowerCase();
        if (elem === 'fire') return false;
        const biome = String(ctx.biome || '').toLowerCase();
        return biome.includes('ice') || biome.includes('frost')
          || biome.includes('mountain') || biome.includes('tundra')
          || ctx.tags?.includes('cold') || elem === 'ice' || elem === 'water'
          || !biome;
      },
      apply(unit) {
        unit.name = unit.name ? `Frozen ${unit.name}` : 'Frozen';
        unit.resist = _mergeUnique(unit.resist || [], ['Ice']);
        unit.weak = _mergeUnique(unit.weak || [], ['Fire']);
        unit.element = unit.element || 'Ice';
        unit.stats = _bumpStats(unit.stats, { E: 1 });
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_frozen_aura']);
        return unit;
      }
    },
    rabid: {
      id: 'rabid',
      label: 'Rabid',
      icon: '!',
      weight: 0.75,
      summary: 'Fast, reckless offense; takes more damage.',
      suits(ctx) {
        const type = String(ctx.type || '').toLowerCase();
        return !['undead', 'construct', 'spirit', 'divine'].includes(type);
      },
      apply(unit) {
        unit.name = unit.name ? `Rabid ${unit.name}` : 'Rabid';
        unit.stats = _bumpStats(unit.stats, { S: 1, A: 1 });
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_rabid_doublestrike']);
        unit.damageTakenMultiplier = Number(unit.damageTakenMultiplier ?? 1) * 1.12;
        return unit;
      }
    },
    alpha: {
      id: 'alpha',
      label: 'Alpha',
      icon: 'A',
      weight: 0.32,
      summary: 'Pack leader with extra bulk and reward value.',
      suits(ctx) {
        if (ctx.alphaAlreadyInPack) return false;
        return (ctx.packSize || 1) >= 2;
      },
      apply(unit) {
        unit.name = unit.name ? `Alpha ${unit.name}` : 'Alpha';
        unit.stats = _bumpStats(unit.stats, { S: 2, E: 2, C: 1 });
        unit.maxHpFlat = Number(unit.maxHpFlat || 0) + 6;
        unit.innatePassives = _appendUnique(unit.innatePassives, ['enemy_mod_alpha_aura']);
        unit._modifierLootBoost = 1.25;
        return unit;
      }
    },
    swift: {
      id: 'swift',
      label: 'Swift',
      icon: '>',
      weight: 0.85,
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
      icon: '#',
      weight: 0.65,
      summary: 'Hardened hide, endurance, and DR.',
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
      icon: '~',
      weight: 0.7,
      summary: 'Bite-drain flavor and a modest stat bump.',
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

  function shouldModify(baseUnit) {
    if (!baseUnit || baseUnit.team === 'ally' || baseUnit.team === 'player') return false;
    if (baseUnit.isBoss || baseUnit.isMidBoss || baseUnit.isUnique) return false;
    const role = String(baseUnit.role || baseUnit.tier || '').toLowerCase();
    if (['boss', 'midboss', 'mid-boss', 'unique', 'elite_unique'].includes(role)) return false;
    if (baseUnit._procModifier) return false;
    if (baseUnit.noProceduralModifier) return false;
    if (baseUnit.type === 'npc_essential') return false;
    return true;
  }

  function pickModifier(baseUnit, ctx = {}) {
    if (!shouldModify(baseUnit)) return null;
    const chance = _contextChance(ctx.chance, ctx);
    if (Math.random() > chance) return null;

    const merged = {
      biome: ctx.biome || ctx.world || '',
      element: ctx.element || baseUnit.element || '',
      type: ctx.type || baseUnit.type || '',
      tags: _lowerTags([...(ctx.tags || []), ...(baseUnit.tags || [])]),
      packSize: ctx.packSize || 1,
      alphaAlreadyInPack: !!ctx.alphaAlreadyInPack
    };

    const pool = [];
    for (const mod of Object.values(MODIFIERS)) {
      if (!mod.suits(merged)) continue;
      pool.push({ mod, weight: Number(mod.weight ?? 1) });
    }
    if (!pool.length) return null;
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = Math.random() * total;
    for (const entry of pool) {
      cursor -= entry.weight;
      if (cursor <= 0) return entry.mod.id;
    }
    return pool[pool.length - 1].mod.id;
  }

  function applyModifier(baseUnit, modifierId) {
    if (!baseUnit || !modifierId) return baseUnit;
    const mod = MODIFIERS[modifierId];
    if (!mod) return baseUnit;
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

  function rollAndApply(baseUnit, ctx = {}) {
    const id = pickModifier(baseUnit, ctx);
    return id ? applyModifier(baseUnit, id) : baseUnit;
  }

  function getModifier(id) {
    return MODIFIERS[id] ? { ...MODIFIERS[id] } : null;
  }

  function listModifiers() {
    return Object.values(MODIFIERS).map((mod) => ({
      id: mod.id,
      label: mod.label,
      icon: mod.icon,
      summary: mod.summary,
      weight: mod.weight
    }));
  }

  function _contextChance(explicitChance, ctx = {}) {
    const explicit = explicitChance != null && explicitChance !== '';
    let chance = Number(explicit ? explicitChance : 0.18);
    if (!Number.isFinite(chance)) chance = 0.18;
    if (!explicit) {
      const tags = new Set(_lowerTags(ctx.tags || []));
      if (tags.has('story') || tags.has('scripted') || tags.has('setpiece')) chance -= 0.04;
      if (tags.has('quest') || tags.has('rank:f') || tags.has('starter')) chance -= 0.02;
      if (tags.has('random') || tags.has('roamer') || tags.has('moving_threat')) chance += 0.05;
      if (tags.has('elite') || tags.has('horde') || tags.has('blood_moon')) chance += 0.07;
      if (Number(ctx.packSize || 1) >= 4) chance += 0.02;
    }
    return Math.max(0, Math.min(0.45, chance));
  }

  function _bumpStats(stats, delta) {
    const out = { ...(stats || {}) };
    for (const [key, value] of Object.entries(delta || {})) {
      out[key] = Math.max(0, (Number(out[key]) || 0) + Number(value || 0));
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

  function _lowerTags(tags) {
    return (tags || []).map((tag) => String(tag || '').toLowerCase()).filter(Boolean);
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
