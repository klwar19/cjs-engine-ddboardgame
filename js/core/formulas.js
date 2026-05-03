// formulas.js
// All combat math: HP, MP, DR, damage, evasion, crit, initiative.
// Pure functions — no state, no side effects.
// Reads: constants.js (for RANK_DATA, ELEMENT_MULTIPLIERS, ACTION_ECONOMY)
// Used by: stat-compiler.js, damage-calc.js, combat-manager.js
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.Formulas = (() => {
  'use strict';

  const C = () => window.CJS.CONST;
  const F_RANK_PLOT_ARMOR_HP = 8;

  // ── HP & MP ────────────────────────────────────────────────────────
  // HP = Rank Base + (Endurance * 6) + (Strength * 3) + floor(max(S, E) * 1.5)
  function calcMaxHP(stats = {}, rank, context = {}) {
    const normalizedRank = String(rank || 'F').toUpperCase();
    const rankData = C().RANK_DATA[normalizedRank] || C().RANK_DATA.F || {};
    const base = rankData.hpBase ?? rankData.hpBonus ?? 0;
    const strength = stats.S || 0;
    const endurance = stats.E || 0;
    return base + (endurance * 6) + (strength * 3) + Math.floor(Math.max(strength, endurance) * 1.5) + calcPlotArmorHP(normalizedRank, context);
  }

  function calcPlotArmorHP(rank, context = {}) {
    const normalizedRank = String(rank || 'F').toUpperCase();
    const disabled = context?.plotArmor === false;
    const isPlayer = context === true || context?.plotArmor === true || context?.team === 'player' || context?.isPlayer === true;
    return normalizedRank === 'F' && isPlayer && !disabled ? F_RANK_PLOT_ARMOR_HP : 0;
  }

  // MP = Rank Base + (Intelligence * 5) + (Perception * 2) + (Charisma * 2)
  function calcMaxMP(stats = {}, rank) {
    const rankData = C().RANK_DATA[rank] || C().RANK_DATA.F || {};
    const base = rankData.mpBase ?? rankData.mpBonus ?? 0;
    return base + ((stats.I || 0) * 5) + ((stats.P || 0) * 2) + ((stats.C || 0) * 2);
  }

  // ── DAMAGE RESISTANCE ──────────────────────────────────────────────
  function calcPhysicalDR(stats = {}) {
    return Math.floor(((stats.S || 0) + (stats.E || 0)) / 2);
  }

  function calcMagicDR(stats = {}) {
    return Math.floor(((stats.I || 0) + (stats.P || 0)) / 2);
  }

  function calcChaosDR(stats = {}) {
    return Math.floor(((stats.L || 0) * 0.8) + ((stats.C || 0) * 0.4));
  }

  function calcDR(stats, damageType) {
    switch (damageType) {
      case 'Physical': return calcPhysicalDR(stats);
      case 'Magic':    return calcMagicDR(stats);
      case 'Chaos':    return calcChaosDR(stats);
      case 'True':     return 0; // True damage ignores DR
      default:         return 0;
    }
  }

  // ── DAMAGE ─────────────────────────────────────────────────────────
  // Final = ((Base + bonuses) * QTE/Crit * Element) through hybrid defense
  // Minimum 1 damage (never 0 unless immune)

  function calcEffectiveSkillPower(basePower, skillLevel) {
    return basePower * (1 + 0.15 * (skillLevel - 1));
  }

  function calcPowerPulse(skillPower, primaryStat) {
    const pulseBase = Math.max(0, (2 * (skillPower || 0)) + (2 * (primaryStat || 0)));
    return Math.pow(pulseBase, 4 / 5);
  }

  function calcBaseDamage(skillPower, primaryStat, diceRoll, luckValue) {
    const power = Math.max(0, skillPower || 0);
    const stat = Math.max(0, primaryStat || 0);
    const luck = Math.max(0, luckValue || 0);
    const sqrtCore = Math.sqrt(power) * Math.sqrt(stat);
    const luckDice = (diceRoll || 0) * Math.pow(luck, 3 / 11);
    return sqrtCore + luckDice + calcPowerPulse(power, stat);
  }

  function calcMitigatedDamage(rawDamage, defenseRating) {
    const raw = Math.max(0, rawDamage || 0);
    const rating = Math.max(0, Math.floor(defenseRating || 0));
    const flatBlock = Math.floor(rating * 0.5);
    const percentMitigation = Math.min(0.40, rating / (rating + 80));
    const afterDefense = Math.floor((raw * (1 - percentMitigation)) - flatBlock);
    const final = Math.max(1, afterDefense);

    return {
      final,
      defenseRating: rating,
      flatBlock,
      percentMitigation,
      blocked: Math.max(0, Math.floor(raw) - final)
    };
  }

  function calcFinalDamage({ skillPower, primaryStat, diceRoll, qteMultiplier,
                             elementMultiplier, dr, bonusDamageFlat, bonusDamagePercent,
                             luckValue }) {
    const base = calcBaseDamage(skillPower, primaryStat, diceRoll || 0, luckValue || 0);
    const withBonusFlat = base + (bonusDamageFlat || 0);
    const withBonusPercent = withBonusFlat * (1 + (bonusDamagePercent || 0) / 100);
    const withQTE = withBonusPercent * (qteMultiplier || 1.0);
    const withElement = withQTE * (elementMultiplier || 1.0);
    const isImmune = (elementMultiplier || 0) === 0;
    const mitigation = isImmune
      ? { final: 0, defenseRating: 0, flatBlock: 0, percentMitigation: 0, blocked: Math.floor(withElement) }
      : calcMitigatedDamage(withElement, dr);

    return {
      base: Math.floor(base),
      withBonuses: Math.floor(withBonusPercent),
      withQTE: Math.floor(withQTE),
      withElement: Math.floor(withElement),
      afterDR: mitigation.final,
      final: mitigation.final,
      blocked: mitigation.blocked,
      defenseRating: mitigation.defenseRating,
      flatBlock: mitigation.flatBlock,
      percentMitigation: mitigation.percentMitigation,
      overkill: 0  // set by caller after checking target HP
    };
  }

  // ── ELEMENT INTERACTION ────────────────────────────────────────────
  // Returns multiplier: 1.5 (weak), 0.5 (resist), 0 (immune), 1.0 (normal)
  // Uses unit's personal weak/resist/immune arrays FIRST, then chart fallback.
  function getElementMultiplier(attackElement, targetUnit) {
    if (!attackElement || attackElement === 'Physical') return 1.0;

    // Check unit-specific overrides
    if (targetUnit.immune && targetUnit.immune.includes(attackElement)) {
      return C().ELEMENT_MULTIPLIERS.immune;
    }
    if (targetUnit.weak && targetUnit.weak.includes(attackElement)) {
      return C().ELEMENT_MULTIPLIERS.weak;
    }
    if (targetUnit.resist && targetUnit.resist.includes(attackElement)) {
      return C().ELEMENT_MULTIPLIERS.resist;
    }

    return C().ELEMENT_MULTIPLIERS.normal;
  }

  // ── EVASION ────────────────────────────────────────────────────────
  // Attacker: 1d20 + Perception + accuracy bonuses
  // Defender: 1d12 + Agility + evasion bonuses
  // Attacker > Defender = hit. ~65% hit rate at equal stats.
  function calcHitCheck(attackerPerception, attackerAccBonus, attackerRoll,
                        defenderAgility, defenderEvaBonus, defenderRoll) {
    const attackScore = attackerRoll + attackerPerception + (attackerAccBonus || 0);
    const defendScore = defenderRoll + defenderAgility + (defenderEvaBonus || 0);
    return {
      hit: attackScore > defendScore,
      attackScore,
      defendScore,
      margin: attackScore - defendScore
    };
  }

  // ── CRITICAL HIT ───────────────────────────────────────────────────
  // Crit Chance = 5% base + (Luck / 2)% + bonuses
  // Crit Damage = 150% base + bonuses
  function calcCritChance(luck, critBonus) {
    return 5 + (luck / 2) + (critBonus || 0);
  }

  function calcCritMultiplier(critDamageBonus) {
    return 1.5 + ((critDamageBonus || 0) / 100);
  }

  function rollCrit(luck, critBonus) {
    const chance = calcCritChance(luck, critBonus);
    const roll = Math.random() * 100;
    return roll < chance;
  }

  // ── INITIATIVE ─────────────────────────────────────────────────────
  function calcInitiative(agility, initiativeBonus, roll) {
    return (roll || 0) + agility + (initiativeBonus || 0);
  }

  // ── MOVEMENT ───────────────────────────────────────────────────────
  // Flat base per unit. Only modified by passives/items/effects/skills.
  // baseMovement is set on each character/monster (typically 2–4).
  function calcMovement(baseMovement, movementBonus) {
    return Math.max(0, (baseMovement || 3) + (movementBonus || 0));
  }

  // ── KNOCKBACK & COLLISION ─────────────────────────────────────────
  // Effective knockback distance after END resistance
  function calcKnockbackDistance(baseDistance, targetEndurance) {
    const resist = Math.floor((targetEndurance || 0) / C().COLLISION.knockbackResistPerEnd);
    return Math.max(0, baseDistance - resist);
  }

  // Collision damage when knocked into wall/obstacle
  function calcWallCollisionDamage(knockbackSourceDamage) {
    const col = C().COLLISION;
    return col.wallDamageFlat + Math.floor((knockbackSourceDamage || 0) * col.wallDamagePercent / 100);
  }

  // Collision damage when knocked into another unit
  function calcUnitCollisionDamage(knockbackSourceDamage) {
    const col = C().COLLISION;
    return col.unitCollisionDamageFlat + Math.floor((knockbackSourceDamage || 0) * col.unitCollisionDamagePercent / 100);
  }

  // Does the pushed unit push the blocker? (size comparison)
  function doesKnockbackChain(pushedSize, blockerSize) {
    if (!C().COLLISION.sizeMatters) return false;
    const sizes = C().UNIT_SIZES;
    const pArea = (sizes[pushedSize]?.w || 1) * (sizes[pushedSize]?.h || 1);
    const bArea = (sizes[blockerSize]?.w || 1) * (sizes[blockerSize]?.h || 1);
    return pArea > bArea;
  }

  // ── LINE OF SIGHT ─────────────────────────────────────────────────
  // Check if a cell blocks LoS (for grid-engine to use in Bresenham walk)
  function cellBlocksLoS(terrainType, unitOnCell) {
    const los = C().LINE_OF_SIGHT;
    const terrain = C().TERRAIN_TYPES[terrainType];
    if (terrain && terrain.blocksLoS && los.obstaclesBlock) return true;
    if (unitOnCell && los.largeUnitsBlock) {
      const uSize = unitOnCell.size || '1x1';
      const s = C().UNIT_SIZES[uSize];
      if (s && (s.w >= 2 || s.h >= 2)) return true;
    }
    return false;
  }

  // ── TERRAIN MOVEMENT COST ─────────────────────────────────────────
  // How many movement points does it cost to enter a cell?
  function getTerrainMoveCost(terrainType) {
    const terrain = C().TERRAIN_TYPES[terrainType];
    return terrain ? terrain.moveCost : 1;
  }

  // ── LOOT DROP ──────────────────────────────────────────────────────
  // Effective chance = base + (Luck × 0.02), capped at 0.95
  function calcDropChance(baseChance, killerLuck) {
    return Math.min(0.95, baseChance + (killerLuck || 0) * 0.02);
  }

  // ── CROSS-WORLD SCALING ────────────────────────────────────────────
  function applyWorldCeiling(actualStat, worldCeiling) {
    return Math.min(actualStat, worldCeiling);
  }

  function applyWorldCeilingToStats(stats, worldCeiling) {
    const capped = {};
    for (const s of Object.keys(stats)) {
      capped[s] = Math.min(stats[s], worldCeiling);
    }
    return capped;
  }

  // ── SKILL LEVEL SCALING ────────────────────────────────────────────
  function calcSkillPowerAtLevel(basePower, level, powerPerLevel) {
    const rate = powerPerLevel || 0.15;
    return basePower * (1 + rate * (level - 1));
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    calcMaxHP, calcMaxMP, calcPlotArmorHP,
    calcPhysicalDR, calcMagicDR, calcChaosDR, calcDR,
    calcEffectiveSkillPower, calcBaseDamage, calcMitigatedDamage, calcFinalDamage,
    getElementMultiplier,
    calcHitCheck, calcCritChance, calcCritMultiplier, rollCrit,
    calcInitiative, calcMovement,
    calcKnockbackDistance, calcWallCollisionDamage, calcUnitCollisionDamage,
    doesKnockbackChain, cellBlocksLoS, getTerrainMoveCost,
    calcDropChance,
    applyWorldCeiling, applyWorldCeilingToStats,
    calcSkillPowerAtLevel
  });
})();
