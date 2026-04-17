// qte-manager.js
// The QTE dispatcher. Picks the type, rolls the difficulty, and delegates
// to the correct sub-module. Returns a Promise resolving to:
//   { grade, multiplier, qteType, breakdown, difficulty }
//
// Difficulty rolling:
//   1. Base distribution by world/area rank (from CONST.QTE_DIFFICULTY_BY_RANK)
//   2. Skill cost modifier: AP >= 4 bumps up one tier
//   3. Attacker status modifier: Shock bumps up; Blind narrows specific QTEs;
//      Silence auto-fails quiz
//   4. Clamp to EASY–INSANE range
//
// Respects CombatSettings:
//   - If a global "skip QTE" flag is set, returns neutral 1.0 immediately
//   - QTE can also be bypassed by passing skill.qte === 'none'
//
// Reads: constants, combat-settings, all qte-*.js modules
// Used by: action-handler.js (called from _doSkill and _doAttack)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.QteManager = (() => {
  'use strict';

  const C  = () => window.CJS.CONST;
  const CS = () => window.CJS.CombatSettings;
  const Log = () => window.CJS.CombatLog;

  // ── PUBLIC ENTRY ──────────────────────────────────────────────────
  // args: {
  //   skill:          skill object (has skill.qte = 'fishing'|'rhythm'|'quickpress'|'mash'|'quiz'|'none'|'random')
  //   attacker:       compiled unit (for status-based modifiers)
  //   container:      HTMLElement to render into (defaults to document.body)
  //   areaRank:       'F' | 'E' | ... | 'SSR' | 'tutorial'  — affects difficulty roll
  //   forceDifficulty:optional 'EASY'|'MEDIUM'|'HARD'|'INSANE' — overrides the roll
  // }
  // Returns a Promise resolving to { grade, multiplier, qteType, ... }.
  async function trigger(args) {
    const { skill, attacker, areaRank, forceDifficulty } = args;
    const container = args.container || document.body;

    // ── Opt out paths ─────────────────────────────────────────
    const qteType = skill?.qte || 'none';
    if (qteType === 'none') {
      return _neutralResult('none');
    }
    if (CS() && CS().getDiceMode && _shouldSkipQTE()) {
      // Integration point: if the user has turned off QTEs via a setting,
      // return a neutral 1.0 multiplier. Not implemented in CombatSettings
      // yet; stub here for when you add it.
      return _neutralResult('skipped');
    }

    // ── Difficulty roll ───────────────────────────────────────
    const difficulty = forceDifficulty || _determineDifficulty(skill, attacker, areaRank);

    // ── Type dispatch ─────────────────────────────────────────
    const actualType = qteType === 'random' ? _pickRandomType() : qteType;
    const module = _moduleFor(actualType);
    if (!module) {
      console.warn(`QteManager: no module for type "${actualType}", skipping`);
      return _neutralResult(actualType);
    }

    // ── Run it ────────────────────────────────────────────────
    try {
      const result = await module.start({
        container, difficulty, skill, attacker
      });
      // Enrich the result with the dispatch metadata
      result.difficulty = difficulty;
      result.qteType = actualType;

      // Log it so the narrator has tags to work with
      if (Log()) {
        Log().logQTE({
          actor: attacker, skill,
          qteType: actualType,
          grade: result.grade,
          multiplier: result.multiplier
        });
      }
      return result;
    } catch (e) {
      console.error('QTE failed with exception:', e);
      return _neutralResult(actualType);
    }
  }

  // ── DIFFICULTY DETERMINATION ──────────────────────────────────────
  function _determineDifficulty(skill, attacker, areaRank) {
    const rank = areaRank || 'F';
    const distribution = C().QTE_DIFFICULTY_BY_RANK[rank] || C().QTE_DIFFICULTY_BY_RANK.F;

    // Roll from the distribution
    let tier = _rollFromDistribution(distribution);

    // Skill cost modifier
    if (skill && (skill.ap || 0) >= 4) tier = _bumpTier(tier, 1);

    // Status modifiers (Shock, Blind, etc.)
    if (attacker?.activeStatuses) {
      const hasShock = attacker.activeStatuses.some(s => s.statusId === 'shock');
      const hasBlind = attacker.activeStatuses.some(s => s.statusId === 'blind');
      if (hasShock) tier = _bumpTier(tier, 1);
      // Blind bumps quickpress & fishing only — handled by the modules themselves
      // if you want; for now, +1 tier for those too.
      if (hasBlind && (skill.qte === 'quickpress' || skill.qte === 'fishing')) {
        tier = _bumpTier(tier, 1);
      }
    }

    return tier;
  }

  function _rollFromDistribution(dist) {
    const r = Math.random();
    let cumulative = 0;
    for (const tier of ['EASY', 'MEDIUM', 'HARD', 'INSANE']) {
      cumulative += (dist[tier] || 0);
      if (r < cumulative) return tier;
    }
    return 'MEDIUM';  // fallback
  }

  function _bumpTier(tier, delta) {
    const order = ['EASY', 'MEDIUM', 'HARD', 'INSANE'];
    const idx = Math.max(0, Math.min(order.length - 1, order.indexOf(tier) + delta));
    return order[idx];
  }

  // ── TYPE DISPATCH ─────────────────────────────────────────────────
  function _moduleFor(type) {
    switch (type) {
      case 'quickpress': return window.CJS.QteQuickPress;
      case 'mash':       return window.CJS.QteMash;
      case 'fishing':    return window.CJS.QteFishing;
      case 'rhythm':     return window.CJS.QteRhythm;
      case 'quiz':       return window.CJS.QteQuiz;
      default:           return null;
    }
  }

  function _pickRandomType() {
    const pool = ['quickpress', 'mash', 'fishing', 'rhythm', 'quiz'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function _neutralResult(qteType) {
    return Promise.resolve({
      grade: 'ok', multiplier: 1.0,
      qteType: qteType || 'none',
      difficulty: null,
      breakdown: { skipped: true }
    });
  }

  function _shouldSkipQTE() {
    // Placeholder: when CombatSettings adds a skipQTE flag, read it here.
    return false;
  }

  // ── PREVIEW (for UI — what tier will this roll?) ──────────────────
  function previewDifficultyFor(skill, attacker, areaRank) {
    return _determineDifficulty(skill, attacker, areaRank);
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    trigger,
    previewDifficultyFor
  });
})();
