// content-validator.js
// Cross-references DataStore content and reports broken pointers, missing
// images, and obvious shape mismatches. Designed to run in-browser via the
// debug console and (eventually) in CI by importing this file into a Node
// test harness that pre-populates DataStore.
//
// Report shape:
//   {
//     ranAt: ISOString,
//     errors:   [{ category, id, message, hint? }],
//     warnings: [{ category, id, message, hint? }],
//     stats:    { totalChecked: number, byCategory: { name: count } }
//   }
//
// Reads: CJS.DataStore (does not mutate state)
// Used by: dev-console, programmatic devs

window.CJS = window.CJS || {};

window.CJS.ContentValidator = (() => {
  'use strict';

  const DS = () => window.CJS.DataStore;

  // Each rule receives (entry, ctx) and returns null OR { level, message, hint }.
  // level: 'error' (broken reference) or 'warning' (suspicious but not fatal).
  const RULES = {
    skills: [
      (entry) => entry.cost != null && typeof entry.cost !== 'number'
        ? { level: 'warning', message: 'skill.cost should be a number' }
        : null,
      (entry, ctx) => {
        if (!entry.qte) return null;
        if (entry.qte === 'random' || entry.qte === 'none') return null;
        return ctx.QTE_TYPES.has(entry.qte) ? null
          : { level: 'error', message: `unknown QTE type "${entry.qte}"` };
      },
      (entry) => {
        for (const fx of entry.effects || []) {
          if (typeof fx === 'string') continue;
          if (fx?.effectId && !DS().exists('effects', fx.effectId)) {
            return { level: 'error', message: `missing effect "${fx.effectId}"` };
          }
        }
        return null;
      }
    ],
    encounters: [
      (entry) => {
        const missing = [];
        for (const u of entry.units || []) {
          if (!u.id) continue;
          if (!DS().exists('monsters', u.id) && !DS().exists('characters', u.id)) {
            missing.push(u.id);
          }
        }
        return missing.length
          ? { level: 'error', message: `units not found: ${missing.join(', ')}` }
          : null;
      },
      (entry) => {
        if (!entry.objective) return null;
        const kind = String(entry.objective.kind || entry.objective.type || '').toLowerCase();
        const known = ['kill_all', 'escort', 'capture_point', 'survival', 'assassination'];
        if (!known.includes(kind)) {
          return { level: 'warning', message: `objective kind "${kind}" not recognized` };
        }
        if (kind === 'escort' && !(entry.objective.vipId || entry.objective.escortId)) {
          return { level: 'error', message: 'escort objective needs vipId/escortId' };
        }
        if (kind === 'assassination' && !entry.objective.targetId) {
          return { level: 'error', message: 'assassination objective needs targetId' };
        }
        if (kind === 'capture_point' && !(entry.objective.captureCells || entry.objective.zoneCells)?.length) {
          return { level: 'error', message: 'capture_point objective needs captureCells' };
        }
        return null;
      }
    ],
    worldEvents: [
      (entry) => entry.durationPhases > 0 ? null
        : { level: 'warning', message: 'durationPhases should be > 0' },
      (entry) => entry.modifiers && typeof entry.modifiers === 'object'
        ? null
        : { level: 'warning', message: 'event has no modifiers (will have no effect)' }
    ],
    fishCatalog: [
      (entry) => (entry.biomes && entry.biomes.length) ? null
        : { level: 'error', message: 'fish has no biomes (will never spawn)' },
      (entry) => {
        if (entry.produces?.food && !DS().exists('food', entry.produces.food)) {
          return { level: 'warning', message: `food "${entry.produces.food}" not in DataStore yet — define it or it'll be missing icons` };
        }
        return null;
      },
      (entry) => {
        const known = ['EASY', 'MEDIUM', 'HARD', 'INSANE'];
        return known.includes(String(entry.difficulty || '').toUpperCase()) ? null
          : { level: 'warning', message: `unknown difficulty "${entry.difficulty}"` };
      }
    ],
    monsters: [
      (entry) => entry.stats ? null
        : { level: 'error', message: 'monster missing stats block' }
    ],
    characters: [
      (entry) => entry.stats ? null
        : { level: 'error', message: 'character missing stats block' }
    ],
    items: [
      (entry) => (entry.name || entry.id) ? null
        : { level: 'warning', message: 'item missing name and id' }
    ]
  };

  function run() {
    const errors = [];
    const warnings = [];
    const stats = { totalChecked: 0, byCategory: {} };
    if (!DS()) {
      return { ranAt: new Date().toISOString(), errors: [{ category: '_', id: '_', message: 'DataStore not loaded' }], warnings, stats };
    }
    const ctx = {
      QTE_TYPES: new Set(['fishing', 'rhythm', 'quickpress', 'mash', 'quiz', 'none', 'random'])
    };
    for (const [category, rules] of Object.entries(RULES)) {
      const entries = DS().getAllAsArray?.(category) || [];
      stats.byCategory[category] = entries.length;
      stats.totalChecked += entries.length;
      for (const entry of entries) {
        for (const rule of rules) {
          let result;
          try { result = rule(entry, ctx); }
          catch (err) { result = { level: 'error', message: `rule threw: ${err.message}` }; }
          if (!result) continue;
          const item = {
            category,
            id: entry.id || '(no id)',
            name: entry.name || '',
            message: result.message,
            hint: result.hint || null
          };
          if (result.level === 'error') errors.push(item);
          else warnings.push(item);
        }
      }
    }
    return {
      ranAt: new Date().toISOString(),
      errors,
      warnings,
      stats
    };
  }

  /** Quick summary line for status badges or dev-console headers. */
  function summary() {
    const r = run();
    return {
      ok: r.errors.length === 0,
      errors: r.errors.length,
      warnings: r.warnings.length,
      totalChecked: r.stats.totalChecked
    };
  }

  /** Per-category extension hook. Allows tests/plugins to inject extra rules. */
  function addRule(category, fn) {
    if (!RULES[category]) RULES[category] = [];
    RULES[category].push(fn);
  }

  return Object.freeze({ run, summary, addRule, RULES });
})();
