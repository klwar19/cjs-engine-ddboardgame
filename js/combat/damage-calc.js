// damage-calc.js
// Full damage pipeline: hit check → crit roll → base dmg → QTE → element → DR.
// Also: applyDamage (HP reduction, death detection, overkill).
// Also: healing application.
//
// Reads: formulas.js, constants.js, dice.js, combat-log.js
// Used by: effect-resolver.js, action-handler.js, status-manager.js (for tick damage)
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.DamageCalc = (() => {
  'use strict';

  const F    = () => window.CJS.Formulas;
  const C    = () => window.CJS.CONST;
  const Dice = () => window.CJS.Dice;
  const DS   = () => window.CJS.DiceService;   // preferred — falls back to Dice
  const Log  = () => window.CJS.CombatLog;
  const AB   = () => window.CJS.AnimationBus;
  const AM   = () => window.CJS.AudioManager;
  const CM   = () => window.CJS.CombatManager;
  const WX   = () => window.CJS.Weather;

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
  // Computes a hit (including hit check, crit, damage) but does NOT apply
  // it. action-handler / effect-resolver calls `applyDamage` after this.
  //
  // args: {
  //   attacker, target, skill (or attackData),
  //   qteMultiplier,  // from qte-manager
  //   qteGrade,       // 'perfect'|'good'|'ok'|'fail'
  // }
  //
  // Returns: {
  //   hit: bool, miss: bool, dodged: bool, isCritical: bool,
  //   damage: number, breakdown: {...}, attackScore, defendScore
  // }
  function computeAttack(args) {
    const { attacker, target, skill, qteMultiplier, qteGrade, weaponData } = args;
    if (!attacker || !target) return { hit: false, miss: true, damage: 0 };

    // ── 1. HIT CHECK ──────────────────────────────────────────────
    // True damage and unavoidable skills can skip.
    let hit = true, attackScore = 0, defendScore = 0;
    if (skill && skill.unavoidable) {
      hit = true;
    } else {
      const attackRoll = _d20('hit_check_attacker');
      const defendRoll = _d12('hit_check_defender');
      const attackerP  = attacker.compiledStats?.P ?? attacker.stats?.P ?? 0;
      const defenderA  = target.compiledStats?.A   ?? target.stats?.A   ?? 0;
      const accBonus   = attacker.accuracyBonus || 0;
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
        damage: 0, breakdown: { final: 0, reason: 'miss' },
        attackScore, defendScore
      };
    }

    // ── 2. CRIT CHECK ─────────────────────────────────────────────
    const luck = attacker.compiledStats?.L ?? attacker.stats?.L ?? 0;
    const isCritical = !!skill?.alwaysCrit ||
                       F().rollCrit(luck, attacker.critBonus || 0);

    // ── 3. BASE DAMAGE ────────────────────────────────────────────
    // Power: skill.power at its current level, falling back to authored
    // natural/basic attack power, then weapon power, then a safe default.
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
    // Falls back to weaponData for basic attacks, then Physical
    const element = skill?.element || weaponData?.element || 'Physical';
    const elementMult = F().getElementMultiplier(element, target);

    // Weather multiplier: active battlefield weather can boost or
    // dampen specific elements (e.g. rain boosts Water, weakens Fire).
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

    // Persona cross-world multipliers: attacker pays for being out of world,
    // target pays for being out of world. Default to 1 for non-campaign units.
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
        overkill
      },
      qteGrade,
      attackScore, defendScore
    };
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
  // Actually reduce HP. Emits logHit/logKill. Does NOT fire on_take_damage
  // or on_kill — those are triggered by the caller (effect-resolver) so
  // the full context chain is right.
  //
  // Absorb shields are checked FIRST — damage is subtracted from shields
  // before HP is reduced.
  //
  // Returns: { applied, absorbed, overkill, killed, newHP }
  function applyDamage({ attacker, target, amount, element, damageType, skill, isCritical, qteGrade, breakdown }) {
    if (!target || amount <= 0) {
      return { applied: 0, absorbed: 0, overkill: 0, killed: false, newHP: target?.currentHP || 0 };
    }

    let remaining = amount;
    let absorbed = 0;

    // ── One-shot damage negation (Aegis Burst ultimate) ──
    // If target has been armed with negate_next_damage, consume it and zero
    // the incoming damage. Also surfaces in the log so players see why.
    if (target.nextDamageNegated) {
      target.nextDamageNegated = false;
      // Also remove the status flag so the icon disappears.
      const _SMneg = window.CJS.StatusManager;
      if (_SMneg?.removeStatus) {
        try { _SMneg.removeStatus(target, 'negate_next_damage'); } catch (e) {}
      }
      try { Log().record({ type: 'damage_negated', actor: attacker, target, tags: ['ultimate', 'negate'], data: { amount } }); } catch (e) {}
      try { AB()?.emit('damage_negated', { target }); } catch (e) {}
      return { applied: 0, absorbed: amount, overkill: 0, killed: false, newHP: target.currentHP || 0, negated: true };
    }

    // ── Absorb shield check ──
    // Shield/Barrier statuses absorb damage before HP is reduced.
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
    // Attacker gains 10% of damage dealt; target gains 5% of damage taken.
    // On KO, attacker gets an extra +25 bonus.
    _grantUltimate(attacker, applied * 0.10);
    _grantUltimate(target,   applied * 0.05);
    if (killed) _grantUltimate(attacker, 25);

    // Log the hit
    Log().logHit({
      actor: attacker, target,
      damage: applied + absorbed, element, damageType, skill, isCritical, qteGrade,
      breakdown: { ...breakdown, absorbed }
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
  // Checks preventsHealing (curse status) before applying.
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
  // Simpler than full attack: no hit check, no crit, no QTE. Just
  // base → element → DR → apply.
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
  // Skips the full pipeline but still respects min-1 and logs.
  function applyRawDamage({ source, target, amount, reason, damageType }) {
    if (!target || amount <= 0) return { applied: 0, killed: false };
    const prevHP = target.currentHP || 0;
    const newHP  = Math.max(0, prevHP - amount);
    target.currentHP = newHP;
    const killed = newHP === 0 && prevHP > 0;
    const applied = Math.min(amount, prevHP);

    // Out-of-band damage also feeds ultimate meters (smaller credit since
    // there's no skill cost involved). Weather ticks, reflect, thorns, etc.
    _grantUltimate(source, applied * 0.05);
    _grantUltimate(target, applied * 0.05);
    if (killed) _grantUltimate(source, 25);

    Log().record({
      type: 'damage',
      actor: source, target,
      tags: ['damage', reason ? `damage_${reason}` : 'damage_raw'],
      data: { amount: applied, reason, damageType }
    });
    if (killed) Log().logKill({ actor: source, target, overkill: amount - prevHP });

    return { applied, killed };
  }

  // ── ULTIMATE METER HELPER ─────────────────────────────────────────
  // Add to a unit's ultimate meter, clamped to [0, max]. No-op if the unit
  // doesn't track an ultimate meter (e.g. base monsters without it set up).
  function _grantUltimate(unit, amount) {
    if (!unit || !Number.isFinite(amount) || amount === 0) return;
    if (typeof unit.ultimateMeter !== 'number') return;
    const max = Number.isFinite(unit.ultimateMax) ? unit.ultimateMax : 100;
    unit.ultimateMeter = Math.max(0, Math.min(max, unit.ultimateMeter + amount));
  }

  // Public wrapper so other modules (effects, action-handler items) can
  // adjust the meter without poking the field directly.
  function grantUltimate(unit, amount) { _grantUltimate(unit, amount); }
  function consumeUltimate(unit, amount) {
    if (!unit || typeof unit.ultimateMeter !== 'number') return false;
    const cost = Math.max(0, Number(amount) || 0);
    if (unit.ultimateMeter < cost) return false;
    unit.ultimateMeter -= cost;
    return true;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    computeAttack,
    applyDamage,
    applyHeal,
    applyMP,
    applyTickDamage,
    applyRawDamage,
    grantUltimate,
    consumeUltimate
  });
})();
