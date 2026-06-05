// formulas.ts — Tier 3 TS port of js/core/formulas.js (engine cluster: core).
// All combat math: HP, MP, DR, damage, evasion, crit, initiative, plus the
// progression/rank/job/passive curves. Pure functions — no state, no side
// effects beyond the window install.
// Reads: window.CJS.CONST (RANK_DATA, ELEMENT_MULTIPLIERS, ACTION_ECONOMY, …)
//        and window.CJS.DataStore (job/item/passive lookups for slot budgets).
// Used by: stat-compiler, damage-calc, combat-manager (all via window.CJS.Formulas).
//
// The function bodies are preserved verbatim from the legacy module — this is
// load-bearing combat math with 465+ assertions in test_engine.js, so the port
// changes only the module envelope (IIFE → ES module + typed export + window
// install), never the arithmetic.

const C = () => window.CJS.CONST;
const F_RANK_PLOT_ARMOR_HP = 8;

// ── HP & MP ────────────────────────────────────────────────────────
// HP = Rank Base + (Endurance * 6) + (Strength * 3) + floor(max(S, E) * 1.5)
function calcMaxHP(stats: any = {}, rank?: any, context: any = {}) {
  const normalizedRank = String(rank || 'F').toUpperCase();
  const rankData = C().RANK_DATA[normalizedRank] || C().RANK_DATA.F || {};
  const base = rankData.hpBase ?? rankData.hpBonus ?? 0;
  const strength = stats.S || 0;
  const endurance = stats.E || 0;
  return base + (endurance * 6) + (strength * 3) + Math.floor(Math.max(strength, endurance) * 1.5) + calcPlotArmorHP(normalizedRank, context);
}

function calcPlotArmorHP(rank: any, context: any = {}) {
  const normalizedRank = String(rank || 'F').toUpperCase();
  const disabled = context?.plotArmor === false;
  const isPlayer = context === true || context?.plotArmor === true || context?.team === 'player' || context?.isPlayer === true;
  return normalizedRank === 'F' && isPlayer && !disabled ? F_RANK_PLOT_ARMOR_HP : 0;
}

// MP = Rank Base + (Intelligence * 5) + (Perception * 2) + (Charisma * 2)
function calcMaxMP(stats: any = {}, rank?: any) {
  const rankData = C().RANK_DATA[rank] || C().RANK_DATA.F || {};
  const base = rankData.mpBase ?? rankData.mpBonus ?? 0;
  return base + ((stats.I || 0) * 5) + ((stats.P || 0) * 2) + ((stats.C || 0) * 2);
}

// ── DAMAGE RESISTANCE ──────────────────────────────────────────────
function calcPhysicalDR(stats: any = {}) {
  return Math.floor(((stats.S || 0) + (stats.E || 0)) / 2);
}

function calcMagicDR(stats: any = {}) {
  return Math.floor(((stats.I || 0) + (stats.P || 0)) / 2);
}

function calcChaosDR(stats: any = {}) {
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

// ── FLANKING ───────────────────────────────────────────────────────
// Returns a position label ('front' | 'side' | 'rear') and the crit bonus
// attackers in that arc get against `targetFacing`. Pure math: no grid lookups.
//
// attackerPos, targetPos:  [r, c] coordinates
// targetFacing:            one of N/S/E/W/NE/SE/SW/NW (string), or null
//
// The arc is determined by comparing the unit vector from target→attacker
// against the target's facing vector. Dot product:
//   ≥ sideArcCosUpper      → front
//   in (rearCos, sideUpper)→ side
//   ≤ rearArcCosThreshold  → rear
function getFlankPosition(attackerPos, targetPos, targetFacing) {
  if (!attackerPos || !targetPos || !targetFacing) {
    return { position: 'front', critBonus: 0 };
  }
  const FLANK = C().FLANKING || { enabled: false, rearCritBonus: 0, sideCritBonus: 0, rearArcCosThreshold: -0.5, sideArcCosUpper: 0.5 };
  if (!FLANK.enabled) return { position: 'front', critBonus: 0 };

  const facing = _facingToVector(targetFacing);
  if (!facing) return { position: 'front', critBonus: 0 };

  // Vector pointing from target TO attacker — this is the direction the
  // attacker is coming from, in row/col space.
  const dr = attackerPos[0] - targetPos[0];
  const dc = attackerPos[1] - targetPos[1];
  const len = Math.sqrt(dr * dr + dc * dc) || 1;
  const ux = dr / len, uy = dc / len;

  // Target faces (fr, fc). The REAR is the OPPOSITE direction of facing,
  // so attacker in the rear arc means (ux,uy) points opposite to facing
  // → dot(attackerFromTarget, facing) is NEGATIVE.
  const dot = ux * facing[0] + uy * facing[1];

  if (dot <= FLANK.rearArcCosThreshold) {
    return { position: 'rear', critBonus: Number(FLANK.rearCritBonus || 0) };
  }
  if (dot < FLANK.sideArcCosUpper) {
    return { position: 'side', critBonus: Number(FLANK.sideCritBonus || 0) };
  }
  return { position: 'front', critBonus: 0 };
}

// Compute facing string from a movement delta (or attacker→target vector).
// Returns one of N/NE/E/SE/S/SW/W/NW, or null when delta is zero.
function facingFromDelta(dr, dc) {
  if (!dr && !dc) return null;
  const sr = Math.sign(dr), sc = Math.sign(dc);
  if (sr === -1 && sc ===  0) return 'N';
  if (sr === -1 && sc ===  1) return 'NE';
  if (sr ===  0 && sc ===  1) return 'E';
  if (sr ===  1 && sc ===  1) return 'SE';
  if (sr ===  1 && sc ===  0) return 'S';
  if (sr ===  1 && sc === -1) return 'SW';
  if (sr ===  0 && sc === -1) return 'W';
  if (sr === -1 && sc === -1) return 'NW';
  return null;
}

function _facingToVector(facing) {
  switch (String(facing || '').toUpperCase()) {
    case 'N':  return [-1,  0];
    case 'NE': return [-1,  1];
    case 'E':  return [ 0,  1];
    case 'SE': return [ 1,  1];
    case 'S':  return [ 1,  0];
    case 'SW': return [ 1, -1];
    case 'W':  return [ 0, -1];
    case 'NW': return [-1, -1];
    default:   return null;
  }
}

// ── ELEVATION ─────────────────────────────────────────────────────
// Given attacker/target elevation numbers (0 = ground, 1+ = raised),
// returns bonus accuracy & range for the attacker. Range bonus only
// applies to ranged attacks (baseRange > 1) — high ground letting you
// see further makes sense for archers, not melee.
function calcElevationBonuses(attackerElevation, targetElevation, baseRange) {
  const E = C().ELEVATION || { enabled: false, accuracyBonusPerStep: 0, rangeBonusPerStep: 0 };
  if (!E.enabled) return { accuracy: 0, range: 0, advantage: 0 };
  const step = Math.max(0, Number(attackerElevation || 0) - Number(targetElevation || 0));
  if (step <= 0) return { accuracy: 0, range: 0, advantage: 0 };
  const isRanged = Number(baseRange || 1) > 1;
  return {
    accuracy: step * Number(E.accuracyBonusPerStep || 0),
    range:    isRanged ? step * Number(E.rangeBonusPerStep || 0) : 0,
    advantage: step
  };
}

// ── BARREL EXPLOSION DAMAGE ───────────────────────────────────────
// Base damage from constants, scaled lightly by the kicker's Strength.
// Caps at 2× base so a single barrel never one-shots high-level units.
function calcBarrelExplosionDamage(kickerStr) {
  const E = C().ENVIRONMENTAL_INTERACTIONS || { barrelExplosionDamage: 25 };
  const base = Math.max(1, Number(E.barrelExplosionDamage || 25));
  const scaled = base + Math.floor((Number(kickerStr || 0) || 0) * 0.6);
  return Math.min(base * 2, scaled);
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

// ── ADVENTURER RANK HELPERS ────────────────────────────────────────
// Ranks form an ordered ladder (F < E < D < C < B < A < S < SR < SSR).
// rankIndex returns the 0-based position in that ladder; unknown ranks
// fall back to 0 (F). Mirrors the pattern in RelationshipTiers.
function rankIndex(rank) {
  const ranks = C().RANKS || ['F','E','D','C','B','A','S','SR','SSR'];
  const idx = ranks.indexOf(String(rank || 'F').toUpperCase());
  return idx < 0 ? 0 : idx;
}

function rankAtIndex(idx) {
  const ranks = C().RANKS || ['F','E','D','C','B','A','S','SR','SSR'];
  const clamped = Math.max(0, Math.min(ranks.length - 1, Number(idx) || 0));
  return ranks[clamped];
}

// Next rank up. Returns null at the cap (SSR).
function nextRank(rank) {
  const ranks = C().RANKS || ['F','E','D','C','B','A','S','SR','SSR'];
  const idx = rankIndex(rank);
  return idx >= ranks.length - 1 ? null : ranks[idx + 1];
}

// True if `rank` is at least `minRank` on the ladder. Treats null/empty
// minRank as unrestricted. Used by conditions and travel gates.
function meetsRank(rank, minRank) {
  if (!minRank) return true;
  return rankIndex(rank) >= rankIndex(minRank);
}

// Lower of two ranks. Used to apply a world ceiling.
function minRankOf(a, b) {
  if (!a) return b;
  if (!b) return a;
  return rankIndex(a) <= rankIndex(b) ? a : b;
}

// A member's effective rank inside a world is capped by the world's
// ceiling. If the world has no ceiling (or it's higher than the
// member's rank), the member's own rank passes through unchanged.
function effectiveRank(memberRank, worldCeiling) {
  return worldCeiling ? minRankOf(memberRank, worldCeiling) : (memberRank || 'F');
}

// ── MONSTER LEVEL SCALING ──────────────────────────────────────────
// Returns the multiplier to apply to stats/HP/MP/XP/RP for a monster
// spawned at `level`. Level 1 = baseline (×1.0).
function calcMonsterLevelScale(level) {
  const lvl = Math.max(1, Math.min(_monsterCap(), Number(level || 1)));
  const perLevel = Number(C().MONSTER_LEVEL_SCALING?.perLevel || 0.06);
  return 1 + perLevel * (lvl - 1);
}

function _monsterCap() {
  return Math.max(1, Number(C().MONSTER_LEVEL_SCALING?.maxLevel || 30));
}

// Resolve the level band [min, max] for a given world's ceiling rank.
// Used so monsters in a low-ceiling world stay genuinely low-level.
function levelBandForRank(rank) {
  const bands = C().MONSTER_LEVEL_SCALING?.levelBandByRank || {};
  const fallback = { min: 1, max: _monsterCap() };
  return bands[String(rank || 'F').toUpperCase()] || fallback;
}

// Pick the level at which to spawn a given monster, given party context
// and the current world's ceiling rank. The monster's own levelBand
// (if authored) intersected with the world ceiling's band defines the
// spawn window; we then pick a level near the party's level scaled by
// the scenario danger and any soft-recommendedRank penalty.
function pickMonsterLevel(monster: any, opts: any = {}) {
  const partyAvgLevel = Math.max(1, Number(opts.partyAvgLevel || 1));
  const danger        = Math.max(0, Number(opts.danger || 0));
  const recPenalty    = Math.max(0, Number(opts.recommendedPenalty || 0));
  const worldCeiling  = opts.worldCeiling || null;

  const monsterBand = monster?.levelBand || {};
  const ceilingBand = worldCeiling ? levelBandForRank(worldCeiling) : { min: 1, max: _monsterCap() };
  // World ceiling caps the MAX only — it must never push spawn level up
  // past a monster's authored band. Otherwise low-band monsters in a
  // high-ceiling world would spawn way above their authored range.
  const lo = Math.max(1, Number(monsterBand.min || 1));
  const hi = Math.min(_monsterCap(),
    Number(monsterBand.max || _monsterCap()),
    Number(ceilingBand.max || _monsterCap()));
  if (hi <= lo) return Math.max(1, lo);

  const target = Math.round(partyAvgLevel * 0.85 + danger * 1.5 + recPenalty);
  return Math.max(lo, Math.min(hi, target));
}

// ── RANK POINTS (RP) ───────────────────────────────────────────────
// RP gain from a single source (monster kill / quest completion /
// stat check / etc). The world ceiling acts as a soft cap: at
// memberRank == ceiling, awards are halved; above ceiling they taper
// linearly to zero. This stops grinding a low-ceiling world past
// its rank without removing the world's content.
function calcRpGain({ sourceRank = 'F', memberRank = 'F', worldCeiling = null,
                      base = 0, levelScale = 1 } = {}) {
  const award = Math.max(0, Number(base || 0)) * Math.max(0, Number(levelScale || 1));
  if (!award) return 0;
  if (!worldCeiling) return Math.round(award);
  const gap = rankIndex(worldCeiling) - rankIndex(memberRank);
  // gap >= 2 → full award, gap == 1 → 75%, gap == 0 (at ceiling) → 50%,
  // gap == -1 → 25%, gap <= -2 → 0%.
  let mult;
  if (gap >= 2) mult = 1.0;
  else if (gap === 1) mult = 0.75;
  else if (gap === 0) mult = 0.5;
  else if (gap === -1) mult = 0.25;
  else mult = 0;
  return Math.round(award * mult);
}

// RP needed to reach the given target rank (e.g. "E" → 60).
// Returns 0 for F (no threshold) or unknown ranks.
function rpThresholdFor(targetRank) {
  return Math.max(0, Number((C().PROGRESSION?.rpThresholds || {})[String(targetRank || '').toUpperCase()] || 0));
}

// Convenience: list the gates a member must clear to attempt rank-up
// to `targetRank`. Returns an object with each gate's status. The
// caller decides whether the member is eligible (all gates pass).
// `state` is optional and used only for chapter / story checks.
function rankUpGates(member: any = {}, targetRank?: any, state: any = null) {
  const adv = member.adventurer || { rank: member.rank || 'F', rankPoints: 0 };
  const PROG = C().PROGRESSION || {};
  const tgt = String(targetRank || nextRank(adv.rank) || '').toUpperCase();
  if (!tgt) return { ok: false, reasons: ['At max rank.'], target: null };

  const reasons = [];

  const needRp = rpThresholdFor(tgt);
  const haveRp = Math.max(0, Number(adv.rankPoints || 0));
  if (haveRp < needRp) reasons.push(`Need ${needRp} RP (have ${haveRp}).`);

  const needLevel = Number((PROG.minLevelByRank || {})[tgt] || 0);
  if (needLevel && Number(member.level || 1) < needLevel) {
    reasons.push(`Need character level ${needLevel}.`);
  }

  const needJobLevel = Number((PROG.minJobLevelByRank || {})[tgt] || 0);
  if (needJobLevel) {
    const progs: Record<string, any> = member.jobProgress || {};
    const top = Object.values(progs).reduce((m, p) => Math.max(m, Number(p?.level || 0)), 0);
    if (top < needJobLevel) reasons.push(`Need a job at level ${needJobLevel}.`);
  }

  const needChapter = Number((PROG.minChapterByRank || {})[tgt] || 0);
  if (needChapter && Number(state?.currentChapter || 1) < needChapter) {
    reasons.push(`Need story chapter ${needChapter}.`);
  }

  return {
    ok: reasons.length === 0,
    reasons,
    target: tgt,
    needRp, haveRp, needLevel, needJobLevel, needChapter
  };
}

// ── SKILL LEVEL SCALING ────────────────────────────────────────────
function calcSkillPowerAtLevel(basePower, level, powerPerLevel) {
  const rate = powerPerLevel || 0.15;
  return basePower * (1 + rate * (level - 1));
}

// ── PROGRESSION HELPERS ────────────────────────────────────────────
// Default AP / XP thresholds live on CONST.PROGRESSION; specific skills
// and jobs can override them. These helpers accept either an array of
// cumulative thresholds or a fallback to the global defaults.

function _progress() { return C().PROGRESSION || {}; }

// Resolve the AP curve for a skill record. Accepts authored
// skill.apThresholds, falls back to PROGRESSION.skillApThresholds.
function _resolveSkillApThresholds(skill) {
  const authored = skill?.apThresholds;
  if (Array.isArray(authored) && authored.length) return authored;
  return _progress().skillApThresholds || [0];
}

function getSkillMaxLevel(skill) {
  const authored = Number(skill?.levelScaling?.maxLevel
    ?? skill?.maxLevel
    ?? _progress().skillMaxLevelDefault
    ?? 5);
  const hardCap = _progress().skillMaxLevelCap;
  const capped = (hardCap == null) ? authored : Math.min(authored, hardCap);
  return Math.max(1, capped);
}

// Given a skill record and an AP total, return the resulting level
// capped by the skill's maxLevel.
function calcSkillLevelForAp(skill, ap) {
  const thresholds = _resolveSkillApThresholds(skill);
  const cap = getSkillMaxLevel(skill);
  const total = Math.max(0, Number(ap || 0));
  let level = 1;
  for (let i = 1; i < thresholds.length && i < cap; i++) {
    if (total >= thresholds[i]) level = i + 1;
    else break;
  }
  return Math.min(level, cap);
}

// AP needed for the next level-up of a skill (returns null if maxed).
function calcSkillApToNextLevel(skill, ap, level) {
  const thresholds = _resolveSkillApThresholds(skill);
  const cap = getSkillMaxLevel(skill);
  const lvl = Math.max(1, Number(level || 1));
  if (lvl >= cap) return null;
  const next = thresholds[lvl];
  if (next == null) return null;
  return Math.max(0, next - Math.max(0, Number(ap || 0)));
}

// AP earned by a single successful skill use, scaled by QTE grade.
function calcSkillApGainPerUse(skill, qteGrade) {
  const baseGain = Math.max(0, Number(skill?.apGain ?? 1));
  const mult = (_progress().apGainQteMultipliers || {})[qteGrade] ?? 1.0;
  return Math.max(1, Math.round(baseGain * mult));
}

// ── CHAR / JOB XP CURVES ──────────────────────────────────────────
function _resolveCharXpThresholds() {
  return _progress().charXpThresholds || [0];
}

function _resolveJobXpThresholds(job) {
  if (Array.isArray(job?.xpThresholds) && job.xpThresholds.length) return job.xpThresholds;
  return _progress().jobXpThresholds || [0];
}

function getCharMaxLevel() {
  return Math.max(1, Number(_progress().charMaxLevel || 20));
}

function getJobMaxLevel(job) {
  return Math.max(1, Number(job?.maxLevel || _progress().jobMaxLevelDefault || 10));
}

function calcCharLevelForXp(xp) {
  const thresholds = _resolveCharXpThresholds();
  const cap = getCharMaxLevel();
  const total = Math.max(0, Number(xp || 0));
  let level = 1;
  for (let i = 1; i < thresholds.length && i < cap; i++) {
    if (total >= thresholds[i]) level = i + 1;
    else break;
  }
  return Math.min(level, cap);
}

function calcCharXpToNextLevel(xp, level) {
  const thresholds = _resolveCharXpThresholds();
  const cap = getCharMaxLevel();
  const lvl = Math.max(1, Number(level || 1));
  if (lvl >= cap) return null;
  const next = thresholds[lvl];
  if (next == null) return null;
  return Math.max(0, next - Math.max(0, Number(xp || 0)));
}

function calcJobLevelForXp(job, xp) {
  const thresholds = _resolveJobXpThresholds(job);
  const cap = getJobMaxLevel(job);
  const total = Math.max(0, Number(xp || 0));
  let level = 1;
  for (let i = 1; i < thresholds.length && i < cap; i++) {
    if (total >= thresholds[i]) level = i + 1;
    else break;
  }
  return Math.min(level, cap);
}

function calcJobXpToNextLevel(job, xp, level) {
  const thresholds = _resolveJobXpThresholds(job);
  const cap = getJobMaxLevel(job);
  const lvl = Math.max(1, Number(level || 1));
  if (lvl >= cap) return null;
  const next = thresholds[lvl];
  if (next == null) return null;
  return Math.max(0, next - Math.max(0, Number(xp || 0)));
}

// ── CHARACTER LEVEL-UP STAT GAINS ─────────────────────────────────
// Returns {S,P,E,C,I,A,L} cumulative stat bonus for a character that
// has reached `level` from level 1, weighted by their base stats so
// dominant stats grow slightly faster.
function calcCharLevelStatBonus(rank, level, baseStats = {}) {
  const lvl = Math.max(1, Number(level || 1));
  if (lvl <= 1) return { S:0, P:0, E:0, C:0, I:0, A:0, L:0 };
  const STATS = C().STATS || ['S','P','E','C','I','A','L'];
  const perLevel = (_progress().statPointsPerCharLevelByRank || {})[rank] || 1;
  const totalPoints = perLevel * (lvl - 1);

  // Sort stats by base value descending; tiebreak by canonical order
  // so we hand out points deterministically (so saving/loading is stable).
  const ordered = [...STATS].sort((a, b) => {
    const da = Number(baseStats[a] || 0);
    const db = Number(baseStats[b] || 0);
    if (db !== da) return db - da;
    return STATS.indexOf(a) - STATS.indexOf(b);
  });

  const out = { S:0, P:0, E:0, C:0, I:0, A:0, L:0 };
  for (let i = 0; i < totalPoints; i++) {
    const stat = ordered[i % ordered.length];
    out[stat] = (out[stat] || 0) + 1;
  }
  return out;
}

// Aggregate stat bonuses across all earned levels of a job.
// job.levels[] entries shape: { level, statBonus:{S,P,...}, grantsSkills:[], grantsPassives:[] }
function calcJobLevelStatBonus(job, jobLevel) {
  const out = { S:0, P:0, E:0, C:0, I:0, A:0, L:0 };
  if (!job || !Array.isArray(job.levels)) return out;
  const cap = Math.min(getJobMaxLevel(job), Math.max(1, Number(jobLevel || 1)));
  for (const tier of job.levels) {
    const lvl = Number(tier?.level || 0);
    if (!lvl || lvl > cap) continue;
    const bonus = tier.statBonus || {};
    for (const k of Object.keys(out)) {
      out[k] += Number(bonus[k] || 0);
    }
  }
  return out;
}

// Collect all skill / passive IDs granted by a job up to its current level.
function collectJobGrants(job, jobLevel) {
  const out = { skills: [], passives: [] };
  if (!job || !Array.isArray(job.levels)) return out;
  const cap = Math.min(getJobMaxLevel(job), Math.max(1, Number(jobLevel || 1)));
  for (const tier of job.levels) {
    const lvl = Number(tier?.level || 0);
    if (!lvl || lvl > cap) continue;
    for (const sid of (tier.grantsSkills || [])) if (sid && !out.skills.includes(sid)) out.skills.push(sid);
    for (const pid of (tier.grantsPassives || [])) if (pid && !out.passives.includes(pid)) out.passives.push(pid);
  }
  return out;
}

// Decide whether `member` can unlock `job`. Returns { ok, reason }.
// member shape: { unlockedJobs[], jobProgress{}, maxJobs, availableBranches[], baseAvailableJobs[] }
// baseAvailableJobs is the explicit allow-list from the character record.
function canUnlockJob(job: any, member: any = {}, jobsCollection: any = {}) {
  if (!job || !job.id) return { ok: false, reason: 'no_job' };
  const unlocked = member.unlockedJobs || [];
  if (unlocked.includes(job.id)) return { ok: true, reason: 'already_unlocked' };

  // Slot cap
  const cap = Math.max(1, Number(member.maxJobs || 2));
  if (unlocked.length >= cap) return { ok: false, reason: 'max_jobs_reached' };

  // Branch / explicit allow-list. If the character has no branches and no
  // baseAvailableJobs allow-list, treat as wildcard (any job allowed).
  const branches = member.availableBranches || [];
  const allow = member.baseAvailableJobs || [];
  const hasAllowList = branches.length > 0 || allow.length > 0;
  if (hasAllowList) {
    const branchOk = job.branch ? branches.includes(job.branch) : false;
    const explicitOk = allow.includes(job.id);
    if (!branchOk && !explicitOk) return { ok: false, reason: 'branch_not_available' };
  }

  // Prerequisite job at minLevel
  const req = job.unlockRequirement;
  if (req && req.jobId) {
    const prereq = jobsCollection[req.jobId];
    if (!prereq) return { ok: false, reason: 'prereq_job_missing' };
    if (!unlocked.includes(req.jobId)) return { ok: false, reason: 'prereq_not_unlocked' };
    const prog = (member.jobProgress || {})[req.jobId] || { level: 1 };
    if (Number(prog.level || 1) < Number(req.minLevel || 1)) {
      return { ok: false, reason: 'prereq_level_low', need: req.minLevel };
    }
  }

  return { ok: true };
}

// ── SKILL LEVEL PERKS ─────────────────────────────────────────────
// Apply cumulative perks (modifiers + extra effects) up to `level`
// on top of the base skill. Returns a new merged skill object.
// Schema for perks (authored on the skill):
//   levelPerks: [
//     { level: 2, modifiers: { ap: -1, range: +1, power: +5, cooldown: -1, mp: -1 },
//       addEffects: [{ effectId, overrides? }],
//       description: "..." }
//   ]
// Modifiers are deltas to the base values. Power deltas stack with
// calcSkillPowerAtLevel multiplicative scaling applied separately.
function applySkillLevelPerks(skill, level) {
  if (!skill) return skill;
  const lvl = Math.max(1, Number(level || 1));
  const perks = Array.isArray(skill.levelPerks) ? skill.levelPerks : [];
  if (!perks.length) return skill;

  const merged = { ...skill };
  let apDelta = 0, mpDelta = 0, rangeDelta = 0, cdDelta = 0, powerDelta = 0;
  let extraEffects = [];

  for (const perk of perks) {
    const perkLevel = Number(perk?.level || 0);
    if (!perkLevel || perkLevel > lvl) continue;
    const m = perk.modifiers || {};
    apDelta += Number(m.ap || 0);
    mpDelta += Number(m.mp || 0);
    rangeDelta += Number(m.range || 0);
    cdDelta += Number(m.cooldown || 0);
    powerDelta += Number(m.power || 0);
    for (const ref of (perk.addEffects || [])) {
      if (ref && ref.effectId) extraEffects.push(ref);
    }
  }

  if (apDelta || mpDelta || rangeDelta || cdDelta || powerDelta) {
    merged.ap = Math.max(0, Number(merged.ap || 0) + apDelta);
    merged.mp = Math.max(0, Number(merged.mp || 0) + mpDelta);
    merged.range = Math.max(0, Number(merged.range || 0) + rangeDelta);
    merged.cooldown = Math.max(0, Number(merged.cooldown || 0) + cdDelta);
    merged.power = Math.max(0, Number(merged.power || 0) + powerDelta);
  }
  if (extraEffects.length) {
    merged.effects = [...(merged.effects || []), ...extraEffects];
  }
  return merged;
}

// Return the next perk a skill will unlock above its current level
// (for tooltip display). Null if at cap.
function getNextSkillPerk(skill, level) {
  if (!skill || !Array.isArray(skill.levelPerks)) return null;
  const lvl = Math.max(1, Number(level || 1));
  let best = null;
  for (const perk of skill.levelPerks) {
    const perkLevel = Number(perk?.level || 0);
    if (!perkLevel || perkLevel <= lvl) continue;
    if (!best || perkLevel < Number(best.level || 0)) best = perk;
  }
  return best;
}

// List of perks already earned at the given level (for UI summary).
function getEarnedSkillPerks(skill, level) {
  if (!skill || !Array.isArray(skill.levelPerks)) return [];
  const lvl = Math.max(1, Number(level || 1));
  return skill.levelPerks
    .filter((perk) => {
      const perkLevel = Number(perk?.level || 0);
      return perkLevel && perkLevel <= lvl;
    })
    .sort((a, b) => Number(a.level) - Number(b.level));
}

// ── PASSIVE RANK PROGRESSION ──────────────────────────────────────
function applyPassiveRankPerks(passive, rank) {
  if (!passive) return passive;
  const lvl = Math.max(1, Math.min(getPassiveMaxRank(passive), Number(rank || 1)));
  const earned = getEarnedPassiveRankPerks(passive, lvl);
  if (!earned.length) return passive;

  const merged = {
    ...passive,
    effects: (passive.effects || []).map((ref) => _cloneEffectRef(_normalizeEffectRef(ref))).filter(Boolean)
  };
  const baseFieldDeltas: Record<string, any> = {};
  const extraEffects = [];

  for (const perk of earned) {
    const modifiers = perk.modifiers || {};
    const valueDelta = _cleanNumber(modifiers.value ?? modifiers.effectValue);
    if (valueDelta) baseFieldDeltas.value = _cleanNumber((baseFieldDeltas.value || 0) + valueDelta);

    const fieldDeltas = modifiers.fields || modifiers.effectFields || {};
    for (const [field, delta] of Object.entries(fieldDeltas)) {
      const clean = _cleanNumber(delta);
      if (field && clean) baseFieldDeltas[field] = _cleanNumber((baseFieldDeltas[field] || 0) + clean);
    }

    for (const ref of [...(perk.addEffects || []), ...(perk.effects || [])]) {
      const normalized = _cloneEffectRef(_normalizeEffectRef(ref));
      if (normalized?.effectId) extraEffects.push({ ...normalized, _passivePerkEffect: true });
    }
  }

  if (Object.keys(baseFieldDeltas).length) {
    merged.effects = merged.effects.map((ref) => ({
      ...ref,
      _passiveRankFieldDeltas: {
        ...(ref._passiveRankFieldDeltas || {}),
        ...baseFieldDeltas
      }
    }));
  }
  if (extraEffects.length) merged.effects = [...merged.effects, ...extraEffects];
  return merged;
}

function getNextPassiveRankPerk(passive, rank) {
  if (!passive || !Array.isArray(passive.rankPerks)) return null;
  const lvl = Math.max(1, Number(rank || 1));
  let best = null;
  for (const perk of passive.rankPerks) {
    const perkRank = _perkRank(perk);
    if (!perkRank || perkRank <= lvl) continue;
    if (!best || perkRank < _perkRank(best)) best = perk;
  }
  return best;
}

function getEarnedPassiveRankPerks(passive, rank) {
  if (!passive || !Array.isArray(passive.rankPerks)) return [];
  const lvl = Math.max(1, Number(rank || 1));
  return passive.rankPerks
    .filter((perk) => {
      const perkRank = _perkRank(perk);
      return perkRank && perkRank <= lvl;
    })
    .sort((a, b) => _perkRank(a) - _perkRank(b));
}

function _perkRank(perk: any = {}) {
  return Number(perk.rank ?? perk.level ?? perk.targetRank ?? 0);
}

function _normalizeEffectRef(ref) {
  if (!ref) return null;
  if (typeof ref === 'string') return { effectId: ref, overrides: {} };
  const out = { ...ref };
  if (!out.effectId && out.id) {
    out.effectId = out.id;
    delete out.id;
  }
  return out;
}

function _cloneEffectRef(ref) {
  if (!ref) return null;
  const out = { ...ref };
  if (ref.overrides) out.overrides = { ...ref.overrides };
  if (ref.conditions) out.conditions = Array.isArray(ref.conditions) ? [...ref.conditions] : { ...ref.conditions };
  if (ref.children) out.children = ref.children.map((child) => _cloneEffectRef(child)).filter(Boolean);
  if (ref._passiveRankFieldDeltas) out._passiveRankFieldDeltas = { ...ref._passiveRankFieldDeltas };
  return out;
}

function getPassiveMaxRank(passive: any = {}) {
  const PROG = _progress();
  const authored = Number(passive?.rankScaling?.maxRank ?? passive?.maxRank ?? PROG.passiveMaxRankDefault ?? 5);
  let cap = Math.max(1, Math.floor(Number.isFinite(authored) ? authored : 5));
  const hardCap = PROG.passiveMaxRankCap;
  if (hardCap != null) cap = Math.min(cap, Math.max(1, Number(hardCap || cap)));
  return cap;
}

function calcPassiveRankCost(passive: any = {}, currentRank = 1) {
  const now = Math.max(1, Number(currentRank || 1));
  const targetRank = now + 1;
  if (!passive || targetRank > getPassiveMaxRank(passive)) return null;

  const explicit = (Array.isArray(passive.rankRequirements) ? passive.rankRequirements : [])
    .find((entry) => Number(entry?.rank || entry?.targetRank || 0) === targetRank);
  if (explicit) {
    return _normalizeBundle(explicit.cost || explicit.costs || explicit.requires || {
      materials: explicit.materials || {}
    });
  }

  const PROG = _progress();
  const authoredCost = passive.rankUpCost || {};
  const materialId = authoredCost.materialId || passive.rankMaterialId || PROG.passiveRankMaterialDefault;
  if (!materialId) return null;
  const baseQty = Number(authoredCost.baseQty ?? 1);
  const qtyPerRank = Number(authoredCost.qtyPerRank ?? 1);
  const qty = Math.max(1, Math.round(baseQty + Math.max(0, targetRank - 2) * qtyPerRank));
  return { materials: { [materialId]: qty } };
}

function applyPassiveRankToEffect(effect: any = {}, passive: any = {}, rank = 1) {
  const lvl = Math.max(1, Math.min(getPassiveMaxRank(passive), Number(rank || 1)));
  const scaling = passive?.rankScaling || {};
  if (!effect || lvl <= 1 || scaling.enabled === false) return effect;

  const perRank = Number(scaling.valuePerRank ?? _progress().passiveRankValuePerRank ?? 0.15);
  if (!perRank) return { ...effect, passiveRank: lvl };

  const multiplier = 1 + (perRank * (lvl - 1));
  const fields = Array.isArray(scaling.fields) && scaling.fields.length ? scaling.fields : ['value'];
  const out = { ...effect, passiveRank: lvl };
  for (const field of fields) {
    if (typeof out[field] === 'number') out[field] = _scaleRankNumber(out[field], multiplier);
  }
  if (Array.isArray(out.children) && out.children.length) {
    out.children = out.children.map((child) => applyPassiveRankToEffect(child, passive, lvl));
  }
  return out;
}

function _scaleRankNumber(value, multiplier) {
  const scaled = Number(value || 0) * Number(multiplier || 1);
  return Math.round(scaled * 100) / 100;
}

function _cleanNumber(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function _normalizeBundle(bundle = {}) {
  const out = {};
  for (const bucket of ['currencies', 'items', 'materials', 'food', 'questItems']) {
    const src = bundle?.[bucket] || {};
    const clean = {};
    for (const [id, qty] of Object.entries(src)) {
      const n = Math.max(0, Number(qty || 0));
      if (id && n > 0) clean[id] = n;
    }
    if (Object.keys(clean).length) out[bucket] = clean;
  }
  return out;
}

// Effective skill/passive slot caps and SP budgets are computed from:
//   1. base authored value on the character (or defaults)
//   2. + per-level steps (every N levels → +X)
//   3. + per-rank bonus
//   4. + sum of bonuses contributed by the active job tiers
//   5. + sum of bonuses contributed by EQUIPPED items (carried in
//      member.equippedItemBonuses for the future when items declare them)
//
// The caller passes the member shape (level, rank, currentJob, jobProgress)
// and base char (for authored caps). Item bonuses are read off the member
// record so callers don't have to re-resolve item DataStore lookups here.
// DataStore lookup helper available inside Formulas without hard imports.
// Defined first so the helpers below can call it freely.
function _DS() { return window.CJS && window.CJS.DataStore; }

function _bonusFromCadence(level, cadence) {
  const every = Math.max(1, Number(cadence?.every || 1));
  const amount = Number(cadence?.amount || 0);
  if (!amount) return 0;
  const lvl = Math.max(1, Number(level || 1));
  return Math.floor((lvl - 1) / every) * amount;
}

function _jobSlotBonus(member: any, base: any, kind: string) {
  if (!member?.currentJob) return 0;
  const job = _DS()?.get?.('jobs', member.currentJob);
  if (!job || !Array.isArray(job.levels)) return 0;
  const cap = Math.min(getJobMaxLevel(job), Math.max(1, Number(member.jobProgress?.[member.currentJob]?.level || 1)));
  let total = 0;
  for (const tier of job.levels) {
    const lvl = Number(tier?.level || 0);
    if (!lvl || lvl > cap) continue;
    total += Number(tier?.[kind] || 0);
  }
  return total;
}

function _itemSlotBonus(member: any, kind: string) {
  if (!member?.equipment) return 0;
  let total = 0;
  for (const itemId of member.equipment) {
    const item = _DS()?.get?.('items', itemId);
    if (!item) continue;
    total += Number(item[kind] || 0);
  }
  return total;
}

function _passiveSlotBonus(member: any, kind: string) {
  // Passives can themselves contribute slot/SP bonuses (e.g. a passive that
  // grants +1 skill slot). Read from the resolved passive record's
  // top-level field. We count only EQUIPPED passives so the budget is
  // self-consistent (an unequipped passive shouldn't grant its own slot).
  let total = 0;
  const ids = new Set<any>(member?.equippedPassives || []);
  for (const pid of ids) {
    const passive = _DS()?.get?.('passives', pid);
    if (!passive) continue;
    total += Number(passive[kind] || 0);
  }
  return total;
}

function calcEffectiveSkillSlots(member: any = {}, base: any = {}) {
  const PROG = _progress();
  const start = Number(member.skillSlots ?? base.skillSlots ?? PROG.defaultSkillSlots ?? 4);
  return Math.max(0, start
    + _bonusFromCadence(member.level, PROG.skillSlotsPerCharLevel)
    + Number((PROG.rankSkillSlotBonus || {})[member.rank || base.rank || 'F'] || 0)
    + _jobSlotBonus(member, base, 'skillSlotBonus')
    + _itemSlotBonus(member, 'skillSlotBonus')
    + _passiveSlotBonus(member, 'skillSlotBonus'));
}

function calcEffectivePassiveSlots(member: any = {}, base: any = {}) {
  const PROG = _progress();
  const start = Number(member.passiveSlots ?? base.passiveSlots ?? PROG.defaultPassiveSlots ?? 3);
  return Math.max(0, start
    + _bonusFromCadence(member.level, PROG.passiveSlotsPerCharLevel)
    + Number((PROG.rankPassiveSlotBonus || {})[member.rank || base.rank || 'F'] || 0)
    + _jobSlotBonus(member, base, 'passiveSlotBonus')
    + _itemSlotBonus(member, 'passiveSlotBonus')
    + _passiveSlotBonus(member, 'passiveSlotBonus'));
}

function calcEffectiveSkillPoints(member: any = {}, base: any = {}) {
  const PROG = _progress();
  const start = Number(member.skillPoints ?? base.skillPoints ?? PROG.defaultSkillPoints ?? 4);
  return Math.max(0, start
    + _bonusFromCadence(member.level, PROG.skillPointsPerCharLevel)
    + Number((PROG.rankSkillPointBonus || {})[member.rank || base.rank || 'F'] || 0)
    + _jobSlotBonus(member, base, 'skillPointBonus')
    + _itemSlotBonus(member, 'skillPointBonus')
    + _passiveSlotBonus(member, 'skillPointBonus'));
}

function calcEffectivePassivePoints(member: any = {}, base: any = {}) {
  const PROG = _progress();
  const start = Number(member.passivePoints ?? base.passivePoints ?? PROG.defaultPassivePoints ?? 3);
  return Math.max(0, start
    + _bonusFromCadence(member.level, PROG.passivePointsPerCharLevel)
    + Number((PROG.rankPassivePointBonus || {})[member.rank || base.rank || 'F'] || 0)
    + _jobSlotBonus(member, base, 'passivePointBonus')
    + _itemSlotBonus(member, 'passivePointBonus')
    + _passiveSlotBonus(member, 'passivePointBonus'));
}

// SP cost of a single skill / passive record. Authors set spCost on the
// record; falls back to PROGRESSION.defaultSpCost (currently 1).
function calcSpCost(record) {
  const PROG = _progress();
  const authored = Number(record?.spCost);
  if (Number.isFinite(authored) && authored >= 0) return authored;
  return Number(PROG.defaultSpCost ?? 1);
}

// Sum SP cost across an array of skill / passive ids.
function calcEquippedSpCost(ids = [], type = 'skills') {
  let total = 0;
  for (const id of ids || []) {
    const rec = _DS()?.get?.(type, id);
    if (!rec) continue;
    total += calcSpCost(rec);
  }
  return total;
}

// ── PUBLIC API ─────────────────────────────────────────────────────
export const Formulas = Object.freeze({
  calcMaxHP, calcMaxMP, calcPlotArmorHP,
  calcPhysicalDR, calcMagicDR, calcChaosDR, calcDR,
  calcEffectiveSkillPower, calcBaseDamage, calcMitigatedDamage, calcFinalDamage,
  getElementMultiplier,
  calcHitCheck, calcCritChance, calcCritMultiplier, rollCrit,
  calcInitiative, calcMovement,
  calcKnockbackDistance, calcWallCollisionDamage, calcUnitCollisionDamage,
  doesKnockbackChain, cellBlocksLoS, getTerrainMoveCost,
  // Flanking / Elevation / Env interactions
  getFlankPosition, facingFromDelta,
  calcElevationBonuses, calcBarrelExplosionDamage,
  calcDropChance,
  applyWorldCeiling, applyWorldCeilingToStats,
  // Rank ladder + world ceiling
  rankIndex, rankAtIndex, nextRank, meetsRank, minRank: minRankOf, effectiveRank,
  // Monster level scaling
  calcMonsterLevelScale, levelBandForRank, pickMonsterLevel,
  // Adventurer rank progression
  calcRpGain, rpThresholdFor, rankUpGates,
  calcSkillPowerAtLevel,
  // Progression
  getSkillMaxLevel, calcSkillLevelForAp, calcSkillApToNextLevel, calcSkillApGainPerUse,
  getCharMaxLevel, calcCharLevelForXp, calcCharXpToNextLevel,
  getJobMaxLevel, calcJobLevelForXp, calcJobXpToNextLevel,
  calcCharLevelStatBonus, calcJobLevelStatBonus, collectJobGrants,
  canUnlockJob,
  applySkillLevelPerks, getNextSkillPerk, getEarnedSkillPerks,
  getPassiveMaxRank, calcPassiveRankCost,
  applyPassiveRankPerks, getNextPassiveRankPerk, getEarnedPassiveRankPerks,
  applyPassiveRankToEffect,
  // SP / slot budgets
  calcEffectiveSkillSlots, calcEffectivePassiveSlots,
  calcEffectiveSkillPoints, calcEffectivePassivePoints,
  calcSpCost, calcEquippedSpCost
});

// Runtime compatibility install. The historical CJSFormulas interface predates
// this port and declares calcMitigatedDamage as returning the full
// CJSCalcFinalDamageResult, but it has always returned only the mitigation
// subset; the exported `Formulas` keeps its accurate inferred shapes (better for
// future TS importers) while the window contract stays exactly as before.
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.Formulas = Formulas as unknown as CJSFormulas;
