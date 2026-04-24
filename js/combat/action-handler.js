// action-handler.js
// Validates and executes an action chosen by either a player or the AI.
// Same API for both — combat-manager doesn't care who picked.
//
// Actions:
//   { type: 'move',    targetPos: [r, c] }
//   { type: 'attack',  targetId: 'unit_instance_id' }
//   { type: 'skill',   skillId, targetId? or aoeCenter? }
//   { type: 'item',    itemId, targetId? }
//   { type: 'defend' }
//   { type: 'end_turn' }
//
// Reads: grid-engine, damage-calc, effect-resolver, status-manager,
//        data-store, constants, combat-log, dice-service
// Used by: combat-manager.js, UI layer
// ─────────────────────────────────────────────────────────────────────

window.CJS = window.CJS || {};

window.CJS.ActionHandler = (() => {
  'use strict';

  const GE  = () => window.CJS.GridEngine;
  const DC  = () => window.CJS.DamageCalc;
  const ER  = () => window.CJS.EffectResolver;
  const SM  = () => window.CJS.StatusManager;
  const DS  = () => window.CJS.DataStore;
  const C   = () => window.CJS.CONST;
  const Log = () => window.CJS.CombatLog;
  const AoE = () => window.CJS.AoE;

  // ── VALIDATE ──────────────────────────────────────────────────────
  // Returns: { valid: bool, reason?: string }
  function validate(unit, action) {
    if (!unit || !action) return { valid: false, reason: 'bad_args' };
    if ((unit.currentHP || 0) <= 0) return { valid: false, reason: 'unit_dead' };

    // Can the unit act at all? (stun, sleep, freeze)
    if (action.type !== 'end_turn' && SM() && !SM().canAct(unit)) {
      return { valid: false, reason: 'action_prevented_by_status' };
    }

    const ts = unit.turnState || {};

    switch (action.type) {
      case 'move': {
        if (ts.hasMoved) return { valid: false, reason: 'already_moved' };
        if (SM() && !SM().canMove(unit)) return { valid: false, reason: 'movement_prevented' };
        if (!action.targetPos) return { valid: false, reason: 'no_target_pos' };
        const mv = GE().isValidMove(unit.instanceId, action.targetPos[0], action.targetPos[1]);
        return mv.valid ? { valid: true } : { valid: false, reason: mv.reason };
      }

      case 'attack': {
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        if ((ts.apRemaining || 0) < 1) return { valid: false, reason: 'no_ap' };
        const target = GE().getUnit(action.targetId);
        if (!target) return { valid: false, reason: 'no_target' };
        // Use weapon range (ranged weapons can basic-attack at distance)
        const atkRange = getAttackRange(unit);
        if (GE().footprintDistance(unit, target) > atkRange) {
          return { valid: false, reason: 'target_out_of_range' };
        }
        return { valid: true };
      }

      case 'skill': {
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        // Silence check: preventsSkills status blocks skill usage
        if (SM() && SM().canUseSkills && !SM().canUseSkills(unit)) {
          return { valid: false, reason: 'silenced' };
        }
        const skill = _resolveSkill(unit, action.skillId);
        if (!skill) return { valid: false, reason: 'unknown_skill' };
        // Check skill is known (via SkillResolver — handles both formats)
        const SR = window.CJS.SkillResolver;
        const knownSkillIds = SR
          ? SR.getSkillIds(unit.skills || [])
          : (unit.skills || []).map(s => typeof s === 'string' ? s : s.skillId);
        if (!knownSkillIds.includes(action.skillId)) {
          return { valid: false, reason: 'skill_not_known' };
        }
        if ((ts.cooldowns?.[action.skillId] || 0) > 0) {
          return { valid: false, reason: 'on_cooldown' };
        }
        const mpCost = Math.max(0, (skill.mp || 0) + (unit.costMod || 0));
        if ((unit.currentMP || 0) < mpCost) return { valid: false, reason: 'not_enough_mp' };
        const apCost = skill.ap || 1;
        if ((ts.apRemaining || 0) < apCost) return { valid: false, reason: 'not_enough_ap' };

        // Stealth check: can't target invisible units
        if (action.targetId && SM() && SM().isInvisible) {
          const target = GE().getUnit(action.targetId);
          if (target && SM().isInvisible(target) && target.team !== unit.team) {
            return { valid: false, reason: 'target_invisible' };
          }
        }

        // Range check for single-target skills
        if (action.targetId && !skill.aoe) {
          const target = GE().getUnit(action.targetId);
          if (!target) return { valid: false, reason: 'no_target' };
          const range = (skill.range || 1) + (unit.rangeBonus || 0);
          if (GE().footprintDistance(unit, target) > range) {
            return { valid: false, reason: 'target_out_of_range' };
          }
          if (skill.requiresLoS &&
              !GE().hasLineOfSight(unit.pos[0], unit.pos[1], target.pos[0], target.pos[1], unit.instanceId)) {
            return { valid: false, reason: 'no_line_of_sight' };
          }
        }
        // AoE cell targeting range
        if (action.aoeCenter && skill.aoe) {
          const range = (skill.range || 1) + (unit.rangeBonus || 0);
          if (GE().distance(unit.pos[0], unit.pos[1], action.aoeCenter[0], action.aoeCenter[1]) > range) {
            return { valid: false, reason: 'aoe_center_out_of_range' };
          }
        }
        return { valid: true };
      }

      case 'item': {
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        if (!(unit.equipment || []).includes(action.itemId) &&
            !(unit.inventory || []).includes(action.itemId)) {
          return { valid: false, reason: 'item_not_owned' };
        }
        return { valid: true };
      }

      case 'defend':
        if (ts.mainActionUsed) return { valid: false, reason: 'main_action_used' };
        return { valid: true };

      case 'end_turn':
        return { valid: true };

      default:
        return { valid: false, reason: 'unknown_action_type' };
    }
  }

  // ── EXECUTE ───────────────────────────────────────────────────────
  // Performs validate then applies. Returns { success, ...details }.
  function execute(unit, action, combatContext) {
    const check = validate(unit, action);
    if (!check.valid) {
      Log().logNote(`Invalid action by ${unit?.name}: ${check.reason}`, ['invalid_action']);
      return { success: false, reason: check.reason };
    }

    const ts = unit.turnState;
    const ctx = combatContext || { turnNumber: Log().getTurn() };

    switch (action.type) {
      case 'move':    return _doMove(unit, action, ctx);
      case 'attack':  return _doAttack(unit, action, ctx);
      case 'skill':   return _doSkill(unit, action, ctx);
      case 'item':    return _doItem(unit, action, ctx);
      case 'defend':  return _doDefend(unit, action, ctx);
      case 'end_turn':return _doEndTurn(unit, action, ctx);
    }
  }

  // ── MOVE ──────────────────────────────────────────────────────────
  function _doMove(unit, action, ctx) {
    const [tr, tc] = action.targetPos;
    const fromPos = [...unit.pos];
    const result = GE().moveUnit(unit.instanceId, tr, tc);
    if (!result.success) return { success: false, reason: result.reason };

    unit.turnState.hasMoved = true;
    Log().logMove({
      actor: unit, from: fromPos, to: [tr, tc],
      cost: result.cost, terrainEffects: result.terrainEffects
    });

    // Fire on_move trigger (terrain effects, caltrops, etc.)
    ER().fireTrigger('on_move', {
      unit, turnNumber: ctx.turnNumber,
      allUnits: GE().getAllUnits(),
      terrainEffects: result.terrainEffects
    });

    // Apply terrain effects for cells traversed
    for (const tEff of (result.terrainEffects || [])) {
      const terrainEffectId = tEff.effectId;
      const master = DS().get('effects', terrainEffectId);
      if (master) {
        ER().executeEffect(master, {
          caster: null, unit, target: unit,
          allUnits: GE().getAllUnits(), turnNumber: ctx.turnNumber
        });
      }
    }

    return { success: true, action: 'move', ...result };
  }

  // ── ATTACK (basic) ────────────────────────────────────────────────
  function _doAttack(unit, action, ctx) {
    const target = GE().getUnit(action.targetId);
    // Get weapon data for element/damageType (null = fists → Physical)
    const weaponData = _getWeaponData(unit);
    const attack = DC().computeAttack({
      attacker: unit, target, skill: null,
      qteMultiplier: ctx.qteMultiplier || 1.0,
      weaponData  // passed to damage-calc for baseDamage/element/damageType
    });

    unit.turnState.mainActionUsed = true;
    unit.turnState.apRemaining = Math.max(0, (unit.turnState.apRemaining || 0) - 1);

    if (attack.miss) {
      Log().logMiss({ actor: unit, target, skill: null });
      ER().fireTrigger('on_miss', {
        unit, attacker: unit, target, allUnits: GE().getAllUnits(),
        turnNumber: ctx.turnNumber
      });
      return { success: true, hit: false, missed: true };
    }

    // Use weapon element/damageType if available
    const atkElement    = weaponData?.element    || 'Physical';
    const atkDamageType = weaponData?.damageType || 'Physical';

    const applied = DC().applyDamage({
      attacker: unit, target, amount: attack.damage,
      damageType: atkDamageType, element: atkElement,
      skill: null, isCritical: attack.isCritical, breakdown: attack.breakdown
    });

    // Fire on_hit (attacker-side)
    ER().fireTrigger('on_hit', {
      unit, attacker: unit, target,
      damageDealt: applied.applied,
      damageType: atkDamageType, element: atkElement,
      isCritical: attack.isCritical,
      turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
    });
    if (attack.isCritical) {
      ER().fireTrigger('on_crit', {
        unit, attacker: unit, target,
        damageDealt: applied.applied,
        turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
      });
    }

    // on_take_damage is fired inside damage-calc/resolver chain

    if (applied.killed) {
      ER().fireTrigger('on_kill', {
        unit, attacker: unit, target,
        turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
      });
      GE().removeFromBoard(target.instanceId);
    }

    return { success: true, hit: true, damage: applied.applied, killed: applied.killed };
  }

  // ── SKILL ─────────────────────────────────────────────────────────
  function _doSkill(unit, action, ctx) {
    const skill = _resolveSkill(unit, action.skillId);
    if (!skill) return { success: false, reason: 'unknown_skill' };
    const apCost = skill.ap || 1;
    const mpCost = Math.max(0, (skill.mp || 0) + (unit.costMod || 0));
    const cd     = Math.max(0, (skill.cooldown || 0) + (unit.cooldownMod || 0));

    // Pay costs
    unit.turnState.mainActionUsed = true;
    unit.turnState.apRemaining = Math.max(0, (unit.turnState.apRemaining || 0) - apCost);
    unit.currentMP = Math.max(0, (unit.currentMP || 0) - mpCost);
    if (cd > 0) {
      unit.turnState.cooldowns = unit.turnState.cooldowns || {};
      unit.turnState.cooldowns[action.skillId] = cd;
    }

    // Pull QTE result from the action (set by UI layer), or default to neutral.
    // Player flow: UI pops QTE → awaits result → submitAction({..., qteResult}).
    // AI flow: combat-manager's AI path simulates a grade based on the unit's
    // stats/archetype and stuffs it into the action before calling execute.
    const qteResult = action.qteResult || _defaultQTEResult(skill);
    const qteMultiplier = qteResult.multiplier || 1.0;
    const qteGrade = qteResult.grade || 'ok';

    const target = action.targetId ? GE().getUnit(action.targetId) : null;
    Log().logSkillUse({ actor: unit, target, skill, apCost, mpCost });

    // Gather targets (single, or AoE)
    let targets = [];
    let aoeOrigin = null;
    if (skill.aoe && skill.aoe !== 'none' && action.aoeCenter) {
      aoeOrigin = action.aoeCenter;
      const dims = GE().getDims();
      const cells = AoE().getCellsForShape(`aoe_${skill.aoe}`, aoeOrigin,
        skill.aoeSize || 2, target ? target.pos : null, dims.width, dims.height);
      targets = AoE().unitsInCells(cells, GE())
        .filter(u => (u.currentHP || 0) > 0 && u.team !== unit.team);
    } else if (target) {
      targets = [target];
    }

    // Resolve damage (if skill has power) for each target
    const hits = [];
    if (skill.power) {
      for (const t of targets) {
        const attack = DC().computeAttack({
          attacker: unit, target: t, skill, qteMultiplier, qteGrade
        });
        if (attack.miss) {
          Log().logMiss({ actor: unit, target: t, skill });
          hits.push({ target: t, missed: true });
          continue;
        }
        const applied = DC().applyDamage({
          attacker: unit, target: t, amount: attack.damage,
          damageType: skill.damageType || 'Physical',
          element:    skill.element    || 'Physical',
          skill, isCritical: attack.isCritical, breakdown: attack.breakdown,
          qteGrade
        });
        hits.push({ target: t, damage: applied.applied, killed: applied.killed, critical: attack.isCritical });

        ER().fireTrigger('on_hit', {
          unit, attacker: unit, target: t,
          damageDealt: applied.applied,
          damageType: skill.damageType, element: skill.element,
          isCritical: attack.isCritical, skillUsed: skill,
          turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
        });
        if (attack.isCritical) {
          ER().fireTrigger('on_crit', {
            unit, attacker: unit, target: t, damageDealt: applied.applied,
            turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
          });
        }
        if (applied.killed) {
          ER().fireTrigger('on_kill', {
            unit, attacker: unit, target: t,
            turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
          });
          GE().removeFromBoard(t.instanceId);
        }
      }
    }

    // Apply skill's additional effects (from skill.effects[])
    for (const ref of (skill.effects || [])) {
      const master = DS().get('effects', ref.effectId);
      if (!master) continue;
      const merged = { ...master, ...(ref.overrides || {}) };
      ER().executeEffect(merged, {
        caster: unit, unit, target, skillUsed: skill,
        aoeOrigin, aoeDirection: target?.pos,
        damageDealt: hits.reduce((s, h) => s + (h.damage || 0), 0),
        allUnits: GE().getAllUnits(),
        turnNumber: ctx.turnNumber
      });
    }

    ER().fireTrigger('on_skill_use', {
      unit, attacker: unit, target, skillUsed: skill,
      turnNumber: ctx.turnNumber, allUnits: GE().getAllUnits()
    });

    return { success: true, action: 'skill', skillId: action.skillId, hits };
  }

  // ── ITEM ──────────────────────────────────────────────────────────
  function _doItem(unit, action, ctx) {
    const item = DS().get('items', action.itemId);
    if (!item) return { success: false, reason: 'no_item' };

    unit.turnState.mainActionUsed = true;
    // Consume if consumable
    if (item.slot === 'consumable') {
      unit.inventory = (unit.inventory || []).filter(id => id !== action.itemId);
    }

    // Fire each item effect
    for (const ref of (item.effects || [])) {
      const master = DS().get('effects', ref.effectId);
      if (!master) continue;
      const merged = { ...master, ...(ref.overrides || {}) };
      const target = action.targetId ? GE().getUnit(action.targetId) : unit;
      ER().executeEffect(merged, {
        caster: unit, unit, target,
        allUnits: GE().getAllUnits(), turnNumber: ctx.turnNumber
      });
    }

    Log().record({
      type: 'item_used', actor: unit, target: null,
      tags: ['item_used', `item_${action.itemId}`],
      data: { itemId: action.itemId }
    });

    ER().fireTrigger('on_item_use', {
      unit, attacker: unit, allUnits: GE().getAllUnits(),
      turnNumber: ctx.turnNumber
    });

    return { success: true, action: 'item' };
  }

  // ── DEFEND ────────────────────────────────────────────────────────
  function _doDefend(unit, action, ctx) {
    unit.turnState.mainActionUsed = true;
    unit.turnState.isDefending = true;
    unit.turnState.bonusAP = (unit.turnState.bonusAP || 0) + (C().ACTION_ECONOMY.defendAPBonus || 0);
    // DR boost for this round — expires at turn_start next turn
    unit._defendDRBoost = C().ACTION_ECONOMY.defendDRBonus || 5;
    Log().record({
      type: 'defend', actor: unit, target: null,
      tags: ['defend'], data: { drBoost: unit._defendDRBoost }
    });
    return { success: true, action: 'defend' };
  }

  // ── END TURN ──────────────────────────────────────────────────────
  function _doEndTurn(unit, action, ctx) {
    return { success: true, action: 'end_turn' };
  }

  // ── DEFAULT QTE RESULT ─────────────────────────────────────────────
  // When an action is executed without a pre-resolved qteResult, we assume
  // a neutral "ok" multiplier. Combat-manager overrides this for AI units
  // with a simulated result (so enemies still roll perfect/good/fail).
  function _defaultQTEResult(skill) {
    return { grade: 'ok', multiplier: 1.0, qteType: skill?.qte || 'none' };
  }

  // Simulate a QTE grade for AI units. Based on a simple roll: higher-rank
  // monsters land better grades more often. Returns the same shape a real
  // QTE would produce.
  function simulateAIQTE(unit, skill) {
    if (!skill || !skill.qte || skill.qte === 'none') {
      return _defaultQTEResult(skill);
    }
    // Rank-based success chance
    const RANK_SKILL = { F: 0.35, E: 0.45, D: 0.55, C: 0.65, B: 0.72, A: 0.80, S: 0.85, SR: 0.90, SSR: 0.95 };
    const rankSkill = RANK_SKILL[unit?.rank] ?? 0.5;
    const r = Math.random();
    let grade;
    if (r < rankSkill * 0.2)       grade = 'perfect';
    else if (r < rankSkill * 0.6)  grade = 'good';
    else if (r < rankSkill)        grade = 'ok';
    else                           grade = 'fail';
    const multiplier = { perfect: 1.5, good: 1.25, ok: 1.0, fail: 0.75 }[grade];
    return { grade, multiplier, qteType: skill.qte, simulated: true };
  }

  // ── RESOLVE SKILL (uses shared SkillResolver) ──────────────────────
  // Merges base skill from DataStore with per-unit overrides and level.
  function _resolveSkill(unit, skillId) {
    const SR = window.CJS.SkillResolver;
    if (SR) return SR.resolveUnitSkill(unit, skillId);
    // Fallback if SkillResolver not loaded
    const base = DS().get('skills', skillId);
    return base ? { ...base } : null;
  }

  // ── WEAPON DATA ───────────────────────────────────────────────────
  // Get the equipped weapon's data (range, element, damageType, baseDamage).
  // Returns null if no weapon equipped.
  function _getWeaponData(unit) {
    if (!unit.equipment) return null;
    for (const iid of unit.equipment) {
      const item = DS().get('items', iid);
      if (item?.slot === 'weapon' && item.weaponData) {
        return item.weaponData;
      }
    }
    return null;
  }

  // Get the effective attack range for basic attacks.
  // Weapon range + unit rangeBonus, or melee (1) if no weapon.
  function getAttackRange(unit) {
    const wd = _getWeaponData(unit);
    return (wd?.range || 1) + (unit.rangeBonus || 0);
  }

  // ── QUERIES ────────────────────────────────────────────────────────
  // What actions can this unit take right now? Used by the UI to grey out buttons.
  function getAvailableActions(unit) {
    const ts = unit.turnState || {};
    const canAct = !SM() || SM().canAct(unit);
    const canSkill = canAct && (!SM() || !SM().canUseSkills || SM().canUseSkills(unit));

    const available = {
      move:    !ts.hasMoved && (!SM() || SM().canMove(unit)),
      attack:  !ts.mainActionUsed && (ts.apRemaining || 0) >= 1 && canAct,
      defend:  !ts.mainActionUsed && canAct,
      endTurn: true,
      skills:  [],
      items:   []
    };

    if (!ts.mainActionUsed && canAct) {
      // Build skill list (via SkillResolver — handles both bare IDs and override objects)
      const SR = window.CJS.SkillResolver;
      for (const entry of (unit.skills || [])) {
        const skillId = SR ? SR.getSkillId(entry) : (typeof entry === 'string' ? entry : entry.skillId);
        const skill = _resolveSkill(unit, skillId);
        if (!skill) continue;
        const cdRemaining = ts.cooldowns?.[skillId] || 0;
        const mpCost = Math.max(0, (skill.mp || 0) + (unit.costMod || 0));
        const apCost = skill.ap || 1;
        available.skills.push({
          id: skillId,
          skill,
          usable: canSkill &&
                  cdRemaining === 0 &&
                  (unit.currentMP || 0) >= mpCost &&
                  (ts.apRemaining || 0) >= apCost,
          silenced: !canSkill,
          cooldown: cdRemaining,
          apCost, mpCost
        });
      }

      // Consumable items — check inventory (not equipment)
      for (const itemId of (unit.inventory || [])) {
        const item = DS().get('items', itemId);
        if (!item || item.slot !== 'consumable') continue;
        available.items.push({ id: itemId, item, usable: true });
      }
    }

    return available;
  }

  // ── PUBLIC API ─────────────────────────────────────────────────────
  return Object.freeze({
    validate, execute, getAvailableActions,
    simulateAIQTE, getAttackRange
  });
})();

