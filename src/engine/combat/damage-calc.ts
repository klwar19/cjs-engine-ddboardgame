// damage-calc.ts — Tier 3 TS port of js/combat/damage-calc.js (engine cluster:
// combat). Full damage pipeline: hit check → crit roll → base dmg → QTE →
// element → weather → DR → apply (HP reduction, absorb shields, death/overkill,
// ultimate accrual, env interactions). Also healing, MP, tick damage, raw
// damage, and knockback-collision application.
//
// Reads: window.CJS Formulas/CONST/Dice/DiceService/CombatLog/AnimationBus/
// AudioManager/CombatManager/Weather/GridEngine/DataStore/StatusManager/
// EffectResolver.
// Used by: effect-resolver, action-handler, status-manager.
//
// Exports `DamageCalc`; installs window.CJS.DamageCalc via one documented cast —
// the historical CJSDamageCalc interface omits applyKnockbackCollisions (present
// here), so the export keeps its accurate shape. Bodies verbatim.

const F    = () => window.CJS.Formulas;
const C    = () => window.CJS.CONST;
const Dice = () => window.CJS.Dice;
const DS   = () => window.CJS.DiceService;   // preferred — falls back to Dice
const Log  = () => window.CJS.CombatLog;
const AB   = () => (window.CJS as any).AnimationBus;
const AM   = () => (window.CJS as any).AudioManager;
const CM   = (): any => window.CJS.CombatManager;
const WX   = () => (window.CJS as any).Weather;
const GE   = () => (window.CJS as any).GridEngine;

function _rollDice(expr, source) {
  // Prefer DiceService so manual/queued dice override works.
  if (window.CJS.DiceService) return DS().roll(expr, source);
  return Dice().roll(expr);
}
function _d20(source) {
  if (window.CJS.DiceService) return DS().d20(source).total;
  return Dice().d20();
}
function _d12(source) {
  if (window.CJS.DiceService) return DS().d12(source).total;
  return Dice().d12();
}

function _basicAttackScalingStat(attacker, weaponData) {
  const baseRange = weaponData?.range ?? attacker.basicAttackRange ?? attacker.attackRange ?? 1;
  return baseRange > 1 ? 'P' : 'S';
}

// ── FULL ATTACK PIPELINE ──────────────────────────────────────────
function computeAttack(args) {
  const { attacker, target, skill, qteMultiplier, qteGrade, weaponData } = args;
  if (!attacker || !target) return { hit: false, miss: true, isCritical: false, damage: 0 };

  // ── 0. POSITIONAL BONUSES (elevation + flanking) ─────────────
  const positional = _computePositionalBonuses(attacker, target, skill, weaponData);

  // ── 1. HIT CHECK ──────────────────────────────────────────────
  let hit = true, attackScore = 0, defendScore = 0;
  if (skill && skill.unavoidable) {
    hit = true;
  } else {
    const attackRoll = _d20('hit_check_attacker');
    const defendRoll = _d12('hit_check_defender');
    const attackerP  = attacker.compiledStats?.P ?? attacker.stats?.P ?? 0;
    const defenderA  = target.compiledStats?.A   ?? target.stats?.A   ?? 0;
    const accBonus   = (attacker.accuracyBonus || 0) + (positional.accuracyBonus || 0);
    const evaBonus   = target.evasionBonus    || 0;
    const check = F().calcHitCheck(attackerP, accBonus, attackRoll,
                                   defenderA, evaBonus, defendRoll);
    hit = check.hit;
    attackScore = check.attackScore;
    defendScore = check.defendScore;
  }

  if (!hit) {
    return {
      hit: false, miss: true, dodged: true, isCritical: false,
      damage: 0, breakdown: { final: 0, reason: 'miss', positional },
      positional,
      attackScore, defendScore
    };
  }

  // ── 2. CRIT CHECK ─────────────────────────────────────────────
  const luck = attacker.compiledStats?.L ?? attacker.stats?.L ?? 0;
  const critBonusTotal = (attacker.critBonus || 0) + (positional.critBonus || 0);
  const isCritical = !!skill?.alwaysCrit ||
                     F().rollCrit(luck, critBonusTotal);

  // ── 3. BASE DAMAGE ────────────────────────────────────────────
  const basePower = skill?.power
    ?? attacker.basicAttackPower
    ?? _defaultPowerFromWeapon(attacker)
    ?? 10;
  const skillLevel = skill?.level || 1;
  const effectivePower = F().calcSkillPowerAtLevel(basePower, skillLevel,
                                                    skill?.levelScaling?.powerPerLevel);

  // Primary scaling stat
  const scalingStat = skill?.scalingStat || _basicAttackScalingStat(attacker, weaponData);
  const primaryStatValue = attacker.compiledStats?.[scalingStat]
                        ?? attacker.stats?.[scalingStat]
                        ?? 5;

  // Dice: skill may have its own dice (e.g. "2d6"), else default small die
  const diceStr = skill?.dice || '1d6';
  const diceRoll = _rollDice(diceStr, `skill_dice_${skill?.id || 'basic'}`).total;

  // QTE multiplier: from qte-manager, or neutral 1.0
  const qMult = qteMultiplier ?? 1.0;

  // Element multiplier: target's weak/resist/immune
  const element = skill?.element || weaponData?.element || 'Physical';
  const elementMult = F().getElementMultiplier(element, target);

  // Weather multiplier
  let weatherMult = 1;
  try {
    const env = CM()?.getEnvironment?.();
    if (env && env.id !== 'normal' && WX()) {
      weatherMult = WX().applyDamageMods(element, { environment: env });
    }
  } catch (e) {}

  // Crit multiplier
  const critMult = isCritical ? F().calcCritMultiplier(attacker.critDmgBonus || 0) : 1.0;

  // DR — uses skill damageType, then weapon damageType, then Physical
  const damageType = skill?.damageType || weaponData?.damageType || 'Physical';
  const drSources  = target.dr || {};
  let dr;
  switch (damageType) {
    case 'Physical': dr = drSources.physical || 0; break;
    case 'Magic':    dr = drSources.magic    || 0; break;
    case 'Chaos':    dr = drSources.chaos    || 0; break;
    case 'True':     dr = 0; break;
    default:         dr = 0;
  }

  // Passive damage mods from attacker
  const bonusFlat    = attacker.damageFlat    || 0;
  const bonusPercent = (attacker.damagePercent || 0) +
                       ((attacker.damageByElement || {})[element] || 0);

  // Compute
  const result = F().calcFinalDamage({
    skillPower: effectivePower,
    primaryStat: primaryStatValue,
    diceRoll,
    luckValue: luck,
    qteMultiplier: qMult * critMult,  // fold crit into the same multiplier step
    elementMultiplier: elementMult * weatherMult,
    dr,
    bonusDamageFlat:    bonusFlat,
    bonusDamagePercent: bonusPercent
  });

  // Persona cross-world multipliers
  const dealtMult = Number(attacker.damageDealtMultiplier ?? 1) || 1;
  const takenMult = Number(target.damageTakenMultiplier ?? 1) || 1;
  if (dealtMult !== 1 || takenMult !== 1) {
    result.final = Math.max(0, Math.round(result.final * dealtMult * takenMult));
  }

  // Hook overkill in
  const overkill = Math.max(0, result.final - (target.currentHP || 0));

  return {
    hit: true,
    miss: false,
    dodged: false,
    isCritical,
    damage: result.final,
    breakdown: {
      basePower:    effectivePower,
      primaryStat:  primaryStatValue,
      scalingStat,
      luck,
      diceRoll,
      qteMultiplier: qMult,
      critMultiplier: critMult,
      elementMultiplier: elementMult,
      weatherMultiplier: weatherMult,
      dr,
      damageType,
      element,
      bonusFlat,
      bonusPercent,
      base: result.base,
      withBonuses: result.withBonuses,
      withQTE: result.withQTE,
      withElement: result.withElement,
      final: result.final,
      overkill,
      // Positional context for the log + UI.
      flank:          positional.flank,
      flankCritBonus: positional.critBonus,
      elevationStep:  positional.elevationStep,
      elevationAcc:   positional.accuracyBonus,
      elevationRange: positional.rangeBonus
    },
    positional,
    qteGrade,
    attackScore, defendScore
  };
}

// Compute flanking + elevation bonuses derived from grid state.
function _computePositionalBonuses(attacker, target, skill, weaponData) {
  const out = {
    flank:          'front',
    critBonus:      0,
    accuracyBonus:  0,
    rangeBonus:     0,
    elevationStep: 0
  };
  const ge = GE();
  if (!ge || !attacker || !target || !attacker.pos || !target.pos) return out;

  // Flanking — uses target's tracked facing.
  if (ge.getFlankPosition) {
    try {
      const f = ge.getFlankPosition(attacker, target);
      if (f) {
        out.flank = f.position || 'front';
        out.critBonus = Number(f.critBonus || 0);
      }
    } catch (e) {}
  }

  // Elevation — high ground = ranged bonuses.
  if (ge.getUnitElevation) {
    try {
      const atkE = ge.getUnitElevation(attacker);
      const tgtE = ge.getUnitElevation(target);
      const baseRange = Number(skill?.range || weaponData?.range || attacker.basicAttackRange || 1);
      const bonuses = F().calcElevationBonuses(atkE, tgtE, baseRange);
      out.accuracyBonus  = bonuses.accuracy;
      out.rangeBonus     = bonuses.range;
      out.elevationStep  = bonuses.advantage;
    } catch (e) {}
  }
  return out;
}

function _defaultPowerFromWeapon(unit) {
  if (!unit.equipment) return null;
  const DS = window.CJS.DataStore;
  if (!DS) return null;
  for (const iid of unit.equipment) {
    const item = DS.get('items', iid);
    if (item?.slot === 'weapon' && item.weaponData) {
      return item.weaponData.baseDamage;
    }
  }
  return null;
}

// ── APPLY DAMAGE ──────────────────────────────────────────────────
function applyDamage({ attacker, target, amount, element, damageType, skill, isCritical, qteGrade, breakdown }) {
  if (!target || amount <= 0) {
    return { applied: 0, absorbed: 0, overkill: 0, killed: false, newHP: target?.currentHP || 0 };
  }

  let remaining = amount;
  let absorbed = 0;

  // ── One-shot damage negation (Aegis Burst ultimate) ──
  if (target.nextDamageNegated) {
    target.nextDamageNegated = false;
    const _SMneg = window.CJS.StatusManager;
    if (_SMneg?.removeStatus) {
      try { _SMneg.removeStatus(target, 'negate_next_damage'); } catch (e) {}
    }
    try { Log().record({ type: 'damage_negated', actor: attacker, target, tags: ['ultimate', 'negate'], data: { amount } }); } catch (e) {}
    try { AB()?.emit('damage_negated', { target }); } catch (e) {}
    return { applied: 0, absorbed: amount, overkill: 0, killed: false, newHP: target.currentHP || 0, negated: true };
  }

  // ── Absorb shield check ──
  const _SM = window.CJS.StatusManager;
  if (_SM && _SM.absorbDamage) {
    const before = remaining;
    remaining = _SM.absorbDamage(target, remaining, damageType);
    absorbed = before - remaining;
  }

  const prevHP = target.currentHP || 0;
  const newHP  = Math.max(0, prevHP - remaining);
  target.currentHP = newHP;

  const overkill = Math.max(0, remaining - prevHP);
  const killed   = newHP === 0 && prevHP > 0;
  const applied  = prevHP - newHP;

  // ── Ultimate meter accrual ──
  _grantUltimate(attacker, applied * 0.10);
  _grantUltimate(target,   applied * 0.05);
  if (killed) _grantUltimate(attacker, 25);

  // Log the hit
  Log().logHit({
    actor: attacker, target,
    damage: applied + absorbed, element, damageType, skill, isCritical, qteGrade,
    breakdown: { ...breakdown, absorbed }
  });

  // ── Environmental interactions ──
  _triggerEnvInteractions({
    attacker, target, element, damageType, skill
  });

  // Animation: damage flash on target cell
  if (applied > 0 || absorbed > 0) {
    try {
      AB()?.emit('damage', {
        attacker, target, amount: applied, absorbed,
        damageType, element, skill, isCritical: !!isCritical
      });
    } catch (e) {}
    if (absorbed > 0) {
      try { AM()?.playSfx('absorb_guard', { volume: applied > 0 ? 0.42 : 0.58 }); } catch (e) {}
    }
  }

  // Log kill
  if (killed) {
    Log().logKill({ actor: attacker, target, overkill, finalBlowSkill: skill });
  }

  return { applied, absorbed, overkill, killed, newHP };
}

// ── APPLY HEALING ─────────────────────────────────────────────────
function applyHeal({ actor, target, amount, source }) {
  if (!target || amount <= 0) return { applied: 0, newHP: target?.currentHP || 0, blocked: false };

  // ── Prevents healing check (curse, etc.) ──
  const _SM = window.CJS.StatusManager;
  if (_SM && _SM.canBeHealed && !_SM.canBeHealed(target)) {
    Log().record({
      type: 'heal', actor, target,
      tags: ['heal', 'heal_blocked', 'prevents_healing'],
      data: { amount, source, blocked: true },
      message: `${target.name || 'Target'} cannot be healed!`
    });
    return { applied: 0, newHP: target.currentHP, blocked: true };
  }

  const prevHP = target.currentHP || 0;
  const newHP  = Math.min(target.maxHP || prevHP, prevHP + amount);
  target.currentHP = newHP;
  const applied = newHP - prevHP;
  Log().logHeal({ actor, target, amount: applied, source });
  if (applied > 0) {
    try { AB()?.emit('heal', { actor, target, amount: applied, source }); } catch (e) {}
    try { AM()?.playSfx('heal', { volume: 0.72 }); } catch (e) {}
  }
  return { applied, newHP, blocked: false };
}

// ── APPLY MP CHANGE ───────────────────────────────────────────────
function applyMP({ target, delta }) {
  if (!target) return 0;
  const prev = target.currentMP || 0;
  const max  = target.maxMP || 0;
  const next = Math.max(0, Math.min(max, prev + delta));
  target.currentMP = next;
  return next - prev;
}

// ── TICK DAMAGE (for DoTs — burn, poison, bleed, etc.) ───────────
function applyTickDamage({ source, target, amount, element, damageType, statusId }) {
  if (!target || amount <= 0) return { applied: 0, killed: false };

  // Element interaction
  const elementMult = F().getElementMultiplier(element || 'Physical', target);

  // DR
  const drSources = target.dr || {};
  let dr = 0;
  switch (damageType) {
    case 'Physical': dr = drSources.physical || 0; break;
    case 'Magic':    dr = drSources.magic    || 0; break;
    case 'Chaos':    dr = drSources.chaos    || 0; break;
    default:         dr = 0;  // pure DoT or "True"
  }

  const isImmune = elementMult === 0;
  const raw = Math.floor(amount * elementMult);
  const mitigation = isImmune
    ? { final: 0 }
    : F().calcMitigatedDamage(raw, dr / 2);  // DoTs use half defense rating unless immune
  let final = mitigation.final;

  // ── Absorb shield check for DoT damage too ──
  let absorbed = 0;
  const _SM = window.CJS.StatusManager;
  if (_SM && _SM.absorbDamage) {
    const before = final;
    final = _SM.absorbDamage(target, final, damageType);
    absorbed = before - final;
  }

  const prevHP = target.currentHP || 0;
  const newHP  = Math.max(0, prevHP - final);
  target.currentHP = newHP;

  const killed = newHP === 0 && prevHP > 0;
  Log().logStatusTick({ target, statusId, effect: 'tick_damage', amount: final + absorbed });
  if (killed) {
    Log().logKill({ actor: source, target, overkill: final - prevHP, finalBlowSkill: null });
  }

  return { applied: Math.min(final, prevHP), absorbed, killed };
}

// ── OUT-OF-BAND DAMAGE (reflect, thorns, collision) ──────────────
function applyRawDamage({ source, target, amount, reason, damageType, element }: { source?: any; target?: any; amount?: any; reason?: any; damageType?: any; element?: any }) {
  if (!target || amount <= 0) return { applied: 0, killed: false };
  const prevHP = target.currentHP || 0;
  const newHP  = Math.max(0, prevHP - amount);
  target.currentHP = newHP;
  const killed = newHP === 0 && prevHP > 0;
  const applied = Math.min(amount, prevHP);

  // Out-of-band damage also feeds ultimate meters (smaller credit).
  _grantUltimate(source, applied * 0.05);
  _grantUltimate(target, applied * 0.05);
  if (killed) _grantUltimate(source, 25);

  Log().record({
    type: 'damage',
    actor: source, target,
    tags: ['damage', reason ? `damage_${reason}` : 'damage_raw'],
    data: { amount: applied, reason, damageType, element }
  });
  if (killed) Log().logKill({ actor: source, target, overkill: amount - prevHP });

  // Environmental interactions still apply for effect/DoT damage.
  if (element && reason !== 'cliff_fall' && reason !== 'barrel_blast') {
    _triggerEnvInteractions({ attacker: source, target, element, damageType, skill: null });
  }

  return { applied, killed };
}

// ── ENVIRONMENTAL INTERACTIONS ────────────────────────────────────
function _triggerEnvInteractions({ attacker, target, element, damageType, skill }) {
  const ge = GE();
  if (!ge || !target?.pos) return;
  const ENV = C().ENVIRONMENTAL_INTERACTIONS || {};
  if (!ENV.enabled) return;
  const [tr, tc] = target.pos;

  // Fire damage → ignite cell beneath target if flammable.
  if (ENV.fireIgnitesGrass && _isFireElement(element) && ge.igniteCell) {
    const r = ge.igniteCell(tr, tc);
    if (r?.changed?.length) {
      Log().record({
        type: 'terrain_transform', actor: attacker, target: null,
        tags: ['terrain', 'terrain_transform', 'terrain_ignited', `element_${String(element).toLowerCase()}`],
        data: { from: r.changed[0][2], to: 'fire_zone', cells: r.changed, source: 'fire_damage' }
      });
      try { AB()?.emit('terrain_ignite', { cells: r.changed, source: attacker }); } catch (e) {}
    }
  }

  // Cold / Water damage → freeze water cell beneath target.
  if (ENV.coldFreezesWater && _isFreezeElement(element, damageType, skill) && ge.freezeCell) {
    const r = ge.freezeCell(tr, tc);
    if (r?.changed?.length) {
      Log().record({
        type: 'terrain_transform', actor: attacker, target: null,
        tags: ['terrain', 'terrain_transform', 'terrain_frozen', `element_${String(element).toLowerCase()}`],
        data: { from: r.changed[0][2], to: 'ice_zone', cells: r.changed, source: 'cold_damage' }
      });
      try { AB()?.emit('terrain_freeze', { cells: r.changed, source: attacker }); } catch (e) {}
    }
  }
}

function _isFireElement(element) {
  return String(element || '').toLowerCase() === 'fire';
}

function _isFreezeElement(element, damageType, skill) {
  const ENV = C().ENVIRONMENTAL_INTERACTIONS || {};
  const list = (ENV.freezeElements || []).map(s => String(s).toLowerCase());
  const el = String(element || '').toLowerCase();
  if (!list.includes(el)) return false;
  if (ENV.freezeRequiresColdTag) {
    const tags = (skill?.tags || []).map(t => String(t).toLowerCase());
    if (!tags.includes('cold') && !tags.includes('ice') && !tags.includes('freeze')) return false;
  }
  return true;
}

// ── KNOCKBACK COLLISION APPLICATION (cliff / barrel-aware) ────────
function applyKnockbackCollisions({ source, pushedUnit, kb, sourceDamage }) {
  const ge = GE();
  if (!ge || !pushedUnit || !kb) return { applied: [], notes: [] };
  const collisions = kb.collisions || [];
  const sourceUnitId = source?.instanceId || null;
  const hits = ge.resolveKnockbackCollisions(pushedUnit.instanceId, collisions, sourceDamage || 0, sourceUnitId);
  const applied = [];
  const explosions = [];

  for (const h of hits) {
    if (h.reason === 'cliff_fall') {
      const t = ge.getUnit(h.unitId);
      if (!t) continue;
      const prevHP = t.currentHP || 0;
      t.currentHP = 0;
      Log().record({
        type: 'damage', actor: source, target: t,
        tags: ['damage', 'damage_cliff_fall', 'cliff_kill', 'instant_kill', 'environmental'],
        data: { amount: prevHP, reason: 'cliff_fall', damageType: 'True' }
      });
      Log().logKill({ actor: source, target: t, overkill: 0, finalBlowSkill: null });
      try { AB()?.emit('cliff_kill', { unit: t, source }); } catch (e) {}
      try { AM()?.playSfx('cliff_fall', { volume: 0.7, fallbacks: ['unit_collision', 'miss'] }); } catch (e) {}
      // Fire on_kill / on_death so passives, ultimate gain, etc. all run.
      const ER: any = (window.CJS as any).EffectResolver;
      if (ER) {
        try {
          ER.fireTrigger('on_kill', {
            unit: source, attacker: source, target: t,
            turnNumber: Log().getTurn(), allUnits: ge.getAllUnits()
          });
          ER.fireTrigger('on_death', {
            unit: t, attacker: source,
            turnNumber: Log().getTurn(), allUnits: ge.getAllUnits()
          });
        } catch (e) {}
      }
      ge.removeFromBoard(t.instanceId);
      applied.push({ unitId: t.instanceId, damage: prevHP, killed: true, reason: 'cliff_fall' });
      continue;
    }
    if (h.reason === 'barrel_blast') {
      const expl = ge.detonateBarrel(h.r, h.c, h.sourceUnitId || sourceUnitId);
      if (expl?.exploded) {
        explosions.push(expl);
      }
      continue;
    }
    // Normal wall / unit collision damage.
    const u = ge.getUnit(h.unitId);
    if (!u) continue;
    const r = applyRawDamage({
      source, target: u, amount: h.damage,
      reason: h.reason, damageType: h.damageType || 'Physical'
    });
    applied.push({ unitId: u.instanceId, ...r, reason: h.reason });
  }

  // Resolve explosions AFTER cliff/normal so the cliff order matches the log.
  for (const expl of explosions) {
    const explHits = [];
    for (const sub of expl.hits) {
      const u = ge.getUnit(sub.unitId);
      if (!u) continue;
      const r = applyRawDamage({
        source, target: u, amount: sub.damage,
        reason: 'barrel_blast', damageType: sub.damageType || 'Magic'
      });
      explHits.push({ unitId: u.instanceId, ...r });
    }
    Log().record({
      type: 'barrel_explosion', actor: source, target: null,
      tags: ['environmental', 'barrel_blast', `element_${String(expl.element || 'fire').toLowerCase()}`],
      data: {
        center: expl.center, radius: expl.radius, damage: expl.damage,
        element: expl.element, hits: explHits
      }
    });
    try { AB()?.emit('barrel_explode', { center: expl.center, radius: expl.radius, element: expl.element, source }); } catch (e) {}
    try { AM()?.playSfx('barrel_explode', { volume: 0.78, fallbacks: ['weapon_hit_fire', 'magic_fire', 'weapon_hit_physical'] }); } catch (e) {}
    applied.push({ explosion: expl, hits: explHits });
  }

  return { applied, explosions };
}

// ── ULTIMATE METER HELPER ─────────────────────────────────────────
function _grantUltimate(unit, amount) {
  if (!unit || !Number.isFinite(amount) || amount === 0) return;
  if (typeof unit.ultimateMeter !== 'number') return;
  const max = Number.isFinite(unit.ultimateMax) ? unit.ultimateMax : 100;
  unit.ultimateMeter = Math.max(0, Math.min(max, unit.ultimateMeter + amount));
}

// Public wrapper so other modules can adjust the meter without poking the field.
function grantUltimate(unit, amount) { _grantUltimate(unit, amount); }

function consumeUltimate(unit, amount) {
  if (!unit || typeof unit.ultimateMeter !== 'number') return false;
  const cost = Math.max(0, Number(amount) || 0);
  if (unit.ultimateMeter < cost) return false;
  unit.ultimateMeter -= cost;
  return true;
}

// ── PUBLIC API ─────────────────────────────────────────────────────
export const DamageCalc = Object.freeze({
  computeAttack,
  applyDamage,
  applyHeal,
  applyMP,
  applyTickDamage,
  applyRawDamage,
  applyKnockbackCollisions,
  grantUltimate,
  consumeUltimate
});

// Runtime compatibility install — keep window.CJS.DamageCalc identical to the
// legacy IIFE. The cast bridges the historical CJSDamageCalc interface, which
// does not list applyKnockbackCollisions (present here and used by effect-resolver).
window.CJS = window.CJS || ({} as CJSNamespace);
window.CJS.DamageCalc = DamageCalc as unknown as CJSDamageCalc;
